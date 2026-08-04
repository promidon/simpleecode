import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  buildEdges,
  edgesFrom,
  edgesTo,
  type GraphFileInput,
} from '../indexing/graphEdges';

function file(partial: Partial<GraphFileInput> & { id: string; path: string }): GraphFileInput {
  return { imports: [], exports: [], references: [], ...partial };
}

test('builds imports edges from resolved relative imports', () => {
  const edges = buildEdges([
    file({ id: '/w/src/app.ts', path: 'src/app.ts', imports: ['./util', 'vscode'] }),
    file({ id: '/w/src/util.ts', path: 'src/util.ts' }),
  ]);
  assert.deepEqual(
    edges.map((e) => [e.fromId, e.toId, e.type]),
    [['/w/src/app.ts', '/w/src/util.ts', 'imports']],
  );
});

test('builds references edges with the linking name', () => {
  const edges = buildEdges([
    file({ id: '/w/Model.swift', path: 'Model.swift', exports: ['SinglyViewModel'] }),
    file({ id: '/w/View.swift', path: 'View.swift', references: ['SinglyViewModel'] }),
  ]);
  assert.equal(edges.length, 1);
  assert.equal(edges[0].type, 'references');
  assert.equal(edges[0].via, 'SinglyViewModel');
});

test('detects tests by naming convention, both TS and Swift styles', () => {
  const edges = buildEdges([
    file({ id: '/w/src/foo.ts', path: 'src/foo.ts' }),
    file({ id: '/w/test/foo.test.ts', path: 'test/foo.test.ts' }),
    file({ id: '/w/Store.swift', path: 'Store.swift' }),
    file({ id: '/w/StoreTests.swift', path: 'StoreTests.swift' }),
  ]);
  assert.deepEqual(
    edges.map((e) => [e.fromId, e.toId, e.type]),
    [
      ['/w/StoreTests.swift', '/w/Store.swift', 'tests'],
      ['/w/test/foo.test.ts', '/w/src/foo.ts', 'tests'],
    ],
  );
});

test('a tests edge wins over an imports/references edge for the same pair', () => {
  const edges = buildEdges([
    file({ id: '/w/foo.ts', path: 'foo.ts', exports: ['Foo'] }),
    file({
      id: '/w/foo.test.ts',
      path: 'foo.test.ts',
      imports: ['./foo'],
      references: ['Foo'],
    }),
  ]);
  assert.equal(edges.length, 1);
  assert.equal(edges[0].type, 'tests');
});

test('no self edges; deterministic order; helpers filter by direction', () => {
  const files = [
    file({ id: '/w/a.swift', path: 'a.swift', exports: ['A'], references: ['A', 'B'] }),
    file({ id: '/w/b.swift', path: 'b.swift', exports: ['B'], references: ['A'] }),
  ];
  const edges = buildEdges(files);
  assert.deepEqual(buildEdges(files), edges); // deterministic
  assert.ok(edges.every((e) => e.fromId !== e.toId));
  assert.deepEqual(edgesFrom(edges, '/w/a.swift').map((e) => e.toId), ['/w/b.swift']);
  assert.deepEqual(edgesTo(edges, '/w/a.swift').map((e) => e.fromId), ['/w/b.swift']);
});
