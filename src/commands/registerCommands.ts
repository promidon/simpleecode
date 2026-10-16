import * as vscode from 'vscode';
import { isAbsolute } from 'path';
import type { SimpleeCodeApp } from '../app/SimpleeCodeApp';
import { swiftEngineStatus } from '../context/swiftEngineStatus';
import { openExternalUrl } from '../utils/openExternalUrl';
import { DashboardPanel } from '../dashboard/DashboardPanel';
import { submitFeedback } from '../feedback/submitFeedback';

/** Every entrypoint captures first and prepares the same host-owned workspace. */
export function registerCommands(context: vscode.ExtensionContext, app: SimpleeCodeApp): void {
  const register = (id: string, handler: (...args: any[]) => unknown) =>
    context.subscriptions.push(vscode.commands.registerCommand(id, handler));
  register('simpleecode.openDashboard', () => DashboardPanel.createOrShow(context.extensionUri, {
    getState: () => app.getDashboardState(),
    onCommand: (command, ...args) => { void vscode.commands.executeCommand(command, ...args); },
    onAsk: question => { void app.explanation.action({ action: 'followup', question }); },
    onExplanation: message => app.explanation.action(message),
    onCancel: () => { void app.explanation.action({ action: 'cancel' }); },
    onOpenSource: (path, line) => { void openSource(path, line); },
    onOpenExternal: openExternalUrl,
    checkAnswer: text => app.checkAnswer(text),
    sendFeedback: input => submitFeedback(input, context),
  }));
  const prepare = async (...args: Parameters<typeof app.explanation.capture>) => {
    // Capture synchronously before moving focus into the sidebar.
    const pending = app.explanation.capture(...args);
    if (!DashboardPanel.revealCurrent()) { await vscode.commands.executeCommand('simpleecode.sidebar.focus'); }
    await pending;
  };
  register('simpleecode.explainSelection', () => prepare('understand', 'selection'));
  register('simpleecode.explainCurrentFile', () => prepare('understand', 'file'));
  register('simpleecode.explainSystemRole', () => prepare('connections'));
  register('simpleecode.explainFunction', () => prepare('understand', 'selection', undefined, '', true));
  register('simpleecode.summarizeCurrentFile', () => prepare('understand', 'file', undefined, 'Summarize this file: its job and main parts.'));
  register('simpleecode.explainBeginner', () => prepare('understand', undefined, 'Use a beginner-friendly explanation. Introduce unfamiliar terms.'));
  register('simpleecode.explainDetailed', () => prepare('understand', undefined, 'Give a detailed, step-by-step explanation, including edge cases.'));
  register('simpleecode.explainDebug', () => prepare('investigate'));
  register('simpleecode.cancelPrompt', () => app.explanation.action({ action: 'cancel' }));
  register('simpleecode.newConversation', () => app.explanation.action({ action: 'new' }));
  register('simpleecode.ask', (question?: string) => typeof question === 'string' && app.explanation.action({ action: 'followup', question }));
  register('simpleecode.openSource', (path?: string, line?: number) => openSource(path, line));
  register('simpleecode.setupSwiftEngine', () => setupSwiftEngine());
  register('simpleecode.reindexWorkspace', async () => {
    app.setPhase('indexing');
    try {
      const files = await app.fileIndex.reindex();
      const symbols = await app.symbolIndex.reindexWorkspace(app.fileIndex.all());
      app.setPhase('done');
      vscode.window.showInformationMessage(`SimpleeCode: indexed ${files.scanned} files and ${symbols.symbols} symbols.`);
    } catch {
      app.setPhase('failed');
      const choice = await vscode.window.showErrorMessage('SimpleeCode: indexing failed.', 'Show output');
      if (choice === 'Show output') {
        app.logger.show();
      }
    }
  });
}

/**
 * Detect whether the Swift engine serves this workspace and, if a bare Xcode
 * target needs a build server, confirm the scheme and run `xcode-build-server`
 * in a visible terminal. Nothing runs without the user's confirmation.
 */
