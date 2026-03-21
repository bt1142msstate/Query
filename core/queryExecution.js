// core/queryExecution.js
// HTTP query execution: build payload, run, stop, stream, parse, clear.
// UI coordination after a query completes (table render, bubble refresh) is
// delegated to window.showExampleTable and window.resetBubbleScrollState,
// which are exported by query.js.

const execDom = window.DOM;
let currentQueryId = null;
window.queryPageIsUnloading = false;

/* ---------- Live-progress helper ---------- */

function updateLiveQueryProgress(resultCount, options = {}) {
  if (typeof window.updateTableQueryAnimationProgress === 'function') {
    window.updateTableQueryAnimationProgress({
      resultCount,
      startTime: options.startTime
    });
  }

  if (currentQueryId && window.QueryHistorySystem) {
    const q = window.QueryHistorySystem.exampleQueries.find(query => query.id === currentQueryId);
    if (q) {
      q.resultCount = resultCount;
    }
  }
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
    if (!window.queryRunning) { partial = true; break; }
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
  window.queryPageIsUnloading = true;
}

window.addEventListener('beforeunload', markQueryPageUnload);
window.addEventListener('pagehide', markQueryPageUnload);

/* ---------- Initial button sync ---------- */

window.updateButtonStates?.();

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
    if (window.queryRunning) {
      window.showToastMessage('Stopping query…', 'info');
      if (currentQueryId && typeof window.cancelQuery === 'function') {
        window.cancelQuery(currentQueryId).catch(err => {
          console.error('Cancellation failed', err);
        });
      }

      window.queryRunning = false;
      window.updateRunButtonIcon();
      if (window.updateButtonStates) {
        window.updateButtonStates();
      }
      if (window.endTableQueryAnimation) window.endTableQueryAnimation();
      return;
    }

    // Start query execution
    (async () => {
      // Remember if split mode was active, then disable it to avoid mapping dynamic Field N names.
      const wasSplitActive = (window.VirtualTable && window.VirtualTable.splitColumnsActive) || window.splitColumnsActive || false;
      if (wasSplitActive && window.VirtualTable && typeof window.VirtualTable.setSplitColumnsMode === 'function') {
        window.VirtualTable.setSplitColumnsMode(false);
        if (window.resetSplitColumnsToggleUI) window.resetSplitColumnsToggleUI();
      }

      currentQueryId = null;
      try {
        window.queryRunning = true;
        window.hasPartialResults = false;
        window.updateRunButtonIcon();
        if (window.updateButtonStates) {
          window.updateButtonStates();
        }
        if (window.startTableQueryAnimation) window.startTableQueryAnimation();
        const queryStartedAt = Date.now();
        updateLiveQueryProgress(0, { startTime: queryStartedAt });

        const state = window.getCurrentQueryState();
        const queryName = typeof window.ensureTableName === 'function'
          ? window.ensureTableName()
          : (execDom.tableNameInput ? execDom.tableNameInput.value.trim() : '');
        const payload = window.buildBackendQueryPayload(queryName);
        const historyConfig = typeof window.buildQueryUiConfig === 'function'
          ? window.buildQueryUiConfig()
          : {
              DesiredColumnOrder: state.displayedFields,
              Filters: []
            };

        console.log('Sending query payload:', payload);

        const response = await fetch('https://mlp.sirsi.net/uhtbin/query_api.pl', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          keepalive: true,
          body: JSON.stringify(payload)
        });

        // Capture Query ID and register in history
        currentQueryId = response.headers.get('X-Query-Id');
        if (currentQueryId && window.addQueryToHistory) {
          const newQuery = {
            id: currentQueryId,
            name: queryName || `Query ${currentQueryId.substring(0, 8)}`,
            query: payload,
            jsonConfig: historyConfig,
            startTime: new Date().toISOString(),
            status: 'running',
            running: true,
            resultCount: 0
          };

          window.addQueryToHistory(newQuery);

          // Start external polling for status
          if (window.QueryHistorySystem && window.QueryHistorySystem.startQueryDurationUpdates) {
            window.QueryHistorySystem.startQueryDurationUpdates();
          }
        }

        if (!response.ok) {
          throw new Error(`Server error: ${response.status} ${response.statusText}`);
        }

        window.showToastMessage('Connected — streaming results…', 'info');
        const streamedPayload = await readStreamedQueryText(response, {
          onProgress: rowCount => {
            if (!window.queryRunning) return;
            updateLiveQueryProgress(rowCount, { startTime: queryStartedAt });
          }
        });
        const text = streamedPayload.text;

        // If user stopped mid-stream, show whatever was received as partial results
        if (streamedPayload.partial) {
          if (streamedPayload.lines.length === 0) {
            console.log('Query stopped by user before any data arrived; discarding.');
            if (currentQueryId && window.QueryHistorySystem) {
              const q = window.QueryHistorySystem.exampleQueries.find(q => q.id === currentQueryId);
              if (q) {
                q.running = false;
                q.status = 'stopped';
                q.resultCount = 0;
                q.endTime = new Date().toISOString();
                window.QueryHistorySystem.renderQueries();
              }
            }
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
        if (currentQueryId && window.QueryHistorySystem) {
          const q = window.QueryHistorySystem.exampleQueries.find(q => q.id === currentQueryId);
          if (q) {
            q.running = false;
            q.status = streamedPayload.partial ? 'stopped' : 'complete';
            q.resultCount = rows.length;
            q.endTime = new Date().toISOString();
            window.QueryHistorySystem.renderQueries();
          }
        }

        // Update VirtualTable
        if (window.VirtualTable) {
          const columnMap = new Map();
          headers.forEach((h, i) => columnMap.set(h, i));

          const newTableData = {
            headers: headers,
            rows: rows.map(r => headers.map(h => r[h])),
            columnMap: columnMap
          };

          window.VirtualTable.virtualTableData = newTableData;

          // Re-render the full table to reset red column headers and redraw rows with new widths
          if (typeof window.showExampleTable === 'function') {
            await window.showExampleTable(state.displayedFields);
          } else {
            window.VirtualTable.renderVirtualTable();
            window.VirtualTable.calculateOptimalColumnWidths();
          }

          // Re-render bubbles to reflect the new state and correct totalRows
          if (window.BubbleSystem) window.BubbleSystem.safeRenderBubbles();

          // Reset bubble scroll back to the top
          window.resetBubbleScrollState?.();
          if (window.updateButtonStates) window.updateButtonStates();

          // Restore split-columns mode if it was active before the query ran
          if (wasSplitActive && window.VirtualTable && typeof window.VirtualTable.setSplitColumnsMode === 'function') {
            if (window.setSplitColumnsToggleUIActive) window.setSplitColumnsToggleUIActive();
            window.VirtualTable.setSplitColumnsMode(true);
          }
        }

        // Update last-executed state
        window.lastExecutedQueryState = window.getCurrentQueryState();
        if (streamedPayload.partial) {
          window.hasPartialResults = true;
          if (window.updateTableResultsLip) window.updateTableResultsLip();
          window.showToastMessage(`Query stopped early. Showing ${rows.length} partial result${rows.length !== 1 ? 's' : ''}.`, 'info');
        } else {
          window.hasPartialResults = false;
          window.showToastMessage(`Query completed. Loaded ${rows.length} results.`, 'success');
        }

      } catch (error) {
        if (window.queryPageIsUnloading) {
          console.info('Query request interrupted by navigation; skipping failure handling.');
          return;
        }

        // Checking if the query was manually stopped by the user
        if (!window.queryRunning) {
          console.log('Query execution interrupted by user stop/cancel.');
          return;
        }

        console.error('Query execution failed:', error);

        // Mark as failed in history
        if (currentQueryId && window.QueryHistorySystem) {
          const q = window.QueryHistorySystem.exampleQueries.find(q => q.id === currentQueryId);
          if (q) {
            q.running = false;
            q.status = 'failed';
            q.error = error.message;
            q.endTime = new Date().toISOString();
            window.QueryHistorySystem.renderQueries();
          }
        }

        window.showToastMessage('Query execution failed: ' + error.message, 'error');
      } finally {
        window.queryRunning = false;
        if (window.updateTableResultsLip) window.updateTableResultsLip();
        window.updateRunButtonIcon();
        if (window.updateButtonStates) {
          window.updateButtonStates();
        }
        if (window.endTableQueryAnimation) window.endTableQueryAnimation();
      }
    })();
  });
}
