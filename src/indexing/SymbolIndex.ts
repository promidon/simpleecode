import * as vscode from 'vscode';
import type { FileRecord } from './FileIndex';
import type { LocalStore } from '../storage/LocalStore';
import type { Logger } from '../utils/logger';
import {
  pickDeclaration,
  toSymbolRecords,
  type DocSymbolLike,
  type SymbolRecord,
} from './symbolRecords';
import { readPrivacyConfig } from '../privacy/PrivacySettings';
import { isPathBlocked, redactSecrets } from '../privacy/privacyGuard';

export type { SymbolRecord } from './symbolRecords';

const STORE_TABLE = 'symbols';

/** Languages whose symbol trees are worth indexing (Build Order #7). */
const INDEX_LANGUAGES = new Set([
  'typescript', 'typescriptreact', 'javascript', 'javascriptreact',
  'swift', 'python', 'go', 'rust', 'java', 'ruby',
]);

/** Cap for a full workspace pass — opening documents is not free. */
const MAX_FILES_PER_REINDEX = 500;

interface FileSymbols {
  id: string; // absolute file path (matches FileRecord.id)
  hash: string; // content hash the symbols were computed from
  symbols: SymbolRecord[];
}

/** Read-only symbol surface used by deterministic retrieval. */
export interface SymbolIndexReader {
  findDeclaration(name: string, excludeFileId?: string): SymbolRecord | undefined;
  all(): SymbolRecord[];
  readonly size: number;
}

/** Lifecycle and mutation surface owned by the extension command layer. */
export interface SymbolIndexService extends SymbolIndexReader {
  load(): Promise<void>;
  reindexFile(fileId: string, hash: string, force?: boolean): Promise<boolean>;
  reindexWorkspace(files: FileRecord[]): Promise<{ files: number; symbols: number }>;
}

/**
 * Build Order #7. The workspace symbol index: name, kind, line range,
 * signature, and a code preview for every declaration the language server
 * reports. Asked via `vscode.executeDocumentSymbolProvider`, flattened by the
 * pure `symbolRecords.ts`, persisted in the local store, and re-read by exact
 * name lookup (retrieval shows the real declaration, not a file's first lines).
 *
 * Incremental: a file whose content hash matches its stored symbols is skipped.
 * Everything is local; nothing here is sent to Claude.
 */
export class SymbolIndex implements SymbolIndexService {
  private readonly files = new Map<string, FileSymbols>();

  constructor(
    private readonly logger: Logger,
    private readonly store?: LocalStore,
  ) {}

  /** Load persisted symbols from the store, if any. */
  async load(): Promise<void> {
    if (!this.store) {
      return;
    }
    try {
      await this.store.init();
      const rows = await this.store.all<FileSymbols>(STORE_TABLE);
      const privacy = readPrivacyConfig();
      let sanitized = false;
      for (const row of rows) {
        if (isPathBlocked(row.id, privacy.blockedFileGlobs)) {
          sanitized = true;
          continue;
        }
        const safe = sanitizeFileSymbols(row);
        sanitized ||= safe.changed;
        this.files.set(row.id, safe.value);
      }
      if (sanitized) {
        await this.persist();
      }
      this.logger.info(`SymbolIndex: loaded symbols for ${rows.length} files.`);
    } catch (err) {
      this.logger.warn('SymbolIndex: load from store failed', String(err));
    }
  }

