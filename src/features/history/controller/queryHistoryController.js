import { createQueryHistoryConfigLoader } from '../queryHistoryConfigLoader.js';
import { createQueryHistoryDependencies } from '../queryHistoryDependencies.js';
import { HistoryResultProgress } from '../results/queryHistoryResultProgress.js';
import { createQueryHistoryResultsLoader } from '../results/queryHistoryResultsLoader.js';
import { createOpenedHistoryResultRestoreController } from '../results/queryHistoryResultRestore.js';
import { createOpenedResultViewStatePersistence } from '../results/queryHistoryResultViewPersistence.js';
import {
  updateHistoryPollingMeta
} from '../view/queryHistoryRenderHelpers.js';
import {
  appendUniqueColumn,
  buildUiConfigFromRequest,
  mergeUiConfigWithRequest,
  resolveSpecialPayloadFieldNames
} from '../queryHistoryRequestMapper.js';
import { createQueriesTableRowHtml } from '../view/queryHistoryRows.js';
import { closeHistoryDetailsOverlayView, renderHistoryDetailsOverlayView } from '../view/queryHistoryDetailsOverlay.js';
import { groupHistoryQueries } from '../view/queryHistoryGrouping.js';
import {
  normalizeHistoryViewOptions
} from '../view/queryHistoryControls.js';
import { buildHistoryPanelView } from '../view/queryHistoryPanelView.js';
import { patchHistoryQueriesPanelData } from '../view/queryHistoryPanelPatcher.js';
import { mapStatusPayloadToHistoryRows } from '../status/queryHistoryStatusMapper.js';
import { formatColumnsTooltip, formatHistoryFiltersTooltip } from '../view/queryHistoryTooltips.js';
import { notifyHistoryResultLoadComplete, prepareHistoryResultLoadNotification } from '../status/queryHistoryNotifications.js';
import { rememberOpenedHistoryResult, shouldRestoreOpenedHistoryResult } from '../results/queryHistoryResultSession.js';
import { getSession } from '../../../core/authSession.js';
import {
  classifyQueryStatus,
  getPreferredHistorySection as getPreferredHistorySectionForCounts
} from '../view/queryHistoryViewHelpers.js';
import {
  AppState,
  BackendApi,
  DOM,
  QueryChangeManager,
  QueryStateReaders,
  appServices,
  appUiActions,
  formatDuration,
  mapFieldOperatorToUiCond,
  normalizeUiConfigFilters,
  onDOMReady,
  registerDynamicField,
  registerQueryHistoryService,
  resolveFieldName,
  showToastMessage,
  waitForFormModeReady
} from './queryHistoryRuntime.js';
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
let openedHistoryResultRestoreController = null;
let openedResultViewStatePersistence = null;

function getFieldSearchValue() {
  return DOM.queryInput?.value || '';
}

function setFieldSearchValue(value) {
  const queryInput = DOM.queryInput;
  if (!queryInput) {
    return;
  }

  const nextValue = String(value || '');
  if (queryInput.value === nextValue) {
    return;
  }

  queryInput.value = nextValue;
  queryInput.dispatchEvent(new Event('input', { bubbles: true }));
}

const resultViewUiState = {
  getFieldSearch: getFieldSearchValue,
  setFieldSearch: setFieldSearchValue
};

function isQueriesPanelOpen() {
  const panel = DOM.queriesPanel;
  return !!(panel && !panel.classList.contains('hidden'));
}

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

function getHistoryControlElement(id) {
  return document.getElementById(id);
}

function getHistorySearchTerm() {
  return DOM.queriesSearch ? DOM.queriesSearch.value.trim() : '';
}

function getHistoryViewOptionsFromControls() {
  return normalizeHistoryViewOptions({
    statusFilter: getHistoryControlElement('queries-status-filter')?.value,
    resultFilter: getHistoryControlElement('queries-result-filter')?.value,
    durationFilter: getHistoryControlElement('queries-duration-filter')?.value,
    sortKey: getHistoryControlElement('queries-sort')?.value
  });
}

