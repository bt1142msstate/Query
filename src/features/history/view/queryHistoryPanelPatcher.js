import {
  captureHistoryViewState,
  didErrorDetailsChange,
  didProgressChange,
  restoreHistoryViewState,
  updateHistoryPollingMeta
} from './queryHistoryRenderHelpers.js';
import {
  buildHistorySubtitleText,
  buildHistoryVisibleMetaDetail
} from './queryHistoryControls.js';
import { groupHistoryQueries } from './queryHistoryGrouping.js';

function hasQueryRowChanged(oldQ, newQ) {
  return oldQ.status !== newQ.status
    || oldQ.resultCount !== newQ.resultCount
    || oldQ.error !== newQ.error
    || oldQ.endTime !== newQ.endTime
    || oldQ.name !== newQ.name
    || didErrorDetailsChange(oldQ.errorDetails, newQ.errorDetails)
    || didProgressChange(oldQ.progress, newQ.progress);
}

function syncHeroAndMeta(container, grouped, searchTerm, viewOptions) {
  const { counts, visibleCount, totalCount } = grouped;
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

  const metaCards = container.querySelectorAll('.history-meta-card');
  if (!metaCards[1]) return;
  const el = metaCards[1].querySelector('.history-meta-value');
  if (el && el.textContent !== String(visibleCount)) el.textContent = String(visibleCount);
  const detail = metaCards[1].querySelector('.history-meta-detail');
  const nextDetail = buildHistoryVisibleMetaDetail(searchTerm, viewOptions);
  if (detail && detail.textContent !== nextDetail) detail.textContent = nextDetail;
}

function syncBookshelfCounts(container, counts, activeHistorySection) {
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
}

function syncMonitorTabCounts(monitor, counts) {
  monitor.querySelectorAll('.history-monitor-tab').forEach(tab => {
    const key = tab.dataset.historyMonitorTab;
    if (!key) return;
    const el = tab.querySelector('.history-monitor-tab-count');
    const count = counts[key] ?? 0;
    const next = `${count} ${count === 1 ? 'entry' : 'entries'}`;
    if (el && el.textContent !== next) el.textContent = next;
  });
}

function rerenderPreservingHistoryView(dom, renderQueries) {
  const viewState = captureHistoryViewState(dom);
  const didRender = renderQueries();
  if (didRender) restoreHistoryViewState(dom, viewState);
}

function getActiveSectionRows(grouped, activeSectionKey) {
  const sectionLists = {
    running: grouped.running || [],
    complete: grouped.complete || [],
    failed: grouped.failed || [],
    canceled: grouped.canceled || []
  };
  return sectionLists[activeSectionKey] || [];
}

function shouldRerenderForRowOrder(tbody, sectionList) {
  const currentOrderedIds = Array.from(tbody.querySelectorAll('tr[data-query-id]')).map(tr => tr.dataset.queryId);
  const nextOrderedIds = sectionList.map(query => query.id);
  return currentOrderedIds.length !== nextOrderedIds.length
    || currentOrderedIds.some((id, index) => id !== nextOrderedIds[index]);
}

function patchSectionRows({ bindHistoryTableButtons, createHistoryRowHtml, document, oldById, sectionList, tbody }) {
  const existingRowMap = new Map();
  tbody.querySelectorAll('tr[data-query-id]').forEach(tr => existingRowMap.set(tr.dataset.queryId, tr));
  const newIds = new Set(sectionList.map(query => query.id));
  existingRowMap.forEach((tr, id) => {
    if (!newIds.has(id)) tr.remove();
  });

  sectionList.forEach((query, index) => {
    const existing = existingRowMap.get(query.id);
    const old = oldById.get(query.id);
    if (existing && old && !hasQueryRowChanged(old, query)) return;

    const temp = document.createElement('tbody');
    temp.innerHTML = createHistoryRowHtml(query);
    const newMainTr = temp.querySelector('tr[data-query-id]');
    if (!newMainTr) return;
    bindHistoryTableButtons(temp);

    if (existing) {
      tbody.replaceChild(newMainTr, existing);
      return;
    }

    const sibling = tbody.querySelectorAll('tr[data-query-id]')[index];
    if (sibling) {
      tbody.insertBefore(newMainTr, sibling);
    } else {
      tbody.appendChild(newMainTr);
    }
  });
}

function patchHistoryQueriesPanelData({
  activeHistoryDetailQueryId,
  activeHistorySection,
  bindHistoryTableButtons,
  createHistoryRowHtml,
  document,
  dom,
  getHistorySearchTerm,
  getHistoryViewOptionsFromControls,
  isPollingActive,
  lastQueryStatusPollAt,
  newHistory,
  previousHistory,
  renderHistoryDetailsOverlay,
  renderQueries
}) {
  const oldById = new Map(previousHistory.map(query => [query.id, query]));
  const container = dom.queriesList;
  if (!container || !container.querySelector('.history-editorial-hero')) {
    renderQueries();
    return;
  }

  const searchTerm = getHistorySearchTerm();
  const viewOptions = getHistoryViewOptionsFromControls();
  const grouped = groupHistoryQueries(newHistory, searchTerm, viewOptions);
  const { counts } = grouped;
  syncHeroAndMeta(container, grouped, searchTerm, viewOptions);

  const refreshedAt = lastQueryStatusPollAt
    ? new Date(lastQueryStatusPollAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : 'Awaiting refresh';
  updateHistoryPollingMeta(dom, { isPollingActive, refreshedAt });
  syncBookshelfCounts(container, counts, activeHistorySection);

  const monitor = container.querySelector('[data-history-monitor]');
  if (!monitor) return;
  syncMonitorTabCounts(monitor, counts);

  const activeSectionKey = monitor.querySelector('.history-monitor-tab.is-active')?.dataset.historyMonitorTab;
  if (!activeSectionKey) return;

  const sectionList = getActiveSectionRows(grouped, activeSectionKey);
  const stage = monitor.querySelector('.history-monitor-stage');
  if (!stage) return;

  const tbody = stage.querySelector('tbody');
  const emptyMessages = {
    running: 'No running queries right now.',
    complete: 'No completed queries yet.',
    failed: 'No failed or interrupted queries.',
    canceled: 'No cancelled queries yet.'
  };

  if (sectionList.length === 0) {
    if (tbody) {
      stage.innerHTML = `<div class="history-empty-state history-monitor-empty">${emptyMessages[activeSectionKey] || ''}</div>`;
    }
    return;
  }

  if (!tbody) {
    rerenderPreservingHistoryView(dom, renderQueries);
    return;
  }

  if (shouldRerenderForRowOrder(tbody, sectionList)) {
    rerenderPreservingHistoryView(dom, renderQueries);
    return;
  }

  patchSectionRows({
    bindHistoryTableButtons,
    createHistoryRowHtml,
    document,
    oldById,
    sectionList,
    tbody
  });

  if (activeHistoryDetailQueryId) {
    renderHistoryDetailsOverlay(activeHistoryDetailQueryId);
  }
}

export { patchHistoryQueriesPanelData };
