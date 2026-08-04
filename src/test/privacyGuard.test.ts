import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyGuards,
  isPathBlocked,
  redactSecrets,
  DEFAULT_PRIVACY_CONFIG,
  type PrivacyConfig,
} from '../privacy/privacyGuard';

const baseConfig: PrivacyConfig = { ...DEFAULT_PRIVACY_CONFIG };

test('isPathBlocked blocks .env and key files', () => {
  const globs = baseConfig.blockedFileGlobs;
  assert.equal(isPathBlocked('/repo/.env', globs), true);
  assert.equal(isPathBlocked('/repo/.env.local', globs), true);
  assert.equal(isPathBlocked('/repo/certs/server.pem', globs), true);
  assert.equal(isPathBlocked('/repo/secrets/db.txt', globs), true);
  assert.equal(isPathBlocked('/repo/src/index.ts', globs), false);
});

test('redactSecrets removes key-like assignments and tokens', () => {
  const input = [
    'const apiKey = "abcdef123456";',
    'const normal = 42;',
    'OPENAI_API_KEY=sk-abcdef0123456789abcdef',
  ].join('\n');
  const { text, count } = redactSecrets(input);
  assert.ok(count >= 2, `expected >=2 redactions, got ${count}`);
  assert.ok(!text.includes('abcdef123456'));
  assert.ok(!text.includes('sk-abcdef0123456789abcdef'));
  assert.ok(text.includes('const normal = 42;'));
});

test('redactSecrets removes complete multiline private-key blocks', () => {
  const input = [
    'const key = `-----BEGIN PRIVATE KEY-----',
    'FAKEBASE64BODYSHOULDNOTLEAK',
    '-----END PRIVATE KEY-----`;',
    'const safe = 1;',
  ].join('\n');
  const { text, count } = redactSecrets(input);
  assert.equal(count, 3);
  assert.ok(!text.includes('FAKEBASE64BODYSHOULDNOTLEAK'));
  assert.ok(!text.includes('END PRIVATE KEY'));
  assert.ok(text.includes('const safe = 1;'));
});

test('redactSecrets fails closed for an unterminated private-key block', () => {
  const input = '-----BEGIN OPENSSH PRIVATE KEY-----\nBODY\nstill secret';
  const { text } = redactSecrets(input);
  assert.ok(!text.includes('BODY'));
  assert.ok(!text.includes('still secret'));
});

test('applyGuards blocks a .env path entirely', () => {
  const result = applyGuards('/repo/.env', 'SECRET=1', baseConfig);
  assert.equal(result.blocked, true);
  assert.equal(result.text, '');
});

test('applyGuards truncates oversized content', () => {
  const big = 'a'.repeat(1000);
  const cfg: PrivacyConfig = { ...baseConfig, maxFileBytes: 100, redactSecrets: false };
  const result = applyGuards('/repo/src/big.ts', big, cfg);
  assert.equal(result.blocked, false);
  assert.equal(result.truncated, true);
  assert.ok(result.redactions.length >= 1);
});

test('applyGuards passes clean small files through unchanged', () => {
  const code = 'export const add = (a: number, b: number) => a + b;\n';
  const result = applyGuards('/repo/src/add.ts', code, baseConfig);
  assert.equal(result.blocked, false);
  assert.equal(result.truncated, false);
  assert.equal(result.text, code);
});
