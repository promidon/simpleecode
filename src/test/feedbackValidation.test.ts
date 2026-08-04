import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isAllowedFeedbackEndpoint } from '../feedback/feedbackValidation';

test('feedback requires HTTPS except for explicit localhost development', () => {
  assert.equal(isAllowedFeedbackEndpoint('https://example.com/feedback'), true);
  assert.equal(isAllowedFeedbackEndpoint('http://example.com/feedback'), false);
  assert.equal(isAllowedFeedbackEndpoint('http://localhost:8888/feedback'), true);
  assert.equal(isAllowedFeedbackEndpoint('file:///tmp/feedback'), false);
});
