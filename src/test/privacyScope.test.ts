import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  effectivePrivacyScope,
  scopeIncludesRelatedFiles,
  scopeIncludesSystemContext,
} from '../privacy/privacyScope';

test('explicit narrow tasks stay narrow and broad tasks respect the configured cap', () => {
  assert.equal(effectivePrivacyScope('explain_selection', 'system_context'), 'selection_only');
  assert.equal(effectivePrivacyScope('explain_file', 'system_context'), 'current_file');
  assert.equal(effectivePrivacyScope('explain_system_role', 'current_file'), 'current_file');
  assert.equal(effectivePrivacyScope('explain_system_role', 'related_files'), 'related_files');
});

test('only related and system scopes permit retrieval', () => {
  assert.equal(scopeIncludesRelatedFiles('selection_only'), false);
  assert.equal(scopeIncludesRelatedFiles('current_file'), false);
  assert.equal(scopeIncludesRelatedFiles('related_files'), true);
  assert.equal(scopeIncludesSystemContext('related_files'), false);
  assert.equal(scopeIncludesSystemContext('system_context'), true);
});
