import type { DashboardHandlers } from './DashboardPanel';

const DASHBOARD_COMMANDS = new Set([
  'simpleecode.reindexWorkspace',
  'simpleecode.setupSwiftEngine',
  'simpleecode.checkForUpdates',
  'simpleecode.newConversation',
  'simpleecode.explainBeginner',
  'simpleecode.explainDetailed',
  'simpleecode.explainDebug',
  'simpleecode.startTour',
  'simpleecode.tourNext',
  'simpleecode.tourPrev',
  'simpleecode.tourExplain',
  'simpleecode.endTour',
  'workbench.action.openSettings',
]);

type DashboardMessage =
  | { type: 'ready' }
  | { type: 'runCommand'; command: string }
  | { type: 'submitPrompt'; text: string }
  | { type: 'cancelPrompt' }
  | { type: 'openSource'; path: string; line?: number }
  | { type: 'openExternal'; url: string }
  | { type: 'checkAnswer'; text: string }
  | { type: 'sendFeedback'; title: string; body: string };

export function parseDashboardMessage(value: unknown): DashboardMessage | undefined {
  if (!isRecord(value) || typeof value.type !== 'string') {
    return undefined;
  }
  switch (value.type) {
    case 'ready':
    case 'cancelPrompt':
      return { type: value.type };
    case 'runCommand':
      return typeof value.command === 'string' && DASHBOARD_COMMANDS.has(value.command)
        ? { type: value.type, command: value.command }
        : undefined;
    case 'submitPrompt':
      return boundedText(value.text, 20_000)
        ? { type: value.type, text: value.text.trim() }
        : undefined;
    case 'checkAnswer':
      return boundedText(value.text, 200_000)
        ? { type: value.type, text: value.text.trim() }
        : undefined;
    case 'openSource': {
      if (!boundedText(value.path, 4_096)) {
        return undefined;
      }
      const line = value.line;
      if (
        line !== undefined &&
        (typeof line !== 'number' ||
          !Number.isInteger(line) ||
          line < 1 ||
          line > 10_000_000)
      ) {
        return undefined;
      }
      return {
        type: value.type,
        path: value.path,
        line: typeof line === 'number' ? line : undefined,
      };
    }
    case 'openExternal':
      return typeof value.url === 'string' && isHttpUrl(value.url)
        ? { type: value.type, url: value.url }
        : undefined;
    case 'sendFeedback':
      return boundedText(value.title, 200) && boundedText(value.body, 20_000)
        ? {
            type: value.type,
            title: value.title.trim(),
            body: value.body.trim(),
          }
        : undefined;
    default:
      return undefined;
  }
}

export async function dispatchDashboardMessage(
  raw: unknown,
  handlers: DashboardHandlers,
  postMessage: (message: unknown) => Thenable<boolean>,
  refresh: () => Promise<void>,
): Promise<void> {
  const message = parseDashboardMessage(raw);
  if (!message) {
    return;
  }
  switch (message.type) {
    case 'ready':
      await refresh();
      break;
    case 'runCommand':
      handlers.onCommand(message.command);
      break;
    case 'submitPrompt':
      handlers.onAsk(message.text);
      break;
    case 'cancelPrompt':
      handlers.onCancel();
      break;
    case 'openSource':
      handlers.onOpenSource(message.path, message.line);
      break;
    case 'openExternal':
      handlers.onOpenExternal(message.url);
      break;
    case 'checkAnswer':
      await postMessage({ type: 'checkResult', result: handlers.checkAnswer(message.text) });
      break;
    case 'sendFeedback':
      await postMessage({
        type: 'feedbackResult',
        result: await handlers.sendFeedback({ title: message.title, body: message.body }),
      });
      break;
  }
}

function boundedText(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
