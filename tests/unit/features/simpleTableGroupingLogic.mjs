import assert from 'node:assert/strict';
import test from 'node:test';
import {
  concatenateTableGroups,
  expandTableRowsIntoColumns
} from '../../../src/features/table/virtual-table/simpleTableGrouping.js';

test('simple table grouping helpers expand duplicate columns', () => {
  const rawTable = [
    ['Branch', 'Title', 'Copies'],
    ['Main', 'Alpha', 10],
    ['Main', 'Beta', 7],
    ['West', 'Delta', 20]
  ];
  const fieldIndexMap = new Map(rawTable[0].map((header, index) => [header, index]));

  const grouped = expandTableRowsIntoColumns({
    allowDuplicateFields: new Set(['Title']),
    fieldIndexMap,
    getOrdinal: value => `${value}nd`,
    groupByField: 'Branch',
    rawTable,
    tableColumnTypes: ['string', 'string', 'int']
  });

  assert.deepEqual(grouped.rawTable, [
    ['Branch', 'Title', '2nd Title', 'Copies'],
    ['Main', 'Alpha', 'Beta', '10'],
    ['West', 'Delta', '', '20']
  ]);
  assert.deepEqual(grouped.tableColumnTypes, ['string', 'string', 'string', 'int']);
});

test('simple table grouping helpers concatenate without changing untouched typed cells', () => {
  const rawTable = [
    ['Branch', 'Title', 'Copies'],
    ['Main', 'Alpha', 10],
    ['Main', 'Beta', 7],
    ['West', 'Delta', 20]
  ];
  const fieldIndexMap = new Map(rawTable[0].map((header, index) => [header, index]));

  const grouped = concatenateTableGroups({
    allowDuplicateFields: new Set(['Title']),
    fieldIndexMap,
    groupByField: 'Branch',
    rawTable
  });

  assert.deepEqual(grouped.rawTable, [
    ['Branch', 'Title', 'Copies'],
    ['Main', 'Alpha, Beta', '10, 7'],
    ['West', 'Delta', 20]
  ]);
});
