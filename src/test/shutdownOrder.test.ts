import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { shutdown } from '../utils/shutdown';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test('shutdown waits for a slow store flush before disposing the logger', async () => {
  const events: string[] = [];
  const store = {
    async close(): Promise<void> {
      events.push('close:start');
      await delay(20);
      events.push('close:end');
    },
  };
  const logger = {
    dispose(): void {
      events.push('logger:dispose');
    },
  };

  await shutdown(store, logger);

  assert.deepEqual(events, ['close:start', 'close:end', 'logger:dispose']);
});

test('a rejected flush still disposes the logger, with no unhandled rejection', async () => {
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown): void => {
    unhandled.push(reason);
  };
  process.on('unhandledRejection', onUnhandled);

  let disposed = false;
  const store = {
    async close(): Promise<void> {
      await delay(10);
      throw new Error('disk write failed');
    },
  };
  const logger = {
    dispose(): void {
      disposed = true;
    },
  };

  try {
    await shutdown(store, logger);
    // Give the loop a couple of turns so a stray rejection would surface.
    await delay(20);

    assert.equal(disposed, true);
    assert.deepEqual(unhandled, []);
  } finally {
    process.removeListener('unhandledRejection', onUnhandled);
  }
});

test('shutdown tolerates missing store or logger', async () => {
  await shutdown(undefined, undefined);
  let disposed = false;
  await shutdown(undefined, { dispose: () => void (disposed = true) });
  assert.equal(disposed, true);
});
