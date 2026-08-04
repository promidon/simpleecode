import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  structureFacts,
  stripCommentsAndStrings,
} from '../context/structureFacts';

test('reads Swift variables, calls, and branches from the source', () => {
  const code = `
    let text = field.trimmed()
    var count: Int = 0
    if filter.capturesNote {
      noteActions.create(title: text)
    } else {
      _ = actions.create(title: text, listId: filter.captureListId())
    }
  `;
  const facts = structureFacts(code, 'swift');
  assert.ok(facts);
  assert.deepEqual(
    facts.variables.map((v) => v.name),
    ['text', 'count'],
  );
  assert.equal(facts.variables[1].type, 'Int');
  assert.ok(facts.calls.includes('create'));
  assert.ok(facts.calls.includes('captureListId'));
  assert.equal(facts.branches, 1);
  assert.equal(facts.loops, 0);
});

test('reads TS variables and counts loops and returns', () => {
  const code = `
    const items: string[] = load();
    for (const item of items) {
      if (!item) { continue; }
    }
    return items.length;
  `;
  const facts = structureFacts(code, 'typescript');
  assert.ok(facts);
  assert.equal(facts.variables[0].name, 'items');
  assert.equal(facts.variables[0].kind, 'const');
  assert.ok(facts.calls.includes('load'));
  assert.equal(facts.loops, 1);
  assert.equal(facts.returns, 1);
});

test('a function declaration is not counted as a call', () => {
  const facts = structureFacts('func send() { deliver() }', 'swift');
  assert.ok(facts);
  assert.ok(!facts.calls.includes('send'));
  assert.ok(facts.calls.includes('deliver'));
});

test('comments and strings do not create facts', () => {
  const code = `
    // for while if return fake()
    let s = "if (x) { loop() }"
    /* var hidden = 1 */
  `;
  const facts = structureFacts(code, 'swift');
  assert.ok(facts);
  assert.equal(facts.loops, 0);
  assert.equal(facts.branches, 0);
  assert.equal(facts.calls.length, 0);
  assert.deepEqual(
    facts.variables.map((v) => v.name),
    ['s'],
  );
});

test('returns undefined for empty or fact-free code', () => {
  assert.equal(structureFacts('', 'swift'), undefined);
  assert.equal(structureFacts('// just a comment', 'swift'), undefined);
});

test('stripCommentsAndStrings keeps code shape', () => {
  const out = stripCommentsAndStrings('let a = "x" // note');
  assert.ok(out.includes('let a = ""'));
  assert.ok(!out.includes('note'));
});
