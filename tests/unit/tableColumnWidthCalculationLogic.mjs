import assert from 'node:assert/strict';
import test from 'node:test';

test('table column width calculation', async () => {
  globalThis.window = {
    matchMedia: query => ({
      matches: query.includes('max-width: 1180px') ? false : false
    })
  };

  const {
    calculateFieldWidth,
    calculateOptimalColumnWidths,
    shouldUseCompactMobileTable
  } = await import('../../table/virtual-table/tableColumnWidthCalculation.js');

  const textMeasurement = {
    measureText: value => String(value || '').length * 8
  };

  const valueFormatting = {
    formatValueByType(value, type) {
      if (type === 'money') return `$${Number(value).toFixed(2)}`;
      if (type === 'date') return value === 'NEVER' ? 'Never' : String(value);
      return String(value);
    }
  };

  const deps = {
    getFieldType: field => (field === 'Bill Count' ? 'number' : (field === 'Due Date' ? 'date' : 'text')),
    parseNumericValue: value => Number(value),
    textMeasurement,
    valueFormatting,
    headerActionSpace: 20,
    headerTextBalanceSpace: 10
  };

  assert.equal(shouldUseCompactMobileTable(), false);

  const data = {
    headers: ['Title', 'Bill Count', 'Due Date'],
    rows: [
      ['Short', '2', 'NEVER'],
      ['A much longer title value', '1532', '20240101']
    ],
    columnMap: new Map([
      ['Title', 0],
      ['Bill Count', 1],
      ['Due Date', 2]
    ])
  };

  const titleWidth = calculateFieldWidth('Title', data, deps);
  const numericWidth = calculateFieldWidth('Bill Count', data, deps);
  const missingWidth = calculateFieldWidth('Missing Field', data, deps);
  const widths = calculateOptimalColumnWidths(['Title', 'Bill Count'], data, deps);

  assert.ok(titleWidth >= 150);
  assert.ok(titleWidth > numericWidth);
  assert.ok(missingWidth >= 150);
  assert.deepEqual(Object.keys(widths), ['Title', 'Bill Count']);
  assert.equal(widths.Title, titleWidth);
  assert.equal(widths['Bill Count'], numericWidth);
});
