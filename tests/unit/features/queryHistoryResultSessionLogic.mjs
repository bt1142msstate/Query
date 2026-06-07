import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import test from 'node:test';
import {
  OPENED_HISTORY_RESULT_STORAGE_KEY,
  OPENED_HISTORY_RESULT_URL_PARAM,
  forgetOpenedHistoryResult,
  hasLimitedSharedFormUrl,
  hasSharedFormUrl,
  readOpenedHistoryResultQueryIdFromUrl,
  readOpenedHistoryResult,
  rememberOpenedHistoryResult,
  shouldRestoreOpenedHistoryResult
} from '../../../src/features/history/results/queryHistoryResultSession.js';

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

function encodeFormSpecForUrl(spec) {
  return Buffer.from(JSON.stringify(spec), 'utf8')
    .toString('base64')
    .replace(/\+/gu, '-')
    .replace(/\//gu, '_')
    .replace(/=+$/gu, '');
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

test('query history result session skips limited shared form URLs only', () => {
  const storage = createMemoryStorage();
  rememberOpenedHistoryResult('query-123', { storage });

  assert.equal(hasSharedFormUrl({ search: '?form=abc&limited=1' }), true);
  assert.equal(hasSharedFormUrl({ search: '?form=abc' }), true);
  assert.equal(hasLimitedSharedFormUrl({ search: '?form=abc&limited=1' }), true);
  assert.equal(hasLimitedSharedFormUrl({ search: '?form=abc&limited=0' }), false);
  assert.equal(hasLimitedSharedFormUrl({ search: '?form=abc' }), false);
  assert.equal(hasLimitedSharedFormUrl({ search: '?form=abc&mode=limited' }), true);
  assert.equal(hasSharedFormUrl({ search: '?limited=1' }), false);
  assert.equal(readOpenedHistoryResultQueryIdFromUrl({ search: '?result=query-456' }), 'query-456');
  assert.equal(shouldRestoreOpenedHistoryResult({
    location: { search: '?form=abc&limited=1' },
    storage
  }), false);
  assert.equal(shouldRestoreOpenedHistoryResult({
    location: { search: '?form=abc' },
    storage
  }), true);
  assert.equal(shouldRestoreOpenedHistoryResult({
    location: { search: '?form=abc&limited=1&result=query-456' },
    storage: createMemoryStorage()
  }), true);
  assert.equal(readOpenedHistoryResult({
    location: { search: '?form=abc&limited=1&result=query-456' },
    storage
  }).source, 'url');
});

test('query history result session can sync the result id into the browser url', () => {
  const storage = createMemoryStorage();
  const replacements = [];
  const history = {
    replaceState(_state, _title, url) {
      replacements.push(url);
    }
  };

  assert.equal(rememberOpenedHistoryResult('query-123', {
    history,
    storage,
    updateUrl: true,
    url: 'https://example.test/index.html?form=abc'
  }), true);
  const rememberedUrl = new URL(replacements.at(-1));
  assert.equal(rememberedUrl.searchParams.get(OPENED_HISTORY_RESULT_URL_PARAM), 'query-123');
  assert.equal(rememberedUrl.searchParams.get('form'), 'abc');

  assert.equal(rememberOpenedHistoryResult('query-456', {
    history,
    storage,
    updateUrl: true,
    url: 'https://example.test/index.html?mode=bubbles&stale=1'
  }), true);
  const resultOnlyUrl = new URL(replacements.at(-1));
  assert.equal(resultOnlyUrl.searchParams.get(OPENED_HISTORY_RESULT_URL_PARAM), 'query-456');
  assert.equal(resultOnlyUrl.searchParams.has('mode'), false);
  assert.equal(resultOnlyUrl.searchParams.has('stale'), false);

  const encodedFormSpec = encodeFormSpecForUrl({
    columns: ['Title'],
    inputs: [
      { key: 'branch', field: 'Branch', operator: 'equals' }
    ],
    lockedFilters: [],
    limitedView: true
  });
  assert.equal(rememberOpenedHistoryResult('query-789', {
    history,
    storage,
    updateUrl: true,
    url: `https://example.test/index.html?form=${encodedFormSpec}&mode=limited&view=limited&limitedView=1&limited=false&branch=Main&stale=1`
  }), true);
  const canonicalFormResultUrl = new URL(replacements.at(-1));
  assert.equal(canonicalFormResultUrl.searchParams.get(OPENED_HISTORY_RESULT_URL_PARAM), 'query-789');
  assert.equal(canonicalFormResultUrl.searchParams.has('form'), true);
  assert.equal(canonicalFormResultUrl.searchParams.get('branch'), 'Main');
  assert.equal(canonicalFormResultUrl.searchParams.get('limited'), '1');
  assert.equal(canonicalFormResultUrl.searchParams.has('mode'), false);
  assert.equal(canonicalFormResultUrl.searchParams.has('view'), false);
  assert.equal(canonicalFormResultUrl.searchParams.has('limitedView'), false);
  assert.equal(canonicalFormResultUrl.searchParams.has('stale'), false);

  assert.equal(forgetOpenedHistoryResult({
    clearUrl: true,
    history,
    storage,
    url: rememberedUrl.toString()
  }), true);
  const clearedUrl = new URL(replacements.at(-1));
  assert.equal(clearedUrl.searchParams.has(OPENED_HISTORY_RESULT_URL_PARAM), false);
  assert.equal(clearedUrl.searchParams.get('form'), 'abc');
});
