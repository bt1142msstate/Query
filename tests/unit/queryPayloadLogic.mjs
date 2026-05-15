import assert from 'node:assert/strict';

globalThis.window = globalThis;
window.setTimeout = setTimeout;
window.clearTimeout = clearTimeout;

const { QueryChangeManager } = await import('../../core/queryState.js');
const { isValidDateValue, normalizeDateValue } = await import('../../core/dateValues.js');
const { fieldAliases, fieldDefs, getFieldFilterOperators } = await import('../../filters/fieldDefs.js');
const {
  buildBackendFilters,
  buildBackendQueryPayload,
  buildQueryUiConfig,
  formatFieldOperatorForDisplay,
  getNormalizedDisplayedFields,
  mapFieldOperatorToUiCond,
  mapUiCondToFieldOperator,
  normalizeUiConfigFilters
} = await import('../../filters/queryPayload.js');

fieldDefs.clear();
fieldAliases.clear();

fieldAliases.set('Old Title', 'Title');
fieldDefs.set('Title', { name: 'Title', filters: ['equals', 'contains'] });
fieldDefs.set('Record Date', { name: 'Record Date', type: 'date', filters: ['between', 'equals', 'never'] });
fieldDefs.set('Never Date', { name: 'Never Date', type: 'date', filters: ['never', 'before'] });
fieldDefs.set('Equal Never Date', { name: 'Equal Never Date', type: 'date', filters: ['equals'] });
fieldDefs.set('Backend Date', { name: 'Backend Date', type: 'date', filters: ['before'] });
fieldDefs.set('Search Key', { name: 'Search Key', filters: ['equals'], allowValueList: true });
fieldDefs.set('Synthetic Field', { name: 'Synthetic Field', is_buildable: true, filters: ['equals'] });
fieldDefs.set('Special MARC', {
  name: 'Special MARC',
  filters: ['equals'],
  special_payload: { tag: '590', subfield: 'a' }
});

QueryChangeManager.setQueryState({
  displayedFields: ['Old Title', 'Title', 'Synthetic Field', 'Special MARC', 'Record Date'],
  activeFilters: {
    'Old Title': {
      filters: [{ cond: 'contains', val: 'needle' }]
    },
    'Search Key': {
      filters: [{ cond: 'equals', val: 'A, B\nC' }]
    },
    'Record Date': {
      filters: [{ cond: 'between', val: '1/2/2026|1/5/2026' }]
    },
    'Never Date': {
      filters: [{ cond: 'never', val: 'NEVER' }]
    },
    'Equal Never Date': {
      filters: [{ cond: 'equals', val: 'Never' }]
    },
    'Backend Date': {
      filters: [{ cond: 'before', val: 'Never' }]
    },
    'Synthetic Field': {
      filters: [{ cond: 'equals', val: 'ignored' }]
    }
  }
}, { source: 'QueryPayloadLogic.seed' });

assert.equal(mapFieldOperatorToUiCond('DoesNotEqual'), 'does_not_equal');
assert.equal(mapFieldOperatorToUiCond('Never'), 'never');
assert.equal(mapUiCondToFieldOperator('on_or_after'), 'GreaterThanOrEqual');
assert.equal(mapUiCondToFieldOperator('never'), 'Never');
assert.equal(formatFieldOperatorForDisplay('LessThanOrEqual'), '<=');
assert.equal(formatFieldOperatorForDisplay('Never'), 'never');
assert.equal(isValidDateValue('Never'), true);
assert.equal(isValidDateValue('=0'), true);
assert.equal(normalizeDateValue('NEVER'), 'Never');
assert.deepEqual(getFieldFilterOperators('Backend Date'), [
  'before',
  'equals',
  'does_not_equal',
  'after',
  'on_or_before',
  'on_or_after',
  'between'
]);
assert.equal(getFieldFilterOperators('Never Date').includes('never'), false);

assert.deepEqual(getNormalizedDisplayedFields(), ['Title', 'Special MARC', 'Record Date']);

assert.deepEqual(normalizeUiConfigFilters({
  FilterGroups: [
    {
      Filters: [
        { FieldName: 'Old Title', FieldOperator: 'Contains', Values: ['x'] },
        { FieldName: 'Never Date', FieldOperator: 'Never', Values: ['NEVER'] },
        { field: 'Record Date', operator: 'Between', value: '1/1/2026|1/2/2026' }
      ]
    }
  ]
}), [
  { FieldName: 'Title', FieldOperator: 'Contains', Values: ['x'] },
  { FieldName: 'Never Date', FieldOperator: 'Never', Values: ['NEVER'] },
  { FieldName: 'Record Date', FieldOperator: 'Between', Values: ['1/1/2026|1/2/2026'] }
]);

assert.deepEqual(buildBackendFilters(), [
  { field: 'Title', operator: '=', value: '*needle*' },
  { field: 'Search Key', operator: '=', value: ['A', 'B', 'C'] },
  { field: 'Record Date', operator: '>=', value: '20260102' },
  { field: 'Record Date', operator: '<=', value: '20260105' },
  { field: 'Never Date', operator: '=', value: 'NEVER' },
  { field: 'Equal Never Date', operator: '=', value: 'NEVER' }
]);

assert.deepEqual(buildQueryUiConfig(), {
  DesiredColumnOrder: ['Title', 'Special MARC', 'Record Date'],
  Filters: [
    { field: 'Title', operator: '=', value: '*needle*' },
    { field: 'Search Key', operator: '=', value: ['A', 'B', 'C'] },
    { field: 'Record Date', operator: '>=', value: '20260102' },
    { field: 'Record Date', operator: '<=', value: '20260105' },
    { field: 'Never Date', operator: '=', value: 'NEVER' },
    { field: 'Equal Never Date', operator: '=', value: 'NEVER' }
  ],
  SpecialFields: [{ tag: '590', subfield: 'a' }]
});

assert.deepEqual(buildBackendQueryPayload('Smoke Query'), {
  action: 'run',
  name: 'Smoke Query',
  filters: [
    { field: 'Title', operator: '=', value: '*needle*' },
    { field: 'Search Key', operator: '=', value: ['A', 'B', 'C'] },
    { field: 'Record Date', operator: '>=', value: '20260102' },
    { field: 'Record Date', operator: '<=', value: '20260105' },
    { field: 'Never Date', operator: '=', value: 'NEVER' },
    { field: 'Equal Never Date', operator: '=', value: 'NEVER' }
  ],
  display_fields: ['Title', 'Record Date'],
  special_fields: [{ tag: '590', subfield: 'a' }]
});

console.log('Query payload logic tests passed');
