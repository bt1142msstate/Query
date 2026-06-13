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

    queryChangeManager.setLifecycleState({
      currentQueryId: query.id,
      hasPartialResults: false,
      hasLoadedResultSet: false
    }, { source: 'QueryHistory.loadQueryResults.start', silent: true });

    if (options.restore !== true) {
      forgetOpenedHistoryResult({ clearUrl: true });
    }

    historyResultProgress.start(query, { render: renderQueries });
    const notificationPermission = options.notify === false ? null : prepareHistoryResultLoadNotification();

    showToastMessage(
      options.restore ? 'Restoring last opened results...' : (query.running ? 'Fetching live results...' : 'Fetching results...'),
      'info'
    );

    try {
      const { response, streamError, jsonPayload } = await historyResultProgress.fetchResults(queryId);
      if (!isLatestLoad()) {
        return false;
      }

      const rows = buildHistoryResultRows({
        response,
        jsonPayload,
        displayedFields: queryStateReaders?.getDisplayedFields?.() || [],
        fallbackColumns: query.jsonConfig ? query.jsonConfig.DesiredColumnOrder : []
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
          uiState,
          uiActions
        });
      }

      uiActions.updateTableResultsLip();
      if (options.remember !== false) {
        const viewState = buildCurrentResultViewState({ queryStateReaders, services, uiState });
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

export { hydrateHistoryResultTable, syncHistoryResultWorkspaceLayout };
