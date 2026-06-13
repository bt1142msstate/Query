import assert from 'node:assert/strict';
import test from 'node:test';

test('virtual table duplicate collapse', async () => {
  const {
    buildVirtualTableProjection,
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
  assert.equal(collapsedWithoutItemId.duplicateRowGroups.length, 2);
  assert.equal(collapsedWithoutItemId.duplicateRowGroups[0].matchingRowCount, 3);
  assert.equal(collapsedWithoutItemId.duplicateRowGroups[0].collapsedRowCount, 2);
  assert.deepEqual(collapsedWithoutItemId.duplicateRowGroups[0].sourceRowIndexes, [0, 1, 3]);
  assert.deepEqual(collapsedWithoutItemId.duplicateRowGroups[0].displayedFields, ['Title', 'Branch']);
  assert.deepEqual(collapsedWithoutItemId.duplicateRowGroups[0].rows, [
    ['Same title', 'Main', 'item-1'],
    ['Same title', 'Main', 'item-2'],
    ['Same title', 'Main', 'item-4']
  ]);
  assert.equal(collapsedWithoutItemId.duplicateRowGroups[1].matchingRowCount, 1);

  const collapsedWithItemId = collapseDuplicateProjectedRows({
    rows,
    displayedFields: ['Title', 'Branch', 'Item ID'],
    columnMap
  });
  assert.equal(collapsedWithItemId.uniqueRows, 4);
  assert.equal(collapsedWithItemId.collapsedRows, 0);
  assert.equal(collapsedWithItemId.rows, rows);
  assert.deepEqual(collapsedWithItemId.duplicateRowGroups, []);

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
  assert.equal(multiValueResult.duplicateRowGroups[0].matchingRowCount, 2);

  const structuredRows = [
    ['Alpha', { note: ['A', 'B'], rank: 1 }],
    ['Alpha', { rank: 1, note: ['A', 'B'] }],
    ['Alpha', { note: ['B', 'A'], rank: 1 }]
  ];
  const structuredResult = collapseDuplicateProjectedRows({
    rows: structuredRows,
    displayedFields: ['Title', 'Structured Note'],
    columnMap: new Map([
      ['Title', 0],
      ['Structured Note', 1]
    ])
  });
  assert.equal(structuredResult.uniqueRows, 2);
  assert.deepEqual(structuredResult.rows, [structuredRows[0], structuredRows[2]]);
  assert.equal(structuredResult.duplicateRowGroups[0].matchingRowCount, 2);

  assert.equal(
    buildDuplicateCollapseToastMessage({
      duplicateRowsCollapsed: 2,
      uniqueRows: 2
    }),
    '2 duplicate rows collapsed for the current columns. Showing 2 unique rows.'
  );

  const uncollapsedProjection = buildVirtualTableProjection({
    baseViewData: { headers: ['Title', 'Branch'], rows, columnMap },
    displayedFields: ['Title', 'Branch'],
    filteredRows: rows,
    collapseDuplicates: false
  });
  assert.equal(uncollapsedProjection.stats.duplicateRowsCollapsed, 0);
  assert.equal(uncollapsedProjection.stats.uniqueRows, 4);
  assert.equal(uncollapsedProjection.stats.postFilteredRows, 4);
  assert.equal(uncollapsedProjection.tableData.rows, rows);
  assert.deepEqual(uncollapsedProjection.tableData.duplicateRowGroups, []);

  const collapsedProjection = buildVirtualTableProjection({
    baseViewData: { headers: ['Title', 'Branch', 'Item ID'], rows, columnMap },
    displayedFields: ['Title', 'Branch'],
    filteredRows: rows,
    collapseDuplicates: true
  });
  assert.equal(collapsedProjection.tableData.duplicateRowGroups[0].matchingRowCount, 3);
  assert.deepEqual(collapsedProjection.tableData.duplicateRowGroups[0].sourceRowIndexes, [0, 1, 3]);
});
