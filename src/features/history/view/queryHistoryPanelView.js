import { escapeHistoryText } from './queryHistoryDetails.js';
import { HISTORY_TABLE_HEADS } from './queryHistoryRows.js';
import {
  buildHistoryEmptyCriteriaMessage,
  buildHistorySubtitleText,
  buildHistoryVisibleMetaDetail,
  getHistoryActiveFilterLabel,
  normalizeHistoryViewOptions
} from './queryHistoryControls.js';
import {
  buildHistoryMonitor,
  buildHistorySection
} from './queryHistoryViewHelpers.js';

function getHistoryViewOptionsKey(options) {
  return JSON.stringify(normalizeHistoryViewOptions(options));
}

function buildHistoryPanelView({
  activeHistorySection = 'none',
  createHistoryRowHtml,
  grouped,
  isPollingActive = false,
  loadingQueryId = null,
  openSection = null,
  progressHtml = '',
  refreshedAt = 'Awaiting refresh',
  searchTerm = '',
  viewOptions = {}
}) {
  const runningList = grouped.running || [];
  const doneList = grouped.complete || [];
  const failedList = grouped.failed || [];
  const cancelledList = grouped.canceled || [];
  const rowBuilder = typeof createHistoryRowHtml === 'function' ? createHistoryRowHtml : () => '';
  const runningRows = runningList.map(rowBuilder).join('');
  const doneRows = doneList.map(rowBuilder).join('');
  const failedRows = failedList.map(rowBuilder).join('');
  const cancelledRows = cancelledList.map(rowBuilder).join('');
  const runningCount = grouped.counts.running;
  const doneCount = grouped.counts.complete;
  const failedCount = grouped.counts.failed;
  const cancelledCount = grouped.counts.canceled;
  const visibleCount = grouped.visibleCount;
  const totalCount = grouped.totalCount;
  const historySubtitle = buildHistorySubtitleText({
    searchTerm,
    visibleCount,
    totalCount,
    runningCount,
    viewOptions
  });
  const hasHistoryCriteria = Boolean(searchTerm || getHistoryActiveFilterLabel(viewOptions));

  if (hasHistoryCriteria && runningCount === 0 && doneCount === 0 && failedCount === 0 && cancelledCount === 0) {
    const content = `<div class="history-empty-state history-empty-search">${escapeHistoryText(buildHistoryEmptyCriteriaMessage(searchTerm, viewOptions))}</div>`;
    return {
      content,
      renderKey: JSON.stringify({
        activeHistorySection,
        cancelledCount,
        content,
        doneCount,
        empty: true,
        failedCount,
        runningCount,
        searchTerm,
        viewOptions: getHistoryViewOptionsKey(viewOptions)
      })
    };
  }

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
  const pollingLabel = isPollingActive ? 'Auto refresh on' : 'Auto refresh paused';
  const visibleMetaDetail = buildHistoryVisibleMetaDetail(searchTerm, viewOptions);
  const content = `
    <section class="history-editorial-hero">
      <div class="history-editorial-copy">
        <h3 class="history-editorial-title">Query History</h3>
        <p class="history-editorial-subtitle">${escapeHistoryText(historySubtitle)}</p>
      </div>
      <div class="history-editorial-meta">
        <div class="history-meta-card">
          <span class="history-meta-label">Updates</span>
          <span class="history-meta-value history-polling-value ${isPollingActive ? 'active' : 'idle'}">${pollingLabel}</span>
          <span class="history-meta-detail history-polling-detail">Last refresh ${escapeHistoryText(refreshedAt)}</span>
        </div>
        <div class="history-meta-card">
          <span class="history-meta-label">Shown</span>
          <span class="history-meta-value">${visibleCount}</span>
          <span class="history-meta-detail">${escapeHistoryText(visibleMetaDetail)}</span>
        </div>
      </div>
    </section>
    ${progressHtml}
    <div class="history-bookshelf${openSection ? ' monitor-active' : ''}">
      ${buildHistorySection('running', runningCount, openSection === 'running')}
      ${buildHistorySection('complete', doneCount, openSection === 'complete')}
      ${buildHistorySection('failed', failedCount, openSection === 'failed')}
      ${buildHistorySection('canceled', cancelledCount, openSection === 'canceled')}
      ${historyMonitor}
    </div>
  `;

  return {
    content,
    renderKey: JSON.stringify({
      activeHistorySection,
      cancelledCount,
      doneCount,
      failedCount,
      failedIds: failedList.map(q => `${q.id}:${q.error ?? ''}`),
      loadingQueryId,
      openSection,
      runningCount,
      runningIds: runningList.map(q => q.id),
      searchTerm,
      totalCount,
      visibleCount,
      viewOptions: getHistoryViewOptionsKey(viewOptions),
      cancelledIds: cancelledList.map(q => q.id),
      doneIds: doneList.map(q => `${q.id}:${q.resultCount ?? ''}`)
    })
  };
}

export {
  buildHistoryPanelView
};
