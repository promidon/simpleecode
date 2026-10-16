import * as vscode from 'vscode';
import { ExplanationCoordinator } from './ExplanationCoordinator';
import { captureSource } from './captureSource';
import { explanationPreparer, explanationSettingsKey } from './prepareExplanation';
import { getParentSymbol } from '../context/parentSymbol';
import { readPrivacyConfig } from '../privacy/PrivacySettings';
import { applyGuards, redactSecrets } from '../privacy/privacyGuard';
import type { FileIndexService } from '../indexing/FileIndex';
import type { SymbolIndexService } from '../indexing/SymbolIndex';
import type { Retriever } from '../rag/Retriever';
import type { AcpChatAdapter } from '../acp/AcpChatAdapter';
import type { ExplanationGoal, ExplanationOptions } from './model';
import { verifyAnswer } from '../rag/verifyAnswer';

export type ExplanationAction =
  | { action: 'options'; options: ExplanationOptions }
  | { action: 'send' | 'handoff'; revision: number; approved?: boolean }
  | { action: 'copy'; revision: number }
  | { action: 'copyTurn'; turnId: number }
  | { action: 'followup'; question: string; nextAction?: 'send' | 'review' }
  | { action: 'saveGuidance'; text: string; confirmed?: boolean }
  | { action: 'removeGuidance' | 'cancel' | 'new' | 'selection' | 'file' | 'refresh' };

