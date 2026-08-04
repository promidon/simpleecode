import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDeclaration } from '../context/parseDeclaration';

test('parseDeclaration finds a Swift enum even under an attribute line', () => {
  const d = parseDeclaration('@MainActor\nenum DeepLinkDispatcher {', 'swift');
  assert.deepEqual(d, {
    kind: 'enum',
    name: 'DeepLinkDispatcher',
    signature: 'enum DeepLinkDispatcher',
  });
});

test('parseDeclaration reads a multi-line Swift function signature', () => {
  const src = 'static func handle(_ url: URL,\n                   app: AppModel) {';
  const d = parseDeclaration(src, 'swift');
  assert.equal(d?.kind, 'func');
  assert.equal(d?.name, 'handle');
  assert.equal(d?.signature, 'func handle(_ url: URL, app: AppModel)');
});

test('parseDeclaration reads a Swift property type', () => {
  const d = parseDeclaration('var model: SinglyViewModel', 'swift');
  assert.deepEqual(d, {
    kind: 'var',
    name: 'model',
    signature: 'var model: SinglyViewModel',
  });
});

test('parseDeclaration reads a Python def and strips the trailing colon', () => {
  const d = parseDeclaration('def handle(url, app):', 'python');
  assert.deepEqual(d, {
    kind: 'function',
    name: 'handle',
    signature: 'def handle(url, app)',
  });
});

test('parseDeclaration reads a Python class', () => {
  const d = parseDeclaration('class Store(Base):', 'python');
  assert.deepEqual(d, { kind: 'class', name: 'Store', signature: 'class Store(Base)' });
});

test('parseDeclaration returns undefined for text with no declaration', () => {
  assert.equal(parseDeclaration('let total = a + b - c', 'python'), undefined);
  assert.equal(parseDeclaration('1 + 2', 'swift'), undefined);
});

test('parseDeclaration ignores languages it does not self-parse', () => {
  assert.equal(parseDeclaration('enum X {}', 'json'), undefined);
});
