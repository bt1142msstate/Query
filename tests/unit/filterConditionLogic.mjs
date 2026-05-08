import assert from 'node:assert/strict';
import {
  getContradictionMessage,
  isListPasteField,
  supportsListSelectorCondition
} from '../../filters/filterConditionLogic.js';

assert.equal(supportsListSelectorCondition('equals'), true);
assert.equal(supportsListSelectorCondition('does_not_equal'), true);
assert.equal(supportsListSelectorCondition('contains'), false);

assert.equal(isListPasteField({ allowValueList: true, values: [] }), true);
assert.equal(isListPasteField({ allowValueList: true, values: ['A'] }), false);
assert.equal(isListPasteField({ allowValueList: false, values: [] }), false);

assert.equal(
  getContradictionMessage({
    filters: [{ cond: 'greater', val: '10' }]
  }, {
    cond: 'less',
    val: '5'
  }, 'number', 'Bill Count'),
  'Bill Count cannot be less than 5 and be greater than 10'
);

assert.equal(
  getContradictionMessage({
    filters: [{ cond: 'between', val: '20260110|20260120' }]
  }, {
    cond: 'equals',
    val: '20260115'
  }, 'date', 'Checkout Date', {
    getComparableDateValue: value => Number(value)
  }),
  null
);

assert.equal(
  getContradictionMessage({
    filters: [{ cond: 'between', val: '20260110|20260120' }]
  }, {
    cond: 'equals',
    val: '20260125'
  }, 'date', 'Checkout Date', {
    getComparableDateValue: value => Number(value)
  }),
  'Checkout Date cannot equal 20260125 and be between 20260110 and 20260120'
);

console.log('Filter condition logic tests passed');
