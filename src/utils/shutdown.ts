/**
 * Shutdown order for the pieces `deactivate()` owns: flush the store first,
 * then release the logger, so a failing flush can still be logged. Pure —
 * callers hand in the two interfaces, tests hand in fakes.
 *
 * These live outside `context.subscriptions` on purpose: VS Code disposes
 * subscriptions synchronously right after *calling* `deactivate()`, without
 * waiting for its promise, so anything that must outlive an async flush
 * cannot sit in that list.
 */
interface ClosableStore {
  close(): Promise<void>;
}

interface DisposableLogger {
  dispose(): void;
}

export async function shutdown(
  store: ClosableStore | undefined,
  logger: DisposableLogger | undefined,
): Promise<void> {
  try {
    await store?.close();
  } catch {
    // The store logs its own flush failures; never let one block teardown.
  }
  logger?.dispose();
}
