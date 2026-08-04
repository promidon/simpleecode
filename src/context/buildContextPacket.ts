import {
  type ContextPacket,
  type ExplanationTask,
  type PrivacyScope,
  defaultUserPrompt,
} from './ContextPacket';
import { getActiveEditorSnapshot } from './ActiveEditorContext';
import { getSelectionSnapshot } from './SelectionContext';
import { applyGuards, type PrivacyConfig } from '../privacy/privacyGuard';
import { effectivePrivacyScope } from '../privacy/privacyScope';

interface PacketBuildResult {
  packet?: ContextPacket;
  /** Set when the privacy guard refused the file. */
  blocked?: string;
  /** Set when a packet can't be built (e.g. no editor / no selection). */
  error?: string;
}

/**
 * Assemble a privacy-checked `ContextPacket` for the given task from the active
 * editor. Returns `{ error }` or `{ blocked }` instead of throwing so callers
 * can show a friendly message.
 */
export function buildContextPacket(
  task: ExplanationTask,
  userPrompt: string | undefined,
  config: PrivacyConfig,
): PacketBuildResult {
  const active = getActiveEditorSnapshot();
  if (!active) {
    return { error: 'No active editor. Open a file first.' };
  }

  const selection = getSelectionSnapshot();
  const prompt = userPrompt?.trim() || defaultUserPrompt(task);
  const guardedPrompt = applyGuards(undefined, prompt, config);
  const promptRedactions = guardedPrompt.redactions.map(
    (note) => `Question: ${note}`,
  );
  const privacyScope = effectivePrivacyScope(task, config.defaultScope);

  if (task === 'explain_selection') {
    if (!selection || !selection.hasSelection) {
      return { error: 'Select some code first, then run Explain Selection.' };
    }
    const guard = applyGuards(active.filePath, selection.selectedText, config);
    if (guard.blocked) {
      return { blocked: guard.reason };
    }
    return {
      packet: finalize({
        task,
        filePath: active.filePath,
        languageId: active.languageId,
        selectedText: guard.text,
        startLine: selection.startLine,
        endLine: selection.endLine,
        userPrompt: guardedPrompt.text,
        privacyScope,
        truncated: guard.truncated || guardedPrompt.truncated,
        redactions: [...guard.redactions, ...promptRedactions],
      }),
    };
  }

  // A configured selection-only maximum also caps broader commands. Require a
  // real selection rather than silently widening the consent boundary.
  const selectionCapped = privacyScope === 'selection_only';
  if (selectionCapped && (!selection || !selection.hasSelection)) {
    return {
      error:
        'Your privacy scope is Selection only. Select code first, or allow a broader scope in SimpleeCode privacy settings.',
    };
  }

  const sourceText = selectionCapped ? selection!.selectedText : active.fullText;
  const guard = applyGuards(active.filePath, sourceText, config);
  if (guard.blocked) {
    return { blocked: guard.reason };
  }

  const redactions = [...guard.redactions, ...promptRedactions];

  return {
    packet: finalize({
      task,
      filePath: active.filePath,
      languageId: active.languageId,
      selectedText: selectionCapped ? guard.text : undefined,
      fullText: selectionCapped ? undefined : guard.text,
      startLine: selectionCapped ? selection!.startLine : 1,
      endLine: selectionCapped ? selection!.endLine : active.lineCount,
      userPrompt: guardedPrompt.text,
      privacyScope,
      truncated: guard.truncated || guardedPrompt.truncated,
      redactions,
    }),
  };
}

interface FinalizeInput {
  task: ExplanationTask;
  filePath?: string;
  languageId?: string;
  selectedText?: string;
  fullText?: string;
  startLine?: number;
  endLine?: number;
  userPrompt: string;
  privacyScope: PrivacyScope;
  truncated: boolean;
  redactions: string[];
}

function finalize(input: FinalizeInput): ContextPacket {
  const code = input.selectedText ?? input.fullText ?? '';
  return {
    task: input.task,
    filePath: input.filePath,
    languageId: input.languageId,
    selectedText: input.selectedText,
    fullText: input.fullText,
    startLine: input.startLine,
    endLine: input.endLine,
    userPrompt: input.userPrompt,
    privacyScope: input.privacyScope,
    meta: {
      byteSize: Buffer.byteLength(code, 'utf8'),
      truncated: input.truncated,
      redactions: input.redactions,
      createdAt: new Date().toISOString(),
    },
  };
}
