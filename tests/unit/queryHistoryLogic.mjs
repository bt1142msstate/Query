import assert from 'node:assert/strict';
import {
  buildUiConfigFromRequest,
  deriveTemplateBindings,
  mapRequestOperatorToUiOperator,
  mergeUiConfigWithRequest,
  resolveFieldNameFromSpecialPayload
} from '../../history/queryHistoryRequestMapper.js';
import { buildHistoryActiveFilters } from '../../history/queryHistoryConfigLoader.js';
import { buildHistoryResultRows } from '../../history/queryHistoryResultsLoader.js';
import { formatColumnsTooltip, formatHistoryFiltersTooltip } from '../../history/queryHistoryTooltips.js';
import {
  classifyQueryStatus,
  getPreferredHistorySection,
  getQueryStatusMeta
} from '../../history/queryHistoryViewHelpers.js';
import { createQueriesTableRowHtml } from '../../history/queryHistoryRows.js';
import test from 'node:test';

test('query history', async () => {
  const fieldDefsArray = [
    {
      name: 'MARC Field',
      builder: {
        outputFieldIdTemplate: 'MARC {tag}${subfield}',
        displayLabelTemplate: 'MARC {tag}${subfield}',
        inputs: [
          { id: 'tag' },
          { id: 'subfield', optional: true }
        ]
      }
    },
    {
      name: 'Generated Field',
      builder: {
        outputFieldIdTemplate: 'Generated {code}',
        displayLabelTemplate: 'Generated {code}',
        inputs: [
          { id: 'code' }
        ]
      }
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

  assert.equal(resolveFieldNameFromSpecialPayload({ tag: '590', subfield: 'a' }, mapperDependencies), 'MARC 590$a');
  assert.equal(resolveFieldNameFromSpecialPayload({ type: 'marc', tag: '999' }, mapperDependencies), 'MARC 999');
  assert.equal(resolveFieldNameFromSpecialPayload({ type: 'generated', code: 'ABC' }, mapperDependencies), 'Generated ABC');
  assert.equal(resolveFieldNameFromSpecialPayload({ type: 'missing', code: 'ABC' }, mapperDependencies), '');

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

  assert.deepEqual(requestConfig.DesiredColumnOrder, ['Resolved Alias', 'Title', 'MARC 999$a']);
  assert.deepEqual(requestConfig.Filters, [
    { FieldName: 'Resolved Alias', FieldOperator: 'Contains', Values: ['*needle*'] },
    { FieldName: 'Price', FieldOperator: 'GreaterThanOrEqual', Values: [10] }
  ]);

  const mergedConfig = mergeUiConfigWithRequest({
    DesiredColumnOrder: ['Existing'],
    Filters: [{ FieldName: 'Existing', FieldOperator: 'Equals', Values: ['1'] }],
  }, {
    display_fields: ['alias'],
    filters: [{ field: 'alias', operator: '=', value: '2' }]
  }, mapperDependencies);

  assert.deepEqual(mergedConfig.DesiredColumnOrder, ['Existing', 'Resolved Alias']);
  assert.deepEqual(mergedConfig.Filters, [{ FieldName: 'Existing', FieldOperator: 'Equals', Values: ['1'] }]);

  assert.deepEqual(buildHistoryActiveFilters([
    { FieldName: 'alias', FieldOperator: 'Equals', Values: ['A', 'B'] },
    { FieldName: 'Date', FieldOperator: 'Between', Values: ['20240101', '20240201'] }
  ], {
    resolveFieldName: mapperDependencies.resolveFieldName,
    mapFieldOperatorToUiCond: op => op === 'Between' ? 'between' : 'equals'
  }), {
    'Resolved Alias': { filters: [{ cond: 'equals', val: 'A,B' }] },
    Date: { filters: [{ cond: 'between', val: '20240101|20240201' }] }
  });

  const resultRows = buildHistoryResultRows({
    response: { headers: { get: name => name === 'X-Raw-Columns' ? 'A|B' : null } },
    streamedLines: ['one|two'],
    displayedFields: ['A', 'B', 'C'],
    fallbackColumns: [],
    parsePipeDelimitedRow: (line, columns) => Object.fromEntries(line.split('|').map((value, index) => [columns[index], value]))
  });
  assert.deepEqual(resultRows, {
    headers: ['A', 'B', 'C'],
    objectRows: [{ A: 'one', B: 'two', C: '' }],
    source: 'pipe'
  });

  assert.match(formatColumnsTooltip(['Title', '<Branch>']), /&lt;Branch&gt;/u);
  assert.equal(formatHistoryFiltersTooltip({ Filters: [] }), 'None');

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
});
