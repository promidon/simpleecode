import { freezeRecord, validOptions, type ExplanationDraft, type ExplanationOptions,
  type ExplanationSession, type PreparedExplanation, type SourceSnapshot } from './model';
import type { AcpSendResult } from '../acp/AcpChatAdapter';
import { verifyAnswer } from '../rag/verifyAnswer';

export interface ExplanationDependencies {
  prepare(draft: ExplanationDraft, signal: AbortSignal, previous?: PreparedExplanation): Promise<PreparedExplanation>;
  send(request: PreparedExplanation, chunk: (text: string) => void): Promise<AcpSendResult>;
  copy(text: string): Promise<void>;
  reset(): void;
  settingsKey(): string;
  changed(): void;
}

/** Host-owned lifecycle. No VS Code, DOM, filesystem, or transport selection here. */
export class ExplanationCoordinator {
  state: ExplanationSession = { phase: 'idle', turns: [] };
  private revision = 0;
  private session = 0;
  private turnId = 0;
  private conversation = 0;
  private operation = 0;
  private abort?: AbortController;
  private freshConversation = true;
  constructor(private readonly deps: ExplanationDependencies) {}

  beginCapture(): void {
    this.stopOperation(); this.freshConversation = true;
    this.state = { ...this.state, prepared: undefined, phase: 'preparing', error: undefined, notice: 'Capturing code locally…' };
    this.deps.changed();
  }

  async prepare(source: SourceSnapshot, options: ExplanationOptions, followup = false): Promise<void> {
    if (!validOptions(options)) { this.fail('Use at most 2,000 guidance characters and 20,000 question characters.'); return; }
    const previous = followup ? this.state.prepared : undefined;
    this.stopOperation();
    if (!followup) { this.session++; this.freshConversation = true; }
    const draft = freezeRecord({ source: structuredClone(source), options: { ...options },
      revision: ++this.revision, session: this.session });
    const token = this.operation;
    const abort = this.abort = new AbortController();
    this.state = { ...this.state, draft, prepared: undefined, phase: 'preparing', error: undefined, notice: undefined };
    this.deps.changed();
    try {
      const prepared = await this.deps.prepare(draft, abort.signal, previous);
      if (token !== this.operation || abort.signal.aborted) { return; }
      if (prepared.settingsKey !== this.deps.settingsKey()) { this.fail('Settings changed. Refresh the prepared explanation.'); return; }
      const retainedTurnIds = this.freshConversation ? [] : this.state.turns.filter(t => t.conversation === this.conversation && t.status === 'done').map(t => t.id);
      this.state = { ...this.state, prepared: freezeRecord({ ...prepared, retainedTurnIds }), phase: 'ready' };
      this.deps.changed();
    } catch {
      if (token === this.operation && !abort.signal.aborted) { this.fail('Could not prepare this explanation. Check the source and privacy settings, then refresh.'); }
    }
  }

