import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildOutboundEnvelope } from '../privacy/OutboundEnvelope';
import type { ContextPacket } from '../context/ContextPacket';

test('outbound envelope measures the exact prompt and aggregates privacy notes', () => {
  const packet: ContextPacket = {
    task: 'explain_system_role',
    filePath: '/repo/src/app.ts',
    fullText: 'const key = «redacted by SimpleeCode»;',
    userPrompt: 'Explain this system.',
    privacyScope: 'related_files',
    meta: { redactions: ['Redacted focal secret.'] },
  };
  const prompt = 'complete prompt ✓';
  const envelope = buildOutboundEnvelope(
    packet,
    prompt,
    [
      {
        sourceType: 'file',
        path: 'src/related.ts',
        reasonIncluded: 'Imported',
        content: 'safe',
        redactions: ['Redacted related secret.'],
        truncated: true,
      },
    ],
    'test channel',
  );
  assert.equal(envelope.prompt, prompt);
  assert.equal(envelope.task, 'explain_system_role');
  assert.equal(envelope.totalBytes, Buffer.byteLength(prompt, 'utf8'));
  assert.equal(envelope.truncated, true);
  assert.deepEqual(envelope.includedSources, ['/repo/src/app.ts', 'src/related.ts']);
  assert.deepEqual(envelope.redactions, [
    'Redacted focal secret.',
    'src/related.ts: Redacted related secret.',
  ]);
});

test('outbound envelope excludes retrieved metadata for a narrow scope', () => {
  const packet: ContextPacket = {
    task: 'explain_selection',
    filePath: '/repo/src/app.ts',
    selectedText: 'safe()',
    userPrompt: 'Explain this.',
    privacyScope: 'selection_only',
  };
  const envelope = buildOutboundEnvelope(
    packet,
    'prompt containing only safe()',
    [{
      sourceType: 'file',
      path: 'src/should-not-appear.ts',
      reasonIncluded: 'Imported',
      content: 'hidden',
      redactions: ['hidden note'],
      truncated: true,
    }],
    'test',
  );
  assert.deepEqual(envelope.includedSources, ['/repo/src/app.ts']);
  assert.deepEqual(envelope.redactions, []);
  assert.equal(envelope.truncated, false);
});
