import { parseQueryResultPayload } from '../../../core/queryResultParser.js';
import {
  applyResultViewState,
  buildCurrentResultViewState,
  encodeResultViewState,
  readResultViewStateFromLocation
} from '../../../core/resultViewState.js';
import { buildTableRowsFromObjectRows, writeCachedHistoryResultSnapshot } from './queryHistoryResultCache.js';
import { forgetOpenedHistoryResult, rememberOpenedHistoryResult } from './queryHistoryResultSession.js';

export function createQueryHistoryResultsLoader({
  appState,
  historyResultProgress,
  notifyHistoryResultLoadComplete,
  prepareHistoryResultLoadNotification,
  queryChangeManager,
  queryStateReaders,
  services,
  uiState,
  showToastMessage,
  uiActions,
  getHistoryQueryById,
  loadQueryConfig,
  renderQueries
}) {
  let activeLoadToken = 0;

  return async function loadQueryResults(queryId, options = {}) {
    const query = getHistoryQueryById(queryId);
    if (!query) return false;

    const loadToken = activeLoadToken + 1;
    activeLoadToken = loadToken;
    const isLatestLoad = () => loadToken === activeLoadToken;

    await loadQueryConfig(query);
    if (!isLatestLoad()) {
      return false;
    }

    beginHistoryResultLoad({ historyResultProgress, options, query, queryChangeManager, renderQueries });
    const notificationPermission = options.notify === false ? null : prepareHistoryResultLoadNotification();
    showHistoryResultStartToast({ options, query, showToastMessage });

    try {
      const { rows, streamError, tableRows } = await fetchAndBuildHistoryRows({
        historyResultProgress,
        query,
        queryId,
        queryStateReaders
      });
      if (!isLatestLoad()) {
        return false;
      }

      console.log(`Loaded ${rows.objectRows.length} rows from history`);
      const incomingViewState = options.viewState || readResultViewStateFromLocation(options.location, { queryId });

      updateRunningHistoryQueryCount({ query, renderQueries, rowCount: rows.objectRows.length });
      markHistoryResultLoaded({ query, queryChangeManager });

      if (services.table) {
        await hydrateHistoryResultTable({
          headers: rows.headers,
          rows: tableRows,
          appState,
          queryStateReaders,
          queryChangeManager,
          viewState: incomingViewState,
          services,
          uiState,
          uiActions
        });
      }

      uiActions.updateTableResultsLip();
      if (options.remember !== false) {
        await rememberHistoryResultSnapshot({
          query,
          queryStateReaders,
          resultViewParam: options.resultViewParam,
          services,
          headers: rows.headers,
          rows: tableRows,
          uiState
        });
      }

      completeHistoryResultLoad({
        notifyHistoryResultLoadComplete,
        notificationPermission,
        options,
        query,
        queryId,
        rowCount: rows.objectRows.length,
        showToastMessage,
        streamError
      });

      services.closeAllModals();
      syncHistoryResultWorkspaceLayout({ services, uiActions });
      return true;
    } catch (error) {
      if (!isLatestLoad()) {
        return false;
      }
      if (error?.isRateLimited) {
        return false;
      }
      console.error('Failed to load results:', error);
      showToastMessage(`Failed to load results: ${error.message}`, 'error');
      return false;
    } finally {
      if (isLatestLoad()) {
        historyResultProgress.clear({ render: renderQueries });
      }
    }
  };
}

function beginHistoryResultLoad({ historyResultProgress, options, query, queryChangeManager, renderQueries }) {
  queryChangeManager.setLifecycleState({
    currentQueryId: query.id,
    hasPartialResults: false,
    hasLoadedResultSet: false
  }, { source: 'QueryHistory.loadQueryResults.start', silent: true });

  if (options.restore !== true) {
    forgetOpenedHistoryResult({ clearUrl: true });
  }

  historyResultProgress.start(query, { render: renderQueries });
}

async function fetchAndBuildHistoryRows({ historyResultProgress, query, queryId, queryStateReaders }) {
  const { response, streamError, jsonPayload } = await historyResultProgress.fetchResults(queryId);
  const rows = buildHistoryResultRows({
    response,
    jsonPayload,
    displayedFields: queryStateReaders?.getDisplayedFields?.() || [],
    fallbackColumns: query.jsonConfig ? query.jsonConfig.DesiredColumnOrder : []
  });
  return {
    rows,
    streamError,
    tableRows: buildTableRowsFromObjectRows(rows.headers, rows.objectRows)
  };
}

