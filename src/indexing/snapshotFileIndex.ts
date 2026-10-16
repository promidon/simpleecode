import * as vscode from 'vscode';
import type { FileIndexReader } from './FileIndex';
import { parseModuleGraph } from './parseModuleGraph';
import { summarizeModule } from './summarizeFile';
import type { SourceSnapshot } from '../explanation/model';

/** Request-local graph overlay. Unsaved text never overwrites the disk index. */
export function snapshotFileIndex(index: FileIndexReader, source: SourceSnapshot): FileIndexReader {
  const open = new Map(vscode.workspace.textDocuments.map(doc => [doc.uri.fsPath, doc]));
  const records = index.all().map(record => {
    const doc = open.get(record.id);
    const text = record.id === source.filePath ? source.fullText : doc?.getText();
    if (text === undefined) { return { ...record }; }
    const graph = parseModuleGraph(text, record.language);
    return { ...record, ...graph, summary: summarizeModule({ language: record.language, imports: graph.imports, exports: graph.exports }) };
  });
  const byPath = new Map(records.map(record => [record.id, record]));
  return { all: () => records, get: path => byPath.get(path), size: records.length };
}
