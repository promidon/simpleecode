import * as vscode from 'vscode';
import { Logger } from './utils/logger';
import { AcpRouter } from './acp/AcpRouter';
import { FileIndex } from './indexing/FileIndex';
import { SymbolIndex } from './indexing/SymbolIndex';
import { JsonStore } from './storage/JsonStore';
import { registerCommands } from './commands/registerCommands';
import { UpdateChecker } from './update/UpdateChecker';
import { submitFeedback } from './feedback/submitFeedback';
import {
  DashboardPanel,
  type DashboardState,
} from './dashboard/DashboardPanel';
import { DashboardView } from './dashboard/DashboardView';
import { getActiveEditorSnapshot } from './context/ActiveEditorContext';
import { getSelectionSnapshot } from './context/SelectionContext';
import { getParentSymbol } from './context/parentSymbol';
import { explainSymbolViaLsp } from './context/codeFacts';
import {
  generateExplanation,
  explainSelection,
} from './context/generateExplanation';
import { swiftDocLinks } from './rag/swiftDocs';
import { verifyAnswer, type AnswerGroundTruth } from './rag/verifyAnswer';
import { describeSystemRole } from './rag/systemRole';
import { planTour, type TourStop } from './rag/tour';
import { markdownToHtml } from './utils/markdownToHtml';
import { openExternalUrl } from './utils/openExternalUrl';
import type { ContextPacket } from './context/ContextPacket';
import type { SimpleeCodeApp } from './app/SimpleeCodeApp';
import type { DashboardPhase } from './dashboard/DashboardPanel';
import type { ExplanationMode } from './prompt/promptBuilder';
import { DeterministicRetriever } from './rag/DeterministicRetriever';
import { shutdown } from './utils/shutdown';

const NEXT_STEPS = [
  '#18 Hybrid ranking (dedupe + rank across retrieval stages)',
  'Slice 5: fetch real doc pages + quote-check the answer',
  'Dense-embedding backend behind vectorSearch (optional)',
];

// Owned by deactivate(), not context.subscriptions: VS Code disposes
// subscriptions synchronously the moment deactivate() is called, which would
// close the logger while the store's async flush is still in flight.
let lifecycle: { store: JsonStore; logger: Logger } | undefined;

