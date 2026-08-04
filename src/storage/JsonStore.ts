import * as vscode from 'vscode';
import type { Logger } from '../utils/logger';
import type { LocalStore } from './LocalStore';

/**
 * Build Order #6. The first concrete `LocalStore`: a single JSON file under the
 * extension's storage folder. No native dependency, survives restarts, and
 * swappable for SQLite / LanceDB later (vectors, #17) without callers changing.
 *
 * Tables live in memory and are flushed to disk on write. Fine for an index of
 * a few thousand files; revisit when the data grows.
 */
export class JsonStore implements LocalStore {
  private readonly fileUri: vscode.Uri;
  private tables: Record<string, Record<string, unknown>> = {};
  private loaded = false;
  private loadFailed = false;

  constructor(
    private readonly storageDir: vscode.Uri,
    private readonly logger?: Logger,
  ) {
    this.fileUri = vscode.Uri.joinPath(storageDir, 'simpleecode-index.json');
  }

  async init(): Promise<void> {
    if (this.loaded) {
      return;
    }
    try {
      await vscode.workspace.fs.createDirectory(this.storageDir);
      const bytes = await vscode.workspace.fs.readFile(this.fileUri);
      this.tables = JSON.parse(Buffer.from(bytes).toString('utf8'));
    } catch (err) {
      if (err instanceof vscode.FileSystemError && err.code === 'FileNotFound') {
        this.tables = {};
      } else {
        this.tables = {};
        this.loadFailed = true;
        this.logger?.warn(
          'JsonStore: existing index could not be read. It will not be overwritten in this session.',
          String(err),
        );
      }
    }
    this.loaded = true;
  }

  async all<T>(table: string): Promise<T[]> {
    return Object.values(this.tables[table] ?? {}) as T[];
  }

  async replaceTable(table: string, rows: Array<{ id: string }>): Promise<void> {
    const map: Record<string, unknown> = {};
    for (const row of rows) {
      map[row.id] = row;
    }
    this.tables[table] = map;
    await this.flush();
  }

  async close(): Promise<void> {
    await this.flush();
  }

  private async flush(): Promise<void> {
    if (this.loadFailed) {
      return;
    }
    try {
      const data = Buffer.from(JSON.stringify(this.tables), 'utf8');
      await vscode.workspace.fs.writeFile(this.fileUri, data);
    } catch (err) {
      this.logger?.warn('JsonStore: flush failed', String(err));
    }
  }
}
