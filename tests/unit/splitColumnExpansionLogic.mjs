import assert from 'node:assert/strict';
import { buildExpandedMultiValueTable } from '../../src/features/table/virtual-table/splitColumnExpansion.js';
import test from 'node:test';

test('split column expansion', async () => {
  const rawTableData = {
    headers: ['Title', 'Public Note', 'MARC 590', 'Branch'],
    rows: [
      [
        'One',
        'First public note\x1FSecond public note',
        '$a MSU -- Ulysses S. Grant Association.\x1F$a MSU -- Gift of Marcia Ewing-Current.\x1F$a MSU -- Richard Current Collection.\x1F$a DSU-180442',
        'Main'
      ],
      ['Two', 'Only public note', '$a Single local note', 'East'],
      ['Three', '', '', 'West']
    ],
    columnMap: new Map([
      ['Title', 0],
      ['Public Note', 1],
      ['MARC 590', 2],
      ['Branch', 3]
    ])
  };

  const expanded = buildExpandedMultiValueTable(rawTableData);

  assert.deepEqual(expanded.headers, [
    'Title',
    'Public Note 1',
    'Public Note 2',
    'MARC 590 1',
    'MARC 590 2',
    'MARC 590 3',
    'MARC 590 4',
    'Branch'
  ]);
  assert.deepEqual(expanded.rows, [
    [
      'One',
      'First public note',
      'Second public note',
      '$a MSU -- Ulysses S. Grant Association.',
      '$a MSU -- Gift of Marcia Ewing-Current.',
      '$a MSU -- Richard Current Collection.',
      '$a DSU-180442',
      'Main'
    ],
    ['Two', 'Only public note', '', '$a Single local note', '', '', '', 'East'],
    ['Three', '', '', '', '', '', '', 'West']
  ]);
  assert.deepEqual(Array.from(expanded.columnMap.entries()), [
    ['Title', 0],
    ['Public Note 1', 1],
    ['Public Note 2', 2],
    ['MARC 590 1', 3],
    ['MARC 590 2', 4],
    ['MARC 590 3', 5],
    ['MARC 590 4', 6],
    ['Branch', 7]
  ]);

  const unsplit = buildExpandedMultiValueTable({
    headers: ['Title'],
    rows: [['Only']],
    columnMap: new Map([['Title', 0]])
  });

  assert.deepEqual(unsplit.headers, ['Title']);
  assert.deepEqual(unsplit.rows, [['Only']]);
  assert.notEqual(unsplit.rows[0], rawTableData.rows[0]);
});
