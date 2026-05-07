import assert from 'node:assert/strict';

globalThis.window = globalThis;
window.setTimeout = setTimeout;
window.clearTimeout = clearTimeout;

const { QueryChangeManager } = await import('../core/queryState.js');
const { fieldAliases, fieldDefs } = await import('../filters/fieldDefs.js');
const {
  buildBackendFilters,
  buildBackendQueryPayload,
  buildQueryUiConfig,
  formatFieldOperatorForDisplay,
  getNormalizedDisplayedFields,
  mapFieldOperatorToUiCond,
  mapUiCondToFieldOperator,
  normalizeUiConfigFilters
} = await import('../filters/queryPayload.js');

fieldDefs.clear();
fieldAliases.clear();

fieldAliases.set('Old Title', 'Title');
fieldDefs.set('Title', { name: 'Title', filters: ['equals', 'contains'] });
fieldDefs.set('Record Date', { name: 'Record Date', type: 'date', filters: ['between', 'equals'] });
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
    'Synthetic Field': {
      filters: [{ cond: 'equals', val: 'ignored' }]
    }
  }
}, { source: 'QueryPayloadLogic.seed' });

assert.equal(mapFieldOperatorToUiCond('DoesNotEqual'), 'does_not_equal');
assert.equal(mapUiCondToFieldOperator('on_or_after'), 'GreaterThanOrEqual');
assert.equal(formatFieldOperatorForDisplay('LessThanOrEqual'), '<=');

assert.deepEqual(getNormalizedDisplayedFields(), ['Title', 'Special MARC', 'Record Date']);

assert.deepEqual(normalizeUiConfigFilters({
  FilterGroups: [
    {
      Filters: [
        { FieldName: 'Old Title', FieldOperator: 'Contains', Values: ['x'] },
        { field: 'Record Date', operator: 'Between', value: '1/1/2026|1/2/2026' }
      ]
    }
  ]
}), [
  { FieldName: 'Title', FieldOperator: 'Contains', Values: ['x'] },
  { FieldName: 'Record Date', FieldOperator: 'Between', Values: ['1/1/2026|1/2/2026'] }
]);

assert.deepEqual(buildBackendFilters(), [
  { field: 'Title', operator: '=', value: '*needle*' },
  { field: 'Search Key', operator: '=', value: ['A', 'B', 'C'] },
  { field: 'Record Date', operator: '>=', value: '20260102' },
  { field: 'Record Date', operator: '<=', value: '20260105' }
]);

assert.deepEqual(buildQueryUiConfig(), {
  DesiredColumnOrder: ['Title', 'Special MARC', 'Record Date'],
  Filters: [
    { field: 'Title', operator: '=', value: '*needle*' },
    { field: 'Search Key', operator: '=', value: ['A', 'B', 'C'] },
    { field: 'Record Date', operator: '>=', value: '20260102' },
    { field: 'Record Date', operator: '<=', value: '20260105' }
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
    { field: 'Record Date', operator: '<=', value: '20260105' }
  ],
  display_fields: ['Title', 'Record Date'],
  special_fields: [{ tag: '590', subfield: 'a' }]
});

console.log('Query payload logic tests passed');