async function setupSwiftEngine(): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    vscode.window.showWarningMessage('SimpleeCode: open a folder first.');
    return;
  }

  const names = (await vscode.workspace.fs.readDirectory(folder.uri)).map(([n]) => n);
  const xcodeProject = names.find((n) => n.endsWith('.xcodeproj'));
  const xcodeWorkspace = names.find((n) => n.endsWith('.xcworkspace'));
  const info = swiftEngineStatus({
    hasPackageSwift: names.includes('Package.swift'),
    hasBuildServerJson: names.includes('buildServer.json'),
    xcodeProject,
    xcodeWorkspace,
  });

  if (info.status !== 'xcode-needs-setup') {
    vscode.window.showInformationMessage(`SimpleeCode: ${info.message}`);
    return;
  }

  // Confirm the scheme — a wrong scheme produces wrong/empty facts.
  const target = xcodeWorkspace ?? xcodeProject ?? '';
  const scheme = await vscode.window.showInputBox({
    title: 'SimpleeCode: Swift engine setup',
    prompt: 'Xcode scheme to index (must match a scheme in this project)',
    value: target.replace(/\.(xcodeproj|xcworkspace)$/, ''),
  });
  if (!scheme) {
    return;
  }

  const command = swiftEngineStatus({
    hasPackageSwift: false,
    hasBuildServerJson: false,
    xcodeProject,
    xcodeWorkspace,
    scheme,
  }).setupCommand!;

  const choice = await vscode.window.showInformationMessage(
    'SimpleeCode: set up the Swift engine for this Xcode project?',
    {
      modal: true,
      detail: `Runs in a terminal:\n\n${command}\n\nThis writes buildServer.json so SourceKit-LSP serves this target accurately. Needs "xcode-build-server" (brew install xcode-build-server) and one prior Xcode build. Reload the window when it finishes.`,
    },
    'Run setup',
  );
  if (choice !== 'Run setup') {
    return;
  }

  const term = vscode.window.createTerminal({
    name: 'SimpleeCode: Swift engine',
    cwd: folder.uri.fsPath,
  });
  term.show();
  term.sendText(
    'command -v xcode-build-server >/dev/null 2>&1 || echo "⚠ xcode-build-server not found — run: brew install xcode-build-server"',
  );
  term.sendText(command);
  vscode.window.showInformationMessage(
    'SimpleeCode: running Swift engine setup. Reload the window (Cmd+R) when the terminal finishes.',
  );
}

/**
 * Open a cited source file and, when known, jump to the line — so a reader can
 * verify a claim in one click (notes #2). `path` may be absolute (the focal
 * file) or workspace-relative (an indexed file); both resolve here.
 */
async function openSource(path?: string, line?: number): Promise<void> {
  if (!path) {
    return;
  }
  let uri: vscode.Uri;
  if (isAbsolute(path)) {
    uri = vscode.Uri.file(path);
  } else {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
      vscode.window.showWarningMessage('SimpleeCode: open a folder first.');
      return;
    }
    uri = vscode.Uri.joinPath(folder.uri, path);
  }
  if (!vscode.workspace.getWorkspaceFolder(uri)) {
    vscode.window.showWarningMessage(
      'SimpleeCode: source links can open files only inside the current workspace.',
    );
    return;
  }
  try {
    const doc = await vscode.workspace.openTextDocument(uri);
    const editor = await vscode.window.showTextDocument(doc, { preview: true });
    if (line && line > 0) {
      const safeLine = Math.min(line - 1, Math.max(0, doc.lineCount - 1));
      const pos = new vscode.Position(safeLine, 0);
      editor.selection = new vscode.Selection(pos, pos);
      editor.revealRange(
        new vscode.Range(pos, pos),
        vscode.TextEditorRevealType.InCenter,
      );
    }
  } catch {
    vscode.window.showWarningMessage(`SimpleeCode: could not open ${path}.`);
  }
}
