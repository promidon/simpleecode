import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPrompt } from '../prompt/promptBuilder';
import type { ContextPacket } from '../context/ContextPacket';

test('buildPrompt includes selected code, focus, and honesty rules', () => {
  const packet: ContextPacket = {
    task: 'explain_selection',
    filePath: '/repo/src/math.ts',
    languageId: 'typescript',
    selectedText: 'export const add = (a, b) => a + b;',
    startLine: 10,
    endLine: 10,
    userPrompt: 'Explain the selected code.',
    privacyScope: 'selection_only',
  };
  const prompt = buildPrompt(packet);

  assert.ok(prompt.includes('export const add = (a, b) => a + b;'));
  assert.ok(prompt.includes('/repo/src/math.ts'));
  assert.ok(prompt.includes('typescript'));
  assert.ok(prompt.includes('Lines: 10-10'));
  assert.ok(prompt.includes('Explain ONLY from the context'));
  assert.ok(prompt.includes('selection_only'));
});

test('buildPrompt includes dyslexia-friendly accessibility instructions', () => {
  const packet: ContextPacket = {
    task: 'explain_selection',
    filePath: '/repo/src/math.ts',
    languageId: 'typescript',
    selectedText: 'export const add = (a, b) => a + b;',
    startLine: 10,
    endLine: 10,
    userPrompt: 'Explain the selected code.',
    privacyScope: 'selection_only',
  };
  const prompt = buildPrompt(packet);

  assert.ok(prompt.includes('dyslexic'));
  assert.ok(prompt.includes('plain, simple words'));
  assert.ok(prompt.includes('Short sentences'));
});

test('buildPrompt for a file includes the full text', () => {
  const packet: ContextPacket = {
    task: 'explain_file',
    filePath: '/repo/src/app.ts',
    languageId: 'typescript',
    fullText: 'const a = 1;\nconst b = 2;',
    userPrompt: 'Explain this file.',
    privacyScope: 'current_file',
  };
  const prompt = buildPrompt(packet);
  assert.ok(prompt.includes('const a = 1;'));
  assert.ok(prompt.includes('# File'));
});

test('buildPrompt includes retrieved related context when provided', () => {
  const packet: ContextPacket = {
    task: 'explain_selection',
    filePath: '/repo/src/math.ts',
    languageId: 'typescript',
    selectedText: 'add(1, 2)',
    startLine: 5,
    endLine: 5,
    userPrompt: 'Explain the selected code.',
    privacyScope: 'related_files',
  };
  const prompt = buildPrompt(packet, [
    {
      sourceType: 'file',
      path: 'src/util.ts',
      range: '1-10 (preview)',
      reasonIncluded: 'Imported by src/math.ts',
      content: 'export const add = (a, b) => a + b;',
    },
  ]);

  assert.ok(prompt.includes('Related context'));
  assert.ok(prompt.includes('src/util.ts'));
  assert.ok(prompt.includes('Imported by src/math.ts'));
  assert.ok(prompt.includes('export const add = (a, b) => a + b;'));
});

test('buildPrompt drops related context when the scope is selection only', () => {
  const packet: ContextPacket = {
    task: 'explain_selection',
    filePath: '/repo/src/math.ts',
    selectedText: 'add(1, 2)',
    userPrompt: 'Explain the selected code.',
    privacyScope: 'selection_only',
  };
  const prompt = buildPrompt(packet, [
    {
      sourceType: 'file',
      path: 'src/private-related.ts',
      reasonIncluded: 'Imported',
      content: 'must not be included',
    },
  ]);
  assert.ok(!prompt.includes('private-related.ts'));
  assert.ok(!prompt.includes('must not be included'));
});

test('buildPrompt includes a Verified facts block when facts are given', () => {
  const packet: ContextPacket = {
    task: 'explain_selection',
    filePath: '/repo/src/ContentView.swift',
    languageId: 'swift',
    selectedText: 'var model = SinglyViewModel()',
    startLine: 3,
    endLine: 3,
    userPrompt: 'Explain the selected code.',
    privacyScope: 'selection_only',
  };
  const prompt = buildPrompt(packet, [], 'standard', {
    symbol: 'model',
    signature: 'var model: SinglyViewModel',
    definition: 'ContentView.swift:3',
    callerCount: 4,
  });

  assert.ok(prompt.includes('Verified facts'));
  assert.ok(prompt.includes('var model: SinglyViewModel'));
  assert.ok(prompt.includes('ContentView.swift:3'));
  assert.ok(prompt.includes('4 place(s)'));
});

test('buildPrompt includes the deterministic draft explanation when provided', () => {
  const packet: ContextPacket = {
    task: 'explain_file',
    filePath: '/repo/src/RootView.swift',
    languageId: 'swift',
    fullText: 'struct RootView {}',
    userPrompt: 'Explain this file.',
    privacyScope: 'current_file',
  };
  const prompt = buildPrompt(packet, [], 'standard', undefined, 'RootView (struct)\n   The root view.');
  assert.ok(prompt.includes('Draft explanation'));
  assert.ok(prompt.includes('The root view.'));
  assert.ok(prompt.includes('Build on it'));
});

test('buildPrompt injects the explanation mode when not standard', () => {
  const packet: ContextPacket = {
    task: 'explain_selection',
    filePath: '/repo/src/math.ts',
    languageId: 'typescript',
    selectedText: 'add(1, 2)',
    startLine: 5,
    endLine: 5,
    userPrompt: 'Explain the selected code.',
    privacyScope: 'selection_only',
  };
  assert.ok(buildPrompt(packet, [], 'beginner').includes('BEGINNER'));
  assert.ok(buildPrompt(packet, [], 'debug').includes('DEBUG'));
  // standard mode adds no mode section
  assert.ok(!buildPrompt(packet, [], 'standard').includes('Explanation mode'));
});

test('buildPrompt surfaces redaction notes when present', () => {
  const packet: ContextPacket = {
    task: 'explain_file',
    filePath: '/repo/src/app.ts',
    languageId: 'typescript',
    fullText: 'const a = 1;',
    userPrompt: 'Explain this file.',
    privacyScope: 'current_file',
    meta: { redactions: ['Redacted 1 secret line.'] },
  };
  const prompt = buildPrompt(packet);
  assert.ok(prompt.includes('Context notes'));
  assert.ok(prompt.includes('Redacted 1 secret line.'));
});
