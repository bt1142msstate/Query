import assert from 'node:assert/strict';
import test from 'node:test';
import {
  OPENED_HISTORY_RESULT_STORAGE_KEY,
  forgetOpenedHistoryResult,
  hasSharedFormUrl,
  readOpenedHistoryResult,
  rememberOpenedHistoryResult,
  shouldRestoreOpenedHistoryResult
} from '../../src/features/history/queryHistoryResultSession.js';

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    removeItem(key) {
      values.delete(key);
    },
    setItem(key, value) {
      values.set(key, String(value));
    }
  };
}

test('query history result session remembers and clears the last opened result id', () => {
  const storage = createMemoryStorage();

  assert.equal(rememberOpenedHistoryResult('  query-123  ', { storage }), true);
  assert.equal(JSON.parse(storage.getItem(OPENED_HISTORY_RESULT_STORAGE_KEY)).queryId, 'query-123');
  assert.deepEqual(readOpenedHistoryResult({ storage }).queryId, 'query-123');
  assert.equal(shouldRestoreOpenedHistoryResult({
    location: { search: '' },
    storage
  }), true);

  assert.equal(forgetOpenedHistoryResult({ storage }), true);
  assert.equal(readOpenedHistoryResult({ storage }), null);
});

test('query history result session skips shared form URLs', () => {
  const storage = createMemoryStorage();
  rememberOpenedHistoryResult('query-123', { storage });

  assert.equal(hasSharedFormUrl({ search: '?form=abc&limited=1' }), true);
  assert.equal(hasSharedFormUrl({ search: '?limited=1' }), false);
  assert.equal(shouldRestoreOpenedHistoryResult({
    location: { search: '?form=abc&limited=1' },
    storage
  }), false);
});
