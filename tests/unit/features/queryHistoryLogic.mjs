import assert from 'node:assert/strict';
import {
  buildUiConfigFromRequest,
  deriveTemplateBindings,
  mapRequestOperatorToUiOperator,
  mergeUiConfigWithRequest,
  resolveFieldNameFromSpecialPayload
} from '../../../src/features/history/queryHistoryRequestMapper.js';
import { buildHistoryActiveFilters, createQueryHistoryConfigLoader } from '../../../src/features/history/queryHistoryConfigLoader.js';
import { buildHistoryResultRows, createQueryHistoryResultsLoader } from '../../../src/features/history/results/queryHistoryResultsLoader.js';
import { formatColumnsTooltip, formatHistoryFiltersTooltip } from '../../../src/features/history/view/queryHistoryTooltips.js';
import {
  buildHistorySection,
  classifyQueryStatus,
  getPreferredHistorySection,
  getQueryStatusMeta
} from '../../../src/features/history/view/queryHistoryViewHelpers.js';
import { buildHistoryDetailsOverlayHtml } from '../../../src/features/history/view/queryHistoryDetails.js';
import { buildHistorySubtitleText } from '../../../src/features/history/view/queryHistoryControls.js';
import { createQueriesTableRowHtml } from '../../../src/features/history/view/queryHistoryRows.js';
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
  assert.match(buildHistorySubtitleText({
    searchTerm: '',
    visibleCount: 4,
    totalCount: 10,
    runningCount: 0,
    viewOptions: {}
  }), /4 of 10 saved runs shown\. Sorted by newest first\. Nothing is running right now\./u);
  const historySectionHtml = buildHistorySection('complete', 3, false);
  assert.match(historySectionHtml, /Review/u);
  assert.match(historySectionHtml, /View/u);
  assert.doesNotMatch(historySectionHtml, /Standby|Open list|Close list/u);

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
    jsonPayload: {
      columns: ['A', 'B'],
      rows: [['one', 'two']]
    },
    displayedFields: ['A', 'B', 'C'],
    fallbackColumns: []
  });
  assert.deepEqual(resultRows, {
    headers: ['A', 'B', 'C'],
    objectRows: [{ A: 'one', B: 'two', C: '' }],
    source: 'jsonl'
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
  assert.match(rowHtml, /template-query-btn/u);
  assert.match(rowHtml, /Create template from this query/u);
  assert.match(rowHtml, /history-template-blocks-icon/u);
  assert.match(rowHtml, /template-block-top/u);
  assert.doesNotMatch(rowHtml, /<path d="M6 3h8l4 4v14H6z"/u);
  assert.match(rowHtml, /history-actions-cell/u);
  assert.match(rowHtml, /history-actions-group/u);
  assert.match(rowHtml, /history-results-icon/u);
  assert.match(rowHtml, /history-row-metric-label">Last run/u);
  assert.match(rowHtml, /history-row-metric-label">Duration/u);
  assert.match(rowHtml, /history-action-label">Open/u);
  assert.match(rowHtml, /history-action-label">Template/u);
  assert.match(rowHtml, /history-action-label">Rerun/u);
  assert.match(rowHtml, /history-rerun-icon/u);
  assert.match(rowHtml, /M3 12a9 9 0 0 1 9-9/u);
  assert.doesNotMatch(rowHtml, /margin-left:4px/u);
  assert.match(rowHtml, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/u);
  assert.doesNotMatch(rowHtml, /<script>alert/u);

  const runningRowHtml = createQueriesTableRowHtml({
    id: 'Q2',
    name: 'Running progress',
    status: 'running',
    running: true,
    startTime: '2026-01-01T00:00:00.000Z',
    resultCount: 0,
    progress: {
      stage: 'loading_dynamic_fields',
      label: 'Loading requested field values',
      detail: 'Preparing additional result fields',
      current: 250,
      total: 1000,
      unit: 'records',
      counters: {
        candidate_rows: 1000,
        lookup_keys: 300
      }
    },
    jsonConfig: { DesiredColumnOrder: ['Title'], Filters: [] }
  }, {
    dependencies: {
      formatDuration: seconds => `${seconds}s`,
      normalizeUiConfigFilters: () => []
    }
  });

  assert.match(runningRowHtml, /Loading requested field values/u);
  assert.match(runningRowHtml, /Preparing additional result fields - 250 \/ 1,000 records/u);
  assert.match(runningRowHtml, /Candidate Rows/u);

  const failedQuery = {
    id: 'Q3',
    name: 'Failed diagnostics',
    status: 'failed',
    failed: true,
    startTime: '2026-01-01T00:00:00.000Z',
    endTime: '2026-01-01T00:00:05.000Z',
    error: 'Backend failed',
    errorDetails: {
      stage: 'loading_dynamic_fields',
      component: 'marc_enrichment',
      code: 'catalogdump_failed',
      message: 'catalogdump failed with exit code 2',
      hint: 'Check catalogdump permissions.',
      command: 'catalogdump -ka -z -om',
      exitCode: 2,
      context: {
        candidate_rows: 42
      }
    },
    jsonConfig: { DesiredColumnOrder: ['Title'], Filters: [] }
  };

  const failedRowHtml = createQueriesTableRowHtml(failedQuery, {
    dependencies: {
      formatDuration: seconds => `${seconds}s`,
      normalizeUiConfigFilters: () => []
    }
  });

  assert.match(failedRowHtml, /Marc Enrichment - Catalogdump Failed/u);

  const failedDetailsHtml = buildHistoryDetailsOverlayHtml(failedQuery, {
    normalizeUiConfigFilters: () => [],
    formatStandardFilterTooltipHTML: () => ''
  });

  assert.match(failedDetailsHtml, /Check catalogdump permissions\./u);
  assert.match(failedDetailsHtml, /catalogdump -ka -z -om/u);
  assert.match(failedDetailsHtml, /Candidate Rows/u);

  const longDetailsHtml = buildHistoryDetailsOverlayHtml({
    id: 'Q4',
    name: 'Large query shape',
    status: 'complete',
    jsonConfig: {
      DesiredColumnOrder: ['Title', 'Author', 'Branch', 'Status', 'Call Number', 'Barcode', 'Public Note', 'MARC 590', '<Unsafe>'],
      Filters: [
        { FieldName: 'Title', FieldOperator: 'Contains', Values: ['history'] },
        { FieldName: 'Author', FieldOperator: 'Equals', Values: ['Smith'] },
        { FieldName: 'Branch', FieldOperator: 'Equals', Values: ['Main'] },
        { FieldName: 'Status', FieldOperator: 'DoesNotEqual', Values: ['Lost'] },
        { FieldName: 'Public Note', FieldOperator: 'Contains', Values: ['one', 'two', 'three'] },
        { FieldName: 'MARC 590', FieldOperator: 'Contains', Values: ['local'] },
        { FieldName: 'Due Date', FieldOperator: 'Before', Values: ['20260101'] },
        { FieldName: 'Bill Count', FieldOperator: 'GreaterThan', Values: ['2'] }
      ]
    }
  }, {
    normalizeUiConfigFilters: uiConfig => uiConfig.Filters,
    formatStandardFilterTooltipHTML: filters => `<div class="tt-filter-container"><ul class="tt-filter-list">${filters.map(filter => `<li>${filter.FieldName}</li>`).join('')}</ul></div>`
  });

  assert.doesNotMatch(longDetailsHtml, /history-details-list-expander/u);
  assert.doesNotMatch(longDetailsHtml, /Showing 6 of 9 fields/u);
  assert.doesNotMatch(longDetailsHtml, /\.\.\. 3 more/u);
  assert.doesNotMatch(longDetailsHtml, /Showing 6 of 8 filters/u);
  assert.doesNotMatch(longDetailsHtml, /\.\.\. 2 more/u);
  assert.match(longDetailsHtml, /history-details-scroll-list/u);
  assert.match(longDetailsHtml, /Bill Count/u);
  assert.match(longDetailsHtml, /&lt;Unsafe&gt;/u);
});

test('query history config clears stale table data before rendering new fields', () => {
  let clearedTableData = false;
  let nextQueryState = null;
  const tableNameInput = {
    classList: { remove() {} },
    dispatchEvent() {},
    value: ''
  };
  const loadQueryConfig = createQueryHistoryConfigLoader({
    appServices: { isFormModeActive: () => false },
    document: {
      getElementById: () => tableNameInput,
      querySelectorAll: () => []
    },
    dom: { tableNameInput },
    historyDependencies: { mapper: () => ({}) },
    queryChangeManager: {
      setLifecycleState() {},
      setQueryState(state) {
        nextQueryState = state;
      }
    },
    queryStateReaders: {
      getDisplayedFields: () => nextQueryState?.displayedFields || [],
      getSerializableState: () => ({})
    },
    services: {
      clearPostFilters() {},
      clearVirtualTableData() {
        clearedTableData = true;
      }
    },
    uiActions: {
      updateButtonStates() {},
      updateFilterSidePanel() {},
      updateTableResultsLip() {}
    },
    appendUniqueColumn: (columns, field) => {
      if (!columns.includes(field)) columns.push(field);
    },
    mapFieldOperatorToUiCond: () => 'equals',
    normalizeUiConfigFilters: () => [],
    registerDynamicField: () => {},
    resolveFieldName: field => field,
    resolveSpecialPayloadFieldNames: () => []
  });

  assert.equal(loadQueryConfig({
    id: 'next-query',
    name: 'Next query',
    jsonConfig: { DesiredColumnOrder: ['Title'] }
  }), true);
  assert.equal(clearedTableData, true);
  assert.deepEqual(nextQueryState.displayedFields, ['Title']);
});

test('query history result loads ignore stale responses after a newer result is opened', async () => {
  const deferred = [];
  const hydratedRows = [];
  const lifecycleEvents = [];
  const queries = new Map([
    ['old-query', {
      id: 'old-query',
      name: 'Old query',
      jsonConfig: { DesiredColumnOrder: ['Title'] }
    }],
    ['new-query', {
      id: 'new-query',
      name: 'New query',
      jsonConfig: { DesiredColumnOrder: ['Title'] }
    }]
  ]);
  let activeProgressQueryId = '';
  let currentTableData = null;

  function createDeferredResult(queryId) {
    let resolve;
    const promise = new Promise(resolvePromise => {
      resolve = resolvePromise;
    });
    deferred.push({ queryId, resolve });
    return promise;
  }

  const loadQueryResults = createQueryHistoryResultsLoader({
    appState: {},
    historyResultProgress: {
      clear() {
        activeProgressQueryId = '';
      },
      fetchResults: queryId => createDeferredResult(queryId),
      getActiveQueryId: () => activeProgressQueryId,
      start(query) {
        activeProgressQueryId = query.id;
      }
    },
    notifyHistoryResultLoadComplete() {},
    prepareHistoryResultLoadNotification: () => null,
    queryChangeManager: {
      replaceDisplayedFields(fields) {
        this.displayedFields = fields;
      },
      setLifecycleState(state) {
        lifecycleEvents.push(state);
      }
    },
    queryStateReaders: {
      getDisplayedFields: () => ['Title'],
      getLifecycleState: () => ({ currentQueryId: 'new-query', hasLoadedResultSet: true })
    },
    services: {
      table: true,
      closeAllModals() {},
      getPostFilterState: () => ({}),
      getVirtualTableData: () => currentTableData,
      isDuplicateRowCollapseActive: () => true,
      isSplitColumnsActive: () => false,
      renderVirtualTable() {},
      rerenderBubbles() {},
      resetBubbleScroll() {},
      setVirtualTableData(data) {
        currentTableData = data;
        hydratedRows.push(data.rows[0][0]);
      },
      syncColumnResizeModeUi() {},
      updateBubbleScrollBar() {}
    },
    uiState: { getFieldSearch: () => '' },
    showToastMessage() {},
    uiActions: {
      showExampleTable: () => Promise.resolve(),
      syncTableViewportHeight() {},
      updateButtonStates() {},
      updateSplitColumnsToggleState() {},
      updateTableResultsLip() {}
    },
    getHistoryQueryById: queryId => queries.get(queryId),
    loadQueryConfig: () => true,
    renderQueries() {}
  });

  const oldLoad = loadQueryResults('old-query');
  await Promise.resolve();
  assert.deepEqual(deferred.map(entry => entry.queryId), ['old-query']);
  const newLoad = loadQueryResults('new-query');
  await Promise.resolve();
  assert.deepEqual(deferred.map(entry => entry.queryId), ['old-query', 'new-query']);

  deferred[1].resolve({
    jsonPayload: { columns: ['Title'], rows: [['New row']] },
    response: null,
    streamError: false
  });
  assert.equal(await newLoad, true);
  assert.deepEqual(hydratedRows, ['New row']);

  deferred[0].resolve({
    jsonPayload: { columns: ['Title'], rows: [['Old row']] },
    response: null,
    streamError: false
  });
  assert.equal(await oldLoad, false);
  assert.deepEqual(hydratedRows, ['New row']);
  assert.equal(currentTableData.rows[0][0], 'New row');
  assert.equal(lifecycleEvents.some(event => event.currentQueryId === 'new-query'), true);
});
