import { parseQueryResultPayload } from '../../../core/queryResultParser.js';
import {
  applyResultViewState,
  buildCurrentResultViewState,
  encodeResultViewState,
  readResultViewStateFromLocation
} from '../../../core/resultViewState.js';
import { buildTableRowsFromObjectRows, writeCachedHistoryResultSnapshot } from './queryHistoryResultCache.js';
import { rememberOpenedHistoryResult } from './queryHistoryResultSession.js';

export function createQueryHistoryResultsLoader({
  appState,
  historyResultProgress,
  notifyHistoryResultLoadComplete,
  parsePipeDelimitedRow,
  prepareHistoryResultLoadNotification,
  queryChangeManager,
  queryStateReaders,
  services,
  showToastMessage,
  uiActions,
  getHistoryQueryById,
  loadQueryConfig,
  renderQueries
}) {
  return async function loadQueryResults(queryId, options = {}) {
    const query = getHistoryQueryById(queryId);
    if (!query) return;

    loadQueryConfig(query);
    historyResultProgress.start(query, { render: renderQueries });
    const notificationPermission = options.notify === false ? null : prepareHistoryResultLoadNotification();

    showToastMessage(
      options.restore ? 'Restoring last opened results...' : (query.running ? 'Fetching live results...' : 'Fetching results...'),
      'info'
    );

    try {
      const { response, lines: streamedLines, streamError, text, jsonPayload } = await historyResultProgress.fetchResults(queryId);
      const rows = buildHistoryResultRows({
        response,
        streamedLines,
        text,
        jsonPayload,
        displayedFields: queryStateReaders?.getDisplayedFields?.() || [],
        fallbackColumns: query.jsonConfig ? query.jsonConfig.DesiredColumnOrder : [],
        parsePipeDelimitedRow
      });

      console.log(`Loaded ${rows.objectRows.length} rows from history`);
      const tableRows = buildTableRowsFromObjectRows(rows.headers, rows.objectRows);
      const incomingViewState = options.viewState || readResultViewStateFromLocation(options.location, { queryId });

      if (query.running) {
        query.resultCount = rows.objectRows.length;
        renderQueries();
      }

      queryChangeManager.setLifecycleState({
        currentQueryId: query.id,
        hasPartialResults: Boolean(query.running),
        hasLoadedResultSet: true
      }, { source: 'QueryHistory.loadQueryResults', silent: true });

      if (services.table) {
        await hydrateHistoryResultTable({
          headers: rows.headers,
          rows: tableRows,
          appState,
          queryStateReaders,
          queryChangeManager,
          viewState: incomingViewState,
          services,
          uiActions
        });
      }

      uiActions.updateTableResultsLip();
      if (options.remember !== false) {
        const viewState = buildCurrentResultViewState({ queryStateReaders, services });
        const resultViewParam = options.resultViewParam === undefined
          ? encodeResultViewState(viewState)
          : options.resultViewParam;
        rememberOpenedHistoryResult(query.id, {
          resultViewParam,
          updateUrl: true
        });
        await writeCachedHistoryResultSnapshot({
          query,
          queryId: query.id,
          headers: rows.headers,
          rows: tableRows,
          viewState
        });
      }

      showToastMessage(streamError
        ? `Connection ended early. Loaded ${rows.objectRows.length} partial results.`
        : (query.running
          ? `Loaded ${rows.objectRows.length} partial results from running query.`
          : `Loaded ${rows.objectRows.length} results.`), streamError ? 'warning' : 'success');
      if (options.notify !== false) {
        notifyHistoryResultLoadComplete({
          permissionPromise: notificationPermission,
          query,
          queryId,
          rowCount: rows.objectRows.length,
          streamError
        });
      }

      services.closeAllModals();
    } catch (error) {
      if (error?.isRateLimited) {
        return;
      }
      console.error('Failed to load results:', error);
      showToastMessage(`Failed to load results: ${error.message}`, 'error');
    } finally {
      historyResultProgress.clear({ render: renderQueries });
    }
  };
}

export function buildHistoryResultRows({
  response,
  streamedLines,
  text = '',
  jsonPayload = null,
  displayedFields,
  fallbackColumns,
  parsePipeDelimitedRow
}) {
  return parseQueryResultPayload({
    response,
    streamedLines,
    text,
    jsonPayload,
    displayedFields,
    fallbackColumns,
    parsePipeRow: parsePipeDelimitedRow
  });
}

async function hydrateHistoryResultTable({
  headers,
  objectRows,
  rows,
  appState,
  queryStateReaders,
  queryChangeManager,
  viewState,
  services,
  uiActions
}) {
  const columnMap = new Map();
  headers.forEach((header, index) => columnMap.set(header, index));
  const tableRows = Array.isArray(rows)
    ? rows
    : buildTableRowsFromObjectRows(headers, objectRows);

  services.setVirtualTableData({
    headers,
    rows: tableRows,
    columnMap
  });

  if (services.isSplitColumnsActive?.()) {
    services.setSplitColumnsMode(true);
  }
  uiActions.updateSplitColumnsToggleState?.();

  applyResultViewState(viewState, {
    queryChangeManager,
    services,
    uiActions
  });

  const displayedFields = queryStateReaders?.getDisplayedFields?.() || [];
  const renderFields = displayedFields.length
    ? displayedFields
    : (services.getVirtualTableData?.()?.headers || headers);

  await uiActions.showExampleTable(renderFields);
  services.rerenderBubbles();

  if (services.bubble?.resetBubbleScroll) {
    services.resetBubbleScroll();
  } else {
    appState.scrollRow = 0;
    services.updateBubbleScrollBar();
  }
  uiActions.updateButtonStates();
}

export { hydrateHistoryResultTable };
