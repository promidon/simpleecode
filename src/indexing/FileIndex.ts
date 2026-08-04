import * as vscode from 'vscode';
import { createHash } from 'crypto';
import { buildEdges } from './graphEdges';
import { parseModuleGraph } from './parseModuleGraph';
import { summarizeModule } from './summarizeFile';
import type { LocalStore } from '../storage/LocalStore';
import type { Logger } from '../utils/logger';

const STORE_TABLE = 'files';

/**
 * Build Order #5. Deterministic, local-only file index. No vector DB, no LLM.
 *
 * It scans the workspace for useful files, hashes each one, and keeps a record
 * in memory. Re-indexing is incremental: a file whose content hash is unchanged
 * is skipped. A debounced file watcher keeps the index fresh as you edit.
 *
 * Everything here is local. Nothing is ever sent to Claude from this module.
 * (Storage to SQLite is Build Order #6; imports/exports are #7+.)
 */
export interface FileRecord {
  id: string; // absolute path (stable key)
  path: string; // workspace-relative path (for display)
  language: string;
  hash: string;
  size: number;
  lastIndexedAt: number;
  imports: string[];
  exports: string[];
  /** Type-like names the file uses (drives Swift dependent lookup). */
  references: string[];
  /** Deterministic one-sentence summary (#16), regenerated when the hash changes. */
  summary?: string;
}

/** Read-only index surface used by retrieval and dashboard state. */
export interface FileIndexReader {
  get(path: string): FileRecord | undefined;
  all(): FileRecord[];
  readonly size: number;
}

/** Lifecycle and mutation surface owned by the extension command layer. */
export interface FileIndexService extends FileIndexReader {
  load(): Promise<void>;
  reindex(): Promise<{ scanned: number; indexed: number; removed: number }>;
  startWatching(onChange: () => void): vscode.Disposable;
}

/** Directories/files ignored by default (Build Order #5). */
const DEFAULT_IGNORE_GLOBS = [
  '**/.git/**',
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/out/**',
  '**/coverage/**',
  '**/.cache/**',
  '**/.env',
  '**/.env.*',
];

/** Path segments we skip in the watcher (the watcher itself cannot exclude). */
const IGNORE_SEGMENTS = [
  '/.git/',
  '/node_modules/',
  '/dist/',
  '/build/',
  '/out/',
  '/coverage/',
  '/.cache/',
];

/** File types worth indexing first (Build Order #5 "detect useful files"). */
const INDEX_EXTENSIONS = [
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs',
  'swift',
  'json', 'md',
  'css', 'scss', 'html',
  'py', 'go', 'rs', 'java', 'rb',
];

/** Map a file extension to a coarse language id (deterministic). */
const LANGUAGE_BY_EXT: Record<string, string> = {
  ts: 'typescript', tsx: 'typescriptreact',
  js: 'javascript', jsx: 'javascriptreact', mjs: 'javascript', cjs: 'javascript',
  swift: 'swift',
  json: 'json', md: 'markdown',
  css: 'css', scss: 'scss', html: 'html',
  py: 'python', go: 'go', rs: 'rust', java: 'java', rb: 'ruby',
};

const MAX_FILES = 5000;

export class FileIndex implements FileIndexService {
  private readonly records = new Map<string, FileRecord>();

  constructor(
    private readonly logger: Logger,
    private readonly store?: LocalStore,
  ) {}

  /** Load persisted records from the store (Build Order #6), if any. */
  async load(): Promise<void> {
    if (!this.store) {
      return;
    }
    try {
      await this.store.init();
      const rows = await this.store.all<FileRecord>(STORE_TABLE);
      for (const row of rows) {
        // Records persisted before `references` existed normalize to [].
        this.records.set(row.id, { ...row, references: row.references ?? [] });
      }
      this.logger.info(`FileIndex: loaded ${rows.length} records from store.`);
    } catch (err) {
      this.logger.warn('FileIndex: load from store failed', String(err));
    }
  }

