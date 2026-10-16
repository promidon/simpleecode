import * as vscode from 'vscode';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import type { DashboardState } from '../dashboard/DashboardPanel';
import type { ExplanationAction } from '../explanation/ExplanationService';
import { snapshotFileIndex } from '../indexing/snapshotFileIndex';

interface TestApi { getState(): Promise<DashboardState>; action(message: ExplanationAction): Promise<void> }
export async function run(): Promise<void> {
  const extension = vscode.extensions.getExtension<TestApi>('promidon.simpleecode');
  assert.ok(extension);
  const api = await extension.activate(); assert.ok(api);
  const cfg = vscode.workspace.getConfiguration('simpleecode');
  await cfg.update('acp.transport', 'agent', vscode.ConfigurationTarget.Global);
  await cfg.update('acp.agentCommand', process.env.SIMPLEECODE_TEST_NODE, vscode.ConfigurationTarget.Global);
  await cfg.update('acp.agentArgs', [join(process.env.SIMPLEECODE_TEST_ROOT!, 'tests/fixtures/acp-agent.mjs')], vscode.ConfigurationTarget.Global);
  const doc = await vscode.workspace.openTextDocument({ language: 'typescript', content: 'function add(a: number, b: number) {\n  return a + b;\n}\n' });
  const editor = await vscode.window.showTextDocument(doc);
  editor.selection = new vscode.Selection(1, 2, 1, 15);
  await vscode.commands.executeCommand('simpleecode.explainSelection');
  let state = (await api.getState()).experience!;
  assert.equal(state.phase, 'ready'); assert.equal(state.turns.length, 0);
  const captured = state.draft!.source.selectedText;
  const second = await vscode.workspace.openTextDocument({ content: 'unrelated document' });
  await vscode.window.showTextDocument(second);
  assert.equal((await api.getState()).experience!.draft!.source.selectedText, captured);
  await api.action({ action: 'options', options: { goal: 'understand', question: '', guidance: 'ELI5' } });
  await api.action({ action: 'saveGuidance', text: 'ELI5' });
  assert.equal((await api.getState()).experience!.savedGuidance, 'ELI5');
  assert.equal(vscode.workspace.getConfiguration('simpleecode').get('guidance'), undefined);
  state = (await api.getState()).experience!;
  await api.action({ action: 'send', revision: state.draft!.revision });
  state = (await api.getState()).experience!;
  assert.equal(state.turns.at(-1)!.status, 'done'); assert.match(state.turns.at(-1)!.text, /turn 1/);
  const originalPrompt = state.turns[0].request.envelope.prompt;
  await api.action({ action: 'followup', question: 'Why?' });
  state = (await api.getState()).experience!;
  assert.equal(state.draft!.options.guidance, 'ELI5');
  await api.action({ action: 'send', revision: state.draft!.revision });
  state = (await api.getState()).experience!;
  assert.match(state.turns.at(-1)!.text, /turn 2/); assert.equal(state.turns[0].request.envelope.prompt, originalPrompt);
  await api.action({ action: 'saveGuidance', text: 'api_key=secret-value' });
  state = (await api.getState()).experience!;
  assert.equal(state.savedGuidance, 'ELI5'); assert.ok(state.pendingGuidance); assert.ok(!state.pendingGuidance.includes('secret-value'));
  await api.action({ action: 'saveGuidance', text: state.pendingGuidance, confirmed: true });
  assert.ok(!(await api.getState()).experience!.savedGuidance.includes('secret-value'));
  await api.action({ action: 'removeGuidance' }); assert.equal((await api.getState()).experience!.savedGuidance, '');
  await api.action({ action: 'options', options: { goal: 'investigate', question: 'FIXTURE_WAIT', guidance: 'ELI5' } });
  state = (await api.getState()).experience!;
  const sending = api.action({ action: 'send', revision: state.draft!.revision });
  await waitFor(async () => (await api.getState()).experience!.phase === 'streaming');
  await api.action({ action: 'cancel' }); await sending;
  state = (await api.getState()).experience!; assert.equal(state.turns.at(-1)!.status, 'cancelled'); assert.match(state.turns.at(-1)!.text, /Fixture answer/);
  await api.action({ action: 'options', options: { goal: 'understand', question: 'After cancellation', guidance: '' } });
  state = (await api.getState()).experience!; await api.action({ action: 'send', revision: state.draft!.revision });
  state = (await api.getState()).experience!; assert.equal(state.turns.at(-1)!.status, 'done'); assert.match(state.turns.at(-1)!.text, /turn 1/);
  await api.action({ action: 'options', options: { goal: 'understand', question: 'FIXTURE_EXIT', guidance: '' } });
  state = (await api.getState()).experience!;
  await Promise.race([api.action({ action: 'send', revision: state.draft!.revision }), new Promise((_, reject) => setTimeout(() => reject(new Error('Process exit did not settle')), 5000))]);
  assert.equal((await api.getState()).experience!.phase, 'failed');
  await cfg.update('privacy.showPromptBeforeSending', true, vscode.ConfigurationTarget.Global);
  await api.action({ action: 'options', options: { goal: 'understand', question: '', guidance: '' } });
  state = (await api.getState()).experience!; await api.action({ action: 'send', revision: state.draft!.revision });
  assert.equal((await api.getState()).experience!.phase, 'reviewing');
  await api.action({ action: 'send', revision: state.draft!.revision, approved: true });
  assert.equal((await api.getState()).experience!.phase, 'done');

  // Whole-file targeting must still obey the effective selection-only ceiling,
  // including facts and diagnostics, not just the main code block.
  await cfg.update('privacy.defaultScope', 'selection_only', vscode.ConfigurationTarget.Global);
  const scopedDoc = await vscode.workspace.openTextDocument({ language: 'typescript', content: 'const OUTSIDE_SENTINEL = 1;\nconst inside = 2;\n' });
  const scopedEditor = await vscode.window.showTextDocument(scopedDoc);
  scopedEditor.selection = new vscode.Selection(1, 0, 1, 17);
  const diagnostics = vscode.languages.createDiagnosticCollection('simpleecode-fixture');
  diagnostics.set(scopedDoc.uri, [
    new vscode.Diagnostic(new vscode.Range(0, 0, 0, 10), 'OUTSIDE_DIAGNOSTIC', vscode.DiagnosticSeverity.Error),
    new vscode.Diagnostic(new vscode.Range(1, 0, 1, 10), 'token=diagnostic-secret', vscode.DiagnosticSeverity.Warning),
  ]);
  await vscode.commands.executeCommand('simpleecode.explainCurrentFile');
  await api.action({ action: 'options', options: { goal: 'investigate', question: 'password=question-secret', guidance: 'api_key=guidance-secret' } });
  state = (await api.getState()).experience!;
  const narrowPrompt = state.prepared!.envelope.prompt;
  for (const forbidden of ['OUTSIDE_SENTINEL', 'OUTSIDE_DIAGNOSTIC', 'diagnostic-secret', 'question-secret', 'guidance-secret']) { assert.ok(!narrowPrompt.includes(forbidden), forbidden); }
  assert.ok(narrowPrompt.includes('at line 2')); assert.equal(state.prepared!.packet.privacyScope, 'selection_only');
  diagnostics.dispose();
  const edit = new vscode.WorkspaceEdit(); edit.insert(scopedDoc.uri, new vscode.Position(1, 0), '// changed\n');
  await vscode.workspace.applyEdit(edit);
  assert.equal((await api.getState()).experience!.sourceChanged, true);
  assert.equal((await api.getState()).experience!.prepared!.envelope.prompt, narrowPrompt);
  await api.action({ action: 'refresh' }); assert.equal((await api.getState()).experience!.sourceChanged, false);

  // Enclosing-function capture never replaces the user's editor selection.
  const symbolDoc = await vscode.workspace.openTextDocument({ language: 'plaintext', content: 'function example() {\n  return 1;\n}' });
  const symbolEditor = await vscode.window.showTextDocument(symbolDoc);
  const beforeSelection = symbolEditor.selection = new vscode.Selection(1, 3, 1, 5);
  const provider = vscode.languages.registerDocumentSymbolProvider('plaintext', { provideDocumentSymbols() {
    return [new vscode.DocumentSymbol('example', '', vscode.SymbolKind.Function, new vscode.Range(0, 0, 2, 1), new vscode.Range(0, 9, 0, 16))];
  } });
  await vscode.commands.executeCommand('simpleecode.explainFunction');
  assert.ok(symbolEditor.selection.isEqual(beforeSelection));
  assert.match((await api.getState()).experience!.draft!.source.selectedText, /function example/);
  provider.dispose();

  // The focal snapshot wins over a later editor buffer; other unsaved buffers
  // overlay the disk index without mutating that persisted index.
  const record = { id: scopedDoc.uri.fsPath, path: 'fixture.ts', language: 'typescript', hash: 'disk', size: 1, lastIndexedAt: 1,
    imports: ['./old'], exports: [], references: [] };
  const index = { all: () => [record], get: () => record, size: 1 };
  const frozenIndex = snapshotFileIndex(index, { ...(await api.getState()).experience!.draft!.source,
    filePath: scopedDoc.uri.fsPath, fullText: "import { Other } from './captured';", languageId: 'typescript' });
  assert.deepEqual(frozenIndex.get(scopedDoc.uri.fsPath)!.imports, ['./captured']);
  assert.deepEqual(record.imports, ['./old']);

  await cfg.update('privacy.showPromptBeforeSending', false, vscode.ConfigurationTarget.Global);
  await cfg.update('acp.agentArgs', [join(process.env.SIMPLEECODE_TEST_ROOT!, 'tests/fixtures/acp-agent.mjs'), '--delay-init'], vscode.ConfigurationTarget.Global);
  await api.action({ action: 'options', options: { goal: 'understand', question: '', guidance: '' } });
  state = (await api.getState()).experience!;
  const startup = api.action({ action: 'send', revision: state.draft!.revision });
  await new Promise(resolve => setTimeout(resolve, 150));
  await api.action({ action: 'cancel' });
  await Promise.race([startup, new Promise((_, reject) => setTimeout(() => reject(new Error('Startup cancellation did not settle')), 2000))]);
  assert.equal((await api.getState()).experience!.phase, 'cancelled');
  assert.equal((await api.getState()).experience!.turns.at(-1)!.text, '');
  await api.action({ action: 'new' });
  console.log('PASS: real VS Code capture, no initial send, source ownership, guidance save/redaction/removal, follow-up session, cancellation at startup/streaming, restart, process exit, inline review, effective diagnostic/fact privacy, source refresh, enclosing capture without editor mutation, captured graph overlay.');
}

async function waitFor(predicate: () => Promise<boolean>): Promise<void> {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (await predicate()) { return; }
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error('Timed out waiting for fixture state');
}
