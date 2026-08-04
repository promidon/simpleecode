import * as vscode from 'vscode';
import { isAbsolute } from 'path';
import type { SimpleeCodeApp } from '../app/SimpleeCodeApp';
import type { ExplanationTask } from '../context/ContextPacket';
import { buildContextPacket } from '../context/buildContextPacket';
import { findContextGaps } from '../context/contextGaps';
import { getSelectionSnapshot } from '../context/SelectionContext';
import { getParentSymbol } from '../context/parentSymbol';
import { getCodeFacts } from '../context/codeFacts';
import {
  explainSelection,
  generateExplanation,
} from '../context/generateExplanation';
import { swiftEngineStatus } from '../context/swiftEngineStatus';
import type { RetrievedContext } from '../rag/Retriever';
import { describeSystemRole, systemRoleBlock } from '../rag/systemRole';
import { swiftDocLinks } from '../rag/swiftDocs';
import { buildPrompt, type ExplanationMode } from '../prompt/promptBuilder';
import { openExternalUrl } from '../utils/openExternalUrl';
import { readPrivacyConfig } from '../privacy/PrivacySettings';
import { DashboardPanel, type DashboardState } from '../dashboard/DashboardPanel';
import { submitFeedback } from '../feedback/submitFeedback';
import { scopeIncludesSystemContext } from '../privacy/privacyScope';
import {
  buildOutboundEnvelope,
  type OutboundEnvelope,
} from '../privacy/OutboundEnvelope';

