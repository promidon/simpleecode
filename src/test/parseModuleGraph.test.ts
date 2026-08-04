import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseModuleGraph } from '../indexing/parseModuleGraph';

test('parseModuleGraph extracts TS imports (from, side-effect, require, dynamic)', () => {
  const src = `
import * as vscode from 'vscode';
import { buildPrompt } from '../prompt/promptBuilder';
import './styles.css';
const fs = require('node:fs');
const mod = await import('./lazy');
export { foo } from './re-export';
`;
  const { imports } = parseModuleGraph(src, 'typescript');
  assert.ok(imports.includes('vscode'));
  assert.ok(imports.includes('../prompt/promptBuilder'));
  assert.ok(imports.includes('./styles.css'));
  assert.ok(imports.includes('node:fs'));
  assert.ok(imports.includes('./lazy'));
  assert.ok(imports.includes('./re-export'));
});

test('parseModuleGraph extracts TS exports (decls, default, named list)', () => {
  const src = `
export const add = (a, b) => a + b;
export function sub() {}
export class Thing {}
export interface Shape {}
export type Id = string;
export default function main() {}
const a = 1, b = 2;
export { a, b as bee };
`;
  const { exports } = parseModuleGraph(src, 'typescript');
  for (const name of ['add', 'sub', 'Thing', 'Shape', 'Id', 'default', 'a', 'bee']) {
    assert.ok(exports.includes(name), `expected export "${name}"`);
  }
});

test('parseModuleGraph handles Swift imports and declarations', () => {
  const src = `
import Foundation
import SwiftUI

struct ContentView {}
func loadUser() {}
class Store {}
`;
  const { imports, exports } = parseModuleGraph(src, 'swift');
  assert.ok(imports.includes('Foundation'));
  assert.ok(imports.includes('SwiftUI'));
  assert.ok(exports.includes('ContentView'));
  assert.ok(exports.includes('loadUser'));
  assert.ok(exports.includes('Store'));
});

test('parseModuleGraph dedupes repeated specifiers', () => {
  const src = `import { a } from 'x';\nimport { b } from 'x';`;
  const { imports } = parseModuleGraph(src, 'typescript');
  assert.equal(imports.filter((i) => i === 'x').length, 1);
});
