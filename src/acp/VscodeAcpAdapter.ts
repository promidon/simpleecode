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
 * clipboard and opens the chat as a dependable fallback, then *attempts* the
 * command. `command` mode trusts arg-passing; `clipboard` mode skips it.
 */
export class VscodeAcpAdapter implements AcpTransportAdapter {
  constructor(private readonly logger: Logger) {}

  private async openChat(): Promise<void> {
    const cfg = this.readConfig();
    if (await this.hasCommand(cfg.openChat)) {
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

  async sendPrompt(prompt: string): Promise<AcpSendResult> {
    const cfg = this.readConfig();
    const sendPresent = await this.hasCommand(cfg.sendPrompt);

    if (cfg.sendStrategy === 'command') {
      if (!sendPresent) {
        return {
          delivery: 'failed',
          detail: `ACP send command "${cfg.sendPrompt}" not found. Install the ACP extension or switch simpleecode.acp.sendStrategy to "clipboard".`,
        };
      }
      try {
        await vscode.commands.executeCommand(cfg.sendPrompt, prompt);
        return { delivery: 'command', detail: `Sent via ${cfg.sendPrompt}.` };
      } catch (err) {
        this.logger.error(`ACP send failed`, redactSecrets(String(err)).text);
        return {
          delivery: 'failed',
          detail: 'ACP send failed. Check the SimpleeCode output for details.',
        };
      }
    }

    if (cfg.sendStrategy === 'clipboard' || !sendPresent) {
      await vscode.env.clipboard.writeText(prompt);
      await this.openChat();
      return {
        delivery: 'clipboard',
        detail: sendPresent
          ? 'Prompt copied to clipboard and ACP chat opened (clipboard strategy).'
          : 'ACP send command not found — prompt copied to clipboard and chat opened for paste.',
      };
    }

    // strategy === 'auto' with the send command present: clipboard as a safety
    // net, open chat, then attempt the command in case it accepts the argument.
    await vscode.env.clipboard.writeText(prompt);
    await this.openChat();
    try {
      await vscode.commands.executeCommand(cfg.sendPrompt, prompt);
    } catch (err) {
      this.logger.warn(
        `ACP send command threw (clipboard backup is set)`,
        redactSecrets(String(err)).text,
      );
    }
    return {
      delivery: 'command',
      detail:
        'Attempted ACP send; prompt also copied to clipboard — paste it if the chat box is empty.',
    };
  }

  newConversation(): void {
    // Best-effort: ask the vscode-acp extension to start a fresh chat, if it
    // exposes that command. Fire-and-forget so this stays synchronous.
    const cfg = this.readConfig();
    void this.hasCommand(cfg.newConversation).then((present) => {
      if (present) {
        void vscode.commands.executeCommand(cfg.newConversation);
      }
    });
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
      detail = `No ACP transport found. Install "${cfg.extensionId}" (vscode-acp). SimpleeCode will copy prompts to the clipboard until then.`;
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
