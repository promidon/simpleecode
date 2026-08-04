import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  pickDeclaration,
  toSymbolRecords,
  type DocSymbolLike,
  type SymbolRecord,
} from '../indexing/symbolRecords';

// vscode.SymbolKind numeric values used in the fakes
const METHOD = 5;
const FUNCTION = 11;
const VARIABLE = 12;
const STRUCT = 22;
const NAMESPACE = 2;

const SWIFT_SOURCE = [
  'struct SinglyViewModel {',
  '  var items: [Reminder] = []',
  '  func send() {',
  '    print("hi")',
  '  }',
  '}',
];

const SWIFT_TREE: DocSymbolLike[] = [
  {
    name: 'SinglyViewModel',
    kind: STRUCT,
    startLine: 0,
    endLine: 5,
    children: [
      { name: 'items', kind: VARIABLE, startLine: 1, endLine: 1 },
      { name: 'send', kind: METHOD, startLine: 2, endLine: 4 },
    ],
  },
];

test('flattens a Swift tree with container paths, ranges, and signatures', () => {
  const records = toSymbolRecords(SWIFT_TREE, '/w/Model.swift', SWIFT_SOURCE, 'swift');
  assert.deepEqual(
    records.map((r) => [r.id, r.kind, r.range.startLine, r.range.endLine]),
    [
      ['/w/Model.swift#SinglyViewModel', 'type', 1, 6],
      ['/w/Model.swift#SinglyViewModel.items', 'constant', 2, 2],
      ['/w/Model.swift#SinglyViewModel.send', 'function', 3, 5],
    ],
  );
  assert.equal(records[0].signature, 'struct SinglyViewModel {');
  assert.ok(records[2].codePreview.includes('func send()'));
});

test('skips unmapped kinds but still walks their children', () => {
  const tree: DocSymbolLike[] = [
    {
      name: 'Outer',
      kind: NAMESPACE, // not mapped
      startLine: 0,
      endLine: 2,
      children: [{ name: 'inner', kind: FUNCTION, startLine: 1, endLine: 1 }],
    },
  ];
  const records = toSymbolRecords(tree, '/f.ts', ['a', 'b', 'c'], 'typescript');
  assert.deepEqual(records.map((r) => r.id), ['/f.ts#Outer.inner']);
});

test('detects React hooks and components by convention', () => {
  const tree: DocSymbolLike[] = [
    { name: 'useThing', kind: FUNCTION, startLine: 0, endLine: 0 },
    { name: 'Sidebar', kind: FUNCTION, startLine: 1, endLine: 1 },
    { name: 'helper', kind: FUNCTION, startLine: 2, endLine: 2 },
  ];
  const tsx = toSymbolRecords(tree, '/f.tsx', ['', '', ''], 'typescriptreact');
  assert.deepEqual(tsx.map((r) => r.kind), ['hook', 'component', 'function']);

  // Plain TS: capitalized functions are NOT components; hooks still are hooks.
  const ts = toSymbolRecords(tree, '/f.ts', ['', '', ''], 'typescript');
  assert.deepEqual(ts.map((r) => r.kind), ['hook', 'function', 'function']);

  // Swift: naming conventions don't apply.
  const swift = toSymbolRecords(tree, '/f.swift', ['', '', ''], 'swift');
  assert.deepEqual(swift.map((r) => r.kind), ['function', 'function', 'function']);
});

test('caps the preview length', () => {
  const lines = Array.from({ length: 100 }, (_, i) => `line ${i}`);
  const tree: DocSymbolLike[] = [
    { name: 'big', kind: FUNCTION, startLine: 0, endLine: 99 },
  ];
  const [record] = toSymbolRecords(tree, '/f.ts', lines, 'typescript');
  assert.ok(record.codePreview.split('\n').length <= 21);
  assert.ok(!record.codePreview.includes('line 50'));
});

test('pickDeclaration prefers types over constants, then stable order', () => {
  const make = (id: string, kind: SymbolRecord['kind']): SymbolRecord => ({
    id,
    fileId: id.split('#')[0],
    name: 'View',
    kind,
    range: { startLine: 1, endLine: 1 },
    codePreview: '',
  });
  const picked = pickDeclaration([
    make('/b.swift#View', 'constant'),
    make('/a.swift#View', 'type'),
  ]);
  assert.equal(picked?.id, '/a.swift#View');
  assert.equal(pickDeclaration([]), undefined);
});
