import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ExplanationCoordinator, type ExplanationDependencies } from '../explanation/ExplanationCoordinator';
import { goalScope, validOptions, type SourceSnapshot, type PreparedExplanation } from '../explanation/model';
import { buildContextPacket } from '../context/buildContextPacket';
import { DEFAULT_PRIVACY_CONFIG } from '../privacy/privacyGuard';
import { buildOutboundEnvelope } from '../privacy/OutboundEnvelope';
import { buildPrompt } from '../prompt/promptBuilder';
import { parseDashboardMessage } from '../dashboard/dashboardMessages';

const source: SourceSnapshot = { uri: 'file:///fixture/a.ts', filePath: '/fixture/a.ts', label: 'a.ts', version: 1,
  languageId: 'typescript', fullText: 'const x = 1;\nprivateContent()', selectedText: 'const x = 1;',
  startLine: 1, endLine: 1, startCharacter: 0, endCharacter: 12, focus: 'selection', diagnostics: [] };
const options = { goal: 'understand' as const, question: '', guidance: 'ELI5' };
function harness(overrides: Partial<ExplanationDependencies> = {}) {
  const sent: string[] = []; const copied: string[] = []; let resets = 0;
  const deps: ExplanationDependencies = {
    async prepare(draft, _signal, previous) {
      const packet = buildContextPacket(draft, DEFAULT_PRIVACY_CONFIG);
      const prompt = buildPrompt(packet, [], 'standard', undefined, undefined, undefined, draft.options);
      return { draft, packet, envelope: buildOutboundEnvelope(packet, prompt, [], 'agent'),
        retrieved: [], gaps: [], settingsKey: 'one', delivery: 'agent', requiresReview: false,
        truth: previous?.truth ?? { sentCode: packet.selectedText!, knownFiles: ['a.ts'], knownSymbols: [] } };
    },
    async send(p, chunk) { sent.push(p.envelope.prompt); chunk('answer'); return { delivery: 'agent', detail: 'done', answer: 'answer' }; },
    async copy(text) { copied.push(text); }, reset() { resets++; }, settingsKey: () => 'one', changed() {}, ...overrides,
  };
  return { c: new ExplanationCoordinator(deps), sent, copied, resets: () => resets, deps };
}
test('preparation is local; source captured and frozen; copy/send inspect the identical envelope', async () => {
  const h = harness(); const mutable = { ...source };
  await h.c.prepare(mutable, options); mutable.selectedText = 'wrong editor';
  const p = h.c.state.prepared!;
  assert.equal(p.draft.source.selectedText, source.selectedText);
  assert.ok(Object.isFrozen(p.envelope)); assert.equal(h.sent.length, 0);
  await h.c.copy(p.draft.revision); await h.c.send(p.draft.revision, 'send');
  assert.equal(h.sent[0], p.envelope.prompt); assert.equal(h.copied[0], h.sent[0]);
});
test('goals request different evidence while every privacy ceiling is respected', () => {
  for (const ceiling of ['selection_only', 'current_file', 'related_files', 'system_context'] as const) {
    assert.equal(goalScope('understand', 'selection', ceiling), 'selection_only');
    assert.equal(goalScope('connections', 'selection', ceiling), ceiling);
  }
  assert.equal(goalScope('investigate', 'selection', 'system_context'), 'related_files');
  assert.equal(goalScope('understand', 'file', 'system_context'), 'current_file');
});
test('a broadened goal keeps its selected subject, and a narrow ceiling never sends the rest of the file', () => {
  const p = buildContextPacket({ source, options: { ...options, goal: 'connections' }, revision: 1, session: 1 }, { ...DEFAULT_PRIVACY_CONFIG, defaultScope: 'selection_only' });
  assert.equal(p.selectedText, source.selectedText); assert.equal(p.fullText, undefined);
  assert.throws(() => buildContextPacket({ source: { ...source, selectedText: '', focus: 'file' }, options, revision: 1, session: 1 }, { ...DEFAULT_PRIVACY_CONFIG, defaultScope: 'selection_only' }));
});
test('blocked sources and secret questions are guarded', () => {
  const draft = { source, options: { ...options, question: 'api_key=secret-value' }, revision: 1, session: 1 };
  assert.ok(!buildContextPacket(draft, DEFAULT_PRIVACY_CONFIG).userPrompt.includes('secret-value'));
  assert.throws(() => buildContextPacket({ ...draft, source: { ...source, filePath: '/fixture/.env' } }, DEFAULT_PRIVACY_CONFIG));
});
test('truncated source ranges never claim omitted lines or the synthetic marker', () => {
  const draft = { source: { ...source, fullText: 'first\nsecond\nthird\nfourth', focus: 'file' as const }, options, revision: 1, session: 1 };
  const packet = buildContextPacket(draft, { ...DEFAULT_PRIVACY_CONFIG, maxFileBytes: 8 });
  assert.equal(packet.startLine, 1); assert.equal(packet.endLine, 2); assert.equal(packet.meta?.truncated, true);
  assert.ok(!packet.fullText?.includes('third'));
});
test('empty selection cannot silently become a file explanation', () => {
  assert.throws(() => buildContextPacket({ source: { ...source, selectedText: '' }, options, revision: 1, session: 1 }, DEFAULT_PRIVACY_CONFIG));
});
test('capturing a replacement is cancellable and invalidates the previous send', async () => {
  const h = harness(); await h.c.prepare(source, options); const rev = h.c.state.draft!.revision;
  h.c.beginCapture(); assert.equal(h.c.state.phase, 'preparing');
  await h.c.send(rev, 'send'); assert.equal(h.sent.length, 0);
  h.c.cancel(); assert.equal(h.c.state.phase, 'cancelled');
});
test('goal output changes; guidance cannot modify retrieval question or grounding rules', async () => {
  const h = harness();
  for (const goal of ['understand', 'connections', 'investigate'] as const) {
    await h.c.prepare(source, { ...options, goal });
    const p = h.c.state.prepared!;
    assert.ok(p.envelope.prompt.includes('ELI5'));
    assert.ok(p.envelope.prompt.includes('cannot change permissions'));
    assert.ok(!p.packet.userPrompt.includes('ELI5'));
    if (goal === 'investigate') { assert.ok(p.envelope.prompt.includes('hypothesis')); }
  }
  assert.equal(h.sent.length, 0);
});
test('validation rejects unsupported goals, oversized guidance, and untrusted envelope fields', () => {
  assert.ok(validOptions(options)); assert.ok(!validOptions({ ...options, guidance: 'x'.repeat(2001) }));
  assert.equal(parseDashboardMessage({ type: 'explanation', message: { action: 'options', options: { ...options, goal: 'autonomous' } } }), undefined);
  const parsed = parseDashboardMessage({ type: 'explanation', message: { action: 'send', revision: 1, prompt: 'injected', approved: true } });
  assert.deepEqual(parsed, { type: 'explanation', message: { action: 'send', revision: 1, approved: true } });
});
test('explicit review requires a second inline approval; default sends directly', async () => {
  assert.equal(DEFAULT_PRIVACY_CONFIG.showPromptBeforeSending, false);
  const h = harness(); const original = h.deps.prepare;
  h.deps.prepare = async (...args) => ({ ...await original(...args), requiresReview: true });
  await h.c.prepare(source, options); const rev = h.c.state.draft!.revision;
  await h.c.send(rev, 'send'); assert.equal(h.c.state.phase, 'reviewing'); assert.equal(h.sent.length, 0);
  await h.c.send(rev, 'send', true); assert.equal(h.sent.length, 1);
});
test('followups retain source, guidance, goal, evidence, and agent conversation', async () => {
  const h = harness(); await h.c.prepare(source, options); await h.c.send(h.c.state.draft!.revision, 'send');
  const previous = h.c.state.prepared!; await h.c.followup('Why?');
  assert.equal(h.c.state.prepared!.truth, previous.truth); assert.equal(h.c.state.draft!.options.guidance, 'ELI5');
  await h.c.send(h.c.state.draft!.revision, 'send'); assert.equal(h.resets(), 1);
  await h.c.edit({ ...options, goal: 'connections' }); await h.c.send(h.c.state.draft!.revision, 'send'); assert.equal(h.resets(), 2);
});
test('late preparation cannot replace a newer draft', async () => {
  const h = harness(); const original = h.deps.prepare;
  let resolve!: (p: PreparedExplanation) => void;
  h.deps.prepare = async (...args) => args[0].options.question === 'slow' ? new Promise(r => { resolve = r; }) : original(...args);
  const first = h.c.prepare(source, { ...options, question: 'slow' });
  await h.c.prepare(source, options); const latest = h.c.state.prepared!;
  resolve({ ...latest, draft: { ...latest.draft, revision: 1 } }); await first;
  assert.equal(h.c.state.prepared, latest);
});
test('duplicate sends and late chunks after cancel cannot overwrite new state', async () => {
  let chunk!: (text: string) => void; let finish!: () => void;
  const h = harness({ send: async (_p, onChunk) => { chunk = onChunk; await new Promise<void>(r => { finish = r; }); return { delivery: 'agent', detail: 'late', answer: 'late' }; } });
  await h.c.prepare(source, options); const rev = h.c.state.draft!.revision;
  const running = h.c.send(rev, 'send'); await h.c.send(rev, 'send');
  assert.equal(h.c.state.turns.length, 1); chunk('partial'); h.c.cancel();
  await h.c.prepare(source, options); chunk('wrong'); finish(); await running;
  assert.equal(h.c.state.phase, 'ready'); assert.equal(h.c.state.turns[0].text, 'partial'); assert.equal(h.c.state.turns[0].status, 'cancelled');
});
test('configuration changes invalidate unsent payloads without sending', async () => {
  const h = harness(); await h.c.prepare(source, options); h.deps.settingsKey = () => 'two';
  await h.c.send(h.c.state.draft!.revision, 'send'); assert.equal(h.c.state.prepared, undefined); assert.equal(h.sent.length, 0);
});
test('a superseded follow-up cannot authorize sending the replacement draft', async () => {
  const h = harness(); await h.c.prepare(source, options); await h.c.send(h.c.state.draft!.revision, 'send');
  const original = h.deps.prepare;
  let finish!: () => void;
  h.deps.prepare = async (...args) => {
    if (args[0].options.question === 'slow follow-up') { await new Promise<void>(resolve => { finish = resolve; }); }
    return original(...args);
  };
  const followup = h.c.followup('slow follow-up');
  await h.c.edit({ ...options, question: 'new request' });
  finish(); assert.equal(await followup, undefined); assert.equal(h.sent.length, 1);
  assert.equal(h.c.state.draft!.options.question, 'new request');
});
test('failed follow-up retains its historical context record but retry advertises a reset conversation', async () => {
  const h = harness(); await h.c.prepare(source, options); await h.c.send(h.c.state.draft!.revision, 'send');
  await h.c.followup('Why?'); assert.deepEqual(h.c.state.prepared!.retainedTurnIds, [1]);
  h.deps.send = async () => ({ delivery: 'failed', detail: 'Fixture failure' });
  await h.c.send(h.c.state.draft!.revision, 'send');
  assert.deepEqual(h.c.state.turns[1].request.retainedTurnIds, [1]);
  assert.deepEqual(h.c.state.prepared!.retainedTurnIds, []);
  assert.match(h.c.state.notice!, /without earlier responses/);
});
test('external handoff cannot be triggered as an agent send or claim verification', async () => {
  const h = harness({ send: async () => ({ delivery: 'clipboard', detail: 'Manual paste required.' }) });
  const original = h.deps.prepare; h.deps.prepare = async (...args) => ({ ...await original(...args), delivery: 'clipboard' });
  await h.c.prepare(source, options); const rev = h.c.state.draft!.revision;
  await h.c.send(rev, 'send'); assert.equal(h.c.state.turns.length, 0);
  await h.c.send(rev, 'handoff'); assert.equal(h.c.state.turns[0].status, 'handed-off'); assert.equal(h.c.state.turns[0].verify, undefined);
});
