// core/queryExecution.js
// HTTP query execution: build payload, run, stop, stream, parse, clear.
// UI coordination after a query completes goes through AppUiActions/AppServices.

const execDom = window.DOM;
var appState = window.AppState;
var services = window.AppServices;
var uiActions = window.AppUiActions;
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
  if (typeof window.updateTableQueryAnimationProgress === 'function') {
    window.updateTableQueryAnimationProgress({
      resultCount,
      startTime: options.startTime
    });
  }

  updateQueryHistoryEntry(window.QueryStateReaders.getLifecycleState().currentQueryId, { resultCount }, { render: false });
}

/* ---------- Streaming response reader ---------- */

async function readStreamedQueryText(response, options = {}) {
  if (!response.body || typeof response.body.getReader !== 'function') {
    const fallbackText = await response.text();
    const fallbackLines = fallbackText.split('\n').filter(line => line.trim().length > 0);
    if (typeof options.onProgress === 'function') {
      options.onProgress(fallbackLines.length);
    }
    return { text: fallbackText, lines: fallbackLines };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const lines = [];
  let bufferedText = '';
  let fullText = '';
  let partial = false;

  while (true) {
    if (!window.QueryStateReaders.getLifecycleState().queryRunning) { partial = true; break; }
    const { value, done } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    fullText += chunk;
    bufferedText += chunk;

    const chunkParts = bufferedText.split(/\r?\n/);
    bufferedText = chunkParts.pop() || '';
    let didCountAdvance = false;

    chunkParts.forEach(line => {
      if (line.trim().length === 0) return;
      lines.push(line);
      didCountAdvance = true;
    });

    if (didCountAdvance && typeof options.onProgress === 'function') {
      options.onProgress(lines.length);
    }
  }

  const tail = decoder.decode();
  if (tail) {
    fullText += tail;
    bufferedText += tail;
  }

  if (bufferedText.trim().length > 0) {
    lines.push(bufferedText);
    if (typeof options.onProgress === 'function') {
      options.onProgress(lines.length);
    }
  }

  return { text: fullText, lines, partial };
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

window.clearCurrentQuery = async function clearCurrentQuery() {
  if (window.QueryChangeManager && typeof window.QueryChangeManager.clearQuery === 'function') {
    return window.QueryChangeManager.clearQuery();
  }

  throw new Error('QueryChangeManager.clearQuery is unavailable.');
};

/* ---------- Clear-query button ---------- */

  if (execDom.clearQueryBtn) {
  execDom.clearQueryBtn.addEventListener('click', () => {
    window.QueryChangeManager.clearQuery().catch(error => {
      console.error('Failed to clear query:', error);
      window.showToastMessage('Failed to clear query.', 'error');
    });
  });
}

/* ---------- Run / Stop button ---------- */

if (execDom.runBtn) {
  execDom.runBtn.addEventListener('click', () => {
    if (execDom.runBtn.disabled) return;   // ignore when disabled

    // If query is running, stop it
    if (window.QueryStateReaders.getLifecycleState().queryRunning) {
      window.showToastMessage('Stopping query…', 'info');
      const lifecycleState = window.QueryStateReaders.getLifecycleState();
      if (lifecycleState.currentQueryId && typeof window.cancelQuery === 'function') {
        window.cancelQuery(lifecycleState.currentQueryId).catch(err => {
          console.error('Cancellation failed', err);
        });
      }

      window.QueryChangeManager.setLifecycleState({ queryRunning: false }, { source: 'QueryExecution.stopQuery', silent: true });
      uiActions.updateRunButtonIcon();
      uiActions.updateButtonStates();
      if (window.endTableQueryAnimation) window.endTableQueryAnimation();
      return;
    }

    // Start query execution
    (async () => {
      // Remember if split mode was active, then disable it to avoid mapping dynamic Field N names.
      const wasSplitActive = services.isSplitColumnsActive() || window.splitColumnsActive || false;
      if (wasSplitActive) {
        services.setSplitColumnsMode(false);
        if (window.resetSplitColumnsToggleUI) window.resetSplitColumnsToggleUI();
      }

      window.QueryChangeManager.setLifecycleState({
        currentQueryId: null,
        queryRunning: true,
        hasPartialResults: false
      }, { source: 'QueryExecution.startQuery', silent: true });
      try {
        uiActions.updateRunButtonIcon();
        uiActions.updateButtonStates();
        if (window.startTableQueryAnimation) window.startTableQueryAnimation();
        const queryStartedAt = Date.now();
        updateLiveQueryProgress(0, { startTime: queryStartedAt });

        const state = window.QueryStateReaders.getSerializableState();
        const queryName = typeof window.ensureTableName === 'function'
          ? window.ensureTableName({ generateIfEmpty: true })
          : (execDom.tableNameInput ? execDom.tableNameInput.value.trim() : '');
        const payload = window.buildBackendQueryPayload(queryName);
        const historyConfig = typeof window.buildQueryUiConfig === 'function'
          ? window.buildQueryUiConfig()
          : {
              DesiredColumnOrder: state.displayedFields,
              Filters: []
            };

        console.log('Sending query payload:', payload);

        const response = await window.BackendApi.request(payload, { keepalive: true });

        // Capture Query ID and register in history
        const responseQueryId = response.headers.get('X-Query-Id');
        window.QueryChangeManager.setLifecycleState({ currentQueryId: responseQueryId }, { source: 'QueryExecution.setQueryId', silent: true });
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

          addQueryHistoryEntry(newQuery);

          // Start external polling for status
          services.startHistoryDurationUpdates();
        }

        if (!response.ok) {
          throw new Error(`Server error: ${response.status} ${response.statusText}`);
        }

        window.showToastMessage('Connected — streaming results…', 'info');
        const streamedPayload = await readStreamedQueryText(response, {
          onProgress: rowCount => {
            if (!window.QueryStateReaders.getLifecycleState().queryRunning) return;
            updateLiveQueryProgress(rowCount, { startTime: queryStartedAt });
          }
        });
        const text = streamedPayload.text;

        // If user stopped mid-stream, show whatever was received as partial results
        if (streamedPayload.partial) {
          if (streamedPayload.lines.length === 0) {
            console.log('Query stopped by user before any data arrived; discarding.');
            updateQueryHistoryEntry(window.QueryStateReaders.getLifecycleState().currentQueryId, {
              running: false,
              status: 'stopped',
              resultCount: 0,
              endTime: new Date().toISOString()
            });
            window.showToastMessage('Query stopped — no results received.', 'info');
            return;
          }
          console.log(`Query stopped mid-stream. Processing ${streamedPayload.lines.length} partial lines.`);
        }

        // Parse pipe-delimited response.
        // Use X-Raw-Columns to understand the actual output order from the backend,
        // then map into the requested state.displayedFields order.
        const rawColsHeader = response.headers.get('X-Raw-Columns');
        const rawColumns = rawColsHeader ? rawColsHeader.split('|') : state.displayedFields;

        const lines = Array.isArray(streamedPayload.lines)
          ? streamedPayload.lines.slice()
          : text.split('\n').filter(line => line.trim().length > 0);
        const headers = state.displayedFields; // Requested order
        const rows = lines.map(line => {
          const obj = typeof window.parsePipeDelimitedRow === 'function'
            ? window.parsePipeDelimitedRow(line, rawColumns)
            : {};
          // Ensure all requested headers exist
          headers.forEach(h => {
            if (!(h in obj)) obj[h] = '';
          });
          return obj;
        });

        console.log(`Received ${rows.length} rows`);
        updateLiveQueryProgress(rows.length, { startTime: queryStartedAt });

        // Mark as complete (or stopped) in history
        updateQueryHistoryEntry(window.QueryStateReaders.getLifecycleState().currentQueryId, {
          running: false,
          status: streamedPayload.partial ? 'stopped' : 'complete',
          resultCount: rows.length,
          endTime: new Date().toISOString()
        });

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
          if (window.QueryTableView?.showExampleTable) {
            await uiActions.showExampleTable(state.displayedFields);
          } else {
            services.renderVirtualTable();
            services.calculateOptimalColumnWidths();
          }

          // Re-render bubbles to reflect the new state and correct totalRows
          services.rerenderBubbles();

          // Reset bubble scroll back to the top
          services.resetBubbleScroll();

          // Restore split-columns mode if it was active before the query ran
          if (wasSplitActive) {
            if (window.setSplitColumnsToggleUIActive) window.setSplitColumnsToggleUIActive();
            services.setSplitColumnsMode(true);
          }
        }

        // Update last-executed state
        window.QueryChangeManager.setLifecycleState({
          lastExecutedQueryState: window.QueryStateReaders.getSerializableState(),
          hasPartialResults: streamedPayload.partial
        }, { source: 'QueryExecution.completeQuery', silent: true });
        if (streamedPayload.partial) {
          uiActions.updateTableResultsLip();
          window.showToastMessage(`Query stopped early. Showing ${rows.length} partial result${rows.length !== 1 ? 's' : ''}.`, 'info');
        } else {
          window.showToastMessage(`Query completed. Loaded ${rows.length} results.`, 'success');
        }

      } catch (error) {
        if (appState.queryPageIsUnloading) {
          console.info('Query request interrupted by navigation; skipping failure handling.');
          return;
        }

        // Checking if the query was manually stopped by the user
        if (!window.QueryStateReaders.getLifecycleState().queryRunning) {
          console.log('Query execution interrupted by user stop/cancel.');
          return;
        }

        if (error?.isRateLimited) {
          return;
        }

        console.error('Query execution failed:', error);

        // Mark as failed in history
        updateQueryHistoryEntry(window.QueryStateReaders.getLifecycleState().currentQueryId, {
          running: false,
          status: 'failed',
          error: error.message,
          endTime: new Date().toISOString()
        });

        window.showToastMessage('Query execution failed: ' + error.message, 'error');
      } finally {
        window.QueryChangeManager.setLifecycleState({ queryRunning: false }, { source: 'QueryExecution.finishQuery', silent: true });
        uiActions.updateTableResultsLip();
        uiActions.updateRunButtonIcon();
        uiActions.updateButtonStates();
        if (window.endTableQueryAnimation) window.endTableQueryAnimation();
      }
    })();
  });
}
