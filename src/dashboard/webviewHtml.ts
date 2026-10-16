import * as vscode from 'vscode';
import { GOALS } from '../explanation/model';
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
  const explanationUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'explanation.js'));
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
        <button class="tab is-active" role="tab" id="tab-explain" data-tab="explain"
          aria-selected="true" aria-controls="panel-explain">Explain</button>
        <button class="tab" role="tab" id="tab-tour" data-tab="tour"
          aria-selected="false" aria-controls="panel-tour" tabindex="-1">Tour</button>
        <button class="tab" role="tab" id="tab-check" data-tab="check"
          aria-selected="false" aria-controls="panel-check" tabindex="-1">Check</button>
      </nav>
      <div class="overflow">
        <button class="icon-btn" id="overflow-btn" aria-haspopup="true"
          aria-expanded="false" aria-label="More actions">${dotsSvg}</button>
        <div class="menu" id="overflow-menu" role="menu" aria-label="More actions" hidden>
          <button role="menuitem" tabindex="-1" data-command="simpleecode.reindexWorkspace">Reindex workspace</button>
          <button role="menuitem" tabindex="-1" data-command="simpleecode.setupSwiftEngine">Set up Swift engine</button>
          <button role="menuitem" tabindex="-1" data-command="workbench.action.openSettings">Settings</button>
          <button role="menuitem" tabindex="-1" data-feedback>Send feedback</button>
          <button role="menuitem" tabindex="-1" data-command="simpleecode.checkForUpdates">Check for updates</button>
        </div>
      </div>
    </header>

    <section class="panel" id="panel-tour" role="tabpanel"
      aria-labelledby="tab-tour" tabindex="0" hidden>
      <div class="tour-scroll" id="tour-content"></div>
    </section>

    <section class="panel is-active" id="panel-explain" role="tabpanel"
      aria-labelledby="tab-explain" tabindex="0">
      <div id="explain-workspace" class="explain-workspace">
        <p class="muted">Choose a goal, optionally tell us how to explain, then press Explain. Your code is not sent until you do.</p>
        <div class="context-bar" id="context-bar"></div>
        <div class="source-actions">
          <button class="ghost-btn" data-explanation="selection">Use current selection</button>
          <button class="ghost-btn" data-explanation="file">Use current file</button>
          <button class="ghost-btn" data-explanation="refresh">Refresh source</button>
          <button class="ghost-btn" data-explanation="new">New explanation</button>
        </div>
        <p id="source-change" class="muted" hidden>Source changed since capture. Refresh source to use the current version.</p>
        <details id="captured-details"><summary>Captured code</summary><pre id="captured-code"></pre></details>
        <div class="explanation-controls">
          <label for="explanation-goal">What would you like to understand?</label>
          <select id="explanation-goal" aria-describedby="goal-description">
            ${Object.entries(GOALS).map(([id, goal]) => `<option value="${id}">${goal.label}</option>`).join('')}
          </select>
          <p id="goal-description" class="muted"></p>
          <label for="explanation-question">Question or symptom (optional)</label>
          <textarea id="explanation-question" rows="2" maxlength="20000"></textarea>
          <label for="explanation-guidance">How would you like it explained? Optional.</label>
          <textarea id="explanation-guidance" rows="2" aria-describedby="guidance-help guidance-error"></textarea>
          <p id="guidance-help" class="muted">Try “ELI5”, “Keep it brief”, or “I know JavaScript but I’m new to Swift”. Up to 2,000 characters.</p>
          <p id="guidance-error" role="alert" hidden>Use at most 2,000 guidance characters.</p>
          <div class="source-actions">
            <button class="ghost-btn" id="save-guidance">Save as my default</button>
            <button class="ghost-btn" data-explanation="removeGuidance" id="remove-guidance">Remove saved default</button>
          </div>
          <p id="guidance-notice" role="status"></p>
          <div id="guidance-confirmation" hidden><pre id="safe-guidance"></pre><button class="btn" id="confirm-guidance">Save this sanitized default</button></div>
        </div>
        <p id="sharing-summary"></p>
        <div id="preparation-gaps"></div>
        <button class="ghost-btn" id="context-settings" data-command="workbench.action.openSettings" hidden>Review context settings</button>
        <p id="explanation-notice" role="status"></p>
        <div class="source-actions">
          <button class="primary-btn" id="explanation-send" disabled>Explain</button>
          <button class="btn" id="inspect-prepared" disabled>View what will be sent</button>
          <button class="btn" data-explanation="cancel" id="explanation-stop" hidden>Stop</button>
        </div>
        <aside id="facts-rail" aria-label="Captured context and facts"></aside>
        <details id="local-explanation-details" hidden><summary>Local explanation (no AI)</summary><div id="local-explanation"></div></details>
        <div id="explain-content"></div>
        <form id="followup-form" hidden>
          <label for="followup-question">Ask about this explanation</label>
          <textarea id="followup-question" rows="2" maxlength="20000"></textarea>
          <p class="muted">Uses this explanation’s code, goal, guidance, and earlier replies.</p>
          <button class="primary-btn" type="submit">Ask follow-up</button>
          <button class="btn" type="button" id="review-followup">Review follow-up first</button>
        </form>
      </div>
      <section id="explanation-inspector" class="explanation-inspector" aria-labelledby="inspector-title" hidden>
        <button class="btn" id="inspector-back">Back to explanation</button>
        <h2 id="inspector-title">What will be sent</h2>
        <div id="inspector-summary"></div>
        <div class="source-actions">
          <button class="btn" id="inspector-copy">Copy prompt</button>
          <button class="primary-btn" id="inspector-send" hidden>Approve and send</button>
        </div>
        <p id="inspector-status" role="status"></p>
        <details id="complete-prompt"><summary>Complete prompt</summary><pre id="inspector-prompt"></pre></details>
        <div id="inspector-history"></div>
      </section>
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

    <div id="answer-live" class="sr-only" role="status" aria-live="polite"></div>
    <div class="modal-root" id="modal-root" hidden></div>
  </div>
  <script nonce="${nonce}" src="${explanationUri}"></script>\n  <script nonce="${nonce}" src="${scriptUri}"></script>
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
