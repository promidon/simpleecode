import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  describeSystemRole,
  systemRoleBlock,
  type IndexedFile,
} from '../rag/systemRole';

function file(partial: Partial<IndexedFile> & { id: string; path: string }): IndexedFile {
  return {
    language: 'typescript',
    imports: [],
    exports: [],
    references: [],
    ...partial,
  };
}

const TS_FILES: IndexedFile[] = [
  file({
    id: '/w/src/util.ts',
    path: 'src/util.ts',
    exports: ['formatDate'],
    imports: ['path'],
  }),
  file({
    id: '/w/src/app.ts',
    path: 'src/app.ts',
    imports: ['./util', 'vscode'],
  }),
  file({
    id: '/w/src/other.ts',
    path: 'src/other.ts',
    imports: ['./nothing-here'],
  }),
];

test('describeSystemRole resolves TS dependents via relative imports', () => {
  const summary = describeSystemRole('/w/src/util.ts', TS_FILES);
  assert.ok(summary);
  assert.deepEqual(summary.dependents, [
    { path: 'src/app.ts', why: 'imports src/util.ts' },
  ]);
  assert.deepEqual(summary.moduleImports, ['path']);
});

test('describeSystemRole lists what the focal file depends on', () => {
  const summary = describeSystemRole('/w/src/app.ts', TS_FILES);
  assert.ok(summary);
  assert.deepEqual(summary.dependsOn, ['src/util.ts']);
  assert.deepEqual(summary.moduleImports, ['vscode']);
  assert.equal(summary.dependents.length, 0);
});

test('describeSystemRole finds Swift dependents by reference-to-export', () => {
  const files: IndexedFile[] = [
    file({
      id: '/w/Model.swift',
      path: 'Model.swift',
      language: 'swift',
      imports: ['Foundation'],
      exports: ['SinglyViewModel'],
    }),
    file({
      id: '/w/ContentView.swift',
      path: 'ContentView.swift',
      language: 'swift',
      imports: ['SwiftUI'],
      references: ['SinglyViewModel', 'Text'],
    }),
  ];
  const summary = describeSystemRole('/w/Model.swift', files);
  assert.ok(summary);
  assert.deepEqual(summary.dependents, [
    { path: 'ContentView.swift', why: 'uses SinglyViewModel' },
  ]);
});

test('describeSystemRole returns undefined for an unindexed file', () => {
  assert.equal(describeSystemRole('/w/missing.ts', TS_FILES), undefined);
});

test('describeSystemRole lists test files separately from dependents (#19)', () => {
  const files = [
    ...TS_FILES,
    file({
      id: '/w/src/util.test.ts',
      path: 'src/util.test.ts',
      imports: ['./util'],
    }),
  ];
  const summary = describeSystemRole('/w/src/util.ts', files)!;
  assert.deepEqual(summary.testedBy, ['src/util.test.ts']);
  // The test file imports util.ts but is NOT counted as a plain dependent.
  assert.deepEqual(summary.dependents, [
    { path: 'src/app.ts', why: 'imports src/util.ts' },
  ]);
  assert.ok(systemRoleBlock(summary).includes('Tested by: src/util.test.ts'));
});

test('systemRoleBlock renders only the sections that exist', () => {
  const summary = describeSystemRole('/w/src/util.ts', TS_FILES)!;
  const block = systemRoleBlock(summary);
  assert.ok(block.startsWith('# Module graph'));
  assert.ok(block.includes('Exposes: formatDate'));
  assert.ok(block.includes('src/app.ts (imports src/util.ts)'));

  const lonely = describeSystemRole('/w/src/other.ts', TS_FILES)!;
  const lonelyBlock = systemRoleBlock(lonely);
  assert.ok(!lonelyBlock.includes('Exposes:'));
  assert.ok(lonelyBlock.includes('no indexed file'));
});

test('parseModuleGraph now reports references (used, not declared)', async () => {
  const { parseModuleGraph } = await import('../indexing/parseModuleGraph');
  const graph = parseModuleGraph(
    'struct A {}\nlet vm = OtherThing()',
    'swift',
  );
  assert.ok(graph.references.includes('OtherThing'));
  assert.ok(!graph.references.includes('A'));
});
