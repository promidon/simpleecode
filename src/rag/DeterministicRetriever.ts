import * as vscode from 'vscode';
import { defaultUserPrompt, type ContextPacket } from '../context/ContextPacket';
import type { Retriever, RetrievedContext } from './Retriever';
import type { FileIndexReader } from '../indexing/FileIndex';
import { buildEdges, edgesTo } from '../indexing/graphEdges';
import type { SymbolIndexReader, SymbolRecord } from '../indexing/SymbolIndex';
import { resolveRelativeImport } from '../indexing/resolveImport';
import type { Logger } from '../utils/logger';
import { applyGuards, type PrivacyConfig } from '../privacy/privacyGuard';
import { readPrivacyConfig } from '../privacy/PrivacySettings';
import { referencedTypeNames } from './typeReferences';
import { buildChunks, SparseVectorIndex } from './vectorSearch';
import {
  scopeIncludesRelatedFiles,
  scopeIncludesSystemContext,
} from '../privacy/privacyScope';

/**
 * Build Order #9. The first useful retrieval — deterministic, no embeddings.
 *
 * Given the current file's packet, it returns related context in four stages:
 * 1. the file's local relative imports resolved to real files (TS/JS),
 * 2. files that DECLARE the type names this code uses (the Swift-friendly
 *    edge — Swift imports modules, not paths; exact declarations when the
 *    symbol index has them),
 * 3. question-ranked chunks via local sparse vector search (#17, only when
 *    the user typed a real question),
 * 4. the file's tests, from graph edges (#19),
 * 5. the project README and package.json.
 * Every piece is run through the same privacy guard, so blocked files are
 * skipped and secrets are redacted.
 *
 * Vector / graph retrievers are later, separate `Retriever` implementations
 * behind this same interface (#17/#18/#19).
 */
const MAX_RELATED_FILES = 5;
const MAX_QUESTION_MATCHES = 3;
const MAX_TEST_FILES = 2;
const PREVIEW_LINES = 40;
const PREVIEW_CHARS = 1500;

export class DeterministicRetriever implements Retriever {
  constructor(
    private readonly fileIndex: FileIndexReader,
    private readonly symbolIndex?: SymbolIndexReader,
    private readonly logger?: Logger,
  ) {}

  async retrieve(packet: ContextPacket): Promise<RetrievedContext[]> {
    if (!packet.filePath || !scopeIncludesRelatedFiles(packet.privacyScope)) {
      return [];
    }
    const config = readPrivacyConfig();
    const record = this.fileIndex.get(packet.filePath);
    const out: RetrievedContext[] = [];
    const seen = new Set<string>([packet.filePath]);

    // 1. Directly imported LOCAL files (relative specifiers only).
    if (record) {
      for (const spec of record.imports) {
        if (out.length >= MAX_RELATED_FILES) {
          break;
        }
        if (!spec.startsWith('.')) {
          continue;
        }
        const resolved = this.resolveLocal(packet.filePath, spec);
        if (!resolved || seen.has(resolved)) {
          continue;
        }
        seen.add(resolved);
        const ctx = await this.readContext(
          resolved,
          'file',
          `Imported by ${record.path}`,
          config,
        );
        if (ctx) {
          out.push(ctx);
        }
      }
    }

    // 2. Files that declare the types this code references — exact name lookup.
    //    This is what finds SinglyViewModel.swift when the selection uses
    //    `SinglyViewModel` (relative imports can't). When the symbol index has
    //    the declaration, send the exact declaration snippet with real line
    //    numbers (#7); otherwise fall back to the file's head preview.
    const code = packet.selectedText ?? packet.fullText ?? '';
    for (const name of referencedTypeNames(code)) {
      if (out.length >= MAX_RELATED_FILES) {
        break;
      }
      const decl = this.symbolIndex?.findDeclaration(name, packet.filePath);
      if (decl) {
        if (seen.has(decl.id)) {
          continue;
        }
        const ctx = this.declarationContext(decl, name, config);
        if (ctx) {
          seen.add(decl.id);
          out.push(ctx);
          continue;
        }
      }
      const declaring = this.findByExport(name, packet.filePath);
      if (!declaring || seen.has(declaring)) {
        continue;
      }
      seen.add(declaring);
      const ctx = await this.readContext(
        declaring,
        'file',
        `Declares ${name}, which this code uses`,
        config,
      );
      if (ctx) {
        out.push(ctx);
      }
    }

    // 3. Vector search (#17): when the user typed a real question, rank all
    //    symbol chunks + file summaries against it (sparse TF-IDF, local and
    //    deterministic) and bring the best matches along.
    const sparseSearchEnabled = vscode.workspace
      .getConfiguration('simpleecode.retrieval')
      .get<boolean>('enableSparseSearch', false);
    for (const match of sparseSearchEnabled ? this.questionMatches(packet) : []) {
      if (seen.has(match.chunk.id) || seen.has(match.chunk.fileId)) {
        continue;
      }
      const guard = applyGuards(match.chunk.fileId, match.chunk.content, config);
      if (guard.blocked) {
        continue;
      }
      seen.add(match.chunk.id);
      out.push({
        sourceType: 'symbol',
        path: match.chunk.path,
        range: match.chunk.range,
        reasonIncluded: `Matches your question (ranked search, score ${match.score.toFixed(2)})`,
        content: guard.text,
        redactions: guard.redactions,
        truncated: guard.truncated,
      });
    }

    // 4. The file's own tests (#19): graph edges from naming conventions
    //    (foo.test.ts → foo.ts, FooTests.swift → Foo.swift). A test shows real
    //    usage, which grounds "how it connects" better than prose can.
    if (packet.filePath) {
      const testEdges = edgesTo(buildEdges(this.fileIndex.all()), packet.filePath)
        .filter((e) => e.type === 'tests')
        .slice(0, MAX_TEST_FILES);
      for (const edge of testEdges) {
        if (seen.has(edge.fromId)) {
          continue;
        }
        seen.add(edge.fromId);
        const ctx = await this.readContext(
          edge.fromId,
          'test',
          'Tests this file (naming convention)',
          config,
        );
        if (ctx) {
          out.push(ctx);
        }
      }
    }

    // 5. Project grounding belongs only to the broadest, explicit scope.
    if (scopeIncludesSystemContext(packet.privacyScope)) {
      for (const grounding of [
        { name: 'README.md', type: 'readme' as const, reason: 'Project overview' },
        { name: 'package.json', type: 'config' as const, reason: 'Project config' },
      ]) {
        const rec = this.findByBasename(grounding.name);
        if (rec && !seen.has(rec.id)) {
          seen.add(rec.id);
          const ctx = await this.readContext(
            rec.id,
            grounding.type,
            grounding.reason,
            config,
          );
          if (ctx) {
            out.push(ctx);
          }
        }
      }
    }

    return out;
  }

