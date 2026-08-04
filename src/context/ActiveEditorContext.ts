import * as vscode from 'vscode';

/**
 * Snapshot of the active editor at a moment in time. Read-only and cheap to
 * build; the dashboard uses it for the live "Active file" panel and the
 * commands use it as the starting point for a packet.
 */
interface ActiveEditorSnapshot {
  filePath?: string;
  /** Workspace-relative path when inside a workspace, else the full path. */
  relativePath?: string;
  languageId?: string;
  isUntitled: boolean;
  lineCount: number;
  fullText: string;
}

export function getActiveEditorSnapshot(): ActiveEditorSnapshot | undefined {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return undefined;
  }
  const doc = editor.document;
  const filePath = doc.isUntitled ? undefined : doc.uri.fsPath;
  return {
    filePath,
    relativePath: filePath
      ? vscode.workspace.asRelativePath(doc.uri, false)
      : undefined,
    languageId: doc.languageId,
    isUntitled: doc.isUntitled,
    lineCount: doc.lineCount,
    fullText: doc.getText(),
  };
}
