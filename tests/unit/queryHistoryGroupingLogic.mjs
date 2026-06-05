import assert from 'node:assert/strict';
import {
  groupHistoryQueries,
  queryMatchesHistorySearch
} from '../../history/queryHistoryGrouping.js';
import test from 'node:test';

test('query history grouping', async () => {
  const queries = [
    {
      id: '104',
      name: 'Running patrons',
      running: true,
      jsonConfig: { DesiredColumnOrder: ['User ID', 'Title'] }
    },
    {
      id: '103',
      name: 'Completed titles',
      status: 'complete',
      jsonConfig: { DesiredColumnOrder: ['Title', 'Author'] }
    },
    {
      id: '102',
      name: 'Failed bills',
      failed: true,
      error: 'Backend timeout',
      jsonConfig: { DesiredColumnOrder: ['Bill Count'] }
    },
    {
      id: '101',
      name: 'Cancelled items',
      cancelled: true,
      jsonConfig: { DesiredColumnOrder: ['Item ID'] }
    }
  ];

  assert.equal(queryMatchesHistorySearch(queries[0], 'patrons'), true);
  assert.equal(queryMatchesHistorySearch(queries[0], 'title'), true);
  assert.equal(queryMatchesHistorySearch(queries[2], 'timeout'), false);
  assert.equal(queryMatchesHistorySearch(queries[2], 'timeout', { includeError: true }), true);

  const allGroups = groupHistoryQueries(queries);
  assert.equal(allGroups.totalCount, 4);
  assert.equal(allGroups.visibleCount, 4);
  assert.deepEqual(allGroups.counts, {
    running: 1,
    complete: 1,
    failed: 1,
    canceled: 1
  });
  assert.deepEqual(allGroups.running.map(query => query.id), ['104']);
  assert.deepEqual(allGroups.complete.map(query => query.id), ['103']);
  assert.deepEqual(allGroups.failed.map(query => query.id), ['102']);
  assert.deepEqual(allGroups.canceled.map(query => query.id), ['101']);

  const titleGroups = groupHistoryQueries(queries, 'title');
  assert.equal(titleGroups.visibleCount, 2);
  assert.deepEqual(titleGroups.running.map(query => query.id), ['104']);
  assert.deepEqual(titleGroups.complete.map(query => query.id), ['103']);

  const errorGroups = groupHistoryQueries(queries, 'timeout');
  assert.equal(errorGroups.visibleCount, 1);
  assert.deepEqual(errorGroups.failed.map(query => query.id), ['102']);
});
