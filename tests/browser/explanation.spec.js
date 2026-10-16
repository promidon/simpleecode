const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const Module = require('node:module');
const originalLoad = Module._load;
Module._load = function (id, ...args) {
  if (id === 'vscode') { return { Uri: { joinPath: (_base, ...parts) => 'http://simpleecode.test/' + parts.join('/') } }; }
  return originalLoad.call(this, id, ...args);
};
const { getDashboardHtml } = require('../../out/dashboard/webviewHtml');
Module._load = originalLoad;
const { ExplanationCoordinator } = require('../../out/explanation/ExplanationCoordinator');
const { buildContextPacket } = require('../../out/context/buildContextPacket');
const { DEFAULT_PRIVACY_CONFIG } = require('../../out/privacy/privacyGuard');
const { buildPrompt } = require('../../out/prompt/promptBuilder');
const { buildOutboundEnvelope } = require('../../out/privacy/OutboundEnvelope');
const { parseDashboardMessage } = require('../../out/dashboard/dashboardMessages');
const { GOALS } = require('../../out/explanation/model');
const { markdownToHtml } = require('../../out/utils/markdownToHtml');

async function mount(page, review = false, hasSource = true, streaming = false) {
  const sent = [], messages = [], errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const source = { uri: 'file:///fixture/AudioManager.tsx', filePath: '/fixture/AudioManager.tsx', label: 'src/AudioManager.tsx',
    version: 1, languageId: 'typescriptreact', fullText: 'function AudioDataBar() { return <div />; }',
    selectedText: 'return <div />;', startLine: 2, endLine: 2, startCharacter: 2, endCharacter: 16, focus: 'selection', diagnostics: [] };
  let savedGuidance = '', updateChunk, finish;
  const render = async () => {
    if (page.isClosed()) { return; }
    const x = coordinator.state, p = x.prepared;
    const snapshot = { phase: x.phase, activeFile: source.label, selection: { hasSelection: true, startLine: 2, endLine: 2, selectedText: source.selectedText },
      acp: { available: true, detail: 'Fake transport' }, index: { files: 3 },
      experience: { ...x, savedGuidance, guidanceNotice: '', sourceChanged: false,
        turns: x.turns.map(t => ({ ...t, html: markdownToHtml(t.text), goalLabel: GOALS[t.request.draft.options.goal].label })) },
      facts: p?.facts, contextGaps: p?.gaps };
    await page.evaluate(state => window.postMessage({ type: 'state', state }, '*'), snapshot);
  };
  const coordinator = new ExplanationCoordinator({
    async prepare(draft, _signal, previous) {
      const packet = buildContextPacket(draft, DEFAULT_PRIVACY_CONFIG);
      const prompt = buildPrompt(packet, [], 'standard', undefined, undefined, undefined, draft.options);
      return { draft, packet, envelope: buildOutboundEnvelope(packet, prompt, [], 'Fake ACP agent'), retrieved: [], gaps: [], settingsKey: 'fixture', delivery: 'agent', requiresReview: review,
        truth: previous?.truth || { sentCode: packet.selectedText, knownFiles: ['src/AudioManager.tsx'], knownSymbols: [] } };
    },
    async send(request, chunk) {
      sent.push(request.envelope.prompt); updateChunk = chunk; chunk('A short explanation.');
      if (streaming) { await new Promise(resolve => { finish = resolve; }); }
      return { delivery: 'agent', detail: 'Fixture answer complete.', answer: 'A short explanation.' };
    },
    async copy(prompt) { messages.push({ copied: prompt }); }, reset() {}, settingsKey: () => 'fixture', changed() { void render(); },
  });
  await page.exposeBinding('hostMessage', async (_source, message) => {
    messages.push(message);
    const parsed = parseDashboardMessage(message);
    if (parsed?.type === 'ready') { await render(); }
    if (parsed?.type === 'explanation') {
      const m = parsed.message;
      if (m.action === 'options') { await coordinator.edit(m.options); }
      if (m.action === 'send' || m.action === 'handoff') { await coordinator.send(m.revision, m.action, m.approved); }
      if (m.action === 'copy') { await coordinator.copy(m.revision); }
      if (m.action === 'followup') {
        await coordinator.followup(m.question);
        if (m.nextAction === 'send') { await coordinator.send(coordinator.state.draft.revision, 'send'); }
        if (m.nextAction === 'review') { coordinator.review(); }
      }
      if (m.action === 'cancel') { coordinator.cancel(); }
      if (m.action === 'saveGuidance') { savedGuidance = m.text; await render(); }
      if (m.action === 'removeGuidance') { savedGuidance = ''; await render(); }
    }
  });
  await page.addInitScript(() => {
    window.acquireVsCodeApi = () => ({ postMessage: message => window.hostMessage(message), getState: () => window.savedUi || {}, setState: value => { window.savedUi = value; } });
  });
  const html = getDashboardHtml({ asWebviewUri: value => value, cspSource: 'http://simpleecode.test' }, 'root');
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'simpleecode.test') { return route.abort(); }
    if (url.pathname === '/') { return route.fulfill({ contentType: 'text/html', body: html }); }
    const file = resolve(__dirname, '../..', '.' + url.pathname);
    return route.fulfill({ body: readFileSync(file), contentType: file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'application/javascript' : 'font/woff2' });
  });
  if (hasSource) { await coordinator.prepare(source, { goal: 'understand', question: '', guidance: '' }); }
  await page.goto('http://simpleecode.test');
  if (hasSource) { await expect(page.locator('#explanation-send')).toBeEnabled(); }
  return { coordinator, render, sent, messages, errors, getSaved: () => savedGuidance, lateChunk: text => updateChunk?.(text), finish: () => finish?.() };
}

