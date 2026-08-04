/**
 * Pure helpers for the Agent Client Protocol (ACP): JSON-RPC 2.0, one JSON
 * object per line, over an agent process's stdio. No `vscode`, no
 * `child_process` — the process wiring lives in `AcpProcessAdapter.ts`, so
 * everything here is unit-testable.
 *
 * Protocol reference: https://agentclientprotocol.com (protocolVersion 1).
 */

export interface AcpMessage {
  jsonrpc: '2.0';
  id?: number | string;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string };
}

const ACP_PROTOCOL_VERSION = 1;

/**
 * Accumulates raw stdout chunks and yields complete newline-delimited JSON
 * messages. Malformed lines are skipped (an agent may print stray text).
 */
export class LineDecoder {
  private buffer = '';

  push(chunk: string): AcpMessage[] {
    this.buffer += chunk;
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() ?? '';
    const messages: AcpMessage[] = [];
    for (const line of lines) {
      const message = parseMessage(line);
      if (message) {
        messages.push(message);
      }
    }
    return messages;
  }
}

export function parseMessage(line: string): AcpMessage | undefined {
  const trimmed = line.trim();
  if (!trimmed.startsWith('{')) {
    return undefined;
  }
  try {
    const value = JSON.parse(trimmed) as AcpMessage;
    return value && value.jsonrpc === '2.0' ? value : undefined;
  } catch {
    return undefined;
  }
}

export function encodeMessage(message: AcpMessage): string {
  return `${JSON.stringify(message)}\n`;
}

// --- requests the client sends ----------------------------------------------

export function initializeRequest(id: number): AcpMessage {
  return {
    jsonrpc: '2.0',
    id,
    method: 'initialize',
    params: {
      protocolVersion: ACP_PROTOCOL_VERSION,
      clientCapabilities: {
        // SimpleeCode sends exactly one privacy-checked packet. The agent must not
        // read or write files through us.
        fs: { readTextFile: false, writeTextFile: false },
      },
    },
  };
}

export function newSessionRequest(id: number, cwd: string): AcpMessage {
  return {
    jsonrpc: '2.0',
    id,
    method: 'session/new',
    params: { cwd, mcpServers: [] },
  };
}

export function promptRequest(
  id: number,
  sessionId: string,
  text: string,
): AcpMessage {
  return {
    jsonrpc: '2.0',
    id,
    method: 'session/prompt',
    params: { sessionId, prompt: [{ type: 'text', text }] },
  };
}

/**
 * `session/cancel` is a NOTIFICATION (no id): it tells the agent to stop the
 * current turn. The agent then ends the in-flight `session/prompt` with
 * stopReason "cancelled". The session stays alive for follow-up questions.
 */
export function cancelNotification(sessionId: string): AcpMessage {
  return {
    jsonrpc: '2.0',
    method: 'session/cancel',
    params: { sessionId },
  };
}

// --- messages the agent sends -----------------------------------------------

/** Text of an `agent_message_chunk` in a `session/update`, else undefined. */
export function agentTextFromUpdate(params: unknown): string | undefined {
  const update = (params as { update?: Record<string, unknown> })?.update;
  if (!update || update.sessionUpdate !== 'agent_message_chunk') {
    return undefined;
  }
  const content = update.content as { type?: string; text?: string } | undefined;
  return content?.type === 'text' && typeof content.text === 'string'
    ? content.text
    : undefined;
}

interface PermissionOption {
  optionId: string;
  name?: string;
  kind?: string;
}

/**
 * SimpleeCode is an explainer, not an editor: tool permissions are always
 * declined. Prefer an explicit reject option; otherwise cancel the request.
 */
export function rejectPermissionResult(options: unknown): {
  outcome: { outcome: 'selected'; optionId: string } | { outcome: 'cancelled' };
} {
  const list = Array.isArray(options) ? (options as PermissionOption[]) : [];
  const reject =
    list.find((o) => o.kind === 'reject_once') ??
    list.find((o) => o.kind === 'reject_always');
  return reject
    ? { outcome: { outcome: 'selected', optionId: reject.optionId } }
    : { outcome: { outcome: 'cancelled' } };
}

export function errorResponse(
  id: number | string,
  code: number,
  message: string,
): AcpMessage {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

export function resultResponse(id: number | string, result: unknown): AcpMessage {
  return { jsonrpc: '2.0', id, result };
}

export function stopReasonOf(result: unknown): string {
  const reason = (result as { stopReason?: unknown })?.stopReason;
  return typeof reason === 'string' ? reason : 'unknown';
}