  /**
   * Index one file's symbols. Skipped when `hash` matches the stored entry
   * (pass `force` to refresh anyway — used for the focal file on Explain, so a
   * dirty editor buffer is always current). Best-effort: a missing provider
   * (e.g. cold SourceKit-LSP) just yields no symbols for now.
   */
  async reindexFile(
    fileId: string,
    hash: string,
    force = false,
  ): Promise<boolean> {
    const privacy = readPrivacyConfig();
    if (isPathBlocked(fileId, privacy.blockedFileGlobs)) {
      return this.files.delete(fileId);
    }
    const existing = this.files.get(fileId);
    if (!force && existing && existing.hash === hash) {
      return false;
    }
    try {
      const document = await vscode.workspace.openTextDocument(
        vscode.Uri.file(fileId),
      );
      const tree = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
        'vscode.executeDocumentSymbolProvider',
        document.uri,
      );
      const rawSymbols = toSymbolRecords(
        (tree ?? []).map(toDocSymbolLike),
        fileId,
        document.getText().split('\n'),
        document.languageId,
      );
      const symbols = rawSymbols.map(sanitizeSymbol);
      this.files.set(fileId, { id: fileId, hash, symbols });
      return true;
    } catch (err) {
      this.logger.warn(`SymbolIndex: failed to index ${fileId}`, String(err));
      return false;
    }
  }

  /**
   * Full pass over the indexed files (hash-skipped, so cheap after the first
   * run). Persists once at the end.
   */
  async reindexWorkspace(
    files: FileRecord[],
  ): Promise<{ files: number; symbols: number }> {
    const eligible = files.filter((f) => INDEX_LANGUAGES.has(f.language));
    const pending = eligible.filter((file) => {
      const existing = this.files.get(file.id);
      return !existing || existing.hash !== file.hash;
    });
    const batch = pending.slice(0, MAX_FILES_PER_REINDEX);
    if (pending.length > batch.length) {
      this.logger.warn(
        `SymbolIndex: capped at ${MAX_FILES_PER_REINDEX} changed files (${pending.length} pending) — run Reindex again to continue.`,
      );
    }

    const keep = new Set(files.map((f) => f.id));
    let changed = 0;
    for (const file of batch) {
      if (await this.reindexFile(file.id, file.hash)) {
        changed++;
      }
    }
    // Drop symbols for files that left the file index.
    for (const id of [...this.files.keys()]) {
      if (!keep.has(id) && !files.some((f) => f.id === id)) {
        this.files.delete(id);
      }
    }
    if (changed > 0) {
      await this.persist();
    }
    const total = this.size;
    this.logger.info(
      `SymbolIndex: ${batch.length} files scanned, ${changed} changed, ${total} symbols.`,
    );
    return { files: batch.length, symbols: total };
  }

  /** The best declaration of `name` outside `excludeFileId`, if indexed. */
  findDeclaration(
    name: string,
    excludeFileId?: string,
  ): SymbolRecord | undefined {
    const candidates: SymbolRecord[] = [];
    for (const file of this.files.values()) {
      if (file.id === excludeFileId) {
        continue;
      }
      for (const symbol of file.symbols) {
        if (symbol.name === name) {
          candidates.push(symbol);
        }
      }
    }
    return pickDeclaration(candidates);
  }

  /** Every indexed symbol (chunk source for vector search, #17). */
  all(): SymbolRecord[] {
    const out: SymbolRecord[] = [];
    for (const file of this.files.values()) {
      out.push(...file.symbols);
    }
    return out;
  }

  get size(): number {
    let n = 0;
    for (const file of this.files.values()) {
      n += file.symbols.length;
    }
    return n;
  }

  /** Persist all symbols to the store. Best-effort. */
  private async persist(): Promise<void> {
    if (!this.store) {
      return;
    }
    try {
      await this.store.replaceTable(STORE_TABLE, [...this.files.values()]);
    } catch (err) {
      this.logger.warn('SymbolIndex: persist to store failed', String(err));
    }
  }
}

function sanitizeFileSymbols(row: FileSymbols): {
  value: FileSymbols;
  changed: boolean;
} {
  const symbols = row.symbols.map(sanitizeSymbol);
  return {
    value: { ...row, symbols },
    changed: symbols.some(
      (symbol, index) =>
        symbol.signature !== row.symbols[index].signature ||
        symbol.codePreview !== row.symbols[index].codePreview,
    ),
  };
}

function sanitizeSymbol(symbol: SymbolRecord): SymbolRecord {
  return {
    ...symbol,
    signature: symbol.signature
      ? redactSecrets(symbol.signature).text
      : undefined,
    codePreview: redactSecrets(symbol.codePreview).text,
  };
}

function toDocSymbolLike(sym: vscode.DocumentSymbol): DocSymbolLike {
  return {
    name: sym.name,
    kind: sym.kind,
    startLine: sym.range.start.line,
    endLine: sym.range.end.line,
    children: (sym.children ?? []).map(toDocSymbolLike),
  };
}
