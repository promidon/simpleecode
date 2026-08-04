import * as vscode from 'vscode';

/**
 * Open a vetted external link in the user's browser. Only `http(s)` URLs are
 * allowed — anything else (e.g. `command:`, `file:`) is ignored, so a webview
 * message can never be used to trigger an unexpected scheme.
 */
export function openExternalUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return;
  }
  void vscode.env.openExternal(vscode.Uri.parse(parsed.toString()));
}
