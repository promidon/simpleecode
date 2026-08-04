import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findContextGaps, type ContextGapInput } from '../context/contextGaps';

const full: ContextGapInput = {
  task: 'explain_selection',
  hasSymbolName: true,
  hasFacts: true,
  retrievedCount: 3,
  truncated: false,
  hadSecretRedaction: false,
};

test('complete context produces no gaps', () => {
  assert.deepEqual(findContextGaps(full), []);
});

test('flags an unresolved enclosing symbol only for a selection', () => {
  const sel = findContextGaps({ ...full, hasSymbolName: false, hasFacts: false });
  assert.ok(sel.some((g) => /function or type around your selection/.test(g)));

  // A whole-file explain has no enclosing symbol by nature — no such gap.
  const file = findContextGaps({
    ...full,
    task: 'explain_file',
    hasSymbolName: false,
    hasFacts: false,
  });
  assert.ok(!file.some((g) => /around your selection/.test(g)));
});

test('flags missing facts only when a symbol was resolved', () => {
  const withSymbol = findContextGaps({ ...full, hasFacts: false });
  assert.ok(withSymbol.some((g) => /No verified facts/.test(g)));

  const noSymbol = findContextGaps({
    ...full,
    hasSymbolName: false,
    hasFacts: false,
    task: 'explain_file',
  });
  assert.ok(!noSymbol.some((g) => /No verified facts/.test(g)));
});

test('flags no related files, truncation, and hidden secrets', () => {
  const gaps = findContextGaps({
    ...full,
    retrievedCount: 0,
    truncated: true,
    hadSecretRedaction: true,
  });
  assert.ok(gaps.some((g) => /No related files/.test(g)));
  assert.ok(gaps.some((g) => /cut before sending/.test(g)));
  assert.ok(gaps.some((g) => /secret-looking lines were hidden/.test(g)));
});

test('explains when the privacy maximum caps system context', () => {
  const gaps = findContextGaps({
    task: 'explain_system_role',
    hasSymbolName: false,
    hasFacts: false,
    retrievedCount: 0,
    truncated: false,
    hadSecretRedaction: false,
    privacyScope: 'current_file',
  });
  assert.ok(gaps.some((gap) => /capped at current_file/.test(gap)));
});
