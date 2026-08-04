import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  enclosingTypePath,
  maskCommentsAndStrings,
} from '../context/enclosingType';
import { explainSelection } from '../context/generateExplanation';
import { constructNotes } from '../context/constructNotes';
import { syntaxDefinition } from '../context/keywordGlossary';

const FILE = [
  'struct Outer {',
  '  struct Inner {',
  '    func go() {}',
  '  }',
  '}',
  'struct TopLevel {}',
].join('\n');

test('enclosingTypePath reports containers, outermost first', () => {
  const innerAt = FILE.indexOf('struct Inner');
  assert.deepEqual(enclosingTypePath(FILE, innerAt), ['Outer']);

  const goAt = FILE.indexOf('func go');
  assert.deepEqual(enclosingTypePath(FILE, goAt), ['Outer', 'Inner']);

  const topAt = FILE.indexOf('struct TopLevel');
  assert.deepEqual(enclosingTypePath(FILE, topAt), []);
});

test('braces in strings and comments cannot fool the walker', () => {
  const tricky = [
    'struct Outer {',
    '  let s = "fake { brace"',
    '  // comment { brace',
    '  enum State {}',
    '}',
  ].join('\n');
  assert.deepEqual(
    enclosingTypePath(tricky, tricky.indexOf('enum State')),
    ['Outer'],
  );
  const masked = maskCommentsAndStrings(tricky);
  assert.equal(masked.length, tricky.length); // offsets preserved
  assert.ok(!masked.includes('fake'));
});

test('unnamed blocks (funcs, closures, if) do not pollute the path', () => {
  const code = [
    'class Store {',
    '  func load() {',
    '    if ready {',
    '      struct Scratch {}',
    '    }',
    '  }',
    '}',
  ].join('\n');
  assert.deepEqual(
    enclosingTypePath(code, code.indexOf('struct Scratch')),
    ['Store'],
  );
});

test('selecting a nested declaration teaches its full name (Nested Types)', () => {
  const out = explainSelection('struct Inner {', FILE, 'swift', 'a.swift');
  assert.ok(out);
  assert.ok(out.includes('lives inside Outer'));
  assert.ok(out.includes('full name is Outer.Inner'));

  const top = explainSelection('struct TopLevel {}', FILE, 'swift', 'a.swift');
  assert.ok(top);
  assert.ok(!top.includes('Nested type'));
});

test('inout lines teach the exclusivity rule (Memory Safety)', () => {
  const notes = constructNotes('func bump(_ n: inout Int) { n += 1 }', 'swift');
  assert.ok(notes.some((n) => n.includes('OWN variable')));
  assert.ok(notes.some((n) => n.includes('can’t be passed inout twice')));
});

test('overflow and bitwise operator tokens answer (Advanced Operators)', () => {
  assert.ok(syntaxDefinition('&+', 'swift')?.includes('wraps around'));
  assert.ok(syntaxDefinition('&-', 'swift')?.includes('255'));
  assert.ok(syntaxDefinition('<<', 'swift')?.includes('doubles'));
  assert.ok(syntaxDefinition('^', 'swift')?.includes('differ'));
  assert.ok(syntaxDefinition('~', 'swift')?.includes('flips'));
});
