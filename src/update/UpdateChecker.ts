import * as vscode from 'vscode';
import * as os from 'os';
import { createHash } from 'crypto';
import {
  decideUpdate,
  assetFromManifest,
  isTrustedUpdateAsset,
} from './versionCheck';
import type { Logger } from '../utils/logger';

/**
 * Startup update check. Runs when the extension activates, is SILENT when
 * there is nothing new (or when the check fails — it logs instead), and shows
 * one notification when the configured source has a newer version. The user
 * triggers the update; nothing installs itself.
 *
 * The source (`simpleecode.updates.source`) is a path or URL to the latest
 * manifest. Update checks are separate from explicit feedback sends and ACP.
 */
export class UpdateChecker {
  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly logger: Logger,
  ) {}

  /** Startup entry: quiet unless an update is found. */
  async checkOnStartup(): Promise<void> {
    const cfg = vscode.workspace.getConfiguration('simpleecode.updates');
    if (!cfg.get('checkOnStartup', false)) {
      return;
    }
    // A dev host runs the source itself — there is nothing newer to find.
    if (this.context.extensionMode === vscode.ExtensionMode.Development) {
      return;
    }
    await this.check(false);
  }

  /** Manual entry (`SimpleeCode: Check for Updates`): always reports a result. */
  async checkNow(): Promise<void> {
    await this.check(true);
  }

  private async check(verbose: boolean): Promise<void> {
    const cfg = vscode.workspace.getConfiguration('simpleecode.updates');
    const source = cfg.get('source', '').trim();
    const current =
      (this.context.extension.packageJSON as { version?: string }).version ??
      '0.0.0';

    if (!source) {
      const note =
        'SimpleeCode updates: no source configured. Point simpleecode.updates.source at your SimpleeCode repo’s package.json (path or URL).';
      this.logger.info(note);
      if (verbose) {
        vscode.window.showInformationMessage(note);
      }
      return;
    }

    const manifest = await this.loadManifest(source);
    const decision = decideUpdate(current, manifest);

    if (!decision.latest) {
      const note = `SimpleeCode updates: could not read a version from ${source}.`;
      this.logger.warn(note);
      if (verbose) {
        vscode.window.showWarningMessage(note);
      }
      return;
    }

    if (!decision.updateAvailable) {
      this.logger.info(
        `SimpleeCode updates: up to date (installed ${decision.current}, source ${decision.latest}).`,
      );
      if (verbose) {
        vscode.window.showInformationMessage(
          `SimpleeCode is up to date (${decision.current}).`,
        );
      }
      return;
    }

    this.logger.info(
      `SimpleeCode updates: ${decision.latest} available (installed ${decision.current}).`,
    );
    const asset = assetFromManifest(manifest);
    const notes = asset.notes ? `\n\n${asset.notes}` : '';
    const choice = await vscode.window.showInformationMessage(
      `SimpleeCode ${decision.latest} is available — you have ${decision.current}. The update runs only when you trigger it.${notes}`,
      'Update now',
      'Later',
    );
    if (choice === 'Update now') {
      await this.runUpdate(asset.url, decision.latest, asset.sha256, source);
    }
  }

  /** Load the manifest from an https URL or a filesystem path. */
  private async loadManifest(source: string): Promise<string | undefined> {
    try {
      if (/^https:\/\//.test(source)) {
        const response = await fetch(source, {
          signal: AbortSignal.timeout(10_000),
          redirect: 'error',
        });
        if (!response.ok) {
          return undefined;
        }
        const text = await response.text();
        return text.length <= 1_000_000 ? text : undefined;
      }
      const path = source.endsWith('.json') ? source : `${source}/package.json`;
      const bytes = await vscode.workspace.fs.readFile(vscode.Uri.file(path));
      return Buffer.from(bytes).toString('utf8');
    } catch (err) {
      this.logger.warn(`SimpleeCode updates: check failed for ${source}`, String(err));
      return undefined;
    }
  }

  /**
   * Install the update. Precedence:
   *   1. a user-set `updateCommand` (full manual control), else
   *   2. the release's same-origin, checksum-verified `.vsix` (installed via
   *      the `code` CLI — the zero-toolchain path for a beta tester), else
   *   3. printed manual steps.
   * Nothing runs without the explicit "Update now" click.
   */
  private async runUpdate(
    url?: string,
    version?: string,
    sha256?: string,
    source?: string,
  ): Promise<void> {
    const command = vscode.workspace
      .getConfiguration('simpleecode.updates')
      .get('updateCommand', '')
      .trim();
    if (command) {
      const terminal = vscode.window.createTerminal({ name: 'SimpleeCode: update' });
      terminal.show();
      terminal.sendText(command);
      vscode.window.showInformationMessage(
        'SimpleeCode: update running in the terminal. Reload the window when it finishes.',
      );
      return;
    }

    if (url) {
      if (!source || !isTrustedUpdateAsset(source, url)) {
        vscode.window.showErrorMessage(
          'SimpleeCode: update refused because the package URL is not on the configured HTTPS update host.',
        );
        return;
      }
      if (!sha256) {
        vscode.window.showErrorMessage(
          'SimpleeCode: update refused because the release feed has no valid SHA-256 checksum.',
        );
        return;
      }
      await this.installVsix(url, version, sha256);
      return;
    }

    vscode.window.showInformationMessage(
      'SimpleeCode: no prebuilt package in the release feed. Set simpleecode.updates.updateCommand to automate this, or pull the latest source, run "npm install && npm run compile", package, and reinstall.',
    );
  }

  /** Download the release .vsix and install it with the `code` CLI. */
  private async installVsix(
    url: string,
    version: string | undefined,
    expectedSha256: string,
  ): Promise<void> {
    const target = vscode.Uri.file(
      `${os.tmpdir()}/simpleecode-${version ?? 'latest'}.vsix`,
    );
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(60_000),
        redirect: 'error',
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const declaredSize = Number(res.headers.get('content-length'));
      if (Number.isFinite(declaredSize) && declaredSize > 100_000_000) {
        throw new Error('declared download size exceeded the 100 MB safety limit');
      }
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (bytes.byteLength > 100_000_000) {
        throw new Error('download exceeded the 100 MB safety limit');
      }
      const actualSha256 = createHash('sha256').update(bytes).digest('hex');
      if (actualSha256 !== expectedSha256) {
        throw new Error('download checksum did not match the release feed');
      }
      await vscode.workspace.fs.writeFile(target, bytes);
    } catch (err) {
      this.logger.warn('SimpleeCode updates: download failed', String(err));
      vscode.window.showErrorMessage(
        'SimpleeCode: the update could not be verified or downloaded. Nothing was installed.',
      );
      return;
    }

    const terminal = vscode.window.createTerminal({ name: 'SimpleeCode: update' });
    terminal.show();
    terminal.sendText(`code --install-extension "${target.fsPath}" --force`);
    vscode.window.showInformationMessage(
      'SimpleeCode: installing the update in the terminal. If "code" is not found, run "Shell Command: Install \'code\' command in PATH" from the Command Palette, then retry. Reload the window when it finishes.',
    );
  }
}
