import assert from 'node:assert/strict';

globalThis.window = globalThis;
window.setTimeout = setTimeout;
window.clearTimeout = clearTimeout;

const { buildActiveFilters, getValidationError } = await import('../../ui/form-mode/formModeStateHelpers.js');
const { fieldDefs } = await import('../../filters/fieldDefs.js');

fieldDefs.clear();
fieldDefs.set('Checkout Date', { name: 'Checkout Date', type: 'date' });
fieldDefs.set('Branch', { name: 'Branch', type: 'string' });

const supportsMultipleValues = () => false;
const interpolateValue = value => String(value ?? '');

const partialDateFilters = buildActiveFilters({
  lockedFilters: [],
  inputs: [
    { key: 'checkout-date', field: 'Checkout Date', operator: 'equals', type: 'date' },
    { key: 'branch', field: 'Branch', operator: 'equals', type: 'string' }
  ]
}, {}, inputSpec => {
  if (inputSpec.field === 'Checkout Date') return ['1/'];
  if (inputSpec.field === 'Branch') return ['Main'];
  return [];
}, supportsMultipleValues, interpolateValue);

assert.deepEqual(partialDateFilters, {
  Branch: { filters: [{ cond: 'equals', val: 'Main' }] }
});

const completeDateFilters = buildActiveFilters({
  lockedFilters: [],
  inputs: [
    { key: 'checkout-date', field: 'Checkout Date', operator: 'equals', type: 'date' }
  ]
}, {}, () => ['Jan 2, 2026'], supportsMultipleValues, interpolateValue);

assert.deepEqual(completeDateFilters, {
  'Checkout Date': { filters: [{ cond: 'equals', val: 'Jan 2, 2026' }] }
});

const partialBetweenFilters = buildActiveFilters({
  lockedFilters: [],
  inputs: [
    { key: 'checkout-date-between', field: 'Checkout Date', operator: 'between', type: 'date' }
  ]
}, {}, () => ['1/2/2026', '1/'], supportsMultipleValues, interpolateValue);

assert.deepEqual(partialBetweenFilters, {});

const neverBetweenFilters = buildActiveFilters({
  lockedFilters: [],
  inputs: [
    { key: 'checkout-date-between', field: 'Checkout Date', label: 'Checkout Date', operator: 'between', type: 'date' }
  ]
}, {}, () => ['Never', '1/2/2026'], supportsMultipleValues, interpolateValue);

assert.deepEqual(neverBetweenFilters, {});

const reversedBetweenFilters = buildActiveFilters({
  lockedFilters: [],
  inputs: [
    { key: 'checkout-date-between', field: 'Checkout Date', label: 'Checkout Date', operator: 'between', type: 'date' }
  ]
}, {}, () => ['1/10/2026', '1/2/2026'], supportsMultipleValues, interpolateValue);

assert.deepEqual(reversedBetweenFilters, {});

const beforeNeverFilters = buildActiveFilters({
  lockedFilters: [],
  inputs: [
    { key: 'checkout-date-before', field: 'Checkout Date', label: 'Checkout Date', operator: 'before', type: 'date' }
  ]
}, {}, () => ['Never'], supportsMultipleValues, interpolateValue);

assert.deepEqual(beforeNeverFilters, {});

const validationControls = new Map([
  ['checkout-date-between', { classList: { toggle() {} } }]
]);
assert.equal(getValidationError({
  active: true,
  spec: {
    inputs: [
      {
        field: 'Checkout Date',
        key: 'checkout-date-between',
        label: 'Checkout Date',
        operator: 'between',
        type: 'date'
      }
    ]
  }
}, validationControls, () => ['Never', '1/2/2026'], () => 'date'), 'Checkout Date cannot use Never in a between filter. Use Before for open-ended ranges, or Equals Never by itself.');

console.log('Form mode state helper logic tests passed');
