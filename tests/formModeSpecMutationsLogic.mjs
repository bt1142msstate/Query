import assert from 'node:assert/strict';
import {
  clearFormSpecControlDefaults,
  hasSpecColumn,
  hasSpecFilterInput,
  removeSpecFilterInputs,
  removeSpecInputByKey,
  resetFormSpecToEmptyQuery
} from '../ui/formModeSpecMutations.js';

const normalizeDuplicateName = value => String(value || '').replace(/\s+\(\d+\)$/u, '');
const spec = {
  title: 'Checkout Report',
  queryName: 'Checkout Report',
  columns: ['Title', 'Author (2)', 'Checkout Date'],
  lockedFilters: [{ field: 'Home Location', operator: 'equals', values: ['MAIN'] }],
  inputs: [
    {
      key: 'author-equals',
      field: 'Author',
      operator: 'equals',
      multiple: false,
      defaultValue: 'Smith'
    },
    {
      key: 'copy-between',
      field: 'Copy Count (2)',
      operator: 'between',
      multiple: false,
      defaultValue: ['1', '4']
    },
    {
      key: 'branch-equals',
      field: 'Branch',
      operator: 'equals',
      multiple: true,
      defaultValue: ['Main', 'North']
    }
  ]
};

assert.equal(hasSpecColumn(spec, 'Author', normalizeDuplicateName), true);
assert.equal(hasSpecColumn(spec, 'Missing Field', normalizeDuplicateName), false);
assert.equal(hasSpecFilterInput(spec, 'Copy Count', normalizeDuplicateName), true);
assert.equal(hasSpecFilterInput(spec, 'Missing Field', normalizeDuplicateName), false);

assert.equal(removeSpecFilterInputs(spec, 'Author (3)', normalizeDuplicateName), true);
assert.deepEqual(spec.inputs.map(inputSpec => inputSpec.key), ['copy-between', 'branch-equals']);
assert.equal(removeSpecFilterInputs(spec, 'Missing Field', normalizeDuplicateName), false);

assert.equal(removeSpecInputByKey(spec, 'branch-equals'), true);
assert.deepEqual(spec.inputs.map(inputSpec => inputSpec.key), ['copy-between']);
assert.equal(removeSpecInputByKey(spec, ''), false);

spec.inputs.push({
  key: 'branch-equals',
  field: 'Branch',
  operator: 'equals',
  multiple: true,
  defaultValue: ['Main', 'North']
});
assert.equal(clearFormSpecControlDefaults(spec), true);
assert.deepEqual(spec.inputs.find(inputSpec => inputSpec.key === 'copy-between').defaultValue, ['', '']);
assert.deepEqual(spec.inputs.find(inputSpec => inputSpec.key === 'branch-equals').defaultValue, []);

assert.equal(resetFormSpecToEmptyQuery(spec), true);
assert.deepEqual(spec, {
  title: '',
  queryName: '',
  columns: [],
  lockedFilters: [],
  inputs: []
});

console.log('Form mode spec mutation logic tests passed');
