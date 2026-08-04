import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyAnswer, type AnswerGroundTruth } from '../rag/verifyAnswer';

const truth: AnswerGroundTruth = {
  sentFilePath: '/repo/src/ContentView.swift',
  sentCode: 'if filter.capturesNote { noteActions.create(title: text) }',
  sentSymbol: 'send',
  sentStartLine: 78,
  sentEndLine: 82,
  knownFiles: ['src/ContentView.swift', 'src/SinglyViewModel.swift', 'README.md'],
  knownSymbols: ['ContentView', 'SinglyViewModel', 'ReminderActions'],
};

test('verifyAnswer grounds known files and flags invented ones', () => {
  const result = verifyAnswer(
    'See `ContentView.swift`. It also calls `Ghost.swift`.',
    truth,
  );
  const ghost = result.claims.find((c) => c.text === 'Ghost.swift');
  const view = result.claims.find((c) => c.text === 'ContentView.swift');
  assert.equal(view?.status, 'grounded');
  assert.equal(ghost?.status, 'unverified');
});

test('verifyAnswer grounds identifiers in the sent code', () => {
  const result = verifyAnswer('It reads `filter` and calls `noteActions`.', truth);
  assert.ok(result.claims.every((c) => c.status === 'grounded'));
});

test('verifyAnswer grounds known symbols even if not in the sent code', () => {
  const result = verifyAnswer('It uses `SinglyViewModel` and `ReminderActions`.', truth);
  assert.ok(result.claims.every((c) => c.status === 'grounded'));
});

test('verifyAnswer flags invented symbols', () => {
  const result = verifyAnswer('Then it calls `frobnicate()`.', truth);
  const claim = result.claims.find((c) => c.text === 'frobnicate()');
  assert.equal(claim?.status, 'unverified');
});

test('verifyAnswer checks line references against the sent range', () => {
  const result = verifyAnswer('On line 80 it branches; line 200 is unrelated.', truth);
  const inRange = result.claims.find((c) => c.text.includes('80'));
  const outRange = result.claims.find((c) => c.text.includes('200'));
  assert.equal(inRange?.status, 'grounded');
  assert.equal(outRange?.status, 'unverified');
});

const factTruth: AnswerGroundTruth = {
  ...truth,
  facts: { symbol: 'model', signature: 'var model: SinglyViewModel' },
};

test('verifyAnswer flags a type that contradicts the verified signature', () => {
  const result = verifyAnswer('Here `model` is a `String`.', factTruth);
  const fact = result.claims.find((c) => c.kind === 'fact');
  assert.ok(fact, 'expected a fact-contradiction claim');
  assert.equal(fact.status, 'unverified');
});

test('verifyAnswer does not flag the correct verified type', () => {
  const result = verifyAnswer('Here `model` is a `SinglyViewModel`.', factTruth);
  assert.ok(!result.claims.some((c) => c.kind === 'fact'));
});

test('verifyAnswer does not type-flag ordinary prose', () => {
  const result = verifyAnswer('The `model` is the screen state.', factTruth);
  assert.ok(!result.claims.some((c) => c.kind === 'fact'));
});

test('verifyAnswer grounds a return type taken from the signature', () => {
  const result = verifyAnswer('It returns a `Recipe`.', {
    ...truth,
    facts: { symbol: 'decode', signature: 'func decode() -> Recipe' },
  });
  const claim = result.claims.find((c) => c.text === 'Recipe');
  assert.equal(claim?.status, 'grounded');
});

test('verifyAnswer flags a documentation claim when no doc text is available', () => {
  const result = verifyAnswer('According to the docs, URLSession retries failed tasks.', truth);
  const doc = result.claims.find((c) => c.kind === 'doc');
  assert.ok(doc, 'expected a doc claim');
  assert.equal(doc.status, 'unverified');
});

test('verifyAnswer grounds a documentation claim when doc text is present', () => {
  const result = verifyAnswer('According to the docs, it coordinates tasks.', {
    ...truth,
    docText: 'URLSession — coordinates a group of related network data tasks.',
  });
  const doc = result.claims.find((c) => c.kind === 'doc');
  assert.equal(doc?.status, 'grounded');
});

test('verifyAnswer raises no doc claim without a source phrase', () => {
  const result = verifyAnswer('It returns a value and calls a helper.', truth);
  assert.ok(!result.claims.some((c) => c.kind === 'doc'));
  assert.equal(result.coverage, 'none');
  assert.match(result.note, /remains unchecked/);
});

test('verifyAnswer does not ground a broad line range that only overlaps', () => {
  const result = verifyAnswer('Lines 1-1000 contain the branch.', truth);
  assert.equal(result.claims.find((c) => c.kind === 'line')?.status, 'unverified');
});

test('verifyAnswer does not ground unrelated documentation text', () => {
  const result = verifyAnswer('According to the docs, URLSession deletes files.', {
    ...truth,
    docText: 'URLSession coordinates a group of related network data tasks.',
  });
  assert.equal(result.claims.find((c) => c.kind === 'doc')?.status, 'unverified');
});

test('verifyAnswer refuses ambiguous duplicate basenames', () => {
  const result = verifyAnswer('See `Shared.ts`.', {
    ...truth,
    knownFiles: ['src/a/Shared.ts', 'src/b/Shared.ts'],
  });
  assert.equal(result.claims.find((c) => c.kind === 'file')?.status, 'unverified');
});

test('verifyAnswer does not ground identifier substrings', () => {
  const result = verifyAnswer('It calls `id`.', {
    ...truth,
    sentCode: 'const grid = true;',
  });
  assert.equal(result.claims.find((c) => c.kind === 'symbol')?.status, 'unverified');
});

test('verifyAnswer counts grounded vs unverified', () => {
  const result = verifyAnswer('`ContentView.swift` and `frobnicate()`.', truth);
  assert.equal(result.grounded, 1);
  assert.equal(result.unverified, 1);
});

test('verifyAnswer attaches a click-through location to grounded file claims', () => {
  const result = verifyAnswer('See `ContentView.swift`.', truth);
  const view = result.claims.find((c) => c.text === 'ContentView.swift');
  assert.equal(view?.location?.path, '/repo/src/ContentView.swift');
});

test('verifyAnswer attaches file + line to in-range line claims, not to out-of-range', () => {
  const result = verifyAnswer('Line 80 branches; line 200 is unrelated.', truth);
  const inRange = result.claims.find((c) => c.text.includes('80'));
  const outRange = result.claims.find((c) => c.text.includes('200'));
  assert.deepEqual(inRange?.location, {
    path: '/repo/src/ContentView.swift',
    line: 80,
  });
  assert.equal(outRange?.location, undefined);
});