test('empty startup is usable and cannot send until code is captured', async ({ page }) => {
  const h = await mount(page, false, false);
  await expect(page.locator('#explanation-send')).toBeDisabled();
  await expect(page.locator('#sharing-summary')).toContainText('Choose code');
  expect(h.errors).toEqual([]); expect(h.sent).toHaveLength(0);
});

test('prepared flow is local; ELI5, explicit save, direct send, follow-up and optional history', async ({ page }) => {
  const h = await mount(page);
  expect(h.sent).toHaveLength(0);
  await page.locator('#explanation-guidance').fill('ELI5');
  await expect(page.locator('#explanation-send')).toBeEnabled();
  expect(h.getSaved()).toBe('');
  await page.locator('#save-guidance').click();
  await expect.poll(h.getSaved).toBe('ELI5');
  await page.locator('#explanation-send').click();
  await expect(page.locator('#explain-content')).toContainText('A short explanation.');
  expect(h.sent).toHaveLength(1); expect(h.sent[0]).toContain('ELI5');
  await page.getByRole('button', { name: 'What was sent', exact: true }).click();
  await expect(page.locator('#explanation-inspector')).toBeVisible();
  await expect(page.locator('#inspector-prompt')).toHaveText(h.sent[0]);
  await expect(page.locator('#inspector-send')).toBeHidden();
  await page.locator('#inspector-back').click();
  await page.locator('#followup-question').fill('Why does that happen?');
  await page.getByRole('button', { name: 'Review follow-up first' }).click();
  await expect(page.locator('#explanation-inspector')).toBeVisible();
  await expect(page.locator('#inspector-history')).toContainText('Earlier request');
  await page.locator('#inspector-send').click();
  await expect.poll(() => h.sent.length).toBe(2);
  expect(h.sent[1]).toContain('ELI5');
  await page.locator('#followup-question').fill('And what next?');
  await page.getByRole('button', { name: 'Ask follow-up', exact: true }).click();
  await expect.poll(() => h.sent.length).toBe(3);
  expect(h.errors).toEqual([]);
  const ui = await page.evaluate(() => window.savedUi);
  expect(JSON.stringify(ui)).not.toContain('ELI5');
});

test('explicit review remains inline and never blocks the editor with a modal', async ({ page }) => {
  const h = await mount(page, true);
  await page.locator('#explanation-send').click();
  await expect(page.locator('#explanation-inspector')).toBeVisible();
  expect(h.sent).toHaveLength(0);
  await expect(page.locator('[role="dialog"]')).toHaveCount(0);
  await page.locator('#inspector-send').click();
  await expect.poll(() => h.sent.length).toBe(1);
});

for (const theme of ['', 'vscode-dark', 'vscode-high-contrast', 'vscode-high-contrast-light']) {
  test('320px reflow, reachable inspection and automated accessibility: ' + (theme || 'light'), async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 600 });
    await mount(page);
    await page.evaluate(theme => document.body.className = theme, theme);
    const workspaceResult = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(workspaceResult.violations).toEqual([]);
    await page.screenshot({ path: 'test-results/workspace-' + (theme || 'light') + '.png' });
    await page.locator('#inspect-prepared').click();
    await expect(page.locator('#inspector-send')).toBeHidden();
    await page.locator('#complete-prompt summary').click();
    await page.locator('#inspector-back').scrollIntoViewIfNeeded();
    await expect(page.locator('#inspector-back')).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(result.violations).toEqual([]);
    await page.screenshot({ path: 'test-results/explanation-' + (theme || 'light') + '.png' });
  });
}