  /** Full workspace scan. Incremental: unchanged files (same hash) are skipped. */
  async reindex(): Promise<{ scanned: number; indexed: number; removed: number }> {
    const folders = vscode.workspace.workspaceFolders ?? [];
    if (folders.length === 0) {
      this.logger.info('FileIndex.reindex(): no workspace folder open.');
      return { scanned: 0, indexed: 0, removed: 0 };
    }

    const include = `**/*.{${INDEX_EXTENSIONS.join(',')}}`;
    const exclude = `{${DEFAULT_IGNORE_GLOBS.join(',')}}`;
    const uris = await vscode.workspace.findFiles(include, exclude, MAX_FILES);

    const seen = new Set<string>();
    let indexed = 0;
    for (const uri of uris) {
      seen.add(uri.fsPath);
      if (await this.indexFile(uri)) {
        indexed++;
      }
    }

    let removed = 0;
    for (const path of [...this.records.keys()]) {
      if (!seen.has(path)) {
        this.records.delete(path);
        removed++;
      }
    }

    this.logger.info(
      `FileIndex: scanned ${uris.length}, changed ${indexed}, removed ${removed}.`,
    );
    if (uris.length >= MAX_FILES) {
      this.logger.warn(
        `FileIndex: hit the ${MAX_FILES}-file cap; some files were not indexed.`,
      );
    }
    if (indexed > 0 || removed > 0) {
      await this.persist();
    }
    return { scanned: uris.length, indexed, removed };
  }

  /**
   * Watch the workspace and keep the index current. Returns a Disposable that
   * stops watching. Updates are debounced before calling `onChange` so a burst
   * of edits triggers a single dashboard refresh (Build Order #5 / #4 guard).
   */
  startWatching(onChange: () => void): vscode.Disposable {
    const watcher = vscode.workspace.createFileSystemWatcher(
      `**/*.{${INDEX_EXTENSIONS.join(',')}}`,
    );

    let debounce: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      if (debounce) {
        clearTimeout(debounce);
      }
      debounce = setTimeout(() => {
        void this.persist();
        onChange();
      }, 400);
    };

    const onCreateOrChange = async (uri: vscode.Uri) => {
      if (this.isIgnored(uri)) {
        return;
      }
      if (await this.indexFile(uri)) {
        schedule();
      }
    };
    const onDelete = (uri: vscode.Uri) => {
      if (this.records.delete(uri.fsPath)) {
        schedule();
      }
    };

    return vscode.Disposable.from(
      watcher,
      watcher.onDidCreate(onCreateOrChange),
      watcher.onDidChange(onCreateOrChange),
      watcher.onDidDelete(onDelete),
      new vscode.Disposable(() => debounce && clearTimeout(debounce)),
    );
  }

  /** Index one file. Returns true only if its content hash changed (or is new). */
  private async indexFile(uri: vscode.Uri): Promise<boolean> {
    try {
      const bytes = await vscode.workspace.fs.readFile(uri);
      const hash = createHash('sha256').update(bytes).digest('hex');
      const existing = this.records.get(uri.fsPath);
      if (existing && existing.hash === hash) {
        return false; // unchanged — incremental skip
      }
      const language = languageFromPath(uri.fsPath);
      const graph = parseModuleGraph(Buffer.from(bytes).toString('utf8'), language);
      this.records.set(uri.fsPath, {
        id: uri.fsPath,
        path: vscode.workspace.asRelativePath(uri, false),
        language,
        hash,
        size: bytes.byteLength,
        lastIndexedAt: Date.now(),
        imports: graph.imports,
        exports: graph.exports,
        references: graph.references,
        summary: summarizeModule({
          language,
          imports: graph.imports,
          exports: graph.exports,
        }),
      });
      return true;
    } catch (err) {
      this.logger.warn(`FileIndex: failed to index ${uri.fsPath}`, String(err));
      return false;
    }
  }

  private isIgnored(uri: vscode.Uri): boolean {
    return IGNORE_SEGMENTS.some((seg) => uri.fsPath.includes(seg));
  }

  /**
   * Write the current records — and the graph edges derived from them (#19) —
   * to the store (Build Order #6). Best-effort.
   */
  private async persist(): Promise<void> {
    if (!this.store) {
      return;
    }
    try {
      const records = [...this.records.values()];
      await this.store.replaceTable(STORE_TABLE, records);
      await this.store.replaceTable('edges', buildEdges(records));
    } catch (err) {
      this.logger.warn('FileIndex: persist to store failed', String(err));
    }
  }

  get(path: string): FileRecord | undefined {
    return this.records.get(path);
  }

  all(): FileRecord[] {
    return [...this.records.values()];
  }

  get size(): number {
    return this.records.size;
  }

}

function languageFromPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  return LANGUAGE_BY_EXT[ext] ?? ext ?? 'plaintext';
}
