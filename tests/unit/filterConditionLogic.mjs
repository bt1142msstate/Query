import assert from 'node:assert/strict';
import {
  getDateFilterValidationMessage,
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
    filters: [{ cond: 'before', val: '20260110' }]
  }, {
    cond: 'never',
    val: 'NEVER'
  }, 'date', 'Checkout Date', {
    getComparableDateValue: value => Number(value)
  }),
  'Checkout Date cannot be Never and be before 20260110'
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

assert.equal(
  getContradictionMessage({
    filters: [{ cond: 'after', val: '20260110' }]
  }, {
    cond: 'before',
    val: '20260105'
  }, 'date', 'Checkout Date', {
    getComparableDateValue: value => Number(value)
  }),
  'Checkout Date cannot be before 20260105 and be after 20260110'
);

assert.equal(
  getContradictionMessage({
    filters: [{ cond: 'after', val: '20260110' }]
  }, {
    cond: 'on_or_before',
    val: '20260110'
  }, 'date', 'Checkout Date', {
    getComparableDateValue: value => Number(value)
  }),
  'Checkout Date cannot be on or before 20260110 and be after 20260110'
);

assert.equal(
  getContradictionMessage({
    filters: [{ cond: 'on_or_after', val: '20260110' }]
  }, {
    cond: 'on_or_before',
    val: '20260110'
  }, 'date', 'Checkout Date', {
    getComparableDateValue: value => Number(value)
  }),
  null
);

assert.equal(
  getDateFilterValidationMessage({
    cond: 'between',
    val: 'Never|20260110'
  }, 'Checkout Date'),
  'Checkout Date cannot use Never in a between filter. Use Before for open-ended ranges, or Equals Never by itself.'
);

assert.equal(
  getDateFilterValidationMessage({
    cond: 'before',
    val: 'Never'
  }, 'Checkout Date'),
  'Checkout Date can only use Never with equals or does not equal.'
);

assert.equal(
  getDateFilterValidationMessage({
    cond: 'equals',
    val: 'Never'
  }, 'Checkout Date'),
  null
);

assert.equal(
  getDateFilterValidationMessage({
    cond: 'between',
    val: '20260120|20260110'
  }, 'Checkout Date', {
    getComparableDateValue: value => Number(value)
  }),
  'Checkout Date start date must be before the end date.'
);

assert.equal(
  getDateFilterValidationMessage({
    cond: 'between',
    val: '20260110|20260110'
  }, 'Checkout Date', {
    getComparableDateValue: value => Number(value)
  }),
  'Checkout Date between dates must be different.'
);

console.log('Filter condition logic tests passed');
