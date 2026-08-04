import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { summarizeModule } from '../indexing/summarizeFile';

test('summarizes a Swift file from declarations and module imports', () => {
  const summary = summarizeModule({
    language: 'swift',
    imports: ['SwiftUI', 'SwiftData'],
    exports: ['SinglyViewModel', 'send'],
  });
  assert.equal(
    summary,
    'Swift file. Declares SinglyViewModel, send. Uses SwiftUI, SwiftData.',
  );
});

test('counts local imports separately from modules', () => {
  const summary = summarizeModule({
    language: 'typescript',
    imports: ['vscode', './util', '../rag/Retriever'],
    exports: ['FileIndex'],
  });
  assert.equal(
    summary,
    'TypeScript file. Declares FileIndex. Uses vscode. Imports 2 local file(s).',
  );
});

test('caps long declaration lists', () => {
  const summary = summarizeModule({
    language: 'typescript',
    imports: [],
    exports: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
  });
  assert.ok(summary.includes('a, b, c, d, e (+2 more)'));
});

test('degrades to just the language for empty files', () => {
  assert.equal(
    summarizeModule({ language: 'json', imports: [], exports: [] }),
    'JSON file.',
  );
  assert.equal(
    summarizeModule({ language: 'weird', imports: [], exports: [] }),
    'weird file.',
  );
});
