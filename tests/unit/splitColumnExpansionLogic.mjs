import assert from 'node:assert/strict';
import { buildExpandedMultiValueTable } from '../../table/virtual-table/splitColumnExpansion.js';

const rawTableData = {
  headers: ['Title', 'Marc Field', 'Branch'],
  rows: [
    ['One', 'A\x1FB\x1FC', 'Main'],
    ['Two', 'D\x1FE', 'East'],
    ['Three', '', 'West']
  ],
  columnMap: new Map([
    ['Title', 0],
    ['Marc Field', 1],
    ['Branch', 2]
  ])
};

const expanded = buildExpandedMultiValueTable(rawTableData);

assert.deepEqual(expanded.headers, ['Title', 'Marc Field 1', 'Marc Field 2', 'Marc Field 3', 'Branch']);
assert.deepEqual(expanded.rows, [
  ['One', 'A', 'B', 'C', 'Main'],
  ['Two', 'D', 'E', '', 'East'],
  ['Three', '', '', '', 'West']
]);
assert.deepEqual(Array.from(expanded.columnMap.entries()), [
  ['Title', 0],
  ['Marc Field 1', 1],
  ['Marc Field 2', 2],
  ['Marc Field 3', 3],
  ['Branch', 4]
]);

const unsplit = buildExpandedMultiValueTable({
  headers: ['Title'],
  rows: [['Only']],
  columnMap: new Map([['Title', 0]])
});

assert.deepEqual(unsplit.headers, ['Title']);
assert.deepEqual(unsplit.rows, [['Only']]);
assert.notEqual(unsplit.rows[0], rawTableData.rows[0]);

console.log('Split column expansion logic tests passed');
