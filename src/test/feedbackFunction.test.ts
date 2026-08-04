import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'module';

const requireForTest = createRequire(__filename);
const feedback = requireForTest('../../netlify/functions/feedback.js') as {
  handler(event: {
    httpMethod: string;
    headers: Record<string, string>;
    body?: string;
  }): Promise<{ statusCode: number; body: string }>;
};

test('feedback function rejects wrong methods and unauthorized requests', async () => {
  const old = process.env.FEEDBACK_TOKEN;
  process.env.FEEDBACK_TOKEN = 'expected-token';
  try {
    const method = await feedback.handler({ httpMethod: 'GET', headers: {} });
    assert.equal(method.statusCode, 405);
    const unauthorized = await feedback.handler({
      httpMethod: 'POST',
      headers: { 'x-simpleecode-token': 'wrong-token' },
      body: '{}',
    });
    assert.equal(unauthorized.statusCode, 401);
  } finally {
    if (old === undefined) {
      delete process.env.FEEDBACK_TOKEN;
    } else {
      process.env.FEEDBACK_TOKEN = old;
    }
  }
});
