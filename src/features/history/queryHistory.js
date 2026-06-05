/**
 * Query History Management Module
 * Handles display and management of query history, including running, completed, and cancelled queries.
 * @module QueryHistory
 */
import { buildHistoryDetailsOverlayHtml } from './queryHistoryDetails.js';
import { createQueryHistoryConfigLoader } from './queryHistoryConfigLoader.js';
import { createQueryHistoryDependencies } from './queryHistoryDependencies.js';
import { HistoryResultProgress } from './queryHistoryResultProgress.js';
import { createQueryHistoryResultsLoader } from './queryHistoryResultsLoader.js';
import {
  appendUniqueColumn,
  buildUiConfigFromRequest,
  mergeUiConfigWithRequest,
  resolveSpecialPayloadFieldNames
} from './queryHistoryRequestMapper.js';
import { HISTORY_TABLE_HEADS, createQueriesTableRowHtml } from './queryHistoryRows.js';
import { groupHistoryQueries } from './queryHistoryGrouping.js';
import { mapStatusPayloadToHistoryRows } from './queryHistoryStatusMapper.js';
import { formatColumnsTooltip, formatHistoryFiltersTooltip } from './queryHistoryTooltips.js';
import { notifyHistoryResultLoadComplete, prepareHistoryResultLoadNotification } from './queryHistoryNotifications.js';
import {
  buildHistoryMonitor,
  buildHistorySection,
  classifyQueryStatus,
  getPreferredHistorySection as getPreferredHistorySectionForCounts
} from './queryHistoryViewHelpers.js';
import { appServices, registerQueryHistoryService } from '../../core/appServices.js';
import { appUiActions } from '../../core/appUiActions.js';
import { BackendApi } from '../../core/backendApi.js';
import { formatDuration, parsePipeDelimitedRow } from '../../core/formatting/dataFormatters.js';
import { onDOMReady } from '../../core/domReady.js';
import { AppState, QueryChangeManager, QueryStateReaders } from '../../core/queryState.js';
import { showToastMessage } from '../../core/toast.js';
import { VisibilityUtils } from '../../core/visibility.js';
import { mapFieldOperatorToUiCond, normalizeUiConfigFilters } from '../filters/queryPayload.js';
import { registerDynamicField, resolveFieldName } from '../filters/fieldDefs.js';
import { DOM } from '../../core/domCache.js';
/* ---------- Query history state and renderer ---------- */
let exampleQueries = [];
let queryDurationUpdateInterval = null;
let lastQueryStatusPollAt = 0;
let activeHistorySection = 'none';
var services = appServices;
var uiActions = appUiActions;
const QUERY_STATUS_POLL_MS = 2000;
const IDLE_POLL_MS = 8000;
let lastHistoryRenderKey = '';
const historyDependencies = createQueryHistoryDependencies(normalizeUiConfigFilters);

function isQueriesPanelOpen() {
  const panel = DOM.queriesPanel;
  return !!(panel && !panel.classList.contains('hidden'));
}

/**
 * Adds a new query to the history list.
 * @function addQueryToHistory
 * @param {Object} query - The query object to add
 */
function addQueryToHistory(query) {
  exampleQueries.unshift(query);
  // Keep only last 50 queries
  if (exampleQueries.length > 50) {
    exampleQueries.pop();
  }
  renderQueries();
  return query;
}

function getHistoryQueries() {
  return exampleQueries.slice();
}

function getHistoryQueryById(queryId) {
  const normalizedId = String(queryId || '').trim();
  if (!normalizedId) {
    return null;
  }

  return exampleQueries.find(query => query.id === normalizedId) || null;
}

function updateHistoryQuery(queryId, updates = {}, options = {}) {
  const query = getHistoryQueryById(queryId);
  if (!query || !updates || typeof updates !== 'object') {
    return null;
  }

  Object.assign(query, updates);

  if (options.render !== false) {
    renderQueries();
  }

  return query;
}

let activeHistoryDetailQueryId = null;