function showHistoryResultStartToast({ options, query, showToastMessage }) {
  showToastMessage(
    options.restore ? 'Restoring last opened results...' : (query.running ? 'Fetching live results...' : 'Fetching results...'),
    'info'
  );
}

function updateRunningHistoryQueryCount({ query, renderQueries, rowCount }) {
  if (!query.running) {
    return;
  }
  query.resultCount = rowCount;
  renderQueries();
}

function markHistoryResultLoaded({ query, queryChangeManager }) {
  queryChangeManager.setLifecycleState({
    currentQueryId: query.id,
    hasPartialResults: Boolean(query.running),
    hasLoadedResultSet: true
  }, { source: 'QueryHistory.loadQueryResults', silent: true });
}

async function rememberHistoryResultSnapshot({
  headers,
  query,
  queryStateReaders,
  resultViewParam,
  rows,
  services,
  uiState
}) {
  const viewState = buildCurrentResultViewState({ queryStateReaders, services, uiState });
  rememberOpenedHistoryResult(query.id, {
    resultViewParam: resultViewParam === undefined ? encodeResultViewState(viewState) : resultViewParam,
    updateUrl: true
  });
  await writeCachedHistoryResultSnapshot({
    query,
    queryId: query.id,
    headers,
    rows,
    viewState
  });
}

function completeHistoryResultLoad({
  notificationPermission,
  notifyHistoryResultLoadComplete,
  options,
  query,
  queryId,
  rowCount,
  showToastMessage,
  streamError
}) {
  showToastMessage(streamError
    ? `Connection ended early. Loaded ${rowCount} partial results.`
    : (query.running
      ? `Loaded ${rowCount} partial results from running query.`
      : `Loaded ${rowCount} results.`), streamError ? 'warning' : 'success');
  if (options.notify === false) {
    return;
  }
  notifyHistoryResultLoadComplete({
    permissionPromise: notificationPermission,
    query,
    queryId,
    rowCount,
    streamError
  });
}

export function buildHistoryResultRows({
  response,
  jsonPayload = null,
  displayedFields,
  fallbackColumns
}) {
  return parseQueryResultPayload({
    response,
    jsonPayload,
    displayedFields,
    fallbackColumns
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
  uiState,
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
    uiState,
    uiActions
  });
  markHydratedResultStateAsExecuted({
    queryChangeManager,
    queryStateReaders
  });
  services.syncFormModeResultBaseline?.();

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
  syncHistoryResultWorkspaceLayout({ services, uiActions });
}

function markHydratedResultStateAsExecuted({
  queryChangeManager,
  queryStateReaders
} = {}) {
  const getSerializableState = queryStateReaders?.getSerializableState;
  const setLifecycleState = queryChangeManager?.setLifecycleState;
  if (typeof getSerializableState !== 'function' || typeof setLifecycleState !== 'function') {
    return;
  }

  setLifecycleState.call(queryChangeManager, {
    lastExecutedQueryState: getSerializableState.call(queryStateReaders)
  }, { source: 'QueryHistory.hydrateResultState', silent: true });
}

function syncHistoryResultWorkspaceLayout({
  services,
  uiActions,
  windowRef = globalThis.window
} = {}) {
  const sync = () => {
    uiActions?.syncTableViewportHeight?.();
    services?.renderVirtualTable?.();
  };

  sync();
  const requestFrame = windowRef?.requestAnimationFrame;
  const setTimer = windowRef?.setTimeout;

  if (typeof requestFrame === 'function') {
    requestFrame.call(windowRef, () => {
      sync();
      requestFrame.call(windowRef, sync);
    });
  }

  if (typeof setTimer === 'function') {
    [50, 150, 300].forEach(delay => {
      setTimer.call(windowRef, sync, delay);
    });
  }
}

export { hydrateHistoryResultTable, markHydratedResultStateAsExecuted, syncHistoryResultWorkspaceLayout };
