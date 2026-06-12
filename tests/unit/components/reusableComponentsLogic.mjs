import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CustomDatePicker,
  DATE_INPUT_PATTERN,
  Tooltips,
  buildFilterTooltipHtml,
  createVirtualTableComponent,
  createWorkbookExportComponent,
  normalizeDateValue
} from '../../../src/components/index.js';

function createSourceData(rows, displayedFields) {
  return {
    dataRows: rows,
    displayedFields,
    fieldTypeMap: new Map(displayedFields.map(field => [field, 'string'])),
    virtualData: {
      columnMap: new Map(displayedFields.map((field, index) => [field, index]))
    }
  };
}

test('reusable virtual table component projects split and deduplicated rows', () => {
  const table = createVirtualTableComponent({
    data: {
      headers: ['Title', 'Public Note', 'Branch'],
      rows: [
        ['Alpha', ['First note', 'Second note'], 'Main'],
        ['Alpha', ['First note', 'Second note'], 'Main'],
        ['Beta', 'Only note', 'East']
      ],
      columnMap: new Map([
        ['Title', 0],
        ['Public Note', 1],
        ['Branch', 2]
      ])
    }
  });

  const collapsed = table.project();
  assert.deepEqual(collapsed.tableData.headers, ['Title', 'Public Note', 'Branch']);
  assert.equal(collapsed.tableData.rows.length, 2);
  assert.equal(collapsed.stats.duplicateRowsCollapsed, 1);

  const expanded = table.setCollapseDuplicateRows(false);
  assert.equal(expanded.tableData.rows.length, 3);
  assert.equal(expanded.stats.duplicateRowsCollapsed, 0);

  const splitProjection = table.setSplitColumns(true);
  assert.deepEqual(table.displayedFields, ['Title', 'Public Note 1', 'Public Note 2', 'Branch']);
  assert.deepEqual(splitProjection.tableData.headers, ['Title', 'Public Note 1', 'Public Note 2', 'Branch']);
  assert.equal(splitProjection.tableData.rows[0][1], 'First note');
  assert.equal(splitProjection.tableData.rows[0][2], 'Second note');
});

test('reusable workbook export component creates the same workbook blob path as the app', async () => {
  const sourceData = createSourceData(
    [['Alpha', ['First note', 'Second note']]],
    ['Title', 'Public Note']
  );
  const exporter = createWorkbookExportComponent({
    helpers: {
      progress: { update() {} },
      async yieldToBrowser() {}
    }
  });

  const { blob, filename } = await exporter.createBlob({
    config: { mode: 'single' },
    state: {
      groupingCandidates: [],
      rowCount: sourceData.dataRows.length,
      sourceData,
      tableName: 'Reusable Report'
    }
  });

  assert.equal(filename, 'Reusable-Report.xlsx');
  assert.equal(blob.type, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

  const workbookText = new TextDecoder().decode(await blob.arrayBuffer());
  assert.match(workbookText.slice(0, 4), /^PK/u);
  assert.match(workbookText, /Reusable Report/u);
  assert.match(workbookText, /First note\s+Second note/u);
});

test('date picker and tooltip component entrypoints expose browser-safe APIs', () => {
  assert.equal(CustomDatePicker.inputPattern, DATE_INPUT_PATTERN);
  assert.equal(new RegExp(DATE_INPUT_PATTERN).test('January 31, 2024'), true);
  assert.equal(new RegExp(DATE_INPUT_PATTERN).test('Never'), true);
  assert.equal(normalizeDateValue('1/31/2024'), '1/31/2024');
  assert.equal(normalizeDateValue('never'), 'Never');
  assert.equal(typeof Tooltips.attach, 'function');
  assert.equal(typeof Tooltips.forceHide, 'function');
  assert.match(buildFilterTooltipHtml([{ field: 'Title', operator: 'Equals', value: 'Alpha' }]), /Title/u);
});
