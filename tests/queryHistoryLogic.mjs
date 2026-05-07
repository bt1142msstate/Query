import assert from 'node:assert/strict';
import {
  buildUiConfigFromRequest,
  deriveTemplateBindings,
  mapRequestOperatorToUiOperator,
  mergeUiConfigWithRequest,
  resolveFieldNameFromSpecialPayload
} from '../history/queryHistoryRequestMapper.js';
import {
  classifyQueryStatus,
  getPreferredHistorySection,
  getQueryStatusMeta
} from '../history/queryHistoryViewHelpers.js';
import { createQueriesTableRowHtml } from '../history/queryHistoryRows.js';

const fieldDefsArray = [
  {
    name: 'Exact Special',
    special_payload: { tag: '590', subfield: 'a' }
  },
  {
    name: 'Marc {tag}',
    is_buildable: true,
    field_template: 'Marc {tag}',
    special_payload_template: { tag: '{tag}', subfield: 'a' }
  }
];

const mapperDependencies = {
  escapeRegExp: value => String(value).replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'),
  fieldDefsArray,
  normalizeUiConfigFilters: uiConfig => Array.isArray(uiConfig.Filters) ? uiConfig.Filters : [],
  registerDynamicField: () => {},
  resolveFieldName: value => (value === 'alias' ? 'Resolved Alias' : value)
};

assert.equal(classifyQueryStatus('running'), 'running');
assert.equal(classifyQueryStatus('unexpected'), 'unexpected');
assert.equal(getQueryStatusMeta('canceled').label, 'Cancelled');
assert.equal(getPreferredHistorySection({ running: 0, complete: 2, failed: 0, canceled: 0 }, 'running'), 'complete');
assert.equal(getPreferredHistorySection({ running: 1, complete: 2, failed: 0, canceled: 0 }, 'none'), null);

const bindings = {};
assert.equal(deriveTemplateBindings('Marc {tag}', 'Marc 590', bindings, mapperDependencies.escapeRegExp), true);
assert.deepEqual(bindings, { tag: '590' });
assert.equal(deriveTemplateBindings('Marc {tag}', 'Item 590', {}, mapperDependencies.escapeRegExp), false);

assert.equal(resolveFieldNameFromSpecialPayload({ tag: '590', subfield: 'a' }, mapperDependencies), 'Exact Special');
assert.equal(resolveFieldNameFromSpecialPayload({ tag: '999', subfield: 'a' }, mapperDependencies), 'Marc 999');

assert.equal(mapRequestOperatorToUiOperator('=', '*abc'), 'Contains');
assert.equal(mapRequestOperatorToUiOperator('!=', '*abc'), 'DoesNotContain');
assert.equal(mapRequestOperatorToUiOperator('>=', 10), 'GreaterThanOrEqual');

const requestConfig = buildUiConfigFromRequest({
  display_fields: ['alias', 'Title'],
  filters: [
    { field: 'alias', operator: '=', value: '*needle*' },
    { field: 'Price', operator: '>=', value: 10 }
  ],
  special_fields: [{ tag: '999', subfield: 'a' }]
}, mapperDependencies);

assert.deepEqual(requestConfig.DesiredColumnOrder, ['Resolved Alias', 'Title', 'Marc 999']);
assert.deepEqual(requestConfig.Filters, [
  { FieldName: 'Resolved Alias', FieldOperator: 'Contains', Values: ['*needle*'] },
  { FieldName: 'Price', FieldOperator: 'GreaterThanOrEqual', Values: [10] }
]);

const mergedConfig = mergeUiConfigWithRequest({
  DesiredColumnOrder: ['Existing'],
  Filters: [{ FieldName: 'Existing', FieldOperator: 'Equals', Values: ['1'] }],
  SpecialFields: []
}, {
  display_fields: ['alias'],
  filters: [{ field: 'alias', operator: '=', value: '2' }]
}, mapperDependencies);

assert.deepEqual(mergedConfig.DesiredColumnOrder, ['Existing', 'Resolved Alias']);
assert.deepEqual(mergedConfig.Filters, [{ FieldName: 'Existing', FieldOperator: 'Equals', Values: ['1'] }]);

const rowHtml = createQueriesTableRowHtml({
  id: 'Q1',
  name: '<script>alert(1)</script>',
  status: 'complete',
  startTime: '2026-01-01T00:00:00.000Z',
  endTime: '2026-01-01T00:00:05.000Z',
  resultCount: 12,
  jsonConfig: { DesiredColumnOrder: ['Title'], Filters: [] }
}, {
  dependencies: {
    formatDuration: seconds => `${seconds}s`,
    normalizeUiConfigFilters: () => []
  }
});

assert.match(rowHtml, /Completed/u);
assert.match(rowHtml, /12 rows/u);
assert.match(rowHtml, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/u);
assert.doesNotMatch(rowHtml, /<script>alert/u);

console.log('Query history logic tests passed');
