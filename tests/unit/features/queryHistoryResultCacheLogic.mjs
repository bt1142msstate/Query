import assert from 'node:assert/strict';
import test from 'node:test';
import {
  HISTORY_RESULT_CACHE_SCHEMA_VERSION,
  buildTableRowsFromObjectRows,
  isUsableCachedHistoryResultSnapshot,
  normalizeCachedHistoryResultSnapshot
} from '../../../src/features/history/results/queryHistoryResultCache.js';

test('query history result cache normalizes object rows into table rows', () => {
  const snapshot = normalizeCachedHistoryResultSnapshot({
    queryId: ' cached-query ',
    query: {
      id: 'cached-query',
      name: 'Cached query',
      jsonConfig: { DesiredColumnOrder: ['Title', 'Branch'] }
    },
    headers: ['Title', 'Branch'],
    objectRows: [
      { Title: 'One', Branch: 'Main' },
      { Title: 'Two', Branch: null }
    ]
  });

  assert.equal(snapshot.queryId, 'cached-query');
  assert.equal(snapshot.version, HISTORY_RESULT_CACHE_SCHEMA_VERSION);
  assert.deepEqual(snapshot.rows, [
    ['One', 'Main'],
    ['Two', '']
  ]);
  assert.equal(snapshot.query.resultCount, 2);
  assert.equal(isUsableCachedHistoryResultSnapshot(snapshot, 'cached-query'), true);
});

test('query history result cache preserves result view state', () => {
  const snapshot = normalizeCachedHistoryResultSnapshot({
    queryId: 'cached-query',
    query: {
      id: 'cached-query',
      jsonConfig: { DesiredColumnOrder: ['Title', 'Branch', 'Status'] }
    },
    headers: ['Title', 'Branch', 'Status'],
    rows: [['One', 'Main', 'Open']],
    viewState: {
      displayedFields: ['Status', 'Title'],
      fieldSearch: 'status',
      postFilters: {
        Status: {
          logic: 'all',
          filters: [{ cond: 'equals', val: 'Open' }]
        }
      },
      splitColumns: true
    }
  });

  assert.deepEqual(snapshot.viewState, {
    version: 1,
    displayedFields: ['Status', 'Title'],
    fieldSearch: 'status',
    postFilters: {
      Status: {
        logic: 'all',
        filters: [{ cond: 'equals', val: 'Open' }]
      }
    },
    splitColumns: true
  });
});

test('query history result cache rejects stale or malformed snapshots', () => {
  const snapshot = normalizeCachedHistoryResultSnapshot({
    queryId: 'cached-query',
    query: { id: 'cached-query', jsonConfig: { DesiredColumnOrder: ['Title'] } },
    headers: ['Title'],
    rows: [['One']]
  });

  assert.equal(isUsableCachedHistoryResultSnapshot(snapshot, 'other-query'), false);
  assert.equal(isUsableCachedHistoryResultSnapshot({ ...snapshot, version: 0 }, 'cached-query'), false);
  assert.equal(normalizeCachedHistoryResultSnapshot({ queryId: 'x', headers: [], rows: [] }), null);
});

test('query history result cache preserves header order when building table rows', () => {
  assert.deepEqual(
    buildTableRowsFromObjectRows(['B', 'A'], [{ A: 'first', B: 'second' }]),
    [['second', 'first']]
  );
});
