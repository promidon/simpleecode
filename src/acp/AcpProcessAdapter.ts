import * as vscode from 'vscode';
import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import { accessSync, constants } from 'fs';
import { delimiter, isAbsolute, join } from 'path';
import { createInterface } from 'readline';
import {
  type AcpAvailability,
  type AcpSendResult,
  type AcpTransportAdapter,
} from './AcpChatAdapter';
import {
  type AcpMessage,
  agentTextFromUpdate,
  cancelNotification,
  describeStopReason,
  encodeMessage,
  errorResponse,
  initializeRequest,
  newSessionRequest,
  parseMessage,
  promptRequest,
  rejectPermissionResult,
  resultResponse,
  stopReasonOf,
} from './acpProtocol';
import type { Logger } from '../utils/logger';
import { redactSecrets } from '../privacy/privacyGuard';
import { buildAgentEnvironment } from './agentEnvironment';

const INIT_TIMEOUT_MS = 20_000;
const PROMPT_TIMEOUT_MS = 600_000;

/**
 * Real ACP delivery (Build Order #13). Spawns the Claude Code ACP agent
 * (default: `claude-code-acp`, the official adapter from
 * `@zed-industries/claude-code-acp`) and speaks newline-delimited JSON-RPC
 * over its stdio. Answers stream back through `sendPrompt`'s `onChunk`, so the
 * dashboard can show them live — no clipboard hop.
 *
 * Privacy stance: `fs` capabilities are false, tool permissions are declined,
 * the session starts outside the workspace, and the child gets a minimal
 * environment. The installed agent is still a trusted local process, not an OS
 * sandbox.
 *
 * The process is started lazily on the first send, and restarted on the next
 * send if it died. All protocol parsing lives in `acpProtocol.ts` (pure).
 */
export class AcpProcessAdapter implements AcpTransportAdapter {
  private child: ChildProcessWithoutNullStreams | undefined;
  private sessionId: string | undefined;
  private nextId = 1;
  private readonly pending = new Map<
    number,
    { resolve: (msg: AcpMessage) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }
  >();
  private onAgentText: ((chunk: string) => void) | undefined;
  /** Id of the `session/prompt` request awaiting an answer, so cancel can end it. */
  private inflightPromptId: number | undefined;
  private generation = 0;

  constructor(
    private readonly logger: Logger,
    private readonly isolatedCwd: string,
  ) {}

  async sendPrompt(
    prompt: string,
    onChunk?: (textSoFar: string) => void,
  ): Promise<AcpSendResult> {
    const generation = this.generation;
    try {
      await this.ensureSession();
      if (generation !== this.generation) { throw new Error('Retired request'); }
    } catch (err) {
      this.logger.error('ACP agent failed to start.', safeError(err));
      if (generation === this.generation) { this.stop(); }
      return {
        delivery: 'failed',
        detail:
          'ACP agent failed to start. Check the configured agent command or install claude-code-acp.',
      };
    }

    let answer = '';
    this.onAgentText = (chunk) => {
      answer += chunk;
      onChunk?.(answer);
    };
    try {
      const response = await this.request(
        (id) => promptRequest(id, this.sessionId!, prompt),
        PROMPT_TIMEOUT_MS,
        (id) => {
          this.inflightPromptId = id;
        },
      );
      if (response.error) {
        return {
          delivery: 'failed',
          detail: `The agent reported an error: ${response.error.message}`,
        };
      }
      return {
        delivery: 'agent',
        detail: describeStopReason(stopReasonOf(response.result)),
        answer,
      };
    } catch (err) {
      this.logger.error('ACP prompt failed.', safeError(err));
      if (generation === this.generation) { this.stop(); }
      return {
        delivery: 'failed',
        detail: 'ACP prompt failed. Check the SimpleeCode output for a redacted diagnostic.',
      };
    } finally {
      if (generation === this.generation) {
        this.onAgentText = undefined;
        this.inflightPromptId = undefined;
      }
    }
  }

  /**
   * Stop the current prompt (Build Order P0 #2). Sends `session/cancel` so the
   * agent halts, and immediately settles the awaiting prompt with a "cancelled"
   * result so the dashboard updates at once — even if the agent is slow to reply.
   * The process and session are left alive for the next question.
   */
  cancel(): void {
    if (!this.child || this.child.exitCode !== null || !this.sessionId) {
      return;
    }
    this.logger.info('ACP agent: stopping the current prompt (session/cancel).');
    this.reply(cancelNotification(this.sessionId));

    const id = this.inflightPromptId;
    if (id === undefined) {
      return;
    }
    const entry = this.pending.get(id);
    if (entry) {
      this.pending.delete(id);
      clearTimeout(entry.timer);
      entry.resolve({ jsonrpc: '2.0', id, result: { stopReason: 'cancelled' } });
    }
    this.inflightPromptId = undefined;
  }

  /**
   * Start a fresh conversation (#5). Cancels anything in flight and drops the
   * session id; the next `sendPrompt` spins up a brand-new session with no
   * memory of the previous topic. The process is respawned lazily on that send.
   */
  newConversation(): void {
    this.cancel();
    this.stop();
  }

  async isAvailable(): Promise<boolean> {
    return (await this.describeAvailability()).available;
  }

  async describeAvailability(): Promise<AcpAvailability> {
    const command = readAgentConfig().command;
    const running = this.child !== undefined && this.child.exitCode === null;
    const onPath = running || commandExists(command);
    return {
      available: onPath,
      extensionId: command,
      extensionInstalled: onPath,
      sendCommandPresent: onPath,
      detail: running
        ? `ACP agent running (${command}). Answers stream into this dashboard.`
        : onPath
          ? `ACP agent found (${command}) — starts on the first Explain.`
          : `ACP agent "${command}" not found on PATH. Install it: npm i -g @zed-industries/claude-code-acp`,
    };
  }