function getPreferredHistorySection(counts) {
  return getPreferredHistorySectionForCounts(counts, activeHistorySection);
}

function syncHistoryMonitorOpenState(isOpen) {
  DOM.queriesPanel?.classList.toggle('history-monitor-open', Boolean(isOpen));
}

function createHistoryRowHtml(query) {
  return createQueriesTableRowHtml(query, {
    activeHistoryDetailQueryId,
    activeHistoryResultLoadQueryId: HistoryResultProgress.getActiveQueryId(),
    dependencies: historyDependencies.display()
  });
}

function captureHistoryViewState() {
  const panelContainer = DOM.queriesContainer;
  const monitorShell = panelContainer?.querySelector('.history-monitor .history-table-shell');

  return {
    panelScrollTop: panelContainer?.scrollTop || 0,
    panelScrollLeft: panelContainer?.scrollLeft || 0,
    monitorScrollTop: monitorShell?.scrollTop || 0,
    monitorScrollLeft: monitorShell?.scrollLeft || 0
  };
}

function restoreHistoryViewState(viewState) {
  if (!viewState) return;

  const panelContainer = DOM.queriesContainer;
  if (panelContainer) {
    panelContainer.scrollTop = viewState.panelScrollTop;
    panelContainer.scrollLeft = viewState.panelScrollLeft;
  }

  const monitorShell = panelContainer?.querySelector('.history-monitor .history-table-shell');
  if (monitorShell) {
    monitorShell.scrollTop = viewState.monitorScrollTop;
    monitorShell.scrollLeft = viewState.monitorScrollLeft;
  }
}

function updateHistoryPollingMeta({ isPollingActive, refreshedAt }) {
  const pollingValue = DOM.queriesList?.querySelector('.history-polling-value');
  const pollingDetail = DOM.queriesList?.querySelector('.history-polling-detail');
  if (pollingValue) {
    pollingValue.textContent = isPollingActive ? 'Polling live' : 'Polling paused';
    pollingValue.classList.toggle('active', !!isPollingActive);
    pollingValue.classList.toggle('idle', !isPollingActive);
  }
  if (pollingDetail) {
    pollingDetail.textContent = `Last refresh ${refreshedAt}`;
  }
}

function didProgressChange(oldProgress, newProgress) {
  return JSON.stringify(oldProgress || null) !== JSON.stringify(newProgress || null);
}

function didErrorDetailsChange(oldDetails, newDetails) {
  return JSON.stringify(oldDetails || null) !== JSON.stringify(newDetails || null);
}

function syncActiveQueryProgressFromHistory(historyRows) {
  const lifecycleState = QueryStateReaders.getLifecycleState?.();
  const currentQueryId = lifecycleState?.currentQueryId;
  if (!lifecycleState?.queryRunning || !currentQueryId) {
    return;
  }

  const activeQuery = historyRows.find(query => String(query.id) === String(currentQueryId));
  if (!activeQuery?.progress) {
    return;
  }

  const resultCount = Number(activeQuery.resultCount);
  uiActions.updateTableQueryAnimationProgress({
    progress: activeQuery.progress,
    resultCount: Number.isFinite(resultCount) ? resultCount : undefined
  });
}

function bindHistoryBookShelf(container) {
  const books = Array.from(container.querySelectorAll('[data-history-book]'));
  books.forEach(book => {
    const summary = book.querySelector('.history-book-summary');
    if (!summary) return;

    summary.addEventListener('click', (event) => {
      event.preventDefault();
      const sectionKey = book.dataset.historyBook || 'running';
      activeHistorySection = activeHistorySection === sectionKey ? 'none' : sectionKey;
      renderQueries();
    });
  });

  container.querySelectorAll('[data-history-monitor-tab]').forEach(tab => {
    tab.addEventListener('click', () => {
      activeHistorySection = tab.dataset.historyMonitorTab || 'running';
      renderQueries();
    });
  });

  container.querySelector('[data-history-monitor-close]')?.addEventListener('click', () => {
    activeHistorySection = 'none';
    renderQueries();
  });
}

