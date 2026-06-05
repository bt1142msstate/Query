import { parseQueryResultPayload } from '../../core/queryResultParser.js';

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
  return async function loadQueryResults(queryId) {
    const query = getHistoryQueryById(queryId);
    if (!query) return;

    loadQueryConfig(query);
    historyResultProgress.start(query, { render: renderQueries });
    const notificationPermission = prepareHistoryResultLoadNotification();

    showToastMessage(query.running ? 'Fetching live results...' : 'Fetching results...', 'info');

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
          objectRows: rows.objectRows,
          appState,
          services,
          uiActions
        });
      }

      uiActions.updateTableResultsLip();

      showToastMessage(streamError
        ? `Connection ended early. Loaded ${rows.objectRows.length} partial results.`
        : (query.running
          ? `Loaded ${rows.objectRows.length} partial results from running query.`
          : `Loaded ${rows.objectRows.length} results.`), streamError ? 'warning' : 'success');
      notifyHistoryResultLoadComplete({
        permissionPromise: notificationPermission,
        query,
        queryId,
        rowCount: rows.objectRows.length,
        streamError
      });

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
  appState,
  services,
  uiActions
}) {
  const columnMap = new Map();
  headers.forEach((header, index) => columnMap.set(header, index));
  const tableRows = objectRows.map(row => headers.map(header => row[header]));

  services.setVirtualTableData({
    headers,
    rows: tableRows,
    columnMap
  });

  await uiActions.showExampleTable(headers);
  services.rerenderBubbles();

  if (services.bubble?.resetBubbleScroll) {
    services.resetBubbleScroll();
  } else {
    appState.scrollRow = 0;
    services.updateBubbleScrollBar();
  }
  uiActions.updateButtonStates();
}
