import { defaultUserPrompt, type ContextPacket } from './ContextPacket';
import { applyGuards, retainedLineCount, type PrivacyConfig } from '../privacy/privacyGuard';
import { goalScope, type ExplanationDraft } from '../explanation/model';

/** Pure capture-to-packet boundary. Never reads the editor after capture. */
export function buildContextPacket(draft: ExplanationDraft, config: PrivacyConfig): ContextPacket {
  const s = draft.source;
  const scope = goalScope(draft.options.goal, s.focus, config.defaultScope);
  if ((s.focus === 'selection' || scope === 'selection_only') && !s.selectedText) { throw new Error('Select code before explaining a selection.'); }
  const selected = s.focus === 'selection' || scope === 'selection_only';
  const guard = applyGuards(s.filePath, selected ? s.selectedText : s.fullText, config);
  if (guard.blocked) { throw new Error('This source is blocked by privacy settings.'); }
  const task = draft.options.goal === 'connections' ? 'explain_system_role' : selected ? 'explain_selection' : 'explain_file';
  const question = applyGuards(undefined, draft.options.question.trim() || defaultUserPrompt(task), config);
  return {
    task, filePath: s.filePath, languageId: s.languageId,
    selectedText: selected ? guard.text : undefined, fullText: selected ? undefined : guard.text,
    startLine: selected ? s.startLine : 1, endLine: (selected ? s.startLine : 1) + Math.max(0, retainedLineCount(guard.text) - 1),
    userPrompt: question.text, privacyScope: scope,
    meta: { byteSize: Buffer.byteLength(guard.text), truncated: guard.truncated || question.truncated,
      redactions: [...guard.redactions, ...question.redactions], createdAt: new Date().toISOString() },
  };
}
