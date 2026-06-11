import assert from 'node:assert/strict';
import test from 'node:test';

test('virtual table duplicate collapse', async () => {
  const {
    buildDuplicateCollapseToastMessage,
    collapseDuplicateProjectedRows
  } = await import('../../../src/features/table/virtual-table/virtualTableDuplicateCollapse.js');

  const rows = [
    ['Same title', 'Main', 'item-1'],
    ['Same title', 'Main', 'item-2'],
    ['Different title', 'East', 'item-3'],
    ['Same title', 'Main', 'item-4']
  ];
  const columnMap = new Map([
    ['Title', 0],
    ['Branch', 1],
    ['Item ID', 2]
  ]);

  const collapsedWithoutItemId = collapseDuplicateProjectedRows({
    rows,
    displayedFields: ['Title', 'Branch'],
    columnMap
  });
  assert.equal(collapsedWithoutItemId.sourceRows, 4);
  assert.equal(collapsedWithoutItemId.uniqueRows, 2);
  assert.equal(collapsedWithoutItemId.collapsedRows, 2);
  assert.deepEqual(collapsedWithoutItemId.rows, [
    ['Same title', 'Main', 'item-1'],
    ['Different title', 'East', 'item-3']
  ]);

  const collapsedWithItemId = collapseDuplicateProjectedRows({
    rows,
    displayedFields: ['Title', 'Branch', 'Item ID'],
    columnMap
  });
  assert.equal(collapsedWithItemId.uniqueRows, 4);
  assert.equal(collapsedWithItemId.collapsedRows, 0);
  assert.equal(collapsedWithItemId.rows, rows);

  const multiValueRows = [
    ['Alpha', ['A', 'B']],
    ['Alpha', ['A', 'B']],
    ['Alpha', ['B', 'A']]
  ];
  const multiValueResult = collapseDuplicateProjectedRows({
    rows: multiValueRows,
    displayedFields: ['Title', 'Notes'],
    columnMap: new Map([
      ['Title', 0],
      ['Notes', 1]
    ])
  });
  assert.equal(multiValueResult.uniqueRows, 2);
  assert.deepEqual(multiValueResult.rows, [multiValueRows[0], multiValueRows[2]]);
  assert.equal(
    buildDuplicateCollapseToastMessage({
      duplicateRowsCollapsed: 2,
      uniqueRows: 2
    }),
    '2 duplicate rows collapsed for the current columns. Showing 2 unique rows.'
  );
});
