import { ExplanationService } from './explanation/ExplanationService';
import { GOALS } from './explanation/model';
import * as vscode from 'vscode';
import { Logger } from './utils/logger';
import { AcpRouter } from './acp/AcpRouter';
import { FileIndex } from './indexing/FileIndex';
import { SymbolIndex } from './indexing/SymbolIndex';
import { JsonStore } from './storage/JsonStore';
import { registerCommands } from './commands/registerCommands';
import { UpdateChecker } from './update/UpdateChecker';
import { submitFeedback } from './feedback/submitFeedback';
import { readFeedbackConfig } from './feedback/feedbackConfig';
import { PRIVACY_SCOPE_LABELS } from './privacy/privacyScope';
import {
  DashboardPanel,
  type DashboardState,
} from './dashboard/DashboardPanel';
import { DashboardView } from './dashboard/DashboardView';
import { swiftDocLinks } from './rag/swiftDocs';
import { describeSystemRole } from './rag/systemRole';
import { planTour, type TourStop } from './rag/tour';
import { markdownToHtml } from './utils/markdownToHtml';
import { openExternalUrl } from './utils/openExternalUrl';
import type { SimpleeCodeApp } from './app/SimpleeCodeApp';
import type { DashboardPhase } from './dashboard/DashboardPanel';
import { DeterministicRetriever } from './rag/DeterministicRetriever';
import { shutdown } from './utils/shutdown';

// Owned by deactivate(), not context.subscriptions: VS Code disposes
// subscriptions synchronously the moment deactivate() is called, which would
// close the logger while the store's async flush is still in flight.
let lifecycle: { store: JsonStore; logger: Logger } | undefined;

export function activate(context: vscode.ExtensionContext) {
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

  let tour: { stops: TourStop[]; total: number; index: number } | undefined;
  let phase: DashboardPhase = 'indexing';
  let answerThrottle: ReturnType<typeof setTimeout> | undefined;
  const explanation = new ExplanationService(context, fileIndex, symbolIndex, retriever, adapter, () => {
    if (!answerThrottle) {
      answerThrottle = setTimeout(() => { answerThrottle = undefined; app.refreshDashboard(); }, 60);
    }
  });
  const app: SimpleeCodeApp = {
    logger, fileIndex, symbolIndex, explanation,
    async getDashboardState(): Promise<DashboardState> {
      const availability = await adapter.describeAvailability();
      const experience = explanation.coordinator.state;
      const d = experience.draft;
      const p = experience.prepared;
      const last = experience.turns.at(-1);
      const envelope = p?.envelope;
      return {
        phase: experience.phase === 'idle' ? phase : experience.phase === 'preparing' ? 'capturing' : experience.phase === 'ready' ? 'idle' : experience.phase,
        experience: { ...experience, turns: experience.turns.map(t => ({ ...t, html: markdownToHtml(t.text), goalLabel: GOALS[t.request.draft.options.goal].label })),
          savedGuidance: explanation.savedGuidance, guidanceNotice: explanation.guidanceNotice,
          pendingGuidance: explanation.pendingGuidance, sourceChanged: explanation.sourceChanged },
        activeFile: d?.source.label, languageId: d?.source.languageId,
        selection: d ? { hasSelection: d.source.focus === 'selection', startLine: d.source.startLine,
          endLine: d.source.endLine, selectedText: truncateForDisplay(d.source.focus === 'selection' ? d.source.selectedText : d.source.fullText) } : undefined,
        acp: { available: availability.available, detail: availability.detail },
        feedbackConfigured: Boolean(readFeedbackConfig().token),
        labels: { scopes: PRIVACY_SCOPE_LABELS },
        lastPacket: envelope ? { task: envelope.task, privacyScope: envelope.privacyScope, filePath: envelope.filePath,
          byteSize: envelope.totalBytes, truncated: envelope.truncated, redactions: envelope.redactions,
          promptPreview: envelope.prompt, includedSources: envelope.includedSources, channel: envelope.channel } : undefined,
        retrieved: p?.retrieved, index: { files: fileIndex.size, symbols: symbolIndex.size },
        docs: swiftDocLinks(p?.facts?.symbol, d?.source.languageId), facts: p?.facts,
        answer: last ? { text: last.text, done: !['sending', 'streaming'].includes(last.status),
          html: markdownToHtml(last.text), verify: last.verify } : undefined,
        explanation: p?.localExplanation, contextGaps: p?.gaps, tour: tourView(),
      };
    },
    refreshDashboard(): void { void DashboardPanel.current?.refresh(); void dashboardView.refresh(); },
    setPhase(next): void { phase = next; this.refreshDashboard(); },
    checkAnswer: text => explanation.checkAnswer(text),
  };

  // The persistent Activity-Bar sidebar dashboard (Build Order #2). It shares
  // the same state + handlers as the editor-tab panel, so both stay in sync.
  const dashboardView = new DashboardView(context.extensionUri, {
    getState: () => app.getDashboardState(),
    onCommand: (command, ...args) => void vscode.commands.executeCommand(command, ...args),
    onAsk: (question) =>
      void vscode.commands.executeCommand('simpleecode.ask', question),
    onCancel: () => void vscode.commands.executeCommand('simpleecode.cancelPrompt'),
    onExplanation: message => explanation.action(message),
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
      { webviewOptions: { retainContextWhenHidden: false } },
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
    vscode.workspace.onDidChangeTextDocument(scheduleRefresh),
    vscode.workspace.onDidChangeConfiguration(event => {
      if (event.affectsConfiguration('simpleecode.privacy') || event.affectsConfiguration('simpleecode.retrieval') || event.affectsConfiguration('simpleecode.acp')) { explanation.coordinator.invalidate(); }
    }),
    vscode.window.onDidChangeActiveTextEditor(scheduleRefresh),
    vscode.window.onDidChangeTextEditorSelection(scheduleRefresh),
    new vscode.Disposable(() => debounce && clearTimeout(debounce)),
    new vscode.Disposable(() => answerThrottle && clearTimeout(answerThrottle)),
    new vscode.Disposable(() => adapter.dispose()),
  );

  logger.info('SimpleeCode activated.');
  // A test-host-only inspection boundary. Production activation exposes no API.
  if (context.extensionMode === vscode.ExtensionMode.Test) {
    return { getState: () => app.getDashboardState(), action: (message: import('./explanation/ExplanationService').ExplanationAction) => explanation.action(message) };
  }
  return undefined;
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