/**
 * Fetches status of all queries from the backend.
 * Updates the local query history with current status.
 * @async
 * @function fetchQueryStatus
 */
async function fetchQueryStatus() {
  try {
    lastQueryStatusPollAt = Date.now();
    const { data } = await BackendApi.postJson({ action: 'status' }, { notifyOnRateLimit: isQueriesPanelOpen() });
    if (!data.queries) return;
    
    const newHistory = mapStatusPayloadToHistoryRows(data, {
      buildUiConfigFromRequest,
      classifyQueryStatus,
      mapperDependencies: historyDependencies.mapper(),
      mergeUiConfigWithRequest
    });

    patchQueriesPanelData(newHistory);
    syncActiveQueryProgressFromHistory(newHistory);

    if (isQueriesPanelOpen()) {
      // Keep the interval alive so queries from other users surface automatically.
      // startQueryDurationUpdates is a no-op when the interval is already active.
      startQueryDurationUpdates();
    }
    
  } catch (e) {
    if (e?.isRateLimited || !isQueriesPanelOpen()) return;
    console.warn('Failed to fetch query status', e);
  }
}

/**
 * Cancels a running query.
 * @async
 * @function cancelQuery
 * @param {string} queryId - The ID of the query to cancel
 */
async function cancelQuery(queryId) {
  try {
    const { response } = await BackendApi.postJson({ action: 'cancel', query_id: queryId });
    
    if (response.ok) {
      const lifecycleState = QueryStateReaders?.getLifecycleState?.();
      const isActiveLocalQuery = lifecycleState?.queryRunning
        && String(lifecycleState.currentQueryId || '') === String(queryId || '');
      const q = exampleQueries.find(q => q.id === queryId);
      if (q) {
        q.running = false;
        q.cancelled = true;
        q.status = 'canceled';
        renderQueries();
      }
      if (isActiveLocalQuery) {
        QueryChangeManager?.setLifecycleState?.(
          { queryRunning: false },
          { source: 'QueryHistory.cancelQuery', silent: true }
        );
        uiActions.updateRunButtonIcon();
        uiActions.updateButtonStates();
        uiActions.endTableQueryAnimation();
      }
      showToastMessage(`Query ${queryId} cancelled`, 'info');
    } else {
      showToastMessage('Failed to cancel query', 'error');
    }
  } catch (e) {
    if (e?.isRateLimited) {
      return;
    }
    console.error('Error cancelling query:', e);
    showToastMessage('Error cancelling query', 'error');
  }
}

function closeHistoryDetailsOverlay() {
  const shell = document.querySelector('.history-details-modal-shell');
  if (shell) {
    VisibilityUtils.hide([shell], {
      ariaHidden: true,
      raisedUiKey: 'history-details-overlay'
    });
  }
  activeHistoryDetailQueryId = null;
  shell?.remove();
  document.body.classList.remove('history-details-open');
}

function renderHistoryDetailsOverlay(queryId = activeHistoryDetailQueryId) {
  closeHistoryDetailsOverlay();

  if (!queryId) {
    return;
  }

  const q = exampleQueries.find(query => query.id === queryId);
  if (!q) {
    return;
  }

  activeHistoryDetailQueryId = queryId;
  const shell = document.createElement('div');
  shell.className = 'history-details-modal-shell';
  shell.hidden = true;
  shell.classList.add('hidden');
  shell.innerHTML = buildHistoryDetailsOverlayHtml(q, historyDependencies.display());
  document.body.appendChild(shell);
  VisibilityUtils.show([shell], {
    ariaHidden: false,
    raisedUiKey: 'history-details-overlay'
  });
  document.body.classList.add('history-details-open');

  shell.querySelectorAll('[data-history-details-close]').forEach(node => {
    node.addEventListener('click', event => {
      event.preventDefault();
      closeHistoryDetailsOverlay();
    });
  });
}

