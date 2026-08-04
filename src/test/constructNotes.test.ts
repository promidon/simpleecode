import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { constructNotes } from '../context/constructNotes';
import { explainSelection } from '../context/generateExplanation';
import { syntaxDefinition } from '../context/keywordGlossary';

const has = (notes: string[], fragment: string) =>
  notes.some((n) => n.includes(fragment));

test('optional binding: guard let and if let (The Basics)', () => {
  const g = constructNotes('guard let user = repo.load() else { return }', 'swift');
  assert.ok(has(g, 'guard let user'));
  assert.ok(has(g, 'early exit'));

  const i = constructNotes('if let name = person.name { greet(name) }', 'swift');
  assert.ok(has(i, 'if let name'));
});

test('operators: ??, ?., ranges, identity, ternary (Basic Operators)', () => {
  assert.ok(has(constructNotes('let n = count ?? 0', 'swift'), 'nil-coalescing'));
  assert.ok(has(constructNotes('user?.address?.city', 'swift'), 'optional chaining'));
  assert.ok(has(constructNotes('for i in 0..<10 {}', 'swift'), 'half-open range'));
  assert.ok(has(constructNotes('1...5', 'swift'), 'closed range'));
  assert.ok(has(constructNotes('a === b', 'swift'), 'SAME object'));
  assert.ok(has(constructNotes('let l = isOn ? a : b', 'swift'), 'ternary'));
  // Optional TYPE annotations are not ternaries.
  assert.ok(!has(constructNotes('var x: Int? = nil', 'swift'), 'ternary'));
});

test('strings: interpolation and multiline (Strings and Characters)', () => {
  assert.ok(
    has(constructNotes('Text("Hello \\(name)!")', 'swift'), 'string interpolation'),
  );
  assert.ok(has(constructNotes('let doc = """', 'swift'), 'multiline string'));
});

test('control flow: for-in, switch, defer (Control Flow)', () => {
  assert.ok(has(constructNotes('for item in items { render(item) }', 'swift'), 'one at a time'));
  assert.ok(has(constructNotes('switch state {', 'swift'), 'every possibility'));
  assert.ok(has(constructNotes('defer { file.close() }', 'swift'), 'scope exits'));
});

test('closures: in-syntax, shorthand args, capture lists (Closures)', () => {
  assert.ok(has(constructNotes('items.map { item in item.id }', 'swift'), 'closure'));
  assert.ok(has(constructNotes('items.sorted { $0 < $1 }', 'swift'), 'Shorthand closure') || has(constructNotes('items.sorted { $0 < $1 }', 'swift'), '$0'));
  const weak = constructNotes('load { [weak self] data in self?.show(data) }', 'swift');
  assert.ok(has(weak, '[weak self]'));
  assert.ok(has(weak, 'retain cycle'));
  const unowned = constructNotes('run { [unowned self] in self.done() }', 'swift');
  assert.ok(has(unowned, 'crashes if self is gone'));
});

test('properties: willSet and didSet observers (Properties)', () => {
  const notes = constructNotes('var score = 0 { didSet { save(score) } }', 'swift');
  assert.ok(has(notes, 'didSet'));
});

test('error handling: try forms and throw (Error Handling)', () => {
  assert.ok(has(constructNotes('let x = try? decode(data)', 'swift'), 'becomes nil'));
  assert.ok(has(constructNotes('let x = try! decode(data)', 'swift'), 'crashes'));
  assert.ok(has(constructNotes('let x = try decode(data)', 'swift'), 'nearest catch'));
  assert.ok(has(constructNotes('throw AppError.notFound', 'swift'), 'raises an error'));
});

test('concurrency: await, async let, Task (Concurrency)', () => {
  assert.ok(has(constructNotes('let user = await api.user()', 'swift'), 'pauses here'));
  assert.ok(has(constructNotes('async let logo = fetchLogo()', 'swift'), 'IN PARALLEL'));
  assert.ok(has(constructNotes('Task { await refresh() }', 'swift'), 'async work'));
});

