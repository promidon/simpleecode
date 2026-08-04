import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAgentEnvironment } from '../acp/agentEnvironment';

test('ACP environment excludes secrets unless the user explicitly allows a name', () => {
  const source = {
    PATH: '/bin',
    HOME: '/home/test',
    API_SECRET: 'hidden',
    EXPLICIT_VALUE: 'allowed',
  };
  const minimal = buildAgentEnvironment([], source);
  assert.equal(minimal.PATH, '/bin');
  assert.equal(minimal.HOME, '/home/test');
  assert.equal(minimal.API_SECRET, undefined);
  const explicit = buildAgentEnvironment(['EXPLICIT_VALUE'], source);
  assert.equal(explicit.EXPLICIT_VALUE, 'allowed');
});
