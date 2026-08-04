import * as vscode from 'vscode';

/**
 * Where in-extension feedback is sent. The endpoint has a project default;
 * the shared token must be configured per user in VS Code settings.
 *
 * SECURITY: release builds never bake the shared token into the public VSIX.
 * The token is rotatable and only authorizes the feedback endpoint.
 */
const DEFAULT_ENDPOINT =
  'https://simpleecode.netlify.app/.netlify/functions/feedback';
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
