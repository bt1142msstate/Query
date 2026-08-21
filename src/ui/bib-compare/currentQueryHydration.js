import { appServices } from '../../core/appServices.js';
import { BackendApi } from '../../core/backendApi.js';
import { fieldDefsArray } from '../../core/fieldDefs.js';
import { parseQueryResultPayload } from '../../core/queryResultParser.js';
import { buildResultTableRowsFromObjectRows } from '../../core/queryResultRows.js';
import { assertQueryRunStreamResponse } from '../../core/queryRunResponse.js';
import { QueryStateReaders } from '../../core/queryState.js';
import { createStreamedQueryResultReader } from '../../core/queryStream.js';
import { buildBackendQueryPayloadFromParts } from '../../features/filters/queryPayload.js';
import { getNonBlankCellValueParts } from '../../core/resultCellValues.js';
import { getClientErrorMessage } from '../../core/clientErrorMessages.js';

const readStreamedQueryResult = createStreamedQueryResultReader();

function currentQuerySourceMarkup() {
  return `
    <button class="bib-current-query-button" type="button" data-bib-current-query disabled>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h10"/><path d="m16 16 2 2 4-4"/></svg>
      <span>Use current query</span>
    </button>
    <p class="bib-current-query-note" data-bib-current-query-note>Run a query first.</p>
    <div class="bib-bulk-source-divider"><span>or provide a list</span></div>
  `;
}

function getBibliographicLookupFields(definitions = fieldDefsArray) {
  return (Array.isArray(definitions) ? definitions : [])
    .filter(definition => definition?.recordLookupScope === 'bibliographic' && definition?.recordLookupType)
    .slice()
    .sort((left, right) => Number(left.recordLookupPriority || 999) - Number(right.recordLookupPriority || 999));
}

function findAvailableLookupField(tableData, definitions = fieldDefsArray) {
  const columnMap = tableData?.columnMap instanceof Map ? tableData.columnMap : new Map();
  return getBibliographicLookupFields(definitions).find(definition => columnMap.has(definition.name)) || null;
}

function valuesFromLookupColumn(tableData, definition) {
  if (!definition || !(tableData?.columnMap instanceof Map)) return [];
  const columnIndex = tableData.columnMap.get(definition.name);
  if (columnIndex === undefined) return [];
  const seen = new Set();
  const values = [];
  (Array.isArray(tableData.rows) ? tableData.rows : []).forEach(row => {
    getNonBlankCellValueParts(row?.[columnIndex]).forEach(rawValue => {
      const value = String(rawValue || '').trim();
      if (!value || seen.has(value)) return;
      seen.add(value);
      values.push(value);
    });
  });
  return values;
}

function buildEntries(values, definition) {
  return values.map(value => ({
    lookup_type: definition.recordLookupType,
    query: value,
    original: value
  }));
}

function buildAuxiliaryPayload({ queryState, lookupField, rowLimit }) {
  const displayedFields = [...new Set([
    ...(queryState?.displayedFields || []),
    lookupField.name
  ])];
  return buildBackendQueryPayloadFromParts({
    activeFilters: queryState?.activeFilters || {},
    displayFields: displayedFields,
    name: 'Hydration source',
    payload: {
      max_rows: Math.max(1, Number(rowLimit || 0))
    }
  });
}

function createTableData(headers, objectRows) {
  return {
    headers: [...headers],
    rows: buildResultTableRowsFromObjectRows(headers, objectRows),
    columnMap: new Map(headers.map((header, index) => [header, index]))
  };
}

function validateEntryCount(entries) {
  if (!entries.length) throw new Error('The current query has no records to hydrate.');
  return entries;
}

function createCurrentQueryHydrationSource({
  workspace,
  controller,
  setSearchStatus,
  showToastMessage,
  services = appServices,
  queryStateReaders = QueryStateReaders,
  definitions = fieldDefsArray
}) {
  const button = workspace.querySelector('[data-bib-current-query]');
  const note = workspace.querySelector('[data-bib-current-query-note]');
  let running = false;

  function availability() {
    const lifecycle = queryStateReaders.getLifecycleState();
    if (running) return { enabled: false, note: 'Preparing the current query...' };
    if (lifecycle.queryRunning) return { enabled: false, note: 'Wait for the current query to finish.' };
    if (!lifecycle.hasLoadedResultSet) return { enabled: false, note: 'Run a query first.' };
    const rowCount = services.getVirtualTableData()?.rows?.length || 0;
    return {
      enabled: rowCount > 0,
      note: rowCount > 0
        ? `Use the ${rowCount.toLocaleString()} records in the current result view.`
        : 'The current query has no records.'
    };
  }

  function refresh() {
    const status = availability();
    if (button) button.disabled = !status.enabled;
    if (note) note.textContent = status.note;
  }

  async function fetchMissingLookupField(lookupField) {
    const lifecycle = queryStateReaders.getLifecycleState();
    if (lifecycle.hasPartialResults) {
      throw new Error('The current result is partial. Rerun it to completion before Hydration fetches a missing identifier.');
    }
    const queryState = lifecycle.lastExecutedQueryState;
    if (!queryState) throw new Error('The executed query definition is not available. Rerun the query first.');
    const rawRowCount = services.getRawTableData()?.rows?.length || services.getVirtualTableData()?.rows?.length || 0;
    const payload = buildAuxiliaryPayload({ queryState, lookupField, rowLimit: rawRowCount + 1 });
    const response = await BackendApi.request(payload, { timeoutMs: 180000 });
    await assertQueryRunStreamResponse(response, BackendApi);
    const streamed = await readStreamedQueryResult(response);
    if (streamed.partial) throw new Error('The identifier lookup ended early. Try again after the connection is stable.');
    const parsed = parseQueryResultPayload({
      jsonPayload: streamed.jsonPayload,
      displayedFields: payload.display_fields,
      fallbackColumns: payload.display_fields
    });
    const tableData = createTableData(parsed.headers, parsed.objectRows);
    return services.filterDetachedTableData(tableData, {
      postFilters: services.getPostFilterState(),
      splitColumns: services.isSplitColumnsActive()
    });
  }

  async function run() {
    if (!availability().enabled) return;
    running = true;
    refresh();
    try {
      const currentTable = services.getVirtualTableData();
      let lookupField = findAvailableLookupField(currentTable, definitions);
      let sourceTable = currentTable;
      let fetched = false;
      if (!lookupField) {
        lookupField = getBibliographicLookupFields(definitions)[0];
        if (!lookupField) throw new Error('The backend did not provide a bibliographic lookup field for Hydration.');
        setSearchStatus(`Fetching ${lookupField.name} for the current query...`);
        sourceTable = await fetchMissingLookupField(lookupField);
        fetched = true;
      }
      const entries = validateEntryCount(buildEntries(valuesFromLookupColumn(sourceTable, lookupField), lookupField));
      setSearchStatus(
        `${entries.length.toLocaleString()} current-query records loaded${fetched ? ` after fetching ${lookupField.name}` : ''}.`,
        'success'
      );
      await controller.run(entries);
    } catch (error) {
      const message = getClientErrorMessage(error, { fallback: 'The current query could not be prepared for Hydration. Try again.' });
      setSearchStatus(message, 'error');
      showToastMessage(message, 'error');
    } finally {
      running = false;
      refresh();
    }
  }

  button?.addEventListener('click', run);
  return { refresh, run };
}

export {
  buildAuxiliaryPayload,
  buildEntries,
  createCurrentQueryHydrationSource,
  currentQuerySourceMarkup,
  findAvailableLookupField,
  getBibliographicLookupFields,
  validateEntryCount,
  valuesFromLookupColumn
};
