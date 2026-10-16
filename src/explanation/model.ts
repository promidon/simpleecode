import type { ContextPacket, PrivacyScope } from '../context/ContextPacket';
import type { CodeFacts } from '../context/codeFacts';
import type { OutboundEnvelope } from '../privacy/OutboundEnvelope';
import type { RetrievedContext } from '../rag/Retriever';
import type { AnswerGroundTruth, VerifyResult } from '../rag/verifyAnswer';

export type ExplanationGoal = 'understand' | 'connections' | 'investigate';
export interface ExplanationOptions { goal: ExplanationGoal; question: string; guidance: string }
export interface SourceSnapshot {
  uri: string; filePath?: string; label: string; version: number; languageId: string;
  fullText: string; selectedText: string; startLine: number; endLine: number;
  startCharacter: number; endCharacter: number; focus: 'selection' | 'file';
  diagnostics: string[];
}
export interface ExplanationDraft {
  revision: number; session: number; source: SourceSnapshot; options: ExplanationOptions;
}
type Delivery = 'agent' | 'command' | 'clipboard';
export interface PreparedExplanation {
  draft: ExplanationDraft; packet: ContextPacket; envelope: OutboundEnvelope;
  facts?: CodeFacts; retrieved: RetrievedContext[]; truth: AnswerGroundTruth;
  localExplanation?: string; roleBlock?: string; roleSources?: string[]; diagnostics?: string[]; gaps: string[]; settingsKey: string;
  delivery: Delivery; requiresReview: boolean;
  /** Earlier completed turns retained in the active agent process at dispatch. */
  retainedTurnIds?: number[];
}
interface ExplanationTurn {
  id: number; session: number; conversation: number; request: PreparedExplanation;
  text: string; status: 'sending' | 'streaming' | 'done' | 'cancelled' | 'failed' | 'handed-off';
  detail?: string; verify?: VerifyResult;
}
export interface ExplanationSession {
  phase: 'idle' | 'preparing' | 'ready' | 'reviewing' | 'sending' | 'streaming' | 'done' | 'cancelled' | 'failed';
  draft?: ExplanationDraft; prepared?: PreparedExplanation; turns: ExplanationTurn[];
  error?: string; notice?: string;
}
export const GOALS: Record<ExplanationGoal, { label: string; description: string; shape: string }> = {
  understand: {
    label: 'Understand this code', description: 'Learn its purpose, steps, inputs, and result.',
    shape: 'What this does; Main steps; Inputs and result. Explain unfamiliar terms when needed.',
  },
  connections: {
    label: 'See how it connects', description: 'Follow the relationships supported by your permitted context.',
    shape: 'Role in the project; Demonstrated connections; Inferred connections; Missing context. Do not invent runtime call graphs.',
  },
  investigate: {
    label: 'Investigate a problem', description: 'Compare observations, possible causes, and checks you can try.',
    shape: 'Observed evidence; Possible causes (label each as a hypothesis); Checks to try. Diagnostics are observations, not proof of a cause. Do not run commands or edit code.',
  },
};
export function validOptions(value: unknown): value is ExplanationOptions {
  if (!value || typeof value !== 'object') { return false; }
  const v = value as Record<string, unknown>;
  return (v.goal === 'understand' || v.goal === 'connections' || v.goal === 'investigate') &&
    typeof v.question === 'string' && v.question.length <= 20_000 &&
    typeof v.guidance === 'string' && v.guidance.length <= 2_000;
}
export function goalScope(goal: ExplanationGoal, focus: SourceSnapshot['focus'], maximum: PrivacyScope): PrivacyScope {
  const scopes: PrivacyScope[] = ['selection_only', 'current_file', 'related_files', 'system_context'];
  const requested = goal === 'connections' ? 3 : goal === 'investigate' ? 2 : focus === 'file' ? 1 : 0;
  return scopes[Math.min(requested, Math.max(0, scopes.indexOf(maximum)))];
}
/** Freeze serializable records recursively; request ownership is not just a type annotation. */
export function freezeRecord<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freezeRecord);
    Object.freeze(value);
  }
  return value;
}
