import assert from 'node:assert/strict';
import { getVirtualTableCellDisplay } from '../../table/virtual-table/virtualTableRows.js';
import test from 'node:test';

test('virtual table rows', async () => {
  const valueFormatting = {
    formatValueByType(value, type, options = {}) {
      if (type === 'date' && value === 'NEVER') {
        return options.invalidDateValue;
      }
      return `${type}:${value}:${options.fieldName}`;
    }
  };

  const parseNumericValue = value => Number(String(value).replace(/[$,]/g, ''));

  assert.deepEqual(getVirtualTableCellDisplay({
    cellValue: '20240101',
    field: 'Created Date',
    type: 'date',
    valueFormatting,
    parseNumericValue
  }), {
    displayValue: 'date:20240101:Created Date',
    textAlign: 'right'
  });

  assert.deepEqual(getVirtualTableCellDisplay({
    cellValue: 'NEVER',
    field: 'Last Checkout Date',
    type: 'date',
    valueFormatting,
    parseNumericValue
  }), {
    displayValue: 'Never',
    textAlign: 'right'
  });

  assert.deepEqual(getVirtualTableCellDisplay({
    cellValue: '$1,250.50',
    field: 'Bill Count',
    type: 'number',
    valueFormatting,
    parseNumericValue
  }), {
    displayValue: 'number:1250.5:Bill Count',
    textAlign: 'right'
  });

  assert.deepEqual(getVirtualTableCellDisplay({
    cellValue: 'Y',
    field: 'Active',
    type: 'boolean',
    valueFormatting,
    parseNumericValue
  }), {
    displayValue: 'Y',
    textAlign: 'center'
  });

  assert.deepEqual(getVirtualTableCellDisplay({
    cellValue: '',
    field: 'Title',
    type: 'text',
    valueFormatting,
    parseNumericValue
  }), {
    displayValue: '',
    textAlign: ''
  });
});
