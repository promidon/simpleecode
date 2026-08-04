import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHover } from '../context/hoverParse';

test('parseHover splits a code-fence signature from the doc prose', () => {
  const md = '```swift\nvar model: SinglyViewModel\n```\n\nThe view model for the screen.';
  const { signature, doc } = parseHover(md);
  assert.equal(signature, 'var model: SinglyViewModel');
  assert.equal(doc, 'The view model for the screen.');
});

test('parseHover handles a signature with no doc', () => {
  const { signature, doc } = parseHover('```ts\nconst add: (a: number) => number\n```');
  assert.equal(signature, 'const add: (a: number) => number');
  assert.equal(doc, undefined);
});

test('parseHover handles prose with no code fence', () => {
  const { signature, doc } = parseHover('Just a description, no code.');
  assert.equal(signature, undefined);
  assert.equal(doc, 'Just a description, no code.');
});

test('parseHover returns nothing for empty input', () => {
  assert.deepEqual(parseHover(''), { signature: undefined, doc: undefined });
});