  /** Resolve a relative import specifier to an indexed file path, or undefined. */
  private resolveLocal(fromFile: string, specifier: string): string | undefined {
    return resolveRelativeImport(
      fromFile,
      specifier,
      (path) => this.fileIndex.get(path) !== undefined,
    );
  }

  private findByBasename(basename: string): { id: string; path: string } | undefined {
    return this.fileIndex
      .all()
      .find((r) => r.path === basename || r.path.endsWith(`/${basename}`));
  }

  /** Top question-ranked chunks, excluding the focal file. Empty without a question. */
  private questionMatches(packet: ContextPacket) {
    const question = packet.userPrompt?.trim();
    if (!question || question === defaultUserPrompt(packet.task)) {
      return [];
    }
    const chunks = buildChunks(
      this.fileIndex.all(),
      this.symbolIndex?.all() ?? [],
    ).filter((c) => c.fileId !== packet.filePath);
    return new SparseVectorIndex(chunks).search(question, MAX_QUESTION_MATCHES);
  }

  /** The exact declaration snippet from the symbol index, privacy-guarded. */
  private declarationContext(
    decl: SymbolRecord,
    name: string,
    config: PrivacyConfig,
  ): RetrievedContext | undefined {
    const guard = applyGuards(decl.fileId, decl.codePreview, config);
    if (guard.blocked) {
      this.logger?.info(`Retrieval: skipped ${decl.fileId} (privacy: ${guard.reason})`);
      return undefined;
    }
    return {
      sourceType: 'file',
      path: this.fileIndex.get(decl.fileId)?.path ?? decl.fileId,
      range: `${decl.range.startLine}-${decl.range.endLine}`,
      reasonIncluded: `Declares ${name} (${decl.kind}), which this code uses`,
      content: guard.text,
      redactions: guard.redactions,
      truncated: guard.truncated,
    };
  }

  /** Absolute path of the file that declares `name`, excluding the focal file. */
  private findByExport(name: string, selfPath?: string): string | undefined {
    const matches = this.fileIndex
      .all()
      .filter((r) => r.id !== selfPath && r.exports.includes(name))
      .sort((a, b) => a.path.localeCompare(b.path));
    return matches[0]?.id;
  }

  private async readContext(
    absPath: string,
    sourceType: RetrievedContext['sourceType'],
    reasonIncluded: string,
    config: PrivacyConfig,
  ): Promise<RetrievedContext | undefined> {
    try {
      const bytes = await vscode.workspace.fs.readFile(vscode.Uri.file(absPath));
      const guard = applyGuards(absPath, Buffer.from(bytes).toString('utf8'), config);
      if (guard.blocked) {
        this.logger?.info(`Retrieval: skipped ${absPath} (privacy: ${guard.reason})`);
        return undefined;
      }
      const lines = guard.text.split('\n').slice(0, PREVIEW_LINES);
      const preview = lines.join('\n').slice(0, PREVIEW_CHARS);
      const record = this.fileIndex.get(absPath);
      // Deterministic file summary (#16) leads the block so the reader gets
      // orientation before the raw code.
      const content = record?.summary
        ? `Summary: ${record.summary}\n\n${preview}`
        : preview;
      return {
        sourceType,
        path: record?.path ?? absPath,
        range: `1-${lines.length} (preview)`,
        reasonIncluded,
        content,
        redactions: guard.redactions,
        truncated: guard.truncated,
      };
    } catch (err) {
      this.logger?.warn(`Retrieval: failed to read ${absPath}`, String(err));
      return undefined;
    }
  }
}
