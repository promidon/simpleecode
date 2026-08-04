import type { ExplanationTask, PrivacyScope } from '../context/ContextPacket';

const SCOPE_RANK: Record<PrivacyScope, number> = {
  selection_only: 0,
  current_file: 1,
  related_files: 2,
  system_context: 3,
};

const TASK_SCOPE: Record<ExplanationTask, PrivacyScope> = {
  explain_selection: 'selection_only',
  explain_file: 'current_file',
  explain_system_role: 'system_context',
};

/**
 * Resolve the task's requested scope against the user's configured maximum.
 * Explicit, narrow commands stay narrow; broader commands are capped by the
 * configured privacy limit.
 */
export function effectivePrivacyScope(
  task: ExplanationTask,
  maximum: PrivacyScope,
): PrivacyScope {
  const requested = TASK_SCOPE[task];
  return SCOPE_RANK[requested] <= SCOPE_RANK[maximum] ? requested : maximum;
}

export function scopeIncludesRelatedFiles(scope: PrivacyScope): boolean {
  return SCOPE_RANK[scope] >= SCOPE_RANK.related_files;
}

export function scopeIncludesSystemContext(scope: PrivacyScope): boolean {
  return SCOPE_RANK[scope] >= SCOPE_RANK.system_context;
}
