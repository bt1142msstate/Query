// src/core/queryExecution.js
// HTTP query execution: build payload, run, stop, stream, parse, clear.
// UI coordination after a query completes goes through AppUiActions/AppServices.

import { BackendApi } from './backendApi.js';
import { notifyBackgroundTaskComplete, prepareBackgroundTaskNotification } from './backgroundTaskNotifications.js';
import { parseQueryResultPayload } from './queryResultParser.js';
import { AppState, QueryChangeManager, QueryStateReaders } from './queryState.js';
import { assertQueryRunStreamResponse } from './queryRunResponse.js';
import { createStreamedQueryResultReader } from './queryStream.js';
import { appServices, registerQueryExecutionService } from './appServices.js';
import { appUiActions } from './appUiActions.js';
import { showToastMessage } from './toast.js';
import { buildBackendQueryPayload, buildQueryUiConfig } from '../features/filters/queryPayload.js';
import { DOM } from './domCache.js';
import { ensureTableName } from '../ui/queryUI.js';

const execDom = DOM;
const appState = AppState;
const services = appServices;
const uiActions = appUiActions;
const ACTIVE_QUERY_STATUS_POLL_MS = 2000;
let activeQueryStatusPollTimer = null;
const readStreamedQueryResult = createStreamedQueryResultReader({
  isQueryRunning: () => QueryStateReaders.getLifecycleState().queryRunning
});
appState.queryPageIsUnloading = false;

function addQueryHistoryEntry(query) {
  return services.addHistoryQuery(query);
}

function updateQueryHistoryEntry(queryId, updates, options = {}) {
  if (!queryId || !updates || typeof updates !== 'object') {
    return null;
  }

  const updatedQuery = services.updateHistoryQuery(queryId, updates, options);
  if (updatedQuery) {
    return updatedQuery;
  }

  const query = services.getHistoryQueryById(queryId);
  if (!query) {
    return null;
  }

  Object.assign(query, updates);
  if (options.render !== false) {
    services.renderHistoryQueries();
  }
  return query;
}

/* ---------- Live-progress helper ---------- */

function updateLiveQueryProgress(resultCount, options = {}) {
  uiActions.updateTableQueryAnimationProgress({
    resultCount,
    startTime: options.startTime,
    progress: options.progress
  });

  updateQueryHistoryEntry(QueryStateReaders.getLifecycleState().currentQueryId, {
    resultCount,
    ...(options.progress ? { progress: options.progress } : {})
  }, { render: false });
}

function stopActiveQueryStatusPolling() {
  if (!activeQueryStatusPollTimer) {
    return;
  }

  clearInterval(activeQueryStatusPollTimer);
  activeQueryStatusPollTimer = null;
}

function startActiveQueryStatusPolling(queryId) {
  stopActiveQueryStatusPolling();
  if (!queryId) {
    return;
  }

  const poll = () => {
    const lifecycleState = QueryStateReaders.getLifecycleState();
    if (!lifecycleState.queryRunning || String(lifecycleState.currentQueryId || '') !== String(queryId)) {
      stopActiveQueryStatusPolling();
      return;
    }

    Promise.resolve(services.fetchHistoryQueryStatus?.()).catch(error => {
      if (!error?.isRateLimited) {
        console.warn('Failed to refresh active query progress', error);
      }
    });
  };

  poll();
  activeQueryStatusPollTimer = setInterval(poll, ACTIVE_QUERY_STATUS_POLL_MS);
}

function notifyQueryTaskComplete({ message, permissionPromise, queryId, title }) {
  notifyBackgroundTaskComplete({
    body: message,
    permissionPromise,
    tag: queryId ? `query-${queryId}` : 'query-execution',
    title
  }).catch(() => {});
}

/* ---------- Page-unload guard ---------- */

function markQueryPageUnload() {
  appState.queryPageIsUnloading = true;
}

window.addEventListener('beforeunload', markQueryPageUnload);
window.addEventListener('pagehide', markQueryPageUnload);

/* ---------- Initial button sync ---------- */

uiActions.updateButtonStates();

/* ---------- Public clear-query API ---------- */

async function clearCurrentQuery() {
  if (QueryChangeManager && typeof QueryChangeManager.clearQuery === 'function') {
    return QueryChangeManager.clearQuery();
  }

  throw new Error('QueryChangeManager.clearQuery is unavailable.');
}

registerQueryExecutionService(Object.freeze({ clearCurrentQuery }));

/* ---------- Clear-query button ---------- */

if (execDom.clearQueryBtn) {
  execDom.clearQueryBtn.addEventListener('click', () => {
    QueryChangeManager.clearQuery().catch(error => {
      console.error('Failed to clear query:', error);
      showToastMessage('Failed to clear query.', 'error');
    });
  });
}

