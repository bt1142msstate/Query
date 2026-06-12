import assert from 'node:assert/strict';
import {
  WORKBOOK_DETAILS_COLUMNS,
  WORKBOOK_DETAILS_SHEET_NAME,
  buildWorkbookDetailsRows,
  buildWorkbookDetailsRowsFromRuntime,
  ensureWorkbookGenerationTimeRow,
  formatWorkbookGenerationDuration,
  getWorkbookDetailsColumns
} from '../../../src/features/table/export/workbookDetails.js';
import test from 'node:test';

test('workbook details', async () => {
  const rows = buildWorkbookDetailsRows({
    activeFilters: {
      Branch: { filters: [{ cond: 'equals', val: 'Main' }] },
      'Checkout Date': { filters: [{ cond: 'between', val: '1/1/2026|1/31/2026' }] }
    },
    config: {
      groupField: 'Branch',
      mode: 'grouped'
    },
    displayedFields: ['Title', 'Branch', 'Checkout Date'],
    exportedAt: new Date('2026-05-19T15:00:00Z'),
    postFilters: {
      Title: {
        logic: 'any',
        filters: [{ cond: 'contains', val: 'history' }]
      }
    },
    postFilterStats: {
      duplicateRowsCollapsed: 2,
      filteredRows: 8,
      postFilteredRows: 10,
      totalRows: 12
    },
    query: {
      endTime: '2026-05-19T15:00:35Z',
      id: 'query-123',
      startTime: '2026-05-19T15:00:00Z',
      status: 'complete'
    },
    rowCount: 8,
    splitMultiValues: true,
    tableName: 'Audit Export'
  });

  assert.equal(WORKBOOK_DETAILS_SHEET_NAME, 'Run Details');
  assert.deepEqual(getWorkbookDetailsColumns(), WORKBOOK_DETAILS_COLUMNS);
  assert.ok(rows.some(row => row.join('|') === 'Export|Workbook|Audit Export'));
  assert.ok(rows.some(row => row.join('|') === 'Export|Mode|Split into sheets'));
  assert.ok(rows.some(row => row.join('|') === 'Export|Workbook Generation Time|Calculating...'));
  assert.ok(rows.some(row => row.join('|') === 'Query|Query ID|query-123'));
  assert.ok(rows.some(row => row.join('|') === 'Query|Duration|35s'));
  assert.ok(rows.some(row => row.join('|') === 'Rows|Loaded Rows Before Post Filters|12'));
  assert.ok(rows.some(row => row.join('|') === 'Rows|Rows After Post Filters|10'));
  assert.ok(rows.some(row => row.join('|') === 'Rows|Duplicate Rows Collapsed|2'));
  assert.ok(rows.some(row => row.join('|') === 'Displayed Fields|2|Branch'));
  assert.ok(rows.some(row => row.join('|') === 'Query Filters|Checkout Date|Between 1/1/2026 to 1/31/2026'));
  assert.ok(rows.some(row => row.join('|') === 'Post Filters|Title (ANY)|Contains history'));

  const runtimeRows = buildWorkbookDetailsRowsFromRuntime({
    config: { mode: 'single' },
    queryStateReaders: {
      getActiveFilters: () => ({ Patron: { filters: [{ cond: 'does_not_equal', val: 'Blocked' }] } }),
      getLifecycleState: () => ({ currentQueryId: 'query-456' })
    },
    services: {
      getHistoryQueryById: () => ({ id: 'query-456', startTime: 'bad-date' }),
      getPostFilterState: () => ({}),
      getPostFilterStats: () => null
    },
    splitMultiValues: false,
    state: {
      rowCount: 3,
      sourceData: { displayedFields: ['Patron'] },
      tableName: 'Runtime Export'
    }
  });

  assert.ok(runtimeRows.some(row => row.join('|') === 'Query|Duration|Unknown'));
  assert.ok(runtimeRows.some(row => row.join('|') === 'Query Filters|Patron|Does not equal Blocked'));
  assert.ok(runtimeRows.some(row => row.join('|') === 'Post Filters|Applied|None'));

  assert.deepEqual(
    ensureWorkbookGenerationTimeRow([['Export', 'Mode', 'One sheet']]),
    [
      ['Export', 'Mode', 'One sheet'],
      ['Export', 'Workbook Generation Time', 'Calculating...']
    ]
  );
  assert.equal(formatWorkbookGenerationDuration(421), '421 ms');
  assert.equal(formatWorkbookGenerationDuration(1250), '1.3 sec');
});
