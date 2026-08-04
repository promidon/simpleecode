import * as vscode from 'vscode';
import {
  DEFAULT_PRIVACY_CONFIG,
  type PrivacyConfig,
} from './privacyGuard';
import type { PrivacyScope } from '../context/ContextPacket';

const PRIVACY_SCOPES = new Set<PrivacyScope>([
  'selection_only',
  'current_file',
  'related_files',
  'system_context',
]);

/**
 * Reads the `simpleecode.privacy.*` settings into a plain `PrivacyConfig` for the
 * pure guard logic. Keeping this thin means the guard itself stays testable.
 */
export function readPrivacyConfig(): PrivacyConfig {
  const cfg = vscode.workspace.getConfiguration('simpleecode.privacy');
  const rawScope = cfg.get<unknown>('defaultScope');
  const rawMax = cfg.get<unknown>('maxFileBytes');
  const rawGlobs = cfg.get<unknown>('blockedFileGlobs');
  const maxFileBytes =
    typeof rawMax === 'number' &&
    Number.isFinite(rawMax) &&
    rawMax >= 1 &&
    rawMax <= 5_000_000
      ? Math.floor(rawMax)
      : DEFAULT_PRIVACY_CONFIG.maxFileBytes;
  return {
    defaultScope:
      typeof rawScope === 'string' && PRIVACY_SCOPES.has(rawScope as PrivacyScope)
        ? (rawScope as PrivacyScope)
        : DEFAULT_PRIVACY_CONFIG.defaultScope,
    showPromptBeforeSending: cfg.get(
      'showPromptBeforeSending',
      DEFAULT_PRIVACY_CONFIG.showPromptBeforeSending,
    ),
    maxFileBytes,
    redactSecrets: cfg.get('redactSecrets', DEFAULT_PRIVACY_CONFIG.redactSecrets),
    blockedFileGlobs: Array.isArray(rawGlobs)
      ? rawGlobs
          .filter((value): value is string => typeof value === 'string')
          .map((value) => value.trim())
          .filter(Boolean)
          .slice(0, 200)
      : DEFAULT_PRIVACY_CONFIG.blockedFileGlobs,
  };
}
