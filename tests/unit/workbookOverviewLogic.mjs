import assert from 'node:assert/strict';
import {
  OVERVIEW_PERCENT_HEADER,
  OVERVIEW_ROW_HEADER,
  OVERVIEW_TOTAL_LABEL,
  buildOverviewRows,
  getOverviewColumns,
  getOverviewTotalCount
} from '../../table/export/workbookOverview.js';

const groups = [
  { label: 'Main', rows: [{}, {}, {}] },
  { count: 1, label: 'East' }
];

assert.deepEqual(getOverviewColumns('Branch'), ['Branch', OVERVIEW_ROW_HEADER, OVERVIEW_PERCENT_HEADER]);
assert.equal(getOverviewTotalCount(groups), 4);
assert.deepEqual(buildOverviewRows(groups), [
  ['Main', 3, 0.75],
  ['East', 1, 0.25],
  [OVERVIEW_TOTAL_LABEL, 4, 1]
]);
assert.deepEqual(buildOverviewRows([{ count: 0, label: 'Blank' }], 0), [
  ['Blank', 0, 0],
  [OVERVIEW_TOTAL_LABEL, 0, 0]
]);

console.log('Workbook overview logic tests passed');