test('oversized guidance is inline; state updates keep caret, text and scroll', async ({ page }) => {
  const h = await mount(page);
  await page.locator('#explanation-guidance').fill('x'.repeat(2001));
  await expect(page.locator('#guidance-error')).toBeVisible();
  await expect(page.locator('#explanation-send')).toBeDisabled();
  await page.locator('#explanation-guidance').fill('Keep it brief');
  await expect(page.locator('#explanation-send')).toBeEnabled();
  const before = await page.locator('#explanation-guidance').evaluate(el => el.selectionStart);
  await h.render();
  await expect(page.locator('#explanation-guidance')).toBeFocused();
  await expect(page.locator('#explanation-guidance')).toHaveValue('Keep it brief');
  expect(await page.locator('#explanation-guidance').evaluate(el => el.selectionStart)).toBe(before);
  await page.setViewportSize({ width: 1024, height: 600 });
  await page.evaluate(() => document.body.style.zoom = '2');
  await page.locator('#inspect-prepared').click();
  await expect(page.locator('#inspector-back')).toBeVisible();
});

test('streaming preserves focus and disclosure; Stop retains incomplete text and rejects late output', async ({ page }) => {
  const h = await mount(page, false, true, true);
  await page.locator('#explanation-send').click();
  await expect(page.locator('#explanation-stop')).toBeVisible();
  await page.locator('#captured-details summary').click();
  await page.locator('#explanation-guidance').focus();
  h.lateChunk('A longer streamed explanation.');
  await expect(page.locator('#explain-content')).toContainText('A longer streamed explanation.');
  await expect(page.locator('#explanation-guidance')).toBeFocused();
  await expect(page.locator('#captured-details')).toHaveAttribute('open', '');
  await page.locator('#explanation-stop').click();
  await expect(page.locator('#explain-content')).toContainText('incomplete');
  await expect(page.locator('#answer-live')).toContainText('incomplete');
  h.lateChunk('WRONG LATE OUTPUT'); h.finish();
  await h.render();
  await expect(page.locator('#explain-content')).not.toContainText('WRONG LATE OUTPUT');
  expect(h.errors).toEqual([]);
});

test('keyboard reaches Explain; a large prompt stays scrollable in a short narrow view', async ({ page }) => {
  const h = await mount(page);
  for (let i = 0; i < 35 && !(await page.locator('#explanation-send').evaluate(el => el === document.activeElement)); i++) { await page.keyboard.press('Tab'); }
  await expect(page.locator('#explanation-send')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect.poll(() => h.sent.length).toBe(1);
  const d = h.coordinator.state.draft;
  await h.coordinator.prepare({ ...d.source, selectedText: 'const long = "' + 'x'.repeat(150000) + '";', fullText: '', endLine: d.source.startLine }, d.options);
  await page.setViewportSize({ width: 320, height: 380 });
  await page.locator('#inspect-prepared').click();
  await page.locator('#complete-prompt summary').click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  await page.locator('#inspector-back').scrollIntoViewIfNeeded();
  await page.locator('#inspector-back').focus(); await page.keyboard.press('Enter');
  await expect(page.locator('#explain-workspace')).toBeVisible();
  expect(h.errors).toEqual([]);
});

test('re-rendered controls keep focus: stream Stop, tour Next, and the overflow menu', async ({ page }) => {
  const h = await mount(page, false, true, true);
  await page.locator('#explanation-send').click();
  const stop = page.locator('.turn-stop');
  await stop.focus();
  h.lateChunk('More streamed text.');
  await expect(page.locator('#explain-content')).toContainText('More streamed text.');
  await expect(stop).toBeFocused();
  await stop.click();
  await expect(stop).toBeHidden();

  const tourState = index => ({ phase: 'idle', acp: { available: true, detail: '' }, index: { files: 3 }, feedbackConfigured: false,
    tour: { index, count: 3, total: 3, stop: { path: `src/step${index}.ts`, language: 'TypeScript', summary: '', reason: 'Fixture step.', exposes: [], dependsOn: [], dependents: [] } } });
  await page.locator('#tab-tour').click();
  await page.evaluate(state => window.postMessage({ type: 'state', state }, '*'), tourState(0));
  await page.locator('[data-command="simpleecode.tourNext"]').focus();
  await page.evaluate(state => window.postMessage({ type: 'state', state }, '*'), tourState(1));
  await expect(page.locator('#tour-content')).toContainText('src/step1.ts');
  await expect(page.locator('[data-command="simpleecode.tourNext"]')).toBeFocused();

  await page.locator('#overflow-btn').click();
  await expect(page.locator('[data-feedback]')).toHaveText('Report an issue ↗');
  await page.locator('[data-feedback]').click();
  await expect(page.locator('#overflow-btn')).toBeFocused();
  expect(h.messages.some(m => m.type === 'openExternal' && m.url.endsWith('/issues/new/choose'))).toBeTruthy();
  expect(h.errors).toEqual([]);
});