  /** Kill the agent process (used on extension deactivation). */
  stop(): void {
    this.generation++;
    for (const [, entry] of this.pending) {
      clearTimeout(entry.timer);
      entry.reject(new Error('ACP process stopped'));
    }
    this.pending.clear();
    this.sessionId = undefined;
    this.onAgentText = undefined;
    this.inflightPromptId = undefined;
    if (this.child) {
      this.child.kill();
      this.child = undefined;
    }
  }

  // --- process + session lifecycle -------------------------------------------

  private async ensureSession(): Promise<void> {
    const generation = this.generation;
    if (this.child && this.child.exitCode === null && this.sessionId) {
      return;
    }
    const { command, args, environmentVariables } = readAgentConfig();
    const cwd = this.isolatedCwd;
    await vscode.workspace.fs.createDirectory(vscode.Uri.file(cwd));
    if (generation !== this.generation) { throw new Error('Cancelled during startup'); }

    this.logger.info(`ACP agent: starting "${command}" in an isolated working directory.`);
    const child = spawn(command, args, {
      cwd,
      env: buildAgentEnvironment(environmentVariables),
    });
    this.child = child;

    // readline decodes UTF-8 across chunk boundaries; stray non-JSON lines are skipped.
    createInterface({ input: child.stdout }).on('line', (line) => {
      if (this.child !== child) { return; }
      const message = parseMessage(line);
      if (message) {
        this.onMessage(message);
      }
    });
    child.stderr.on('data', (data: Buffer) => {
      if (this.child !== child) { return; }
      const safe = redactSecrets(data.toString('utf8').trim()).text;
      this.logger.warn('ACP agent stderr (secret-redacted):', safe);
    });
    child.on('exit', (code) => {
      if (this.child !== child) { return; }
      this.logger.warn(`ACP agent exited (code ${code}).`);
      this.stop();
    });
    child.on('error', (err) => {
      if (this.child !== child) { return; }
      this.logger.error('ACP agent spawn error:', String(err));
      this.stop();
    });

    const init = await this.request((id) => initializeRequest(id), INIT_TIMEOUT_MS);
    if (generation !== this.generation) { throw new Error('Cancelled during initialization'); }
    if (init.error) {
      throw new Error(`initialize failed: ${init.error.message}`);
    }
    const session = await this.request(
      (id) => newSessionRequest(id, cwd),
      INIT_TIMEOUT_MS,
    );
    if (generation !== this.generation) { throw new Error('Cancelled during session creation'); }
    if (session.error) {
      throw new Error(`session/new failed: ${session.error.message}`);
    }
    const sessionId = (session.result as { sessionId?: string })?.sessionId;
    if (!sessionId) {
      throw new Error('session/new returned no sessionId');
    }
    this.sessionId = sessionId;
    this.logger.info(`ACP agent: session ${sessionId} ready.`);
  }

  private request(
    build: (id: number) => AcpMessage,
    timeoutMs: number,
    onId?: (id: number) => void,
  ): Promise<AcpMessage> {
    const id = this.nextId++;
    onId?.(id);
    return new Promise<AcpMessage>((resolve, reject) => {
      const child = this.child;
      if (!child || child.exitCode !== null) {
        reject(new Error('agent process is not running'));
        return;
      }
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`timed out after ${timeoutMs / 1000}s`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      child.stdin.write(encodeMessage(build(id)));
    });
  }

  private onMessage(message: AcpMessage): void {
    // Response to one of our requests.
    if (message.method === undefined && typeof message.id === 'number') {
      const entry = this.pending.get(message.id);
      if (entry) {
        this.pending.delete(message.id);
        clearTimeout(entry.timer);
        entry.resolve(message);
      }
      return;
    }

    // Notification: streamed session updates.
    if (message.method === 'session/update') {
      if ((message.params as { sessionId?: string })?.sessionId !== this.sessionId) { return; }
      const text = agentTextFromUpdate(message.params);
      if (text) {
        this.onAgentText?.(text);
      }
      return;
    }

    // Request from the agent: decline permissions, refuse everything else.
    if (message.method !== undefined && message.id !== undefined) {
      if (message.method === 'session/request_permission') {
        const options = (message.params as { options?: unknown })?.options;
        this.logger.info('ACP agent asked for a tool permission — declined (SimpleeCode is read-only).');
        this.reply(resultResponse(message.id, rejectPermissionResult(options)));
      } else {
        this.reply(errorResponse(message.id, -32601, `SimpleeCode does not support ${message.method}`));
      }
    }
  }

  private reply(message: AcpMessage): void {
    if (this.child && this.child.exitCode === null) {
      this.child.stdin.write(encodeMessage(message));
    }
  }
}

function readAgentConfig(): {
  command: string;
  args: string[];
  environmentVariables: string[];
} {
  const cfg = vscode.workspace.getConfiguration('simpleecode.acp');
  return {
    command: cfg.get('agentCommand', 'claude-code-acp'),
    args: cfg.get<string[]>('agentArgs', []),
    environmentVariables: cfg.get<string[]>('environmentVariables', []),
  };
}

function safeError(error: unknown): string {
  return redactSecrets(String(error)).text;
}

/** True when `command` resolves to an executable (absolute or via PATH). */
function commandExists(command: string): boolean {
  const candidates = isAbsolute(command)
    ? [command]
    : (process.env.PATH ?? '').split(delimiter).map((dir) => join(dir, command));
  return candidates.some((candidate) => {
    try {
      accessSync(candidate, constants.X_OK);
      return true;
    } catch {
      return false;
    }
  });
}
