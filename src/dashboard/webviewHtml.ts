import * as vscode from 'vscode';
import { randomBytes } from 'crypto';

/**
 * Shared HTML shell for the SimpleeCode webview, used by both the editor-tab
 * `DashboardPanel` and the Activity-Bar `DashboardView` (Build Order #2). The
 * chrome (header, tab bar, panels) is static; per-tab content is rendered
 * client-side by `media/dashboard.js` from the `DashboardState` the extension
 * posts in.
 *
 * The visual language follows `docs/design/redesign-plan.md`: a brand colour
 * palette (light/dark, keyed off VS Code's `vscode-dark`/`vscode-high-contrast`
 * body classes) over VS Code's own geometry (padding, radius, focus) inherited
 * through `--vscode-*` variables.
 */
export function getDashboardHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
): string {
  const styleUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'media', 'dashboard.css'),
  );
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'media', 'dashboard.js'),
  );
  const nonce = makeNonce();
  const csp = [
    `default-src 'none'`,
    `style-src ${webview.cspSource}`,
    `script-src 'nonce-${nonce}'`,
    `font-src ${webview.cspSource}`,
  ].join('; ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link href="${styleUri}" rel="stylesheet" />
  <title>SimpleeCode</title>
</head>
<body>
  <div class="shell">
    <header class="topbar">
      <div class="brand">
        <span class="brand-glyph" aria-hidden="true">${glyphSvg}</span>
        <span class="brand-name">SimpleeCode</span>
        <span class="status-pill" id="status-pill" role="status" aria-live="polite"></span>
      </div>
      <nav class="tabs" role="tablist" aria-label="SimpleeCode sections">
        <button class="tab is-active" role="tab" id="tab-tour" data-tab="tour"
          aria-selected="true" aria-controls="panel-tour">Tour</button>
        <button class="tab" role="tab" id="tab-explain" data-tab="explain"
          aria-selected="false" aria-controls="panel-explain" tabindex="-1">Explain</button>
        <button class="tab" role="tab" id="tab-check" data-tab="check"
          aria-selected="false" aria-controls="panel-check" tabindex="-1">Check</button>
      </nav>
      <div class="overflow">
        <button class="icon-btn" id="overflow-btn" aria-haspopup="true"
          aria-expanded="false" aria-label="More actions">${dotsSvg}</button>
        <div class="menu" id="overflow-menu" role="menu" aria-label="More actions" hidden>
          <button role="menuitem" data-command="simpleecode.reindexWorkspace">Reindex workspace</button>
          <button role="menuitem" data-command="simpleecode.setupSwiftEngine">Set up Swift engine</button>
          <button role="menuitem" data-command="workbench.action.openSettings">Settings</button>
          <button role="menuitem" data-feedback>Send feedback</button>
          <button role="menuitem" data-command="simpleecode.checkForUpdates">Check for updates</button>
        </div>
      </div>
    </header>

    <section class="panel is-active" id="panel-tour" role="tabpanel"
      aria-labelledby="tab-tour" tabindex="0">
      <div class="tour-scroll" id="tour-content"></div>
    </section>

    <section class="panel" id="panel-explain" role="tabpanel"
      aria-labelledby="tab-explain" tabindex="0" hidden>
      <div class="context-bar" id="context-bar"></div>
      <div class="explain-body">
        <div class="explain-main">
          <div class="explain-scroll" id="explain-content"></div>
          <div class="composer">
            <div class="composer-controls">
              <span class="depth-label">Depth</span>
              <div class="segmented" role="group" aria-label="Explanation depth">
                <button class="seg" data-mode="beginner" aria-pressed="false"
                  data-command="simpleecode.explainBeginner">Beginner</button>
                <button class="seg is-active" data-mode="detailed" aria-pressed="true"
                  data-command="simpleecode.explainDetailed">Detailed</button>
                <button class="seg" data-mode="debug" aria-pressed="false"
                  data-command="simpleecode.explainDebug">Debug</button>
              </div>
              <button class="ghost-btn new-btn" data-command="simpleecode.newConversation">
                <span aria-hidden="true">↻</span> New</button>
            </div>
            <form class="ask" id="ask">
              <input id="ask-input" type="text" autocomplete="off"
                placeholder="Ask about the selection…"
                aria-label="Ask a question about the current code" />
              <button type="submit" class="send-btn" aria-label="Send question">
                <span aria-hidden="true">→</span></button>
            </form>
          </div>
        </div>
        <aside class="facts-rail" id="facts-rail" aria-label="Context and facts"></aside>
      </div>
      <div id="answer-live" class="sr-only" role="status" aria-live="polite"></div>
    </section>

    <section class="panel" id="panel-check" role="tabpanel"
      aria-labelledby="tab-check" tabindex="0" hidden>
      <div class="check-wrap">
        <h2 class="panel-title">Check an answer</h2>
        <p class="panel-sub">Paste any explanation — from SimpleeCode or anywhere else — and
          SimpleeCode verifies its file, symbol, and line claims against your real code.</p>
        <textarea id="check-input" rows="6" placeholder="Paste the explanation here…"
          aria-label="Answer to check"></textarea>
        <button id="check-run" class="primary-btn">
          <span class="btn-ico" aria-hidden="true">✓</span> Check claims</button>
        <div id="check-results"></div>
        <div id="check-answer"></div>
      </div>
    </section>

    <div class="modal-root" id="modal-root" hidden></div>
  </div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}

/** Brand magnifier glyph (mirrors media/simpleecode-icon.svg), currentColor. */
const glyphSvg =
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
  '<circle cx="10" cy="10" r="6.25" stroke="currentColor" stroke-width="1.6" />' +
  '<circle cx="10" cy="10" r="2.4" fill="currentColor" />' +
  '<line x1="14.8" y1="14.8" x2="20" y2="20" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />' +
  '</svg>';

/** Horizontal ellipsis for the overflow trigger. */
const dotsSvg =
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">' +
  '<circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" />' +
  '</svg>';

function makeNonce(): string {
  return randomBytes(24).toString('base64url');
}
