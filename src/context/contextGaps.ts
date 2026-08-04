/**
 * Build Order #21 / notes #3 — the "what's missing" detector.
 *
 * Deterministic. Given what the last packet actually contained, it lists the
 * ways the context was thin, so a thin answer can be labelled as thin *up
 * front* — the reader knows not to over-trust it. PURE (no `vscode`) so it is
 * unit-testable.
 *
 * It reports genuine incompleteness (a symbol we couldn't resolve, no related
 * files, truncation, hidden secret lines), plus a broad command that was
 * deliberately capped by the configured privacy maximum.
 */
export interface ContextGapInput {
  task: 'explain_selection' | 'explain_file' | 'explain_system_role';
  /** Did we resolve the enclosing function/type for a selection? */
  hasSymbolName: boolean;
  /** Did the language server return verified facts (type, callers)? */
  hasFacts: boolean;
  /** How many related files deterministic retrieval pulled in. */
  retrievedCount: number;
  /** Was the sent code cut by the size guard? */
  truncated: boolean;
  /** Did the privacy guard hide any secret-looking lines? */
  hadSecretRedaction: boolean;
  privacyScope?: 'selection_only' | 'current_file' | 'related_files' | 'system_context';
}

export function findContextGaps(input: ContextGapInput): string[] {
  const gaps: string[] = [];

  if (
    input.task === 'explain_system_role' &&
    input.privacyScope !== undefined &&
    input.privacyScope !== 'system_context'
  ) {
    gaps.push(
      `System context was capped at ${input.privacyScope} by your privacy setting. Increase the maximum scope to include the wider graph.`,
    );
  }

  if (input.task === 'explain_selection' && !input.hasSymbolName) {
    gaps.push(
      'I could not find the function or type around your selection, so “how it connects” is a best guess.',
    );
  }

  if (input.hasSymbolName && !input.hasFacts) {
    gaps.push(
      'No verified facts (type, callers) came back for this symbol. For Swift, a bare Xcode target needs its build server — run “Set Up Swift Engine”.',
    );
  }

  if (input.retrievedCount === 0) {
    gaps.push(
      'No related files were included, so the answer sees only the approved focal scope — not the code around it.',
    );
  }

  if (input.truncated) {
    gaps.push(
      'This file was long, so part of it was cut before sending. The answer may miss the cut part.',
    );
  }

  if (input.hadSecretRedaction) {
    gaps.push(
      'Some secret-looking lines were hidden for privacy, so the answer cannot see them.',
    );
  }

  return gaps;
}
