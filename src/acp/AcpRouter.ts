import * as vscode from 'vscode';
import type {
  AcpAvailability,
  AcpChatAdapter,
  AcpSendResult,
  AcpTransportAdapter,
} from './AcpChatAdapter';
import { AcpProcessAdapter } from './AcpProcessAdapter';
import { VscodeAcpAdapter } from './VscodeAcpAdapter';
import type { Logger } from '../utils/logger';

type AcpTransport = 'auto' | 'agent' | 'commands';

/**
 * Picks the ACP transport per send, driven by `simpleecode.acp.transport`:
 *
 * - `agent`    — always the spawned ACP agent process (real delivery + answer).
 * - `commands` — always the `vscode-acp` extension commands (clipboard safety net).
 * - `auto`     — the agent when its command is on PATH, else the commands path.
 */
export class AcpRouter implements AcpChatAdapter {
  private readonly agent: AcpProcessAdapter;
  private readonly commands: VscodeAcpAdapter;

  constructor(logger: Logger, isolatedCwd: string) {
    this.agent = new AcpProcessAdapter(logger, isolatedCwd);
    this.commands = new VscodeAcpAdapter(logger);
  }

  async sendPrompt(
    prompt: string,
    onChunk?: (textSoFar: string) => void,
  ): Promise<AcpSendResult> {
    return (await this.pick()).sendPrompt(prompt, onChunk);
  }

  /**
   * Stop whatever is running. Only the spawned agent holds a streaming turn, so
   * cancel targets it directly (the commands path has nothing to stop).
   */
  cancel(): void {
    this.agent.cancel();
  }

  /**
   * Start a fresh conversation. The persistent session lives on the agent, so
   * resetting it there is the meaningful action for either transport.
   */
  newConversation(): void {
    this.agent.newConversation();
    this.commands.newConversation();
  }

  async describeAvailability(): Promise<AcpAvailability> {
    return (await this.pick()).describeAvailability();
  }

  /** Kill the agent process on deactivation. */
  dispose(): void {
    this.agent.stop();
  }

  private async pick(): Promise<AcpTransportAdapter> {
    const transport = vscode.workspace
      .getConfiguration('simpleecode.acp')
      .get<AcpTransport>('transport', 'auto');
    if (transport === 'agent') {
      return this.agent;
    }
    if (transport === 'commands') {
      return this.commands;
    }
    return (await this.agent.isAvailable()) ? this.agent : this.commands;
  }
}
