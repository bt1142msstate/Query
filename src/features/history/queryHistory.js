import { buildHistoryDetailsOverlayHtml } from './view/queryHistoryDetails.js';
import { createQueryHistoryConfigLoader } from './queryHistoryConfigLoader.js';
import { createQueryHistoryDependencies } from './queryHistoryDependencies.js';
import { HistoryResultProgress } from './results/queryHistoryResultProgress.js';
import { createQueryHistoryResultsLoader } from './results/queryHistoryResultsLoader.js';
import { createOpenedHistoryResultRestoreController } from './results/queryHistoryResultRestore.js';
import { createOpenedResultViewStatePersistence } from './results/queryHistoryResultViewPersistence.js';
import {
  captureHistoryViewState,
  didErrorDetailsChange,
  didProgressChange,
  restoreHistoryViewState,
  updateHistoryPollingMeta
} from './view/queryHistoryRenderHelpers.js';
import {
  appendUniqueColumn,
  buildUiConfigFromRequest,
  mergeUiConfigWithRequest,
  resolveSpecialPayloadFieldNames
} from './queryHistoryRequestMapper.js';
import { createQueriesTableRowHtml } from './view/queryHistoryRows.js';
import { groupHistoryQueries } from './queryHistoryGrouping.js';
import {
  buildHistorySubtitleText,
  buildHistoryVisibleMetaDetail,
  normalizeHistoryViewOptions
} from './view/queryHistoryControls.js';
import { buildHistoryPanelView } from './view/queryHistoryPanelView.js';
import { mapStatusPayloadToHistoryRows } from './status/queryHistoryStatusMapper.js';
import { formatColumnsTooltip, formatHistoryFiltersTooltip } from './view/queryHistoryTooltips.js';
import { notifyHistoryResultLoadComplete, prepareHistoryResultLoadNotification } from './status/queryHistoryNotifications.js';
import { rememberOpenedHistoryResult, shouldRestoreOpenedHistoryResult } from './results/queryHistoryResultSession.js';
import {
  classifyQueryStatus,
  getPreferredHistorySection as getPreferredHistorySectionForCounts
} from './view/queryHistoryViewHelpers.js';
import { appServices, registerQueryHistoryService } from '../../core/appServices.js';
import { waitForFormModeReady } from '../../core/appStartupEvents.js';
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

  const searchTerm = getHistorySearchTerm();
  const viewOptions = getHistoryViewOptionsFromControls();
  const grouped = groupHistoryQueries(newHistory, searchTerm, viewOptions);
  const { running: runningList, complete: doneList, failed: failedList, canceled: cancelledList, counts, visibleCount, totalCount } = grouped;

  // — Editorial hero subtitle
  const heroSubtitle = container.querySelector('.history-editorial-subtitle');
  if (heroSubtitle) {
    const next = buildHistorySubtitleText({
      searchTerm,
      visibleCount,
      totalCount,
      runningCount: counts.running,
      viewOptions
    });
    if (heroSubtitle.textContent !== next) heroSubtitle.textContent = next;
  }

  // — Visible-count meta card (second .history-meta-card)
  const metaCards = container.querySelectorAll('.history-meta-card');
  if (metaCards[1]) {
    const el = metaCards[1].querySelector('.history-meta-value');
    if (el && el.textContent !== String(visibleCount)) el.textContent = String(visibleCount);
    const detail = metaCards[1].querySelector('.history-meta-detail');
    const nextDetail = buildHistoryVisibleMetaDetail(searchTerm, viewOptions);
    if (detail && detail.textContent !== nextDetail) detail.textContent = nextDetail;
  }

  // — Polling meta (text + CSS class only)
  const refreshedAt = lastQueryStatusPollAt
    ? new Date(lastQueryStatusPollAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : 'Awaiting refresh';
  updateHistoryPollingMeta(DOM, {
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
      const next = count === 0 ? 'None' : key === activeHistorySection ? 'Selected' : 'View';
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
    const viewState  = captureHistoryViewState(DOM);
    const didRender  = renderQueries();
    if (didRender) restoreHistoryViewState(DOM, viewState);
    return;
  }

  const currentOrderedIds = Array.from(tbody.querySelectorAll('tr[data-query-id]')).map(tr => tr.dataset.queryId);
  const nextOrderedIds = sectionList.map(q => q.id);
  const rowOrderChanged = currentOrderedIds.length !== nextOrderedIds.length
    || currentOrderedIds.some((id, index) => id !== nextOrderedIds[index]);
  if (rowOrderChanged) {
    const viewState = captureHistoryViewState(DOM);
    const didRender = renderQueries();
    if (didRender) restoreHistoryViewState(DOM, viewState);
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