  edit(options: ExplanationOptions): Promise<void> {
    const source = this.state.draft?.source;
    return source ? this.prepare(source, options) : Promise.resolve();
  }
  async followup(question: string): Promise<number | undefined> {
    const { draft, prepared, phase } = this.state;
    if (!draft || !prepared || !['done', 'ready'].includes(phase) || !question.trim()) { return; }
    // Return ownership only if this preparation is still current. A submit
    // continuation must never send a newer source selected during the await.
    const revision = this.revision + 1;
    await this.prepare(draft.source, { ...draft.options, question }, true);
    return this.state.phase === 'ready' && this.state.draft?.revision === revision ? revision : undefined;
  }
  review(): void {
    if (this.state.phase !== 'ready' || !this.state.prepared) { return; }
    this.state = { ...this.state, phase: 'reviewing' }; this.deps.changed();
  }
  async send(revision: number, action: 'send' | 'handoff', approved = false): Promise<void> {
    const p = this.state.prepared;
    if (!p || p.draft.revision !== revision || !['ready', 'reviewing', 'failed', 'cancelled'].includes(this.state.phase)) { return; }
    if (p.settingsKey !== this.deps.settingsKey()) { this.invalidate(); return; }
    if ((p.delivery === 'agent') !== (action === 'send')) { this.fail('Delivery changed. Review the prepared destination.'); return; }
    if (p.requiresReview && !approved) { this.state = { ...this.state, phase: 'reviewing' }; this.deps.changed(); return; }
    const token = ++this.operation;
    if (this.freshConversation) { this.deps.reset(); this.conversation++; this.freshConversation = false; }
    const turn = { id: ++this.turnId, session: p.draft.session, conversation: this.conversation, request: p, text: '', status: 'sending' as const };
    this.state = { ...this.state, phase: 'sending', error: undefined, turns: [...this.state.turns, turn] };
    this.deps.changed();
    const update = (patch: Partial<typeof this.state.turns[number]>) => {
      this.state = { ...this.state, turns: this.state.turns.map(t => t.id === turn.id ? { ...t, ...patch } : t) };
    };
    try {
      const result = await this.deps.send(p, text => {
        if (token !== this.operation) { return; }
        update({ text, status: 'streaming' }); this.state.phase = 'streaming'; this.deps.changed();
      });
      if (token !== this.operation) { return; }
      if (result.delivery === 'failed') {
        update({ status: 'failed', detail: result.detail }); this.resetConversation(); this.fail(result.detail);
      } else {
        update({ status: result.delivery === 'agent' ? 'done' : 'handed-off', text: result.answer ?? '', detail: result.detail,
          verify: result.delivery === 'agent' && result.answer !== undefined ? verifyAnswer(result.answer, p.truth) : undefined });
        this.state.phase = 'done'; this.deps.changed();
      }
    } catch {
      if (token !== this.operation) { return; }
      update({ status: 'failed' }); this.resetConversation(); this.fail('Delivery failed. Retry explicitly or copy the prompt.');
    }
  }
  async copy(revision: number): Promise<void> {
    const p = this.state.prepared;
    if (!p || p.draft.revision !== revision || p.settingsKey !== this.deps.settingsKey()) { return; }
    await this.deps.copy(p.envelope.prompt);
    if (this.state.prepared === p) { this.state.notice = 'Copied to clipboard. Not sent.'; this.deps.changed(); }
  }
  cancel(): void {
    this.stopOperation(); this.freshConversation = true;
    if (this.state.prepared) { this.resetConversation(); }
    this.state = { ...this.state, phase: 'cancelled' }; this.deps.changed();
  }
  invalidate(): void {
    this.stopOperation(); this.freshConversation = true;
    this.state = { ...this.state, prepared: undefined, phase: 'idle', notice: 'Settings changed. Refresh before sending.' }; this.deps.changed();
  }
  clear(): void {
    this.stopOperation(); this.freshConversation = true; this.session++;
    this.state = { phase: 'idle', turns: [] }; this.deps.changed();
  }
  private stopOperation(): void {
    this.operation++; this.abort?.abort();
    if (['sending', 'streaming'].includes(this.state.phase)) {
      this.deps.reset(); this.freshConversation = true;
      this.state.turns = this.state.turns.map(t => ['sending', 'streaming'].includes(t.status) ? { ...t, status: 'cancelled', detail: 'Stopped. This answer is incomplete.' } : t);
    }
  }
  private resetConversation(): void {
    this.freshConversation = true; this.deps.reset();
    if (this.state.prepared) { this.state.prepared = freezeRecord({ ...this.state.prepared, retainedTurnIds: [] }); }
    this.state.notice = 'Agent conversation reset. Retry uses the captured evidence without earlier responses.';
  }
  private fail(error: string): void { this.state = { ...this.state, phase: 'failed', error }; this.deps.changed(); }
}
