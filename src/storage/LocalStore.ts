/**
 * Local-only persistence boundary for index data.
 *
 * `JsonStore` is the current implementation. A future storage backend can swap
 * behind this deliberately small table-snapshot contract without changing the
 * file or symbol indexes.
 */
export interface LocalStore {
  init(): Promise<void>;
  all<T>(table: string): Promise<T[]>;
  /** Replace an entire table in one atomic snapshot. */
  replaceTable(table: string, rows: Array<{ id: string }>): Promise<void>;
  close(): Promise<void>;
}
