import { test } from 'node:test';
import assert from 'node:assert/strict';
import { explainSignature } from '../context/explainSignature';

test('explainSignature explains a Swift function with params and a return', () => {
  const out = explainSignature('func handle(_ url: URL, app: AppModel) -> Bool');
  assert.equal(out, 'Takes url (URL), app (AppModel); gives back Bool.');
});

test('explainSignature handles no params and no return', () => {
  assert.equal(explainSignature('func reset()'), 'Takes no inputs; gives back nothing.');
});

test('explainSignature treats Void as nothing', () => {
  assert.equal(explainSignature('func save(x: Int) -> Void'), 'Takes x (Int); gives back nothing.');
});

test('explainSignature explains a property type', () => {
  assert.equal(explainSignature('var model: SinglyViewModel'), 'A value of type SinglyViewModel.');
});

test('explainSignature reads a property type past an initializer', () => {
  assert.equal(
    explainSignature('var orbState: OrbState = .resting'),
    'A value of type OrbState.',
  );
});

test('explainSignature handles a TS arrow signature', () => {
  const out = explainSignature('const add: (a: number, b: number) => number');
  assert.equal(out, 'Takes a (number), b (number); gives back number.');
});

test('explainSignature keeps generics/closures intact when splitting params', () => {
  const out = explainSignature('func run(items: Array<String>, onDone: () -> Void)');
  assert.equal(out, 'Takes items (Array<String>), onDone (() -> Void); gives back nothing.');
});

test('explainSignature returns undefined when it cannot parse', () => {
  assert.equal(explainSignature('not really a signature'), undefined);
});
