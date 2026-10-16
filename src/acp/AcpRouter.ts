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
 * Resolves delivery during preparation and revalidates before dispatch:
 *
 * - `agent`    — always the spawned ACP agent process (real delivery + answer).
 * - `commands` — explicit external handoff; no silent clipboard fallback.
 * - `auto`     — the agent when its command is on PATH, else the commands path.
 */
export class AcpRouter implements AcpChatAdapter {
  private readonly agent: AcpProcessAdapter;
  private readonly commands: VscodeAcpAdapter;
  private generation = 0;

  constructor(logger: Logger, isolatedCwd: string) {
    this.agent = new AcpProcessAdapter(logger, isolatedCwd);
    this.commands = new VscodeAcpAdapter(logger);
  }

  async sendPreparedPrompt(
    prompt: string,
    delivery: 'agent' | 'command' | 'clipboard',
    onChunk?: (textSoFar: string) => void,
  ): Promise<AcpSendResult> {
    const generation = this.generation;
    if (delivery !== await this.resolveDelivery() || generation !== this.generation) {
      return { delivery: 'failed', detail: 'Delivery changed. Refresh the prepared explanation before sending.' };
    }
    return delivery === 'agent' ? this.agent.sendPrompt(prompt, onChunk) : this.commands.sendPrompt(prompt, undefined, () => generation === this.generation);
  }

  async resolveDelivery(): Promise<'agent' | 'command' | 'clipboard'> {
    const selected = await this.pick();
    if (selected === this.agent) { return 'agent'; }
    return vscode.workspace.getConfiguration('simpleecode.acp').get('sendStrategy') === 'command' ? 'command' : 'clipboard';
  }

  /**
   * Stop whatever is running. Only the spawned agent holds a streaming turn, so
   * cancel targets it directly (the commands path has nothing to stop).
   */
  cancel(): void {
    this.generation++;
    this.agent.cancel();
  }

  /**
   * Start a fresh conversation. The persistent session lives on the agent, so
   * resetting it there is the meaningful action for either transport.
   */
  newConversation(): void {
    this.generation++;
    this.agent.newConversation();
  }

  async describeAvailability(): Promise<AcpAvailability> {
    return (await this.pick()).describeAvailability();
  }

  /** Kill the agent process on deactivation. */
  dispose(): void {
    this.generation++;
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
