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
      aria-labelledby="tab-tour" tabindex="-1" hidden>
      <div class="tour-scroll" id="tour-content"></div>
    </section>

    <section class="panel is-active" id="panel-explain" role="tabpanel"
      aria-labelledby="tab-explain" tabindex="-1">
      <div id="explain-workspace" class="explain-workspace">
        <div id="setup-summary" class="setup-summary" hidden>
          <span id="setup-summary-text" class="setup-summary-text"></span>
          <button class="link-btn" id="setup-edit" aria-controls="setup-card" aria-expanded="false">Edit</button>
        </div>
        <section id="setup-card" class="setup-card" aria-labelledby="setup-title">
          <h2 id="setup-title" class="sr-only">Prepare an explanation</h2>
          <div class="source-row">
            <div class="context-bar" id="context-bar"></div>
            <details class="source-menu" id="source-menu">
              <summary class="btn btn-sm">Change</summary>
              <div class="source-menu-list">
                <button class="menu-row" data-explanation="selection">Use current selection</button>
                <button class="menu-row" data-explanation="file">Use current file</button>
                <button class="menu-row" data-explanation="refresh">Refresh source</button>
              </div>
            </details>
          </div>
          <p id="source-change" class="notice" hidden>Source changed since capture. Use Change → Refresh source to explain the current version.</p>
          <details id="captured-details" class="fold"><summary>Captured code</summary><pre id="captured-code"></pre></details>
          <div class="explanation-controls">
            <fieldset class="goal-field" aria-describedby="goal-description">
              <legend>Goal</legend>
              <div class="segmented" id="explanation-goal">
                ${Object.entries(GOALS).map(([id, goal]) => `<label class="seg"><input type="radio" name="explanation-goal" value="${id}"${id === 'understand' ? ' checked' : ''}><span>${goal.short}</span></label>`).join('')}
              </div>
              <p id="goal-description" class="hint"></p>
            </fieldset>
            <label for="explanation-question">Question or symptom <span class="optional">optional</span></label>
            <textarea id="explanation-question" rows="2" maxlength="20000"></textarea>
            <label for="explanation-guidance">How should it be explained? <span class="optional">optional</span></label>
            <textarea id="explanation-guidance" rows="2" aria-describedby="guidance-help guidance-error"></textarea>
            <div class="pill-row" id="guidance-pills" aria-label="Guidance suggestions" role="group">
              <button class="pill" data-guidance="ELI5">ELI5</button>
              <button class="pill" data-guidance="Keep it brief">Keep it brief</button>
              <button class="pill" id="guidance-language" data-guidance="I’m new to this language" hidden>New to this language</button>
              <button class="pill pill-quiet" id="save-guidance">Save as my default</button>
              <button class="pill pill-quiet" data-explanation="removeGuidance" id="remove-guidance">Remove saved default</button>
            </div>
            <p id="guidance-help" class="hint">Up to 2,000 characters. Saved defaults stay on this device.</p>
            <p id="guidance-error" class="field-error" role="alert" hidden>Use at most 2,000 guidance characters.</p>
            <p id="guidance-notice" class="notice" role="status"></p>
            <div id="guidance-confirmation" class="confirm" hidden><pre id="safe-guidance"></pre><button class="btn" id="confirm-guidance">Save this sanitized default</button></div>
          </div>
          <div class="privacy-line">
            <span class="privacy-icon" aria-hidden="true">${shieldSvg}</span>
            <p id="sharing-summary"></p>
          </div>
          <details id="gaps-details" class="fold" hidden><summary id="gaps-summary">What the answer can’t see</summary><div id="preparation-gaps"></div></details>
          <button class="link-btn" id="context-settings" data-command="workbench.action.openSettings" hidden>Review context settings</button>
          <p id="explanation-notice" class="notice" role="status"></p>
          <div class="action-row">
            <button class="primary-btn" id="explanation-send" disabled>Explain</button>
            <button class="btn" id="inspect-prepared" disabled>View prompt</button>
            <button class="btn" data-explanation="cancel" id="explanation-stop" hidden>Stop</button>
          </div>
          <p id="send-reason" class="hint" hidden></p>
        </section>
        <aside id="facts-rail" aria-label="Captured context and facts"></aside>
        <details id="local-explanation-details" class="fold" hidden><summary>Local explanation (no AI)</summary><div id="local-explanation"></div></details>
        <div id="explain-content"></div>
        <form id="followup-form" class="followup" hidden>
          <label for="followup-question">Ask about this explanation</label>
          <div class="followup-row">
            <textarea id="followup-question" rows="2" maxlength="20000" aria-describedby="followup-help"></textarea>
            <button class="primary-btn icon-only" type="submit" aria-label="Ask follow-up"><span aria-hidden="true">${arrowUpSvg}</span></button>
          </div>
          <p id="followup-help" class="hint">Uses this explanation’s code, goal, guidance, and earlier replies.</p>
          <div class="link-row">
            <button class="link-btn" type="button" id="review-followup">Review follow-up first</button>
            <button class="link-btn" type="button" data-explanation="new">New explanation</button>
          </div>
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
      aria-labelledby="tab-check" tabindex="-1" hidden>
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

/** Shield for the one-line privacy summary, currentColor. */
const shieldSvg =
  '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
  '<path d="M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6l7-3z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" />' +
  '<path d="M9 12l2 2 4-4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />' +
  '</svg>';

/** Up arrow for the follow-up send button, currentColor. */
const arrowUpSvg =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
  '<path d="M12 19V5M5 12l7-7 7 7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />' +
  '</svg>';

/** Horizontal ellipsis for the overflow trigger. */
const dotsSvg =
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">' +
  '<circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" />' +
  '</svg>';

function makeNonce(): string {
  return randomBytes(24).toString('base64url');
}
