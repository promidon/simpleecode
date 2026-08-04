/**
 * The structured unit of work SimpleeCode builds locally and hands to the ACP
 * transport. This is intentionally a pure data type with no `vscode` imports so
 * it can be built, serialized, and unit-tested without an editor host.
 *
 * Retrieved context remains a separate, guarded list until the exact outbound
 * envelope is built. Keep raw code + file path + line range authoritative;
 * summaries never replace them.
 */

export type ExplanationTask =
  | 'explain_selection'
  | 'explain_file'
  | 'explain_system_role';

export type PrivacyScope =
  | 'selection_only'
  | 'current_file'
  | 'related_files'
  | 'system_context';

export interface ContextPacket {
  task: ExplanationTask;
  filePath?: string;
  languageId?: string;
  selectedText?: string;
  fullText?: string;
  startLine?: number;
  endLine?: number;
  /** Parent function/component/class, when deterministic symbol lookup resolves it. */
  symbolName?: string;
  userPrompt: string;
  privacyScope: PrivacyScope;
  /** Local-only bookkeeping for the dashboard and the privacy preview. */
  meta?: ContextPacketMeta;
}

interface ContextPacketMeta {
  /** Approximate byte size of the included code (selection or fullText). */
  byteSize?: number;
  /** True if the included content was truncated by the size guard. */
  truncated?: boolean;
  /** Human-readable notes about what the privacy guard redacted. */
  redactions?: string[];
  /** ISO timestamp the packet was assembled. */
  createdAt?: string;
}

/** Maps a command's task to the human-facing default question for that task. */
export function defaultUserPrompt(task: ExplanationTask): string {
  switch (task) {
    case 'explain_selection':
      return 'Explain the selected code.';
    case 'explain_file':
      return 'Explain what this file does and how it is structured.';
    case 'explain_system_role':
      return 'Explain how this code fits into the wider system.';
  }
}
