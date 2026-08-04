import { test } from 'node:test';
import assert from 'node:assert/strict';
import { swiftDocLinks } from '../rag/swiftDocs';

test('swiftDocLinks returns nothing for non-Swift files', () => {
  assert.deepEqual(swiftDocLinks('URLSession', 'typescript'), []);
  assert.deepEqual(swiftDocLinks('URLSession', undefined), []);
});

test('swiftDocLinks returns learning links for Swift with no symbol', () => {
  const links = swiftDocLinks(undefined, 'swift');
  assert.ok(links.length >= 4);
  assert.ok(links.some((l) => l.url.includes('developer.apple.com/tutorials/develop-in-swift')));
  assert.ok(links.some((l) => l.url.includes('swift.org/documentation')));
  assert.ok(links.some((l) => l.url.includes('w3schools.com/swift')));
  assert.ok(links.some((l) => l.url.includes('hackingwithswift.com/100')));
});

test('swiftDocLinks adds symbol search links (encoded, always-resolving)', () => {
  const links = swiftDocLinks('URLSession', 'swift');
  const apple = links.find((l) => l.url.startsWith('https://developer.apple.com/search/'));
  assert.ok(apple, 'expected an Apple search link');
  assert.ok(apple.url.includes('q=URLSession'));
  assert.ok(links.some((l) => l.url.includes('hackingwithswift.com/search?q=URLSession')));
});

test('swiftDocLinks URL-encodes symbols with special characters', () => {
  const links = swiftDocLinks('Array<String>', 'swift');
  const apple = links.find((l) => l.url.startsWith('https://developer.apple.com/search/'));
  assert.ok(apple);
  assert.ok(apple.url.includes('q=Array%3CString%3E'));
});