const loadQueryConfig = createQueryHistoryConfigLoader({
  appServices,
  document,
  dom: DOM,
  historyDependencies,
  queryChangeManager: QueryChangeManager,
  queryStateReaders: QueryStateReaders,
  services,
  uiActions,
  appendUniqueColumn,
  mapFieldOperatorToUiCond,
  normalizeUiConfigFilters,
  registerDynamicField,
  resolveFieldName,
  resolveSpecialPayloadFieldNames
});

const loadQueryResults = createQueryHistoryResultsLoader({
  appState: AppState,
  historyResultProgress: HistoryResultProgress,
  notifyHistoryResultLoadComplete,
  parsePipeDelimitedRow,
  prepareHistoryResultLoadNotification,
  queryChangeManager: QueryChangeManager,
  queryStateReaders: QueryStateReaders,
  services,
  showToastMessage,
  uiActions,
  getHistoryQueryById,
  loadQueryConfig,
  renderQueries
});

/**
 * Binds load/rerun/stop button event handlers on all matching buttons within
 * a given root element. Called after both full re-renders and surgical row
 * insertions so listeners are always wired to the live DOM nodes.
 * @param {Element} scope
 */
function bindHistoryTableButtons(scope) {
  scope.querySelectorAll('.history-expand-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const queryId = btn.getAttribute('data-history-expand');
      if (!queryId) return;
      renderHistoryDetailsOverlay(queryId);
    });
  });

  scope.querySelectorAll('.load-query-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      closeHistoryDetailsOverlay();
      loadQueryResults(btn.getAttribute('data-query-id'));
    });
  });

  scope.querySelectorAll('.rerun-query-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const id = btn.getAttribute('data-query-id');
      const q = exampleQueries.find(q => q.id === id);
      if (!q) return;
      q.running = true;
      q.startTime = new Date().toISOString();
      q.endTime = null;
      q.cancelled = false;
      q.status = 'running';
      loadQueryConfig(q);
      closeHistoryDetailsOverlay();
      DOM.runBtn?.click();
      appServices.closeModalPanel('queries-panel');
    });
  });

  scope.querySelectorAll('.stop-query-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const id = btn.getAttribute('data-query-id');
      const toastElement = showToastMessage({
        message: 'Cancel this running query?',
        type: 'warning',
        duration: 0,
        action: { label: 'Cancel Query', onClick: () => cancelQuery(id) }
      });
      if (!toastElement) {
        cancelQuery(id);
      }
    });
  });
}

/**
 * Returns true when fields that affect a row's rendered HTML have changed
 * between two versions of the same query object.
 * @param {Object} oldQ
 * @param {Object} newQ
 * @returns {boolean}
 */
function hasQueryRowChanged(oldQ, newQ) {
  return oldQ.status      !== newQ.status
      || oldQ.resultCount !== newQ.resultCount
      || oldQ.error       !== newQ.error
      || oldQ.endTime     !== newQ.endTime
      || oldQ.name        !== newQ.name
      || didErrorDetailsChange(oldQ.errorDetails, newQ.errorDetails)
      || didProgressChange(oldQ.progress, newQ.progress);
}

/**
 * Surgically patches the queries panel to reflect newHistory.
 * Only the exact DOM nodes that changed are touched — no full innerHTML swaps
 * during normal polling.  Falls back to renderQueries() only for structural
 * transitions (container not yet rendered, or empty↔populated table state).
 * @param {Array} newHistory
 */
