import * as vscode from 'vscode';
import { readFeedbackConfig } from './feedbackConfig';
import { isAllowedFeedbackEndpoint } from './feedbackValidation';

interface FeedbackInput {
  title: string;
  body: string;
}

interface FeedbackResult {
  ok: boolean;
  error?: string;
}

/**
 * Send one piece of beta feedback to the Netlify function, which commits it as
 * docs/feedback/<slug>--<date>.md in the repo. The only network call is to the
 * configured endpoint; nothing else about the machine is collected beyond the
 * extension version, OS, and VS Code version below.
 */
export async function submitFeedback(
  input: FeedbackInput,
  context: vscode.ExtensionContext,
): Promise<FeedbackResult> {
  const cfg = readFeedbackConfig();
  if (!cfg.endpoint || !cfg.token) {
    return {
      ok: false,
      error:
        'Feedback isn’t configured yet. Set simpleecode.feedback.endpoint and simpleecode.feedback.token.',
    };
  }
  if (!isAllowedFeedbackEndpoint(cfg.endpoint)) {
    return {
      ok: false,
      error:
        'Feedback requires an HTTPS endpoint. Plain HTTP is allowed only for localhost development.',
    };
  }

  const version =
    (context.extension.packageJSON as { version?: string }).version ?? 'unknown';
  const payload = {
    title: input.title,
    body: input.body,
    tester: cfg.tester,
    meta: { version, os: process.platform, vscode: vscode.version },
  };

  try {
    const res = await fetch(cfg.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-simpleecode-token': cfg.token },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
      redirect: 'error',
    });
    if (res.ok) {
      return { ok: true };
    }
    let detail = '';
    try {
      const data = (await res.json()) as { error?: string };
      detail = data.error ? ` — ${data.error}` : '';
    } catch {
      /* ignore */
    }
    return { ok: false, error: `Couldn’t send feedback (HTTP ${res.status})${detail}.` };
  } catch {
    return {
      ok: false,
      error: 'Couldn’t reach the feedback service. Check your connection and try again.',
    };
  }
}
