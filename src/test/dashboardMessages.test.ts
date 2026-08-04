import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDashboardMessage } from '../dashboard/dashboardMessages';

test('dashboard messages accept only allowlisted commands', () => {
  assert.deepEqual(parseDashboardMessage({
    type: 'runCommand',
    command: 'simpleecode.startTour',
  }), { type: 'runCommand', command: 'simpleecode.startTour' });
  assert.equal(parseDashboardMessage({
    type: 'runCommand',
    command: 'workbench.action.terminal.sendSequence',
  }), undefined);
});

test('dashboard messages reject invalid paths, lines, schemes, and oversized text', () => {
  assert.equal(parseDashboardMessage({ type: 'openSource', path: 'a.ts', line: 0 }), undefined);
  assert.equal(parseDashboardMessage({ type: 'openExternal', url: 'command:evil' }), undefined);
  assert.equal(parseDashboardMessage({ type: 'submitPrompt', text: 'x'.repeat(20_001) }), undefined);
  assert.ok(parseDashboardMessage({ type: 'openExternal', url: 'https://example.com' }));
});