export function activate(context: vscode.ExtensionContext): void {
  const logger = new Logger();
  logger.info('SimpleeCode activating.');

  const adapter = new AcpRouter(
    logger,
    vscode.Uri.joinPath(context.globalStorageUri, 'acp-session').fsPath,
  );
  const store = new JsonStore(context.globalStorageUri, logger);
  lifecycle = { store, logger };
  const fileIndex = new FileIndex(logger, store);
  const symbolIndex = new SymbolIndex(logger, store);
  const retriever = new DeterministicRetriever(fileIndex, symbolIndex, logger);

  let lastPacket: DashboardState['lastPacket'] | undefined;
  let lastRetrieved: DashboardState['retrieved'];
  let lastFacts: DashboardState['facts'];
  let lastAnswer: DashboardState['answer'];
  let lastContextGaps: string[] | undefined;
  let lastSentPacket: ContextPacket | undefined;
  let tour: { stops: TourStop[]; total: number; index: number } | undefined;
  let phase: DashboardPhase = 'indexing';
  let explanationMode: ExplanationMode = 'detailed';

  // Streaming answers arrive many times a second; refresh at most ~4×/s.
  let answerThrottle: ReturnType<typeof setTimeout> | undefined;

  const app: SimpleeCodeApp = {
    logger,
    adapter,
    fileIndex,
    symbolIndex,
    retriever,
    async getDashboardState(): Promise<DashboardState> {
      const active = getActiveEditorSnapshot();
      const selection = getSelectionSnapshot();
      const parent = active ? await getParentSymbol() : undefined;
      const availability = await adapter.describeAvailability();

      // Deterministic explanation — written from the code's own structure and
      // doc comments. No language server, no AI. A single selected word resolves
      // to its declaration; a larger selection is outlined; no selection outlines
      // the whole file.
      const fileLabel = active?.relativePath ?? active?.filePath ?? 'this file';
      let explanation: string | undefined;
      if (active && selection?.hasSelection) {
        explanation = explainSelection(
          selection.selectedText,
          active.fullText,
          active.languageId ?? '',
          fileLabel,
        );
        // A single word the glossary + file text couldn't resolve → ask the
        // engine (LSP). Keywords never reach this: the glossary answers first.
        const word = selection.selectedText.trim();
        if (!explanation && /^[A-Za-z_]\w*$/.test(word)) {
          explanation =
            (await explainSymbolViaLsp()) ??
            `${word}\n\nNot declared in this file. The language server didn't resolve it either (a bare Xcode target needs its build server — run "Set Up Swift Engine"). It likely comes from an import or the SDK — open a doc link below.`;
        }
      } else if (active) {
        explanation = generateExplanation(
          active.fullText,
          active.languageId ?? '',
          fileLabel,
        );
      }
      return {
        phase,
        explanationMode,
        activeFile: active?.relativePath ?? active?.filePath,
        languageId: active?.languageId,
        selection: selection
          ? {
              hasSelection: selection.hasSelection,
              startLine: selection.startLine,
              endLine: selection.endLine,
              selectedText: selection.hasSelection
                ? truncateForDisplay(selection.selectedText)
                : undefined,
              parentSymbol: parent
                ? `${parent.name} (${parent.kind})`
                : undefined,
            }
          : undefined,
        acp: { available: availability.available, detail: availability.detail },
        lastPacket,
        retrieved: lastRetrieved,
        index: { files: fileIndex.size, symbols: symbolIndex.size },
        docs: swiftDocLinks(parent?.name, active?.languageId),
        facts: lastFacts,
        answer: lastAnswer
          ? { ...lastAnswer, html: markdownToHtml(lastAnswer.text) }
          : undefined,
        explanation,
        contextGaps: lastContextGaps,
        tour: tourView(),
        nextSteps: NEXT_STEPS,
      };
    },
    refreshDashboard(): void {
      void DashboardPanel.current?.refresh();
      void dashboardView.refresh();
    },
    setLastPacket(packet): void {
      lastPacket = packet;
      this.refreshDashboard();
    },
    setRetrieved(retrieved): void {
      lastRetrieved = retrieved;
      this.refreshDashboard();
    },
    setFacts(facts): void {
      lastFacts = facts;
      this.refreshDashboard();
    },
    setContextGaps(gaps): void {
      lastContextGaps = gaps.length ? gaps : undefined;
      this.refreshDashboard();
    },
    setAnswer(answer): void {
      lastAnswer = answer;
      if (answer && !answer.done) {
        if (!answerThrottle) {
          answerThrottle = setTimeout(() => {
            answerThrottle = undefined;
            this.refreshDashboard();
          }, 250);
        }
        return;
      }
      if (answerThrottle) {
        clearTimeout(answerThrottle);
        answerThrottle = undefined;
      }
      this.refreshDashboard();
    },
    setLastContext(packet): void {
      lastSentPacket = packet;
    },
    setPhase(next): void {
      phase = next;
      this.refreshDashboard();
    },
    setExplanationMode(mode): void {
      explanationMode = mode;
      this.refreshDashboard();
    },
    checkAnswer(answerText): ReturnType<SimpleeCodeApp['checkAnswer']> {
      const p = lastSentPacket;
      const all = fileIndex.all();
      const truth: AnswerGroundTruth = {
        sentFilePath: p?.filePath,
        sentCode: [p?.selectedText, p?.fullText].filter(Boolean).join('\n'),
        sentSymbol: p?.symbolName,
        sentStartLine: p?.startLine,
        sentEndLine: p?.endLine,
        knownFiles: all.map((r) => r.path),
        knownSymbols: [...new Set(all.flatMap((r) => r.exports))],
        facts: lastFacts
          ? {
              symbol: lastFacts.symbol,
              signature: lastFacts.signature,
              definition: lastFacts.definition,
            }
          : undefined,
        docText: lastFacts?.doc,
      };
      return verifyAnswer(answerText, truth);
    },
  };

  // The persistent Activity-Bar sidebar dashboard (Build Order #2). It shares
  // the same state + handlers as the editor-tab panel, so both stay in sync.
  const dashboardView = new DashboardView(context.extensionUri, {
    getState: () => app.getDashboardState(),
    onCommand: (command) => void vscode.commands.executeCommand(command),
    onAsk: (question) =>
      void vscode.commands.executeCommand('simpleecode.ask', question),
    onCancel: () => void vscode.commands.executeCommand('simpleecode.cancelPrompt'),
    onOpenSource: (path, line) =>
      void vscode.commands.executeCommand('simpleecode.openSource', path, line),
    onOpenExternal: (url) => openExternalUrl(url),
    checkAnswer: (text) => app.checkAnswer(text),
    sendFeedback: (input) => submitFeedback(input, context),
  });
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      DashboardView.viewType,
      dashboardView,
      { webviewOptions: { retainContextWhenHidden: true } },
    ),
  );

  registerCommands(context, app);

  // Codebase Tour (P1 #4): a deterministic, dependency-ordered walk of the code.
  // The plan is pure (`planTour`); here we hold the position and open each file.
  function tourView(): DashboardState['tour'] {
    const stop = tour?.stops[tour.index];
    if (!tour || !stop) {
      return undefined;
    }
    const role = describeSystemRole(stop.id, fileIndex.all());
    return {
      index: tour.index,
      count: tour.stops.length,
      total: tour.total,
      stop: {
        path: stop.path,
        language: stop.language,
        summary: stop.summary,
        reason: stop.reason,
        exposes: role?.exports ?? [],
        dependsOn: role?.dependsOn ?? [],
        dependents: (role?.dependents ?? []).map((d) => d.path),
      },
    };
  }

  async function openTourStop(): Promise<void> {
    const stop = tour?.stops[tour.index];
    if (!stop) {
      return;
    }
    try {
      const doc = await vscode.workspace.openTextDocument(
        vscode.Uri.file(stop.id),
      );
      await vscode.window.showTextDocument(doc, { preview: true });
    } catch (err) {
      logger.warn(`Tour: could not open ${stop.path}`, String(err));
    }
    app.refreshDashboard();
  }

  context.subscriptions.push(
    vscode.commands.registerCommand('simpleecode.startTour', async () => {
      const plan = planTour(fileIndex.all());
      if (!plan.stops.length) {
        vscode.window.showInformationMessage(
          'SimpleeCode: nothing to tour yet — open a folder and let it index.',
        );
        return;
      }
      tour = { stops: plan.stops, total: plan.total, index: 0 };
      await openTourStop();
    }),
    vscode.commands.registerCommand('simpleecode.tourNext', async () => {
      if (!tour) {
        return;
      }
      tour.index = Math.min(tour.index + 1, tour.stops.length - 1);
      await openTourStop();
    }),
    vscode.commands.registerCommand('simpleecode.tourPrev', async () => {
      if (!tour) {
        return;
      }
      tour.index = Math.max(tour.index - 1, 0);
      await openTourStop();
    }),
    vscode.commands.registerCommand('simpleecode.tourExplain', async () => {
      if (!tour) {
        return;
      }
      await openTourStop();
      await vscode.commands.executeCommand('simpleecode.explainSystemRole');
    }),
    vscode.commands.registerCommand('simpleecode.endTour', () => {
      tour = undefined;
      app.refreshDashboard();
    }),
  );

  // Update check (silent when current; a notification only when the source
  // has a newer version — the user triggers the actual update).
  const updates = new UpdateChecker(context, logger);
  context.subscriptions.push(
    vscode.commands.registerCommand('simpleecode.checkForUpdates', () =>
      updates.checkNow(),
    ),
  );
  void updates.checkOnStartup();

  // Build Order #5/#6/#7: load the persisted indexes (instant), show them,
  // then run incremental rescans to catch changes, and watch for edits. Local
  // only — file contents are hashed, never sent to Claude.
  void app.fileIndex
    .load()
    .then(() => app.symbolIndex.load())
    .then(() => app.refreshDashboard())
    .then(() => app.fileIndex.reindex())
    .then(() => app.refreshDashboard())
    .then(() => app.symbolIndex.reindexWorkspace(app.fileIndex.all()))
    .then(() => {
      if (phase === 'indexing') {
        phase = 'idle';
      }
      app.refreshDashboard();
    })
    .catch((err: unknown) => {
      logger.warn('Startup indexing failed.', String(err));
      if (phase === 'indexing') {
        phase = 'failed';
      }
      app.refreshDashboard();
    });
  context.subscriptions.push(
    app.fileIndex.startWatching(() => app.refreshDashboard()),
  );

  // Keep the dashboard's live panels current as the user moves around — this is
  // local only and never sends anything to Claude (Build Order #4 guardrail).
  let debounce: ReturnType<typeof setTimeout> | undefined;
  const scheduleRefresh = () => {
    if (debounce) {
      clearTimeout(debounce);
    }
    debounce = setTimeout(() => app.refreshDashboard(), 250);
  };

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(scheduleRefresh),
    vscode.window.onDidChangeTextEditorSelection(scheduleRefresh),
    new vscode.Disposable(() => debounce && clearTimeout(debounce)),
    new vscode.Disposable(() => answerThrottle && clearTimeout(answerThrottle)),
    new vscode.Disposable(() => adapter.dispose()),
  );

  logger.info('SimpleeCode activated.');
}

export async function deactivate(): Promise<void> {
  // Registered disposables own process and watcher cleanup. The store and
  // logger are flushed and released here, in that order.
  const current = lifecycle;
  lifecycle = undefined;
  await shutdown(current?.store, current?.logger);
}

/** Cap selected code shown in the dashboard so the webview stays snappy. */
function truncateForDisplay(text: string, max = 4000): string {
  return text.length <= max
    ? text
    : `${text.slice(0, max)}\n… (${text.length - max} more chars)`;
}
