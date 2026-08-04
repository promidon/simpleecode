import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  SparseVectorIndex,
  buildChunks,
  tokenize,
  type Chunk,
} from '../rag/vectorSearch';

function chunk(id: string, text: string): Chunk {
  return { id, fileId: `/w/${id}.swift`, path: `${id}.swift`, kind: 'symbol', text, content: text };
}

test('tokenize splits camelCase and snake_case, keeps the whole word', () => {
  assert.deepEqual(tokenize('captureListId'), ['capture', 'list', 'id', 'capturelistid']);
  assert.deepEqual(tokenize('note_actions'), ['note', 'actions', 'action']);
  assert.ok(tokenize('let x = URLSession.shared').includes('urlsession'));
});

test('tokenize adds light stems so prose meets code identifiers', () => {
  assert.ok(tokenize('reminders').includes('reminder'));
  assert.ok(tokenize('saved').includes('save'));
  assert.ok(tokenize('loading').includes('load'));
});

test('tokenize drops stopwords, single letters, and bare numbers', () => {
  assert.deepEqual(tokenize('func a return 42 the'), []);
});

test('search ranks the chunk about the question topic first', () => {
  const index = new SparseVectorIndex([
    chunk('reminders', 'func createReminder(title: String) saves a reminder to the list'),
    chunk('notes', 'func createNote(title: String) saves a note'),
    chunk('sync', 'func syncEngine() pushes changes to CloudKit'),
  ]);
  const results = index.search('where do reminders get saved?');
  assert.ok(results.length >= 1);
  assert.equal(results[0].chunk.id, 'reminders');
});

test('search is deterministic and returns nothing for unknown terms', () => {
  const chunks = [chunk('a', 'alpha beta'), chunk('b', 'alpha beta')];
  const index = new SparseVectorIndex(chunks);
  const first = index.search('alpha');
  const second = index.search('alpha');
  assert.deepEqual(first.map((r) => r.chunk.id), second.map((r) => r.chunk.id));
  assert.deepEqual(first.map((r) => r.chunk.id), ['a', 'b']); // score tie → id order
  assert.deepEqual(index.search('zzz-not-in-corpus'), []);
  assert.deepEqual(index.search(''), []);
});

test('search caps at k results', () => {
  const many = Array.from({ length: 10 }, (_, i) => chunk(`c${i}`, 'shared topic words'));
  assert.equal(new SparseVectorIndex(many).search('topic', 3).length, 3);
});

test('buildChunks makes one chunk per summary and per symbol', () => {
  const chunks = buildChunks(
    [
      { id: '/w/a.swift', path: 'a.swift', summary: 'Swift file. Declares Store.' },
      { id: '/w/b.swift', path: 'b.swift' }, // no summary → no chunk
    ],
    [
      {
        id: '/w/a.swift#Store',
        fileId: '/w/a.swift',
        name: 'Store',
        kind: 'class',
        range: { startLine: 3, endLine: 40 },
        signature: 'final class Store {',
        codePreview: 'final class Store { ... }',
      },
    ],
  );
  assert.equal(chunks.length, 2);
  const summary = chunks.find((c) => c.kind === 'file_summary');
  assert.equal(summary?.id, '/w/a.swift#summary');
  const symbol = chunks.find((c) => c.kind === 'symbol');
  assert.equal(symbol?.path, 'a.swift');
  assert.equal(symbol?.range, '3-40');
});
