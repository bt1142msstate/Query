import assert from 'node:assert/strict';

globalThis.window = globalThis;
window.setTimeout = setTimeout;
window.clearTimeout = clearTimeout;

const {
  assignInputSpecDefaultValues,
  buildGeneratedInputSpecsFromActiveFilters,
  clearInputSpecDefaultValue,
  getInputSignature,
  getInputSpecDefaultValues,
  normalizeOperatorForField,
  readStoredFilterValues,
  syncInputSpecFromState,
  uniqueInputKey
} = await import('../../ui/form-mode/formModeQuerySpec.js');

const fieldDefs = new Map([
  ['Checkout Date', { name: 'Checkout Date', type: 'date' }],
  ['Search Key', { name: 'Search Key', allowValueList: true }],
  ['Branch', { name: 'Branch', multiSelect: true, type: 'string' }]
]);

assert.equal(normalizeOperatorForField(fieldDefs.get('Checkout Date'), 'GreaterThan'), 'after');
assert.equal(normalizeOperatorForField(fieldDefs.get('Checkout Date'), 'LessThanOrEqual'), 'on_or_before');
assert.equal(normalizeOperatorForField(fieldDefs.get('Checkout Date'), 'Never'), 'equals');
assert.equal(normalizeOperatorForField(fieldDefs.get('Search Key'), 'Contains'), 'contains');

const seenKeys = new Set(['branch-equals']);
assert.equal(uniqueInputKey('Branch Equals', seenKeys), 'branch-equals-2');
assert.equal(uniqueInputKey('', seenKeys), 'field');

assert.deepEqual(readStoredFilterValues({ cond: 'between', val: '1/1/2026|1/5/2026|ignored' }), ['1/1/2026', '1/5/2026']);
assert.deepEqual(readStoredFilterValues({ cond: 'equals', val: 'A, B\nC' }), ['A', 'B', 'C']);

const scalarInput = { operator: 'equals', multiple: false, defaultValue: 'Alpha, Beta' };
assert.deepEqual(getInputSpecDefaultValues(scalarInput), ['Alpha', 'Beta']);
assignInputSpecDefaultValues(scalarInput, ['Main', 'East'], fieldDefs.get('Branch'));
assert.equal(scalarInput.multiple, true);
assert.deepEqual(scalarInput.defaultValue, ['Main', 'East']);

const betweenInput = { operator: 'between', multiple: true, defaultValue: [] };
assignInputSpecDefaultValues(betweenInput, ['1/1/2026', '1/5/2026'], fieldDefs.get('Checkout Date'));
assert.equal(betweenInput.multiple, false);
assert.deepEqual(betweenInput.defaultValue, ['1/1/2026', '1/5/2026']);
clearInputSpecDefaultValue(betweenInput);
assert.deepEqual(betweenInput.defaultValue, ['', '']);

const syncInput = { operator: 'greater', multiple: false, defaultValue: '', type: 'date' };
syncInputSpecFromState(syncInput, { operator: 'LessThan', values: ['1/5/2026'] }, fieldDefs.get('Checkout Date'));
assert.equal(syncInput.operator, 'before');
assert.equal(syncInput.defaultValue, '1/5/2026');

const generatedInputs = buildGeneratedInputSpecsFromActiveFilters([
  { key: 'search-key-equals' }
], {
  'Search Key': {
    filters: [{ cond: 'equals', val: 'A, B' }]
  },
  'Checkout Date': {
    filters: [{ cond: 'between', val: '1/1/2026|1/5/2026' }]
  }
}, { fieldDefs });

assert.deepEqual(generatedInputs.map(input => input.key), ['search-key-equals-2', 'checkout-date-between']);
assert.deepEqual(generatedInputs[0], {
  key: 'search-key-equals-2',
  field: 'Search Key',
  source: 'query-filter',
  label: 'Search Key',
  operator: 'equals',
  multiple: true,
  default: ['A', 'B'],
  defaultValue: ['A', 'B'],
  help: '',
  placeholder: '',
  required: false,
  hidden: false,
  type: '',
  options: null,
  keys: []
});
assert.equal(generatedInputs[1].operator, 'between');
assert.deepEqual(generatedInputs[1].defaultValue, ['1/1/2026', '1/5/2026']);
assert.equal(generatedInputs[1].type, 'date');
assert.equal(getInputSignature(generatedInputs[1]), 'Checkout Date::between');

const generatedNeverDateInput = buildGeneratedInputSpecsFromActiveFilters([], {
  'Checkout Date': {
    filters: [{ cond: 'never', val: 'NEVER' }]
  }
}, { fieldDefs })[0];
assert.equal(generatedNeverDateInput.operator, 'equals');
assert.equal(generatedNeverDateInput.defaultValue, 'NEVER');
assert.equal(getInputSignature(generatedNeverDateInput), 'Checkout Date::equals');

console.log('Form mode query spec logic tests passed');
