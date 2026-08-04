import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  explainDeclarationLine,
  keywordDefinition,
} from '../context/keywordGlossary';
import { explainSelection } from '../context/generateExplanation';

test('keywordDefinition answers Swift and TS keywords, not unknowns', () => {
  assert.ok(keywordDefinition('struct', 'swift')?.includes('value type'));
  assert.ok(keywordDefinition('guard', 'swift')?.includes('early exit'));
  assert.ok(keywordDefinition('interface', 'typescript')?.includes('contract'));
  assert.equal(keywordDefinition('banana', 'swift'), undefined);
  assert.equal(keywordDefinition('struct', 'python'), undefined);
});

test('the HereApp case: struct + App teaches the parts AND the why', () => {
  const out = explainDeclarationLine('struct HereApp: App {', 'swift');
  assert.ok(out);
  assert.ok(out.includes('struct — Makes a value type'));
  assert.ok(out.includes('HereApp — the name'));
  assert.ok(out.includes(': App — adopts App: the SwiftUI entry-point contract'));
  assert.ok(out.includes('Why struct? SwiftUI is designed around App types being structs'));
});

test('attributes and modifiers are taught in place', () => {
  const out = explainDeclarationLine('@main\nstruct HereApp: App {', 'swift');
  assert.ok(out);
  assert.ok(out.includes('@main — marks the program’s entry point'));

  const prop = explainDeclarationLine('@State private var count = 0', 'swift');
  assert.ok(prop);
  assert.ok(prop.includes('@State — view-owned state'));
  assert.ok(prop.includes('private — Visible only inside'));
  assert.ok(prop.includes('var — A variable'));
});

test('class + ObservableObject explains why a class was the right choice', () => {
  const out = explainDeclarationLine(
    'final class Store: ObservableObject {',
    'swift',
  );
  assert.ok(out);
  assert.ok(out.includes('final — No subclassing'));
  assert.ok(out.includes('ObservableObject: an object views can watch'));
  assert.ok(out.includes('Why class? This one is a class ON PURPOSE'));
});

test('functions get plain-words signature plus effect keywords', () => {
  const out = explainDeclarationLine(
    'func send(title: String) async throws -> Bool {',
    'swift',
  );
  assert.ok(out);
  assert.ok(out.includes('func — Declares a function'));
  assert.ok(out.includes('async —'));
  assert.ok(out.includes('throws —'));
});

test('unknown conformances still teach the contract idea', () => {
  const out = explainDeclarationLine('struct Row: MyProtocol {', 'swift');
  assert.ok(out);
  assert.ok(out.includes('promises everything MyProtocol requires'));
});

test('TS declarations get keyword, name, and heritage', () => {
  const out = explainDeclarationLine(
    'export class JsonStore extends BaseStore implements LocalStore {',
    'typescript',
  );
  assert.ok(out);
  assert.ok(out.includes('export —'));
  assert.ok(out.includes('class —'));
  assert.ok(out.includes('extends BaseStore'));
  assert.ok(out.includes('implements LocalStore'));
});

test('non-declarations return undefined', () => {
  assert.equal(explainDeclarationLine('x + y == 3', 'swift'), undefined);
  assert.equal(explainDeclarationLine('print("hi")', 'typescript'), undefined);
});

// --- integration through explainSelection -----------------------------------

test('selecting the bare word "struct" answers from the glossary', () => {
  const out = explainSelection('struct', 'struct Foo {}', 'swift', 'a.swift');
  assert.ok(out);
  assert.ok(out.startsWith('struct (keyword)'));
  assert.ok(out.includes('value type'));
});

test('selecting a declaration line returns its anatomy', () => {
  const out = explainSelection(
    'struct HereApp: App {',
    'struct HereApp: App {}',
    'swift',
    'HereApp.swift',
  );
  assert.ok(out);
  assert.ok(out.includes('Why struct?'));
});

test('selecting a whole declaration block leads with anatomy, then the outline', () => {
  const code = [
    'struct HereApp: App {',
    '  /// The app scene.',
    '  var body: some Scene { WindowGroup { ContentView() } }',
    '}',
  ].join('\n');
  const out = explainSelection(code, code, 'swift', 'HereApp.swift');
  assert.ok(out);
  assert.ok(out.includes('Why struct?'));
  assert.ok(out.includes('Inside it:'));
  assert.ok(out.includes('body'));
});
