import * as vscode from 'vscode';

/**
 * Snapshot of the current selection. Line numbers are 1-based for display and
 * for the packet (humans and Claude both read 1-based line numbers).
 */
interface SelectionSnapshot {
  hasSelection: boolean;
  selectedText: string;
  startLine: number; // 1-based
  endLine: number; // 1-based
  startCharacter: number;
  endCharacter: number;
}

export function getSelectionSnapshot(): SelectionSnapshot | undefined {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return undefined;
  }
  const sel = editor.selection;
  const selectedText = editor.document.getText(sel);
  return {
    hasSelection: !sel.isEmpty,
    selectedText,
    startLine: sel.start.line + 1,
    endLine: sel.end.line + 1,
    startCharacter: sel.start.character,
    endCharacter: sel.end.character,
  };
}