function patchQueriesPanelData(newHistory) {
  // Snapshot old state BEFORE overwriting exampleQueries
  const oldById = new Map(exampleQueries.map(q => [q.id, q]));
  exampleQueries = newHistory;

  const container = DOM.queriesList;
  if (!container || !container.querySelector('.history-editorial-hero')) {
    renderQueries();
    return;
  }

  const searchInput = DOM.queriesSearch;
  const searchTerm  = searchInput ? searchInput.value.trim().toLowerCase() : '';
  const grouped = groupHistoryQueries(newHistory, searchTerm);
  const { running: runningList, complete: doneList, failed: failedList, canceled: cancelledList, counts, visibleCount, totalCount } = grouped;

  // — Editorial hero subtitle
  const heroSubtitle = container.querySelector('.history-editorial-subtitle');
  if (heroSubtitle) {
    const liveSignal  = counts.running > 0
      ? `${counts.running} live ${counts.running === 1 ? 'query is' : 'queries are'} still updating.`
      : 'No active queries are running right now.';
    const searchLabel = searchTerm
      ? `Showing ${visibleCount} of ${totalCount} saved queries matching "${searchTerm}".`
      : `Showing ${visibleCount} recent ${visibleCount === 1 ? 'query' : 'queries'} across your workspace history.`;
    const next = `${searchLabel} ${liveSignal}`;
    if (heroSubtitle.textContent !== next) heroSubtitle.textContent = next;
  }

  // — Visible-count meta card (second .history-meta-card)
  const metaCards = container.querySelectorAll('.history-meta-card');
  if (metaCards[1]) {
    const el = metaCards[1].querySelector('.history-meta-value');
    if (el && el.textContent !== String(visibleCount)) el.textContent = String(visibleCount);
  }

  // — Polling meta (text + CSS class only)
  const refreshedAt = lastQueryStatusPollAt
    ? new Date(lastQueryStatusPollAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : 'Awaiting refresh';
  updateHistoryPollingMeta({
    isPollingActive: !!(queryDurationUpdateInterval && isQueriesPanelOpen()),
    refreshedAt
  });

  // — Bookshelf book counts and state labels
  Object.entries(counts).forEach(([key, count]) => {
    const book = container.querySelector(`[data-history-book="${key}"]`);
    if (!book) return;
    const countEl = book.querySelector('.history-book-count');
    if (countEl && countEl.textContent !== String(count)) countEl.textContent = String(count);
    const stateEl = book.querySelector('.history-book-state');
    if (stateEl) {
      const next = count === 0 ? 'Empty' : key === activeHistorySection ? 'Projected' : 'Standby';
      if (stateEl.textContent !== next) stateEl.textContent = next;
    }
  });

  // — Monitor panel
  const monitor = container.querySelector('[data-history-monitor]');
  if (!monitor) return;

  // Tab counts
  monitor.querySelectorAll('.history-monitor-tab').forEach(tab => {
    const key = tab.dataset.historyMonitorTab;
    if (!key) return;
    const el    = tab.querySelector('.history-monitor-tab-count');
    const count = counts[key] ?? 0;
    const next  = `${count} ${count === 1 ? 'entry' : 'entries'}`;
    if (el && el.textContent !== next) el.textContent = next;
  });

  const activeSectionKey = monitor.querySelector('.history-monitor-tab.is-active')?.dataset.historyMonitorTab;
  if (!activeSectionKey) return;

  const sectionLists = { running: runningList, complete: doneList, failed: failedList, canceled: cancelledList };
  const sectionList  = sectionLists[activeSectionKey] || [];
  const stage        = monitor.querySelector('.history-monitor-stage');
  if (!stage) return;

  const tbody = stage.querySelector('tbody');
  const emptyMessages = {
    running:  'No running queries right now.',
    complete: 'No completed queries yet.',
    failed:   'No failed or interrupted queries.',
    canceled: 'No cancelled queries yet.'
  };

  // Section emptied — swap table for empty-state message
  if (sectionList.length === 0) {
    if (tbody) {
      stage.innerHTML = `<div class="history-empty-state history-monitor-empty">${emptyMessages[activeSectionKey] || ''}</div>`;
    }
    return;
  }

  // Section first populated — table scaffolding not in DOM yet; one-time full render
  if (!tbody) {
    const viewState  = captureHistoryViewState();
    const didRender  = renderQueries();
    if (didRender) restoreHistoryViewState(viewState);
    return;
  }

  // Build a map of rows currently in the tbody
  const existingRowMap = new Map();
  tbody.querySelectorAll('tr[data-query-id]').forEach(tr => existingRowMap.set(tr.dataset.queryId, tr));

  const newIds = new Set(sectionList.map(q => q.id));

  // Remove rows whose query is no longer in this section
  existingRowMap.forEach((tr, id) => { if (!newIds.has(id)) tr.remove(); });

  // Insert new rows / replace changed rows — skip rows that haven't changed
  sectionList.forEach((q, index) => {
    const existing = existingRowMap.get(q.id);
    const old      = oldById.get(q.id);

    if (existing && old && !hasQueryRowChanged(old, q)) return; // Nothing to do

    const temp = document.createElement('tbody');
    temp.innerHTML = createHistoryRowHtml(q);
    const newMainTr = temp.querySelector('tr[data-query-id]');
    if (!newMainTr) return;
    bindHistoryTableButtons(temp);

    if (existing) {
      tbody.replaceChild(newMainTr, existing);
    } else {
      // Insert at the correct ordinal position among already-updated rows
      const sibling = tbody.querySelectorAll('tr[data-query-id]')[index];
      if (sibling) {
        tbody.insertBefore(newMainTr, sibling);
      } else {
        tbody.appendChild(newMainTr);
      }
    }
  });

  if (activeHistoryDetailQueryId) {
    renderHistoryDetailsOverlay(activeHistoryDetailQueryId);
  }
}

/**
 * Updates only the duration cells of currently-running query rows in-place,
 * avoiding a full layout re-render on every tick.
 * @function updateRunningDurationsInPlace
 */
function updateRunningDurationsInPlace() {
  const list = DOM.queriesList;
  if (!list) return;
  exampleQueries.filter(q => q.running && q.startTime).forEach(q => {
    const cell = list.querySelector(`.history-duration-cell[data-query-id="${q.id}"]`);
    if (!cell) return;
    const start = new Date(q.startTime);
    if (isNaN(start.getTime())) return;
    const seconds = Math.max(0, Math.floor((Date.now() - start) / 1000));
    cell.textContent = formatDuration(seconds);
  });
}

/**
 * Starts real-time updates for running query durations.
 * Keeps polling even when no queries are running so that queries started by
 * other users appear without a manual page refresh.
 * @function startQueryDurationUpdates
 */
function startQueryDurationUpdates() {
  if (!isQueriesPanelOpen()) return;
  if (queryDurationUpdateInterval) return; // Already running

  fetchQueryStatus();

  queryDurationUpdateInterval = setInterval(() => {
    if (!isQueriesPanelOpen()) {
      stopQueryDurationUpdates();
      return;
    }

    const hasRunningQueries = exampleQueries.some(q => q.running);
    // Tick running durations in-place — no full re-render needed.
    if (hasRunningQueries) {
      updateRunningDurationsInPlace();
    }

    // Poll the backend: faster when queries are running, slower when idle.
    const pollInterval = hasRunningQueries ? QUERY_STATUS_POLL_MS : IDLE_POLL_MS;
    if ((Date.now() - lastQueryStatusPollAt) >= pollInterval) {
      fetchQueryStatus();
    }
  }, 1000);
}

/**
 * Stops real-time duration updates for running queries.
 * @function stopQueryDurationUpdates
 */
function stopQueryDurationUpdates() {
  if (queryDurationUpdateInterval) {
    clearInterval(queryDurationUpdateInterval);
    queryDurationUpdateInterval = null;
  }
}

/**
 * Renders the complete queries list with search filtering.
 * Groups queries by status (running, completed, cancelled) and displays them in tables.
 * @function renderQueries
 */
function renderQueries(){
  const container = DOM.queriesList;
  if(!container) return false;
  
  // Get search value
  const searchInput = DOM.queriesSearch;
  const searchTerm = searchInput ? searchInput.value.trim().toLowerCase() : '';
  const grouped = groupHistoryQueries(exampleQueries, searchTerm);
  const { running: runningList, complete: doneList, failed: failedList, canceled: cancelledList } = grouped;
  
  const runningRows = runningList.map(createHistoryRowHtml).join('');
  const doneRows = doneList.map(createHistoryRowHtml).join('');
  const failedRows = failedList.map(createHistoryRowHtml).join('');
  const cancelledRows = cancelledList.map(createHistoryRowHtml).join('');

  const runningCount = grouped.counts.running;
  const doneCount = grouped.counts.complete;
  const failedCount = grouped.counts.failed;
  const cancelledCount = grouped.counts.canceled;
  const visibleCount = grouped.visibleCount;
  const totalCount = grouped.totalCount;
  const liveSignal = runningCount > 0
    ? `${runningCount} live ${runningCount === 1 ? 'query is' : 'queries are'} still updating.`
    : 'No active queries are running right now.';
  const searchLabel = searchTerm
    ? `Showing ${visibleCount} of ${totalCount} saved queries matching "${searchTerm}".`
    : `Showing ${visibleCount} recent ${visibleCount === 1 ? 'query' : 'queries'} across your workspace history.`;
  const refreshedAt = lastQueryStatusPollAt
    ? new Date(lastQueryStatusPollAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : 'Awaiting refresh';
  const isPollingActive = !!(queryDurationUpdateInterval && isQueriesPanelOpen());
  const pollingLabel = isPollingActive ? 'Polling live' : 'Polling paused';
  const openSection = getPreferredHistorySection({
    running: runningCount,
    complete: doneCount,
    failed: failedCount,
    canceled: cancelledCount
  });
  syncHistoryMonitorOpenState(Boolean(openSection));

  let content = '';
  let renderKey = '';

  // Show "no results" message if search returns nothing
  if (searchTerm && runningCount === 0 && doneCount === 0 && failedCount === 0 && cancelledCount === 0) {
    content = `<div class="history-empty-state history-empty-search">No queries found matching "${searchTerm}".</div>`;
    renderKey = JSON.stringify({
      searchTerm,
      runningCount,
      doneCount,
      failedCount,
      cancelledCount,
      activeHistorySection,
      empty: true,
      content
    });
  } else {
    const sections = [
      {
        key: 'running',
        count: runningCount,
        rows: runningRows,
        tableHead: HISTORY_TABLE_HEADS.running,
        emptyMessage: 'No running queries right now.'
      },
      {
        key: 'complete',
        count: doneCount,
        rows: doneRows,
        tableHead: HISTORY_TABLE_HEADS.complete,
        emptyMessage: 'No completed queries yet.'
      },
      {
        key: 'failed',
        count: failedCount,
        rows: failedRows,
        tableHead: HISTORY_TABLE_HEADS.failed,
        emptyMessage: 'No failed or interrupted queries.'
      },
      {
        key: 'canceled',
        count: cancelledCount,
        rows: cancelledRows,
        tableHead: HISTORY_TABLE_HEADS.canceled,
        emptyMessage: 'No cancelled queries yet.'
      }
    ];
    const historyMonitor = buildHistoryMonitor(openSection, sections);
    const runningSection = buildHistorySection('running', runningCount, openSection === 'running');
    const doneSection = buildHistorySection('complete', doneCount, openSection === 'complete');
    const failedSection = buildHistorySection('failed', failedCount, openSection === 'failed');
    const cancelledSection = buildHistorySection('canceled', cancelledCount, openSection === 'canceled');

    content = `
      <section class="history-editorial-hero">
        <div class="history-editorial-copy">
          <h3 class="history-editorial-title">Query Hub</h3>
          <p class="history-editorial-subtitle">${searchLabel} ${liveSignal}</p>
        </div>
        <div class="history-editorial-meta">
          <div class="history-meta-card">
            <span class="history-meta-label">Polling</span>
            <span class="history-meta-value history-polling-value ${isPollingActive ? 'active' : 'idle'}">${pollingLabel}</span>
            <span class="history-meta-detail history-polling-detail">Last refresh ${refreshedAt}</span>
          </div>
          <div class="history-meta-card">
            <span class="history-meta-label">Visible Queries</span>
            <span class="history-meta-value">${visibleCount}</span>
            <span class="history-meta-detail">${searchTerm ? 'Filtered view' : 'Across all query statuses'}</span>
          </div>
        </div>
      </section>
      ${HistoryResultProgress.render()}
      <div class="history-bookshelf${openSection ? ' monitor-active' : ''}">
        ${runningSection}
        ${doneSection}
        ${failedSection}
        ${cancelledSection}
        ${historyMonitor}
      </div>
    `;

    renderKey = JSON.stringify({
      searchTerm,
      activeHistorySection,
      runningCount,
      doneCount,
      failedCount,
      cancelledCount,
      visibleCount,
      totalCount,
      openSection,
      loadingQueryId: HistoryResultProgress.getActiveQueryId(),
      // Identity-based keys only — no computed display strings — so the key only
      // changes when the data actually changes, not every elapsed-second tick.
      runningIds: runningList.map(q => q.id),
      doneIds: doneList.map(q => `${q.id}:${q.resultCount ?? ''}`),
      failedIds: failedList.map(q => `${q.id}:${q.error ?? ''}`),
      cancelledIds: cancelledList.map(q => q.id)
    });
  }

  if (renderKey === lastHistoryRenderKey) {
    updateHistoryPollingMeta({ isPollingActive, refreshedAt });
    return false;
  }

  lastHistoryRenderKey = renderKey;

  container.innerHTML = content;
  bindHistoryBookShelf(container);
  bindHistoryTableButtons(container);
  if (activeHistoryDetailQueryId) {
    renderHistoryDetailsOverlay(activeHistoryDetailQueryId);
  }

  return true;
}

/**
 * Handles clicks on query table rows to load their configuration.
 * @function handleQueryRowClick
 * @param {Event} e - The click event
 */
function handleQueryRowClick(e) {
  const row = e.target.closest('#queries-container tbody tr[data-query-id]');
  if(!row) return;
  const id = row.getAttribute('data-query-id');
  const q = exampleQueries.find(q => q.id === id);
  if(!q || !q.jsonConfig) return;

  loadQueryConfig(q);
}

/**
 * Query History System object providing external access to history functionality.
 * @namespace QueryHistorySystem
 * @global
 */
const QueryHistorySystem = {
  addQuery: addQueryToHistory,
  getQueries: getHistoryQueries,
  getQueryById: getHistoryQueryById,
  updateQuery: updateHistoryQuery,
  applyQueryConfig: loadQueryConfig,
  cancelQuery,
  formatColumnsTooltip, formatHistoryFiltersTooltip,
  fetchQueryStatus,
  closeDetailsOverlay: closeHistoryDetailsOverlay,
  startQueryDurationUpdates,
  stopQueryDurationUpdates,
  renderQueries
};

Object.defineProperty(QueryHistorySystem, 'exampleQueries', {
  enumerable: false,
  get() {
    return exampleQueries;
  }
});

registerQueryHistoryService(QueryHistorySystem);

let queryHistoryInitialized = false;

// Initialize query history functionality
onDOMReady(() => {
  if (queryHistoryInitialized) {
    return;
  }

  queryHistoryInitialized = true;

  // Initial render of the query history list
  renderQueries();

  // Start duration updates if there are running queries
  if (exampleQueries.some(q => q.running)) {
    // Don't start immediately - only when the panel is opened
    // The openModal function will handle starting updates
  }

  // Attach queries search event listener
  const queriesSearchInput = DOM.queriesSearch;
  if (queriesSearchInput) {
    queriesSearchInput.addEventListener('input', renderQueries);
  }

  // Add row click event listener
  document.addEventListener('click', handleQueryRowClick);

  // Initial fetch of query history
  setTimeout(fetchQueryStatus, 500);
});
