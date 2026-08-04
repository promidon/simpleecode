import * as vscode from 'vscode';
import type { DashboardHandlers } from './DashboardPanel';
import { getDashboardHtml } from './webviewHtml';
import { dispatchDashboardMessage } from './dashboardMessages';

/**
 * The Activity-Bar sidebar dashboard (Build Order #2). A persistent
 * `WebviewViewProvider` that renders the same UI as `DashboardPanel`, but docked
 * in the side bar instead of an editor tab. It shares the webview HTML and the
 * `DashboardHandlers` contract with the panel so both stay in sync via one
 * `getState()`.
 */
export class DashboardView implements vscode.WebviewViewProvider {
  public static readonly viewType = 'simpleecode.sidebar';

  private view?: vscode.WebviewView;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly handlers: DashboardHandlers,
  ) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media')],
    };
    webviewView.webview.html = getDashboardHtml(
      webviewView.webview,
      this.extensionUri,
    );

    webviewView.webview.onDidReceiveMessage(
      (message: unknown) =>
        dispatchDashboardMessage(
          message,
          this.handlers,
          (reply) => webviewView.webview.postMessage(reply),
          () => this.refresh(),
        ),
    );

    // Re-pull state whenever the view is re-shown after being collapsed/hidden.
    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        void this.refresh();
      }
    });
  }

  /** Re-pull state and push it to the view if it's resolved. Safe any time. */
  async refresh(): Promise<void> {
    if (!this.view) {
      return;
    }
    const state = await this.handlers.getState();
    await this.view.webview.postMessage({ type: 'state', state });
  }
}