function createHistoryRowHtml(query) {
  return createQueriesTableRowHtml(query, {
    activeHistoryDetailQueryId,
    activeHistoryResultLoadQueryId: HistoryResultProgress.getActiveQueryId(),
    dependencies: historyDependencies.display()
  });
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
    openedHistoryResultRestoreController?.restoreFromBackendAfterStatus({ location: window.location });

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
  activeHistoryDetailQueryId = null;
  closeHistoryDetailsOverlayView(document);
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
  renderHistoryDetailsOverlayView({
    dependencies: historyDependencies.display(),
    document,
    onClose: closeHistoryDetailsOverlay,
    query: q
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
  prepareHistoryResultLoadNotification,
  queryChangeManager: QueryChangeManager,
  queryStateReaders: QueryStateReaders,
  services,
  uiState: resultViewUiState,
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

  scope.querySelectorAll('.template-query-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const id = btn.getAttribute('data-query-id');
      const query = getHistoryQueryById(id);
      if (!query) return;
      closeHistoryDetailsOverlay();
      const opened = appServices.createTemplateFromHistoryQuery(query);
      if (opened !== false) {
        appServices.closeModalPanel('queries-panel');
      }
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

function patchQueriesPanelData(newHistory) {
  const previousHistory = exampleQueries;
  exampleQueries = newHistory;
  patchHistoryQueriesPanelData({
    activeHistoryDetailQueryId,
    activeHistorySection,
    bindHistoryTableButtons,
    createHistoryRowHtml,
    document,
    dom: DOM,
    getHistorySearchTerm,
    getHistoryViewOptionsFromControls,
    isPollingActive: !!(queryDurationUpdateInterval && isQueriesPanelOpen()),
    lastQueryStatusPollAt,
    newHistory,
    previousHistory,
    renderHistoryDetailsOverlay,
    renderQueries
  });
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
  
  const searchTerm = getHistorySearchTerm();
  const viewOptions = getHistoryViewOptionsFromControls();
  const grouped = groupHistoryQueries(exampleQueries, searchTerm, viewOptions);
  const runningCount = grouped.counts.running;
  const refreshedAt = lastQueryStatusPollAt
    ? new Date(lastQueryStatusPollAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : 'Awaiting refresh';
  const isPollingActive = !!(queryDurationUpdateInterval && isQueriesPanelOpen());
  const openSection = getPreferredHistorySection({
    running: runningCount,
    complete: grouped.counts.complete,
    failed: grouped.counts.failed,
    canceled: grouped.counts.canceled
  });
  syncHistoryMonitorOpenState(Boolean(openSection));
  const { content, renderKey } = buildHistoryPanelView({
    activeHistorySection,
    createHistoryRowHtml,
    grouped,
    isPollingActive,
    loadingQueryId: HistoryResultProgress.getActiveQueryId(),
    openSection,
    progressHtml: HistoryResultProgress.render(),
    refreshedAt,
    searchTerm,
    viewOptions
  });

  if (renderKey === lastHistoryRenderKey) {
    updateHistoryPollingMeta(DOM, { isPollingActive, refreshedAt });
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
  rememberOpenedResult: rememberOpenedHistoryResult,
  cacheOpenedResult: snapshot => openedResultViewStatePersistence?.cacheSnapshot(snapshot),
  forgetOpenedResult: () => openedHistoryResultRestoreController?.forgetRestoreSnapshot?.(),
  loadQueryResults,
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
  if (!getSession()) {
    return;
  }

  openedHistoryResultRestoreController = createOpenedHistoryResultRestoreController({
    appState: AppState,
    getHistoryQueryById,
    loadQueryConfig,
    loadQueryResults,
    queryChangeManager: QueryChangeManager,
    queryStateReaders: QueryStateReaders,
    services,
    showToastMessage,
    uiState: resultViewUiState,
    uiActions
  });
  openedResultViewStatePersistence = createOpenedResultViewStatePersistence({
    getHistoryQueryById,
    queryStateReaders: QueryStateReaders,
    services,
    uiState: resultViewUiState
  });

  if (queryHistoryInitialized) {
    return;
  }

  queryHistoryInitialized = true;

  // Initial render of the query history list
  renderQueries();

  // Attach queries search event listener
  const queriesSearchInput = DOM.queriesSearch;
  if (queriesSearchInput) {
    queriesSearchInput.addEventListener('input', renderQueries);
  }

  [
    'queries-status-filter',
    'queries-result-filter',
    'queries-duration-filter',
    'queries-sort'
  ].forEach(controlId => {
    const control = getHistoryControlElement(controlId);
    control?.addEventListener('change', renderQueries);
    control?.addEventListener('input', renderQueries);
  });

  QueryStateReaders.subscribe(event => {
    if (event?.meta?.source === 'QueryChangeManager.clearQuery') {
      openedHistoryResultRestoreController.forgetRestoreSnapshot().catch(error => {
        console.warn('Failed to clear cached history result:', error);
      });
      return;
    }

    if (event?.changes?.displayedFields) {
      openedResultViewStatePersistence.schedule(event);
    }
  });
  window.addEventListener('postfilters:updated', () => {
    openedResultViewStatePersistence.schedule({ meta: { source: 'postfilters:updated' } });
  });
  DOM.queryInput?.addEventListener('input', () => {
    openedResultViewStatePersistence.schedule({ meta: { source: 'field-search' } });
  });

  // Add row click event listener
  document.addEventListener('click', handleQueryRowClick);

  // Initial fetch of query history. When results were open before refresh,
  // try local cache first so table results can rehydrate without a backend
  // result download. If the cache is unavailable, the status poll keeps the
  // previous backend fallback path.
  if (shouldRestoreOpenedHistoryResult({ location: window.location })) {
    waitForFormModeReady().then(() => {
      openedHistoryResultRestoreController.restoreFromCache({ location: window.location })
        .catch(error => {
          console.warn('Failed to restore cached history results:', error);
        })
        .finally(() => {
          fetchQueryStatus();
        });
    });
  } else {
    setTimeout(fetchQueryStatus, 500);
  }
});
