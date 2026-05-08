import assert from 'node:assert/strict';
import {
  shouldRemoveUnmatchedInputFromQuerySync,
  syncSpecInputsWithActiveFilters
} from '../../ui/form-mode/formModeQuerySync.js';

const fieldDefs = new Map([
  ['Branch', { name: 'Branch', multiSelect: true }],
  ['Checkout Date', { name: 'Checkout Date', type: 'date' }]
]);

assert.equal(shouldRemoveUnmatchedInputFromQuerySync(null, 'generated'), false);
assert.equal(shouldRemoveUnmatchedInputFromQuerySync({ source: 'query-filter' }, 'url'), true);
assert.equal(shouldRemoveUnmatchedInputFromQuerySync({ source: 'custom' }, 'generated'), true);
assert.equal(shouldRemoveUnmatchedInputFromQuerySync({ source: 'custom' }, 'url'), false);

const generatedSpec = {
  inputs: [
    {
      key: 'branch-equals',
      field: 'Branch',
      source: 'query-filter',
      label: 'Branch',
      operator: 'equals',
      multiple: false,
      defaultValue: 'Old',
      type: ''
    },
    {
      key: 'checkout-date-after',
      field: 'Checkout Date',
      source: 'query-filter',
      label: 'Checkout Date',
      operator: 'after',
      multiple: false,
      defaultValue: '2026-01-01',
      type: 'date'
    }
  ]
};

const firstSync = syncSpecInputsWithActiveFilters({
  spec: generatedSpec,
  activeFilters: {
    Branch: { filters: [{ cond: 'equals', val: 'Main, East' }] }
  },
  fieldDefs,
  specSource: 'generated'
});

assert.equal(firstSync.changed, true);
assert.deepEqual(generatedSpec.inputs.map(inputSpec => inputSpec.field), ['Branch']);
assert.deepEqual(generatedSpec.inputs[0].defaultValue, ['Main', 'East']);
assert.equal(generatedSpec.inputs[0].multiple, true);
assert.deepEqual(firstSync.controlsToSync.map(item => item.inputSpec.key), ['branch-equals']);

const secondSync = syncSpecInputsWithActiveFilters({
  spec: generatedSpec,
  activeFilters: {
    Branch: { filters: [{ cond: 'equals', val: 'Main, East' }] }
  },
  fieldDefs,
  specSource: 'generated'
});

assert.equal(secondSync.changed, false);
assert.deepEqual(secondSync.controlsToSync, []);

const urlSpec = {
  inputs: [
    {
      key: 'custom-branch',
      field: 'Branch',
      source: 'custom',
      label: 'Branch',
      operator: 'equals',
      multiple: true,
      defaultValue: ['Main']
    }
  ]
};

const urlSync = syncSpecInputsWithActiveFilters({
  spec: urlSpec,
  activeFilters: {},
  fieldDefs,
  specSource: 'url'
});

assert.equal(urlSync.changed, true);
assert.equal(urlSpec.inputs.length, 1);
assert.deepEqual(urlSpec.inputs[0].defaultValue, []);

const addSpec = { inputs: [] };
const addSync = syncSpecInputsWithActiveFilters({
  spec: addSpec,
  activeFilters: {
    'Checkout Date': { filters: [{ cond: 'GreaterThanOrEqual', val: '2026-01-15' }] }
  },
  fieldDefs,
  specSource: 'generated'
});

assert.equal(addSync.changed, true);
assert.equal(addSpec.inputs.length, 1);
assert.equal(addSpec.inputs[0].field, 'Checkout Date');
assert.equal(addSpec.inputs[0].operator, 'on_or_after');
assert.equal(addSpec.inputs[0].type, 'date');
assert.equal(addSpec.inputs[0].defaultValue, '2026-01-15');

console.log('Form mode query sync logic tests passed');