/* ---------- Run / Stop button ---------- */

if (execDom.runBtn) {
  execDom.runBtn.addEventListener('click', () => {
    if (execDom.runBtn.disabled) return;   // ignore when disabled

    // If query is running, stop it
    if (QueryStateReaders.getLifecycleState().queryRunning) {
      showToastMessage('Stopping query…', 'info');
      const lifecycleState = QueryStateReaders.getLifecycleState();
      if (lifecycleState.currentQueryId) {
        Promise.resolve(services.cancelHistoryQuery(lifecycleState.currentQueryId)).catch(err => {
          console.error('Cancellation failed', err);
        });
      }

      QueryChangeManager.setLifecycleState({ queryRunning: false }, { source: 'QueryExecution.stopQuery', silent: true });
      uiActions.updateRunButtonIcon();
      uiActions.updateButtonStates();
      uiActions.endTableQueryAnimation();
      return;
    }

    // Start query execution
    (async () => {
      const completionNotification = prepareBackgroundTaskNotification();
      await services.forgetOpenedHistoryResult?.();
      // Temporarily use the stacked table state for payload building so generated
      // split-column names are never sent to the backend.
      const wasSplitPreferred = services.isSplitColumnsActive();
      if (wasSplitPreferred) {
        services.setSplitColumnsMode(false);
      }

      if (services.hasPostFilters?.()) {
        services.clearPostFilters({ refreshView: false, notify: true, resetScroll: false });
      }

      QueryChangeManager.setLifecycleState({
        currentQueryId: null,
        queryRunning: true,
        hasPartialResults: false
      }, { source: 'QueryExecution.startQuery', silent: true });
      try {
        uiActions.updateRunButtonIcon();
        uiActions.updateButtonStates();
        uiActions.startTableQueryAnimation();
        const queryStartedAt = Date.now();
        let currentHistoryQuery = null;
        updateLiveQueryProgress(0, { startTime: queryStartedAt });

        const state = QueryStateReaders.getSerializableState();
        const queryName = ensureTableName({ generateIfEmpty: true });
        const payload = buildBackendQueryPayload(queryName);
        const historyConfig = buildQueryUiConfig();

        console.log('Sending query payload:', payload);

        const response = await BackendApi.request(payload, { keepalive: true });
        await assertQueryRunStreamResponse(response, BackendApi);

        // Capture Query ID and register in history
        const responseQueryId = response.headers.get('X-Query-Id');
        QueryChangeManager.setLifecycleState({ currentQueryId: responseQueryId }, { source: 'QueryExecution.setQueryId', silent: true });
        if (responseQueryId) {
          const newQuery = {
            id: responseQueryId,
            name: queryName || `Query ${responseQueryId.substring(0, 8)}`,
            query: payload,
            jsonConfig: historyConfig,
            startTime: new Date().toISOString(),
            status: 'running',
            running: true,
            resultCount: 0
          };

          currentHistoryQuery = addQueryHistoryEntry(newQuery) || newQuery;

          // Start external polling for status
          services.startHistoryDurationUpdates();
          startActiveQueryStatusPolling(responseQueryId);
        }

        showToastMessage('Connected — streaming results…', 'info');
        const streamedPayload = await readStreamedQueryResult(response, {
          onProgress: rowCount => {
            if (!QueryStateReaders.getLifecycleState().queryRunning) return;
            updateLiveQueryProgress(rowCount, { startTime: queryStartedAt });
          }
        });
        // If user stopped mid-stream, show whatever was received as partial results
        if (streamedPayload.partial) {
          if (streamedPayload.lines.length === 0) {
            console.log('Query stopped by user before any data arrived; discarding.');
            const stoppedMessage = 'Query stopped — no results received.';
            updateQueryHistoryEntry(QueryStateReaders.getLifecycleState().currentQueryId, {
              running: false,
              status: 'stopped',
              resultCount: 0,
              endTime: new Date().toISOString()
            });
            notifyQueryTaskComplete({ message: stoppedMessage, permissionPromise: completionNotification, queryId: QueryStateReaders.getLifecycleState().currentQueryId, title: 'Query stopped' });
            showToastMessage(stoppedMessage, 'info');
            return;
          }
          if (streamedPayload.streamError) {
            console.warn(`${streamedPayload.streamError.message} Processing ${streamedPayload.lines.length} partial lines.`);
          } else {
            console.log(`Query stopped mid-stream. Processing ${streamedPayload.lines.length} partial lines.`);
          }
        }

        const parsedResults = parseQueryResultPayload({
          response,
          jsonPayload: streamedPayload.jsonPayload,
          displayedFields: state.displayedFields,
          fallbackColumns: state.displayedFields
        });
        const headers = parsedResults.headers;
        const rows = parsedResults.objectRows;

        console.log(`Received ${rows.length} rows`);
        updateLiveQueryProgress(rows.length, { startTime: queryStartedAt });

        // Mark as complete (or stopped) in history
        const endedEarlyFromNetwork = Boolean(streamedPayload.streamError);
        updateQueryHistoryEntry(QueryStateReaders.getLifecycleState().currentQueryId, {
          running: false,
          status: endedEarlyFromNetwork ? 'failed' : (streamedPayload.partial ? 'stopped' : 'complete'),
          resultCount: rows.length,
          failed: endedEarlyFromNetwork,
          cancelled: false,
          error: endedEarlyFromNetwork ? streamedPayload.streamError.message : null,
          endTime: new Date().toISOString()
        });

        // Mark this query state as executed before rendering the table so zero-row
        // result sets render as "no results" instead of the planning placeholder.
        QueryChangeManager.setLifecycleState({
          lastExecutedQueryState: QueryStateReaders.getSerializableState(),
          hasPartialResults: streamedPayload.partial,
          hasLoadedResultSet: true
        }, { source: 'QueryExecution.completeQuery', silent: true });

        // Update VirtualTable
        if (services.table) {
          const columnMap = new Map();
          headers.forEach((h, i) => columnMap.set(h, i));

          const newTableData = {
            headers: headers,
            rows: rows.map(r => headers.map(h => r[h])),
            columnMap: columnMap
          };

          services.setVirtualTableData(newTableData);

          // Re-render the full table to reset red column headers and redraw rows with new widths
          await uiActions.showExampleTable(state.displayedFields);

          // Re-render bubbles to reflect the new state and correct totalRows
          services.rerenderBubbles();

          // Reset bubble scroll back to the top
          services.resetBubbleScroll();

          // Restore the user's split-columns preference after the new raw data is loaded.
          if (wasSplitPreferred) {
            services.setSplitColumnsMode(true);
          }
        }
        await services.cacheOpenedHistoryResult?.({
          query: currentHistoryQuery,
          queryId: QueryStateReaders.getLifecycleState().currentQueryId,
          headers,
          rows: services.getRawTableData?.()?.rows || rows.map(row => headers.map(header => row[header]))
        });

        const completionMessage = streamedPayload.partial
          ? (endedEarlyFromNetwork
              ? `Query connection ended early. Showing ${rows.length} partial result${rows.length !== 1 ? 's' : ''}.`
              : `Query stopped early. Showing ${rows.length} partial result${rows.length !== 1 ? 's' : ''}.`)
          : `Query completed. Loaded ${rows.length} results.`;
        const completionType = endedEarlyFromNetwork ? 'warning' : (streamedPayload.partial ? 'info' : 'success');
        notifyQueryTaskComplete({
          message: completionMessage,
          permissionPromise: completionNotification,
          queryId: QueryStateReaders.getLifecycleState().currentQueryId,
          title: endedEarlyFromNetwork ? 'Query interrupted' : (streamedPayload.partial ? 'Query stopped' : 'Query complete')
        });
        if (streamedPayload.partial) {
          uiActions.updateTableResultsLip();
        }
        showToastMessage(completionMessage, completionType);

      } catch (error) {
        if (appState.queryPageIsUnloading) {
          console.info('Query request interrupted by navigation; skipping failure handling.');
          return;
        }

        // Checking if the query was manually stopped by the user
        if (!QueryStateReaders.getLifecycleState().queryRunning) {
          console.log('Query execution interrupted by user stop/cancel.');
          return;
        }

        if (error?.isRateLimited) {
          return;
        }

        console.error('Query execution failed:', error);

        // Mark as failed in history
        updateQueryHistoryEntry(QueryStateReaders.getLifecycleState().currentQueryId, {
          running: false,
          status: 'failed',
          failed: true,
          error: error.message,
          endTime: new Date().toISOString()
        });

        const failureMessage = 'Query execution failed: ' + error.message;
        notifyQueryTaskComplete({ message: failureMessage, permissionPromise: completionNotification, queryId: QueryStateReaders.getLifecycleState().currentQueryId, title: 'Query failed' });
        showToastMessage(failureMessage, 'error');
      } finally {
        stopActiveQueryStatusPolling();
        QueryChangeManager.setLifecycleState({ queryRunning: false }, { source: 'QueryExecution.finishQuery', silent: true });
        uiActions.updateTableResultsLip();
        uiActions.updateRunButtonIcon();
        uiActions.updateButtonStates();
        uiActions.endTableQueryAnimation();
      }
    })();
  });
}

export { clearCurrentQuery };
