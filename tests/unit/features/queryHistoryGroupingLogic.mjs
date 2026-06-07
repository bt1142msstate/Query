import assert from 'node:assert/strict';
import {
  groupHistoryQueries,
  queryMatchesHistorySearch
} from '../../../src/features/history/queryHistoryGrouping.js';
import { getHistorySortLabel } from '../../../src/features/history/view/queryHistoryControls.js';
import test from 'node:test';

test('query history grouping', async () => {
  const queries = [
    {
      id: '104',
      name: 'Running patrons',
      running: true,
      resultCount: 12,
      startTime: '2026-05-11T08:00:00Z',
      jsonConfig: { DesiredColumnOrder: ['User ID', 'Title'] }
    },
    {
      id: '103',
      name: 'Completed titles',
      status: 'complete',
      resultCount: 1200,
      startTime: '2026-05-11T07:00:00Z',
      endTime: '2026-05-11T07:10:00Z',
      jsonConfig: { DesiredColumnOrder: ['Title', 'Author'] }
    },
    {
      id: '102',
      name: 'Failed bills',
      failed: true,
      status: 'failed',
      resultCount: 0,
      startTime: '2026-05-11T06:00:00Z',
      endTime: '2026-05-11T06:45:00Z',
      error: 'Backend timeout',
      jsonConfig: { DesiredColumnOrder: ['Bill Count'] }
    },
    {
      id: '101',
      name: 'Cancelled items',
      cancelled: true,
      status: 'canceled',
      resultCount: null,
      startTime: '2026-05-11T05:00:00Z',
      cancelledTime: '2026-05-11T05:02:00Z',
      jsonConfig: { DesiredColumnOrder: ['Item ID'] }
    },
    {
      id: '100',
      name: 'Archive authors',
      status: 'complete',
      resultCount: 7,
      startTime: '2026-05-11T04:00:00Z',
      endTime: '2026-05-11T04:01:00Z',
      jsonConfig: { DesiredColumnOrder: ['Branch'] }
    }
  ];

  assert.equal(queryMatchesHistorySearch(queries[0], 'patrons'), true);
  assert.equal(queryMatchesHistorySearch(queries[0], 'title'), true);
  assert.equal(queryMatchesHistorySearch(queries[2], 'timeout'), false);
  assert.equal(queryMatchesHistorySearch(queries[2], 'timeout', { includeError: true }), true);

  const allGroups = groupHistoryQueries(queries);
  assert.equal(allGroups.totalCount, 5);
  assert.equal(allGroups.visibleCount, 5);
  assert.deepEqual(allGroups.counts, {
    running: 1,
    complete: 2,
    failed: 1,
    canceled: 1
  });
  assert.deepEqual(allGroups.running.map(query => query.id), ['104']);
  assert.deepEqual(allGroups.complete.map(query => query.id), ['103', '100']);
  assert.deepEqual(allGroups.failed.map(query => query.id), ['102']);
  assert.deepEqual(allGroups.canceled.map(query => query.id), ['101']);

  const titleGroups = groupHistoryQueries(queries, 'title');
  assert.equal(titleGroups.visibleCount, 2);
  assert.deepEqual(titleGroups.running.map(query => query.id), ['104']);
  assert.deepEqual(titleGroups.complete.map(query => query.id), ['103']);

  const errorGroups = groupHistoryQueries(queries, 'timeout');
  assert.equal(errorGroups.visibleCount, 1);
  assert.deepEqual(errorGroups.failed.map(query => query.id), ['102']);

  const completedGroups = groupHistoryQueries(queries, '', { statusFilter: 'complete' });
  assert.equal(completedGroups.visibleCount, 2);
  assert.deepEqual(completedGroups.complete.map(query => query.id), ['103', '100']);

  const hasRowsGroups = groupHistoryQueries(queries, '', { resultFilter: 'has_results' });
  assert.equal(hasRowsGroups.visibleCount, 3);
  assert.deepEqual(hasRowsGroups.running.map(query => query.id), ['104']);
  assert.deepEqual(hasRowsGroups.complete.map(query => query.id), ['103', '100']);

  const noRowsGroups = groupHistoryQueries(queries, '', { resultFilter: 'no_results' });
  assert.equal(noRowsGroups.visibleCount, 1);
  assert.deepEqual(noRowsGroups.failed.map(query => query.id), ['102']);

  const largeResultGroups = groupHistoryQueries(queries, '', { resultFilter: 'large_results' });
  assert.equal(largeResultGroups.visibleCount, 1);
  assert.deepEqual(largeResultGroups.complete.map(query => query.id), ['103']);

  const longDurationGroups = groupHistoryQueries(queries, '', {
    durationFilter: 'over_30m',
    now: '2026-05-11T08:30:00Z'
  });
  assert.equal(longDurationGroups.visibleCount, 2);
  assert.deepEqual(longDurationGroups.running.map(query => query.id), ['104']);
  assert.deepEqual(longDurationGroups.failed.map(query => query.id), ['102']);

  const resultSortedGroups = groupHistoryQueries(queries, '', { sortKey: 'most_results' });
  assert.deepEqual(resultSortedGroups.complete.map(query => query.id), ['103', '100']);
  assert.deepEqual(resultSortedGroups.running.map(query => query.id), ['104']);
  assert.deepEqual(resultSortedGroups.failed.map(query => query.id), ['102']);

  const nameSortedGroups = groupHistoryQueries(queries, '', { sortKey: 'name' });
  assert.deepEqual(nameSortedGroups.complete.map(query => query.id), ['100', '103']);
  assert.deepEqual(nameSortedGroups.failed.map(query => query.id), ['102']);
  assert.deepEqual(nameSortedGroups.running.map(query => query.id), ['104']);
  assert.equal(getHistorySortLabel({ sortKey: 'most_results' }), 'Most results');
});