/** Registers the core SimpleeCode commands (disposed through the extension context). */
export function registerCommands(
  context: vscode.ExtensionContext,
  app: SimpleeCodeApp,
): void {
  const register = (id: string, handler: (...args: any[]) => unknown) =>
    context.subscriptions.push(vscode.commands.registerCommand(id, handler));

  register('simpleecode.openDashboard', async () => {
    await DashboardPanel.createOrShow(context.extensionUri, {
      getState: () => app.getDashboardState(),
      onCommand: (command) => {
        void vscode.commands.executeCommand(command);
      },
      onAsk: (question) => {
        void vscode.commands.executeCommand('simpleecode.ask', question);
      },
      onCancel: () => {
        void vscode.commands.executeCommand('simpleecode.cancelPrompt');
      },
      onOpenSource: (path, line) => {
        void vscode.commands.executeCommand('simpleecode.openSource', path, line);
      },
      onOpenExternal: (url) => openExternalUrl(url),
      checkAnswer: (text) => app.checkAnswer(text),
      sendFeedback: (input) => submitFeedback(input, context),
    });
  });

  register('simpleecode.explainSelection', () => runExplain(app, 'explain_selection'));
  register('simpleecode.explainCurrentFile', () => runExplain(app, 'explain_file'));
  register('simpleecode.explainSystemRole', () => runExplain(app, 'explain_system_role'));

  // Stop a running prompt (Build Order P0 #2). Safe to call when idle.
  register('simpleecode.cancelPrompt', () => {
    app.adapter.cancel();
    app.setPhase('cancelled');
  });

  // Start a fresh conversation (P1 #5): drop the session and clear the last
  // answer, so the next question starts on a clean slate.
  register('simpleecode.newConversation', () => {
    app.adapter.newConversation();
    app.setAnswer(undefined);
    app.setContextGaps([]);
    app.setLastPacket(undefined);
    app.setRetrieved(undefined);
    app.setFacts(undefined);
    app.setLastContext(undefined);
    app.setPhase('idle');
    vscode.window.showInformationMessage(
      'SimpleeCode: started a new conversation. Your next question starts fresh.',
    );
  });

  // Click-through to source (notes #2): open a cited file at its line so a claim
  // can be checked in one click. Args come from the dashboard's claim links.
  register('simpleecode.openSource', (path?: string, line?: number) =>
    openSource(path, line),
  );

  // Explain the whole enclosing function/class. Reuses the deterministic parent
  // symbol (step 1): expand the selection to its range, then explain it.
  register('simpleecode.explainFunction', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage('SimpleeCode: open a file first.');
      return;
    }
    const parent = await getParentSymbol();
    if (!parent) {
      vscode.window.showWarningMessage(
        'SimpleeCode: no function or symbol found at the cursor.',
      );
      return;
    }
    const startPos = new vscode.Position(parent.startLine - 1, 0);
    const endLineIdx = parent.endLine - 1;
    const endPos = new vscode.Position(
      endLineIdx,
      editor.document.lineAt(endLineIdx).text.length,
    );
    editor.selection = new vscode.Selection(startPos, endPos);
    editor.revealRange(new vscode.Range(startPos, endPos));
    await runExplain(app, 'explain_selection');
  });

  register('simpleecode.summarizeCurrentFile', () =>
    runExplain(
      app,
      'explain_file',
      'Summarize this file in plain language: what is its job, and what are its main parts?',
    ),
  );

  // Re-run modes (Build Order #14): same code, different explanation style.
  register('simpleecode.explainBeginner', () => runExplainHere(app, 'beginner'));
  register('simpleecode.explainDetailed', () => runExplainHere(app, 'detailed'));
  register('simpleecode.explainDebug', () => runExplainHere(app, 'debug'));

  // The dashboard ask box (Build Order #2). A free-text question grounds on the
  // current selection when there is one, otherwise on the whole file.
  register('simpleecode.ask', (question?: string) => {
    const hasSelection = getSelectionSnapshot()?.hasSelection ?? false;
    return runExplain(
      app,
      hasSelection ? 'explain_selection' : 'explain_file',
      typeof question === 'string' ? question : undefined,
    );
  });

  // Guided, one-time setup so SourceKit-LSP serves a bare Xcode target — which
  // makes symbol facts accurate (real types, callers, SDK symbols).
  register('simpleecode.setupSwiftEngine', () => setupSwiftEngine());

  register('simpleecode.reindexWorkspace', async () => {
    app.setPhase('indexing');
    app.logger.info('Reindex requested.');
    try {
      const files = await app.fileIndex.reindex();
      app.refreshDashboard();
      const symbols = await app.symbolIndex.reindexWorkspace(app.fileIndex.all());
      app.setPhase('done');
      vscode.window.showInformationMessage(
        `SimpleeCode: indexed ${files.scanned} files (${files.indexed} changed) and ${symbols.symbols} symbols.`,
      );
    } catch (err) {
      app.logger.warn('Reindex failed.', String(err));
      app.setPhase('failed');
      vscode.window.showErrorMessage(
        'SimpleeCode: indexing failed. Check the SimpleeCode output for details.',
      );
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

/** Explain the current selection, or the whole file if nothing is selected. */
function runExplainHere(app: SimpleeCodeApp, mode: ExplanationMode): Promise<void> {
  const hasSelection = getSelectionSnapshot()?.hasSelection ?? false;
  return runExplain(
    app,
    hasSelection ? 'explain_selection' : 'explain_file',
    undefined,
    mode,
  );
}

async function runExplain(
  app: SimpleeCodeApp,
  task: ExplanationTask,
  userQuestion?: string,
  mode: ExplanationMode = 'detailed',
): Promise<void> {
  app.setPhase('capturing');
  app.setExplanationMode(mode);
  if (userQuestion && userQuestion.length > 20_000) {
    app.setPhase('failed');
    vscode.window.showWarningMessage(
      'SimpleeCode: the question is too long. Keep it under 20,000 characters.',
    );
    return;
  }
  const config = readPrivacyConfig();
  const result = buildContextPacket(task, userQuestion, config);

  if (result.error) {
    app.setPhase('failed');
    vscode.window.showWarningMessage(`SimpleeCode: ${result.error}`);
    return;
  }
  if (result.blocked) {
    app.setPhase('failed');
    vscode.window.showWarningMessage(`SimpleeCode blocked this content: ${result.blocked}`);
    return;
  }

  const packet = result.packet!;

  // Deterministically attach the enclosing function/class so Claude can ground
  // the "How it connects" part of the explanation (Build Order #7/#8 slice).
  if (packet.task === 'explain_selection') {
    const parent = await getParentSymbol();
    if (parent) {
      packet.symbolName = parent.name;
    }
  }

  // Remember the exact packet so a pasted answer can be verified against it (#20).
  app.setLastContext(packet);

  // Facts Layer: pull verified facts from the language server, show them in the
  // dashboard, and feed them to the prompt as ground truth.
  const facts = await getCodeFacts();
  app.setFacts(facts);

  // Keep the focal file's symbols current (dirty buffers included) so retrieval
  // can hand out exact declarations (#7).
  if (packet.filePath) {
    const record = app.fileIndex.get(packet.filePath);
    await app.symbolIndex.reindexFile(packet.filePath, record?.hash ?? '', true);
  }

  // Deterministic retrieval (#9): related files via imports and type references
  // (exact declarations when the symbol index has them), plus README/config.
  const retrieved = await app.retriever.retrieve(packet);
  app.setRetrieved(
    retrieved.map((r) => ({
      sourceType: r.sourceType,
      path: r.path,
      reasonIncluded: r.reasonIncluded,
    })),
  );

  // "What's missing" (#21 / notes #3): label a thin answer as thin, up front —
  // deterministically, from what the packet actually carried.
  app.setContextGaps(
    findContextGaps({
      task: packet.task,
      hasSymbolName: Boolean(packet.symbolName),
      hasFacts: Boolean(facts),
      retrievedCount: retrieved.length,
      truncated: Boolean(packet.meta?.truncated),
      hadSecretRedaction: (packet.meta?.redactions ?? []).some((r) =>
        /secret/i.test(r),
      ),
      privacyScope: packet.privacyScope,
    }),
  );

  // Swift doc links (#10): reference-only entries so Claude can point the user
  // to the canonical docs. Deterministic search links — never fetched here.
  const docContext = swiftDocLinks(packet.symbolName, packet.languageId).map(
    (l): RetrievedContext => ({
      sourceType: 'doc',
      path: l.title,
      reasonIncluded: l.reason,
      content: l.url,
    }),
  );

  // Deterministic draft explanation (from the code we're sending) — the AI
  // polishes and connects the dots on top of it, like a tutor. A selection gets
  // the glossary/anatomy treatment (keyword meanings, why-struct contracts);
  // note it only sees the selection itself, honoring the privacy scope.
  const draft = packet.selectedText
    ? explainSelection(
        packet.selectedText,
        packet.selectedText,
        packet.languageId ?? '',
        packet.filePath ?? 'this file',
      )
    : generateExplanation(
        packet.fullText ?? '',
        packet.languageId ?? '',
        packet.filePath ?? 'this file',
      );

  // System-role grounding (#20): the file's real place in the module graph —
  // imports, exports, and which files depend on it — from the local index.
  let roleBlock: string | undefined;
  if (
    packet.task === 'explain_system_role' &&
    packet.filePath &&
    scopeIncludesSystemContext(packet.privacyScope)
  ) {
    const summary = describeSystemRole(packet.filePath, app.fileIndex.all());
    roleBlock = summary ? systemRoleBlock(summary) : undefined;
  }

  const prompt = buildPrompt(
    packet,
    [...retrieved, ...docContext],
    mode,
    facts,
    draft,
    roleBlock,
  );
  const envelope = buildOutboundEnvelope(
    packet,
    prompt,
    [...retrieved, ...docContext],
    outboundChannelDescription(),
  );

  if (config.showPromptBeforeSending) {
    app.setPhase('reviewing');
    const choice = await showPreview(envelope);
    if (choice === 'cancel') {
      app.setLastPacket(toLastPacket(envelope, 'cancelled (not sent)'));
      app.setPhase('cancelled');
      return;
    }
    if (choice === 'copy') {
      await vscode.env.clipboard.writeText(envelope.prompt);
      app.setLastPacket(toLastPacket(envelope, 'copied to clipboard'));
      app.setPhase('done');
      vscode.window.showInformationMessage('SimpleeCode: prompt copied to clipboard.');
      return;
    }
  }

  app.setPhase('sending');
  app.setAnswer({ text: '', done: false });
  let streamingStarted = false;
  const sendResult = await app.adapter.sendPrompt(envelope.prompt, (textSoFar) => {
    if (!streamingStarted) {
      streamingStarted = true;
      app.setPhase('streaming');
    }
    app.setAnswer({ text: textSoFar, done: false });
  });
  app.setLastPacket(toLastPacket(envelope, sendResult.detail));

  if (sendResult.answer !== undefined && sendResult.delivery === 'agent') {
    // Answer captured: run the limited deterministic checker. Recognized
    // file, line, symbol, and documentation claims are checked; prose that the
    // checker cannot classify remains explicitly unchecked.
    app.setPhase('verifying');
    app.setAnswer({
      text: sendResult.answer,
      done: true,
      verify: app.checkAnswer(sendResult.answer),
    });
    app.setPhase('done');
  } else {
    app.setAnswer(undefined);
    app.setPhase(sendResult.delivery === 'failed' ? 'failed' : 'done');
  }

  if (sendResult.delivery === 'failed') {
    vscode.window.showErrorMessage(`SimpleeCode: ${sendResult.detail}`);
  } else {
    vscode.window.showInformationMessage(`SimpleeCode: ${sendResult.detail}`);
  }
}

/** Modal preview so nothing leaves the machine without an explicit choice. */
async function showPreview(
  envelope: OutboundEnvelope,
): Promise<'send' | 'copy' | 'cancel'> {
  const lines = [
    `Task: ${envelope.task}`,
    `Scope: ${envelope.privacyScope}`,
    `File: ${envelope.filePath ?? '(untitled)'}`,
    `Complete prompt size: ${envelope.totalBytes} bytes${envelope.truncated ? ' (some source content was truncated)' : ''}`,
    `Delivery: ${envelope.channel}`,
    '',
    'Included sources:',
    ...envelope.includedSources.map((source) => `• ${source}`),
  ];
  if (envelope.redactions.length) {
    lines.push('', 'Privacy notes:', ...envelope.redactions.map((r) => `• ${r}`));
  }
  lines.push('', '--- complete prompt ---', envelope.prompt);

  const choice = await vscode.window.showInformationMessage(
    'SimpleeCode is about to send this context to Claude.',
    { modal: true, detail: lines.join('\n') },
    'Send to Claude',
    'Copy prompt only',
  );

  if (choice === 'Send to Claude') {
    return 'send';
  }
  if (choice === 'Copy prompt only') {
    return 'copy';
  }
  return 'cancel';
}

function toLastPacket(
  envelope: OutboundEnvelope,
  delivery: string,
): DashboardState['lastPacket'] {
  return {
    task: envelope.task,
    privacyScope: envelope.privacyScope,
    filePath: envelope.filePath,
    byteSize: envelope.totalBytes,
    truncated: envelope.truncated,
    redactions: envelope.redactions,
    promptPreview: envelope.prompt,
    includedSources: envelope.includedSources,
    channel: envelope.channel,
    delivery,
    createdAt: new Date().toISOString(),
  };
}

function outboundChannelDescription(): string {
  const cfg = vscode.workspace.getConfiguration('simpleecode.acp');
  const transport = cfg.get<'auto' | 'agent' | 'commands'>('transport', 'auto');
  const strategy = cfg.get<'auto' | 'command' | 'clipboard'>('sendStrategy', 'auto');
  if (transport === 'agent') {
    return 'isolated ACP agent process';
  }
  if (transport === 'commands' && strategy === 'command') {
    return 'configured ACP command';
  }
  if (transport === 'commands' || strategy === 'clipboard') {
    return 'system clipboard and ACP chat';
  }
  return 'ACP agent when available; otherwise system clipboard and ACP chat';
}
