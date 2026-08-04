import { test } from 'node:test';
import assert from 'node:assert/strict';
import { markdownToHtml } from '../utils/markdownToHtml';

test('renders bold, italic, and inline code', () => {
  const html = markdownToHtml('This is **bold**, *soft*, and `code`.');
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /<em>soft<\/em>/);
  assert.match(html, /<code>code<\/code>/);
});

test('renders headings as h3/h4', () => {
  assert.match(markdownToHtml('## What this does'), /<h3>What this does<\/h3>/);
  assert.match(markdownToHtml('#### Deep'), /<h4>Deep<\/h4>/);
});

test('renders bullet and numbered lists', () => {
  const ul = markdownToHtml('- one\n- two');
  assert.match(ul, /<ul><li>one<\/li><li>two<\/li><\/ul>/);
  const ol = markdownToHtml('1. first\n2. second');
  assert.match(ol, /<ol><li>first<\/li><li>second<\/li><\/ol>/);
});

test('renders a fenced code block and escapes its contents', () => {
  const html = markdownToHtml('```ts\nconst x = a < b && c > d;\n```');
  assert.match(html, /<pre><code>const x = a &lt; b &amp;&amp; c &gt; d;<\/code><\/pre>/);
});

test('allows http(s) links but drops javascript: links', () => {
  const ok = markdownToHtml('See [docs](https://example.com/a).');
  assert.match(ok, /<a href="#" data-url="https:\/\/example\.com\/a">docs<\/a>/);
  const bad = markdownToHtml('Click [here](javascript:alert(1)).');
  assert.doesNotMatch(bad, /javascript:/);
  assert.match(bad, /here/); // keeps the visible text, drops the link
});

test('escapes raw HTML so a model answer cannot inject markup (XSS)', () => {
  const html = markdownToHtml('Danger: <img src=x onerror=alert(1)> and <script>bad()</script>.');
  assert.doesNotMatch(html, /<img/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;img/);
  assert.match(html, /&lt;script&gt;/);
});

test('does not mangle snake_case or dunder identifiers', () => {
  const html = markdownToHtml('The value of my_var and __init__ is fine.');
  assert.match(html, /my_var/);
  assert.match(html, /__init__/);
  assert.doesNotMatch(html, /<em>/);
});

test('renders a blockquote', () => {
  assert.match(markdownToHtml('> a quote'), /<blockquote>a quote<\/blockquote>/);
});

test('empty input yields empty output', () => {
  assert.equal(markdownToHtml(''), '');
});