test('type casting: as? and as! (Type Casting)', () => {
  assert.ok(has(constructNotes('let vc = sender as? UIButton', 'swift'), 'Safe cast') || has(constructNotes('let vc = sender as? UIButton', 'swift'), 'safe cast'));
  assert.ok(has(constructNotes('let vc = sender as! UIButton', 'swift'), 'crashes'));
});

test('Swift 6 book additions: typed throws, if/switch expressions, if case', () => {
  assert.ok(
    has(constructNotes('func load() throws(NetworkError) -> Data', 'swift'), 'typed throws'),
  );
  assert.ok(
    has(constructNotes('let color = switch state { case .on: red }', 'swift'), 'EXPRESSION'),
  );
  assert.ok(
    has(constructNotes('let label = if isOn { "on" } else { "off" }', 'swift'), 'EXPRESSION'),
  );
  assert.ok(
    has(constructNotes('if case .loading = state { spin() }', 'swift'), 'pattern matching'),
  );
  assert.ok(
    has(constructNotes('guard case let .some(v) = box else { return }', 'swift'), 'pattern matching'),
  );
});

test('comments and string bodies never produce construct notes', () => {
  assert.deepEqual(constructNotes('// guard let x = y ?? z', 'swift'), []);
  assert.ok(!has(constructNotes('print("use ?? here")', 'swift'), 'nil-coalescing'));
});

test('caps the number of notes and returns [] for other languages', () => {
  const busy = 'guard let a = b ?? c, let d = e as? F else { return }\n' +
    'for i in 0..<10 { Task { await run(i) } }\n' +
    'items.map { $0 }.filter { x in x > 1 }';
  assert.ok(constructNotes(busy, 'swift', 4).length <= 4);
  assert.deepEqual(constructNotes('guard let x = y', 'typescript'), []);
});

// --- macros and operator tokens (Macros, Advanced Operators) -----------------

test('syntaxDefinition covers # macros with a generic fallback', () => {
  assert.ok(syntaxDefinition('#Preview', 'swift')?.includes('canvas preview'));
  assert.ok(syntaxDefinition('#warning', 'swift')?.includes('warning'));
  assert.ok(syntaxDefinition('#SomeCustomMacro', 'swift')?.includes('macro'));
  assert.ok(syntaxDefinition('$0', 'swift')?.includes('argument number 1'));
  assert.ok(syntaxDefinition('??', 'swift')?.includes('Nil-coalescing'));
  assert.ok(syntaxDefinition('as!', 'swift')?.includes('crashes'));
  assert.ok(syntaxDefinition('=>', 'typescript')?.includes('Arrow function'));
  assert.equal(syntaxDefinition('@@', 'swift'), undefined);
});

// --- integration through explainSelection ------------------------------------

test('selecting an operator token answers directly', () => {
  const out = explainSelection('??', 'let a = b ?? c', 'swift', 'a.swift');
  assert.ok(out?.includes('Nil-coalescing'));
});

test('selecting a guard line teaches the statement, not a fake declaration', () => {
  const out = explainSelection(
    'guard let user = repo.load() else { return }',
    '',
    'swift',
    'a.swift',
  );
  assert.ok(out);
  assert.ok(out.includes('guard let user'));
  assert.ok(!out.includes('the name this code gives it')); // no declaration anatomy
});

test('selecting a return statement leads with the keyword meaning', () => {
  const out = explainSelection('return items.count', '', 'swift', 'a.swift');
  assert.ok(out?.includes('return — Ends the function'));
});

test('declaration anatomy appends the constructs used on the line', () => {
  const out = explainSelection(
    '@State private var label = isOn ? "on" : "off"',
    '',
    'swift',
    'a.swift',
  );
  assert.ok(out);
  assert.ok(out.includes('@State'));
  assert.ok(out.includes('Also used here:'));
  assert.ok(out.includes('ternary'));
});
