import * as vscode from 'vscode';
import {
  type AcpAvailability,
  type AcpSendResult,
  type AcpTransportAdapter,
} from './AcpChatAdapter';
import type { Logger } from '../utils/logger';
import { redactSecrets } from '../privacy/privacyGuard';

interface AcpCommandConfig {
  extensionId: string;
  openChat: string;
  sendPrompt: string;
  newConversation: string;
  sendStrategy: 'auto' | 'command' | 'clipboard';
}

/**
 * Concrete adapter for the `vscode-acp` family of extensions
 * (`formulahendry.acp-client` / `omercnet.vscode-acp`). All command ids are
 * configurable via `simpleecode.acp.*` so a different ACP build can be wired
 * without touching code.
 *
 * Delivery reality: `acp.sendPrompt` in the reference extension is a Command
 * Palette action that sends the chat input box — passing a prompt argument is
 * not guaranteed to populate it. So `auto` mode always copies the prompt to the
 * clipboard and opens the chat only after an explicit handoff action.
 * `command` mode requests argument-based delivery without claiming confirmation.
 */
export class VscodeAcpAdapter implements AcpTransportAdapter {
  constructor(private readonly logger: Logger) {}

  private async openChat(cfg: AcpCommandConfig, current: () => boolean): Promise<void> {
    if (await this.hasCommand(cfg.openChat) && current()) {
      try {
        await vscode.commands.executeCommand(cfg.openChat);
      } catch (err) {
        this.logger.warn(`Failed to run ${cfg.openChat}`, String(err));
      }
    } else {
      this.logger.warn(
        `ACP open-chat command "${cfg.openChat}" not found. Is "${cfg.extensionId}" installed?`,
      );
    }
  }

  async sendPrompt(prompt: string, _onChunk?: (text: string) => void, current: () => boolean = () => true): Promise<AcpSendResult> {
    const cfg = this.readConfig();
    const sendPresent = await this.hasCommand(cfg.sendPrompt);
    if (!current() || JSON.stringify(cfg) !== JSON.stringify(this.readConfig())) {
      return { delivery: 'failed', detail: 'Handoff cancelled or settings changed before dispatch. Nothing was copied or sent.' };
    }

    if (cfg.sendStrategy === 'command') {
      if (!sendPresent) {
        return {
          delivery: 'failed',
          detail: `ACP send command "${cfg.sendPrompt}" not found. Install the ACP extension or switch simpleecode.acp.sendStrategy to "clipboard".`,
        };
      }
      try {
        await vscode.commands.executeCommand(cfg.sendPrompt, prompt);
        return { delivery: 'command', detail: `Handoff requested via ${cfg.sendPrompt}. Delivery and answers cannot be confirmed automatically.` };
      } catch (err) {
        this.logger.error(`ACP send failed`, redactSecrets(String(err)).text);
        return {
          delivery: 'failed',
          detail: 'ACP send failed. Check the SimpleeCode output for details.',
        };
      }
    }

    await vscode.env.clipboard.writeText(prompt);
    await this.openChat(cfg, current);
    return {
      delivery: 'clipboard',
      detail: 'Copied for manual paste into a new external chat. External conversation history and answers are not controlled by SimpleeCode.',
    };
  }

  async describeAvailability(): Promise<AcpAvailability> {
    const cfg = this.readConfig();
    const extension = vscode.extensions.getExtension(cfg.extensionId);
    const sendCommandPresent = await this.hasCommand(cfg.sendPrompt);
    const extensionInstalled = extension !== undefined;
    const available = extensionInstalled || sendCommandPresent;

    let detail: string;
    if (available) {
      detail = `ACP transport detected (${extensionInstalled ? cfg.extensionId : cfg.sendPrompt}).`;
    } else {
      detail = `No ACP transport found. Install "${cfg.extensionId}" (vscode-acp), or explicitly copy a prepared prompt for use elsewhere.`;
    }

    return {
      available,
      extensionId: cfg.extensionId,
      extensionInstalled,
      sendCommandPresent,
      detail,
    };
  }

  private async hasCommand(command: string): Promise<boolean> {
    const all = await vscode.commands.getCommands(true);
    return all.includes(command);
  }

  private readConfig(): AcpCommandConfig {
    const acp = vscode.workspace.getConfiguration('simpleecode.acp');
    return {
      extensionId: acp.get('extensionId', 'formulahendry.acp-client'),
      openChat: acp.get('commands.openChat', 'acp.openChat'),
      sendPrompt: acp.get('commands.sendPrompt', 'acp.sendPrompt'),
      newConversation: acp.get('commands.newConversation', 'acp.newConversation'),
      sendStrategy: acp.get('sendStrategy', 'auto'),
    };
  }
}
