import assert from 'node:assert/strict';
import test from 'node:test';
import { buildExpandedMultiValueTable, getLazyExpandedRowsSourceRows } from '../../../src/features/table/virtual-table/splitColumnExpansion.js';
import { sortRowsByColumn } from '../../../src/features/table/virtual-table/tableSort.js';

test('table sort handles raw values and empty placement', () => {
  const rows = [
    ['Beta', '2', '20240103'],
    ['', '10', '20240101'],
    ['Alpha', '1', '20240102']
  ];

  sortRowsByColumn(rows, 0, 'string', 'asc');
  assert.deepEqual(rows.map(row => row[0]), ['Alpha', 'Beta', '']);

  sortRowsByColumn(rows, 1, 'number', 'desc');
  assert.deepEqual(rows.map(row => row[1]), ['10', '2', '1']);

  sortRowsByColumn(rows, 2, 'date', 'asc');
  assert.deepEqual(rows.map(row => row[2]), ['20240101', '20240102', '20240103']);
});

test('table sort uses lazy split source rows without materializing projections', () => {
  const rawTableData = {
    headers: ['Title', 'Public Note'],
    rows: [
      ['One', 'First\x1FZulu'],
      ['Two', 'Only'],
      ['Three', 'First\x1FAlpha']
    ],
    columnMap: new Map([
      ['Title', 0],
      ['Public Note', 1]
    ])
  };
  const split = buildExpandedMultiValueTable(rawTableData, { lazyRows: true });
  const sourceRows = getLazyExpandedRowsSourceRows(split.rows);

  sortRowsByColumn(split.rows, split.columnMap.get('Public Note 2'), 'string', 'asc');

  assert.equal(getLazyExpandedRowsSourceRows(split.rows), sourceRows);
  assert.deepEqual(split.rows.map(row => row[0]), ['Three', 'One', 'Two']);
  assert.deepEqual(rawTableData.rows.map(row => row[0]), ['Three', 'One', 'Two']);
  assert.deepEqual(split.rows.map(row => row[split.columnMap.get('Public Note 2')]), ['Alpha', 'Zulu', '']);
});

test('table sort handles filtered lazy split row arrays', () => {
  const rawTableData = {
    headers: ['Title', 'Public Note'],
    rows: [
      ['One', 'First\x1FZulu'],
      ['Two', 'Only'],
      ['Three', 'First\x1FAlpha']
    ],
    columnMap: new Map([
      ['Title', 0],
      ['Public Note', 1]
    ])
  };
  const split = buildExpandedMultiValueTable(rawTableData, { lazyRows: true });
  const filteredRows = [split.rows[0], split.rows[2]];

  sortRowsByColumn(filteredRows, split.columnMap.get('Public Note 2'), 'string', 'asc');

  assert.deepEqual(filteredRows.map(row => row[0]), ['Three', 'One']);
  assert.deepEqual(rawTableData.rows.map(row => row[0]), ['One', 'Two', 'Three']);
});
