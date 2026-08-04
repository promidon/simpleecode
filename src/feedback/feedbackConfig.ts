import * as vscode from 'vscode';

/**
 * Where in-extension feedback is sent. The endpoint + shared token can be baked
 * here (so a beta tester needs zero setup) or overridden per-user in settings.
 *
 * SECURITY: the shared token only authorizes creating a file in docs/feedback/
 * via the Netlify function — it is not a GitHub token, and it is rotatable. For
 * a closed beta, baking it is acceptable; rotate it (Netlify env + this default)
 * if the .vsix ever leaks beyond your testers.
 */
const DEFAULT_ENDPOINT =
  'https://simpleecode.netlify.app/.netlify/functions/feedback';
// Injected into the .vsix at build time from Netlify's FEEDBACK_TOKEN
// (see scripts/release.sh) — kept OUT of git so no secret lands in history.
const DEFAULT_TOKEN = '';

interface FeedbackConfig {
  endpoint: string;
  token: string;
  tester: string;
}

export function readFeedbackConfig(): FeedbackConfig {
  const cfg = vscode.workspace.getConfiguration('simpleecode.feedback');
  return {
    endpoint: (cfg.get('endpoint', '') || DEFAULT_ENDPOINT).trim(),
    token: (cfg.get('token', '') || DEFAULT_TOKEN).trim(),
    tester: cfg.get('tester', '').trim(),
  };
}
