import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_ACCOUNT_API_URL,
  resolveAccountApiUrl
} from '../../../src/core/authApiUrl.js';

test('account requests use the sample endpoint only while demo mode is active', () => {
  assert.equal(
    resolveAccountApiUrl('https://example.test/demo-api'),
    'https://example.test/demo-api'
  );
  assert.equal(
    resolveAccountApiUrl('https://example.test/query-api'),
    DEFAULT_ACCOUNT_API_URL
  );
});
