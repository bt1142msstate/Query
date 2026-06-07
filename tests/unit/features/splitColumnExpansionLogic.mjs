import assert from 'node:assert/strict';
import {
  buildExpandedMultiValueTable,
  getLazyExpandedRowSourceValue,
  getLazyExpandedRowsSourceRows,
  getMultiValueTableSummary,
  isLazyExpandedRow,
  materializeExpandedRow
} from '../../../src/features/table/virtual-table/splitColumnExpansion.js';
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
  assert.deepEqual(Array.from(expanded.splitColumnGroups.entries()), [
    ['Public Note', ['Public Note 1', 'Public Note 2']],
    ['MARC 590', ['MARC 590 1', 'MARC 590 2', 'MARC 590 3', 'MARC 590 4']]
  ]);
  assert.deepEqual(Array.from(expanded.splitColumnParent.entries()), [
    ['Public Note 1', 'Public Note'],
    ['Public Note 2', 'Public Note'],
    ['MARC 590 1', 'MARC 590'],
    ['MARC 590 2', 'MARC 590'],
    ['MARC 590 3', 'MARC 590'],
    ['MARC 590 4', 'MARC 590']
  ]);
  assert.deepEqual(Array.from(expanded.splitColumnSourceMap.entries()), [
    ['Public Note', 1],
    ['MARC 590', 2]
  ]);
  assert.deepEqual(getMultiValueTableSummary(rawTableData), {
    eligible: true,
    columnCount: 2,
    valueCount: 4
  });

  const lazyExpanded = buildExpandedMultiValueTable(rawTableData, { lazyRows: true });
  assert.deepEqual(lazyExpanded.headers, expanded.headers);
  assert.equal(getLazyExpandedRowsSourceRows(lazyExpanded.rows), rawTableData.rows);
  assert.equal(Array.isArray(lazyExpanded.rows[0]), true);
  assert.equal(isLazyExpandedRow(lazyExpanded.rows[0]), true);
  assert.equal(lazyExpanded.rows[0].length, expanded.headers.length);
  assert.equal(lazyExpanded.rows[0][1], 'First public note');
  assert.equal(lazyExpanded.rows[0][6], '$a DSU-180442');
  assert.equal(getLazyExpandedRowSourceValue(lazyExpanded.rows[0], 1), rawTableData.rows[0][1]);
  assert.deepEqual([...lazyExpanded.rows[0]], expanded.rows[0]);
  assert.deepEqual(lazyExpanded.rows.map(row => row[0]), ['One', 'Two', 'Three']);
  assert.deepEqual(lazyExpanded.rows.filter(row => row[0] !== 'Two').map(row => row[0]), ['One', 'Three']);
  assert.deepEqual(Object.keys(lazyExpanded.rows[0]), ['0', '1', '2', '3', '4', '5', '6', '7']);
  assert.deepEqual(materializeExpandedRow(lazyExpanded.rows[1]), expanded.rows[1]);
  assert.equal(materializeExpandedRow(expanded.rows[1]), expanded.rows[1]);

  const sortableLazyExpanded = buildExpandedMultiValueTable(rawTableData, { lazyRows: true });
  sortableLazyExpanded.rows.sort((left, right) => String(left[0]).localeCompare(String(right[0]), undefined, { numeric: true }));
  assert.equal(getLazyExpandedRowsSourceRows(sortableLazyExpanded.rows), null);
  assert.deepEqual(sortableLazyExpanded.rows.map(row => row[0]), ['One', 'Three', 'Two']);
  assert.equal(sortableLazyExpanded.rows[0][1], 'First public note');

  const unsplit = buildExpandedMultiValueTable({
    headers: ['Title'],
    rows: [['Only']],
    columnMap: new Map([['Title', 0]])
  });

  assert.deepEqual(unsplit.headers, ['Title']);
  assert.deepEqual(unsplit.rows, [['Only']]);
  assert.notEqual(unsplit.rows[0], rawTableData.rows[0]);

  const lazyUnsplit = buildExpandedMultiValueTable({
    headers: ['Title'],
    rows: [['Only']],
    columnMap: new Map([['Title', 0]])
  }, { lazyRows: true });
  assert.deepEqual(lazyUnsplit.headers, ['Title']);
  assert.deepEqual(lazyUnsplit.rows, [['Only']]);
  assert.equal(lazyUnsplit.rows[0][0], 'Only');
  assert.deepEqual(getMultiValueTableSummary({
    headers: ['Title', 'Notes'],
    rows: [
      ['Only', ['First', 'Second', '  ']],
      ['Other', 'Solo']
    ],
    columnMap: new Map([
      ['Title', 0],
      ['Notes', 1]
    ])
  }), {
    eligible: true,
    columnCount: 1,
    valueCount: 1
  });

  const expandedJsonArrays = buildExpandedMultiValueTable({
    headers: ['Title', 'Notes'],
    rows: [
      ['Only', ['First', 'Second']],
      ['Other', 'Solo']
    ],
    columnMap: new Map([
      ['Title', 0],
      ['Notes', 1]
    ])
  });
  assert.deepEqual(expandedJsonArrays.headers, ['Title', 'Notes 1', 'Notes 2']);
  assert.deepEqual(expandedJsonArrays.rows, [
    ['Only', 'First', 'Second'],
    ['Other', 'Solo', '']
  ]);
});
