import * as vscode from 'vscode';
import type { SourceSnapshot } from './model';

export function captureSource(focus: SourceSnapshot['focus'], editor = vscode.window.activeTextEditor, range = editor?.selection): SourceSnapshot | undefined {
  if (!editor || !range) { return undefined; }
  const doc = editor.document;
  return {
    uri: doc.uri.toString(), filePath: doc.isUntitled ? undefined : doc.uri.fsPath,
    label: doc.isUntitled ? doc.fileName : vscode.workspace.asRelativePath(doc.uri, false),
    version: doc.version, languageId: doc.languageId, fullText: doc.getText(), selectedText: doc.getText(range),
    startLine: range.start.line + 1, endLine: range.end.line + 1,
    startCharacter: range.start.character, endCharacter: range.end.character, focus,
    diagnostics: vscode.languages.getDiagnostics(doc.uri)
      .filter(d => focus === 'file' || d.range.intersection(range))
      .slice(0, 40).map(d => `${vscode.DiagnosticSeverity[d.severity]} at line ${d.range.start.line + 1}: ${d.message}`),
  };
}