const DEFAULT_GUIDANCE_KEY = 'explanation.guidance.v1';
export class ExplanationService {
  readonly coordinator: ExplanationCoordinator;
  savedGuidance: string;
  guidanceNotice = '';
  pendingGuidance?: string;
  private captureId = 0;
  constructor(private readonly context: vscode.ExtensionContext, fileIndex: FileIndexService,
    symbolIndex: SymbolIndexService, retriever: Retriever, adapter: AcpChatAdapter, private readonly changed: () => void) {
    this.savedGuidance = context.globalState.get<string>(DEFAULT_GUIDANCE_KEY, '');
    this.coordinator = new ExplanationCoordinator({
      prepare: explanationPreparer(fileIndex, symbolIndex, retriever, adapter),
      send: (p, chunk) => adapter.sendPreparedPrompt(p.envelope.prompt, p.delivery, chunk),
      copy: text => Promise.resolve(vscode.env.clipboard.writeText(text)), reset: () => adapter.newConversation(),
      settingsKey: explanationSettingsKey, changed,
    });
  }
  async capture(goal: ExplanationGoal = 'understand', focus?: 'selection' | 'file', guidance = this.savedGuidance, question = '', enclosing = false): Promise<void> {
    const id = ++this.captureId;
    const editor = vscode.window.activeTextEditor;
    const selection = editor?.selection;
    let source = captureSource(focus ?? (selection?.isEmpty ? 'file' : 'selection'), editor, selection);
    if (!source || !editor || !selection) { this.guidanceNotice = 'Open a code file, then choose Use current selection or Use current file.'; this.changed(); return; }
    if (enclosing) {
      this.coordinator.beginCapture();
      const parent = await getParentSymbol(editor.document.uri, selection).catch(() => undefined);
      if (id !== this.captureId) { return; }
      if (!parent || editor.document.version !== source.version) {
        this.coordinator.cancel();
        this.guidanceNotice = 'Could not capture the enclosing symbol. Select its code and try again.'; this.changed(); return;
      }
      source = captureSource('selection', editor, new vscode.Selection(parent.startLine - 1, 0, parent.endLine - 1, editor.document.lineAt(parent.endLine - 1).text.length))!;
    }
    this.guidanceNotice = '';
    await this.coordinator.prepare(source, { goal, question, guidance });
  }
  async action(message: ExplanationAction): Promise<void> {
    switch (message.action) {
      case 'options': this.captureId++; await this.coordinator.edit(message.options); break;
      case 'send': case 'handoff': await this.coordinator.send(message.revision, message.action, message.approved); break;
      case 'copy': await this.coordinator.copy(message.revision); break;
      case 'copyTurn': {
        const turn = this.coordinator.state.turns.find(t => t.id === message.turnId);
        if (turn) { await vscode.env.clipboard.writeText(turn.request.envelope.prompt); this.guidanceNotice = 'Historical prompt copied. Nothing was sent.'; }
        break;
      }
      case 'followup': {
        const revision = await this.coordinator.followup(message.question);
        const prepared = this.coordinator.state.prepared;
        if (prepared && prepared.draft.revision === revision) {
          if (message.nextAction === 'review') { this.coordinator.review(); }
          if (message.nextAction === 'send' && prepared.delivery === 'agent') { await this.coordinator.send(prepared.draft.revision, 'send'); }
        }
        break;
      }
      case 'cancel': this.captureId++; this.coordinator.cancel(); break;
      case 'new': this.captureId++; this.coordinator.clear(); await this.capture(); break;
      case 'selection': await this.capture('understand', 'selection'); break;
      case 'file': await this.capture('understand', 'file'); break;
      case 'refresh': {
        const id = ++this.captureId;
        const d = this.coordinator.state.draft;
        if (!d) { await this.capture(); break; }
        this.coordinator.beginCapture();
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.parse(d.source.uri)).then(value => value, () => undefined);
        if (id !== this.captureId) { break; }
        if (!doc) { this.coordinator.cancel(); this.guidanceNotice = 'Source is unavailable. Choose another file or selection.'; break; }
        const range = doc.validateRange(new vscode.Range(d.source.startLine - 1, d.source.startCharacter, d.source.endLine - 1, d.source.endCharacter));
        const next = { ...d.source, fullText: doc.getText(), selectedText: doc.getText(range), version: doc.version,
          startLine: range.start.line + 1, endLine: range.end.line + 1,
          startCharacter: range.start.character, endCharacter: range.end.character,
          diagnostics: vscode.languages.getDiagnostics(doc.uri).filter(diag => d.source.focus === 'file' || diag.range.intersection(range))
            .slice(0, 40).map(diag => `${vscode.DiagnosticSeverity[diag.severity]} at line ${diag.range.start.line + 1}: ${diag.message}`) };
        await this.coordinator.prepare(next, d.options); break;
      }
      case 'saveGuidance': {
        if (message.text.length > 2_000) { this.guidanceNotice = 'Use at most 2,000 guidance characters.'; break; }
        const safe = applyGuards(undefined, redactSecrets(message.text).text, readPrivacyConfig()).text;
        if (safe !== message.text && !(message.confirmed && this.pendingGuidance === safe)) {
          this.pendingGuidance = safe;
          this.guidanceNotice = 'Possible secrets were removed. Review the text below before saving it.';
        } else {
          await this.context.globalState.update(DEFAULT_GUIDANCE_KEY, safe);
          this.savedGuidance = safe; this.pendingGuidance = undefined;
          this.guidanceNotice = 'Default saved on this device. It is not added to workspace settings or Settings Sync.';
        }
        break;
      }
      case 'removeGuidance': await this.context.globalState.update(DEFAULT_GUIDANCE_KEY, undefined); this.savedGuidance = ''; this.pendingGuidance = undefined; this.guidanceNotice = 'Saved default removed. Current explanation is unchanged.'; break;
    }
    this.changed();
  }
  checkAnswer(text: string) {
    const turn = this.coordinator.state.turns.at(-1);
    return verifyAnswer(text, turn?.request.truth ?? { sentCode: '', knownFiles: [], knownSymbols: [] });
  }
  get sourceChanged(): boolean {
    const source = this.coordinator.state.draft?.source;
    return !!source && vscode.workspace.textDocuments.some(d => d.uri.toString() === source.uri && d.version !== source.version);
  }
}
