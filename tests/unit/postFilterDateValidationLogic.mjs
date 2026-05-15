import assert from 'node:assert/strict';
import {
  getPostFilterDateValidationMessage,
  postFilterDateOperatorAllowsNever
} from '../../table/post-filters/postFilterDateValidation.js';

const customDatePicker = {
  getComparableValue(value) {
    return Number(String(value || '').replace(/\D/gu, ''));
  },
  isValidDateValue(value) {
    return ['Never', '20260110', '20260120'].includes(String(value || ''));
  }
};

assert.equal(postFilterDateOperatorAllowsNever('equals'), true);
assert.equal(postFilterDateOperatorAllowsNever('before'), false);

assert.equal(getPostFilterDateValidationMessage({
  cond: 'between',
  customDatePicker,
  field: 'Checkout Date',
  value: 'Never',
  value2: '20260120'
}), 'Checkout Date cannot use Never in a between filter. Use Before for open-ended ranges, or Equals Never by itself.');

assert.equal(getPostFilterDateValidationMessage({
  cond: 'before',
  customDatePicker,
  field: 'Checkout Date',
  value: 'Never',
  value2: ''
}), 'Checkout Date can only use Never with equals or does not equal.');

assert.equal(getPostFilterDateValidationMessage({
  cond: 'between',
  customDatePicker,
  field: 'Checkout Date',
  value: '20260120',
  value2: '20260110'
}), 'Checkout Date start date must be before the end date.');

console.log('Post filter date validation logic tests passed');
