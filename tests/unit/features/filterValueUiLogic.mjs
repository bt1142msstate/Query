import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getFilterDisplayValues,
  getFilterLiteralValues
} from '../../../src/features/filters/filterValueUi.js';

test('filter value helpers keep raw list values editable while display values can be formatted', () => {
  const filter = { cond: 'equals', val: '604,808410,808434' };
  const fieldDef = {
    name: 'Catalog Key',
    allowValueList: true,
    values: [
      { RawValue: '604', Name: 'Accounting articles' }
    ]
  };

  assert.deepEqual(getFilterLiteralValues(filter), ['604', '808410', '808434']);
  assert.deepEqual(getFilterDisplayValues(filter, fieldDef), ['Accounting articles', '808410', '808434']);
});

