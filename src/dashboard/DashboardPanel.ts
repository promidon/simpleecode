import * as vscode from 'vscode';
import { getDashboardHtml } from './webviewHtml';
import type { DocLink } from '../rag/swiftDocs';
import type { VerifyResult } from '../rag/verifyAnswer';
import type { CodeFacts } from '../context/codeFacts';
import { dispatchDashboardMessage } from './dashboardMessages';
import type { ExplanationMode } from '../prompt/promptBuilder';

export type DashboardPhase =
  | 'idle'
  | 'capturing'
  | 'indexing'
  | 'reviewing'
  | 'sending'
  | 'streaming'
  | 'verifying'
  | 'done'
  | 'cancelled'
  | 'failed';

/** Serializable snapshot the webview renders. Built by `extension.ts`. */
export interface DashboardState {
  phase: DashboardPhase;
  explanationMode: ExplanationMode;
  activeFile?: string;
  languageId?: string;
  selection?: {
    hasSelection: boolean;
    startLine: number;
    endLine: number;
    /** The selected code itself — local-only, shown in the selected-code panel. */
    selectedText?: string;
    /** Enclosing function/class, e.g. "loadUser (function)". Deterministic. */
    parentSymbol?: string;
  };
  acp: {
    available: boolean;
    detail: string;
  };
  lastPacket?: {
    task: string;
    privacyScope: string;
    filePath?: string;
    byteSize?: number;
    truncated?: boolean;
    redactions: string[];
    promptPreview: string;
    includedSources: string[];
    channel: string;
    delivery?: string;
    createdAt?: string;
  };
  /** Claude's answer, streamed live from the ACP agent (Build Order #13/#14). */
  answer?: {
    text: string;
    done: boolean;
    /** Safe HTML rendering of `text` (Markdown → readable, P0 #3). */
    html?: string;
    /** Auto-run claim check against the sent context, once the answer is done. */
    verify?: VerifyResult;
  };
  /** Deterministic draft explanation (from structure + doc comments — no AI). */
  explanation?: string;
  /** What was thin/missing about the last packet's context (#21/notes #3). */
  contextGaps?: string[];
  /** Active Codebase Tour (P1 #4): the current stop and where it sits. */
  tour?: {
    index: number;
    count: number;
    total: number;
    stop: {
      path: string;
      language: string;
      summary?: string;
      reason: string;
      exposes: string[];
      dependsOn: string[];
      dependents: string[];
    };
  };
  /** Retrieved context sources — populated once retrieval lands (#9–#10). */
  retrieved?: Array<{ sourceType: string; path: string; reasonIncluded: string }>;
  /** Deterministic file + symbol index summary (Build Order #5/#7). */
  index?: { files: number; symbols?: number };
  /** Swift docs + learning links for the current file/symbol (Build Order #10). */
  docs?: DocLink[];
  /** Verified facts from the language server (Facts Layer, Slice 1/2). */
  facts?: CodeFacts;
  nextSteps: string[];
}

export interface DashboardHandlers {
  getState(): Promise<DashboardState>;
  onCommand(command: string): void;
  /** A free-text question typed into the dashboard's ask box. */
  onAsk(question: string): void;
  /** Stop the prompt currently streaming into the dashboard (#2). */
  onCancel(): void;
  /** Open a cited source file at a line, to check a claim in one click (#2 notes). */
  onOpenSource(path: string, line?: number): void;
  /** Open an external https link (doc/learning links) in the browser. */
  onOpenExternal(url: string): void;
  /** Verify a pasted answer against the sent context + index (#20). */
  checkAnswer(answerText: string): VerifyResult;
  /** Send beta feedback to the configured endpoint (docs/feedback/*.md). */
  sendFeedback(input: {
    title: string;
    body: string;
  }): Promise<{ ok: boolean; error?: string }>;
}

/**
 * Singleton dashboard webview (Build Order #2/#13, minimal v1). Shows active
 * file, current selection, the last context packet + prompt preview, ACP
 * availability and the next build steps. Content lives in `media/`.
 */
export class DashboardPanel {
  public static current: DashboardPanel | undefined;
  private static readonly viewType = 'simpleecode.dashboard';

  private readonly panel: vscode.WebviewPanel;
  private readonly disposables: vscode.Disposable[] = [];

  static async createOrShow(
    extensionUri: vscode.Uri,
    handlers: DashboardHandlers,
  ): Promise<void> {
    const column = vscode.window.activeTextEditor?.viewColumn;
    if (DashboardPanel.current) {
      DashboardPanel.current.panel.reveal(column);
      await DashboardPanel.current.refresh();
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      DashboardPanel.viewType,
      'SimpleeCode',
      column ?? vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')],
      },
    );
    DashboardPanel.current = new DashboardPanel(panel, extensionUri, handlers);
  }

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    private readonly handlers: DashboardHandlers,
  ) {
    this.panel = panel;
    this.panel.webview.html = getDashboardHtml(this.panel.webview, extensionUri);

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    this.panel.webview.onDidReceiveMessage(
      (message: unknown) =>
        dispatchDashboardMessage(
          message,
          this.handlers,
          (reply) => this.panel.webview.postMessage(reply),
          () => this.refresh(),
        ),
      null,
      this.disposables,
    );
  }

  /** Re-pull state and push it to the webview. Safe to call any time. */
  async refresh(): Promise<void> {
    if (!DashboardPanel.current) {
      return;
    }
    const state = await this.handlers.getState();
    await this.panel.webview.postMessage({ type: 'state', state });
  }

  dispose(): void {
    DashboardPanel.current = undefined;
    this.panel.dispose();
    while (this.disposables.length) {
      this.disposables.pop()?.dispose();
    }
  }
}
