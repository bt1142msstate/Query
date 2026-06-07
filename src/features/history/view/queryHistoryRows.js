import { buildHistoryExpandButton, escapeHistoryText } from './queryHistoryDetails.js';
import { formatDuration } from '../../../core/formatting/dataFormatters.js';
import { formatBackendErrorSummary } from '../../../core/queryErrorDetails.js';
import {
  formatBackendProgressDetail,
  formatBackendProgressSummary,
  getBackendProgressCounterItems
} from '../../../core/queryProgress.js';
import { getQueryStatusMeta } from './queryHistoryViewHelpers.js';

const HISTORY_TABLE_HEADS = Object.freeze({
  running: `
    <thead class="history-table-head running">
      <tr>
        <th class="px-4 py-2 text-center" data-tooltip="Query name or identifier">Name</th>
        <th class="px-4 py-2 text-center" data-tooltip="Current query status">Status</th>
        <th class="px-4 py-2 text-center" data-tooltip="Open fields and filters for this query">Details</th>
        <th class="px-4 py-2 text-center" data-tooltip="When this query was started">Started</th>
        <th class="px-4 py-2 text-center" data-tooltip="How long this running query has been active">Duration</th>
        <th class="px-4 py-2 text-center" data-tooltip="Open partial results or create a reusable template">Results / Template</th>
        <th class="px-4 py-2 text-center" data-tooltip="Stop the currently running query">Stop/Cancel</th>
      </tr>
    </thead>`,
  complete: `
    <thead class="history-table-head complete">
      <tr>
        <th class="px-4 py-2 text-center" data-tooltip="Query name or identifier">Name</th>
        <th class="px-4 py-2 text-center" data-tooltip="Current query status">Status</th>
        <th class="px-4 py-2 text-center" data-tooltip="Open fields and filters for this query">Details</th>
        <th class="px-4 py-2 text-center" data-tooltip="When this query was last executed">Last Run</th>
        <th class="px-4 py-2 text-center" data-tooltip="How long the query took to complete">Duration</th>
        <th class="px-4 py-2 text-center" data-tooltip="Load the query results or view report">Results</th>
        <th class="px-4 py-2 text-center" data-tooltip="Re-execute this query or save it as a reusable template">Actions</th>
      </tr>
    </thead>`,
  failed: `
    <thead class="history-table-head failed">
      <tr>
        <th class="px-4 py-2 text-center" data-tooltip="Query name or identifier">Name</th>
        <th class="px-4 py-2 text-center" data-tooltip="Current query status">Status</th>
        <th class="px-4 py-2 text-center" data-tooltip="Open fields and filters for this query">Details</th>
        <th class="px-4 py-2 text-center" data-tooltip="When this query last ran">Last Run</th>
        <th class="px-4 py-2 text-center" data-tooltip="How long the query ran before failing">Duration</th>
        <th class="px-4 py-2 text-center" data-tooltip="Failure reason or backend warning">Issue</th>
        <th class="px-4 py-2 text-center" data-tooltip="Re-execute this query or save it as a reusable template">Actions</th>
      </tr>
    </thead>`,
  canceled: `
    <thead class="history-table-head canceled">
      <tr>
        <th class="px-4 py-2 text-center" data-tooltip="Query name or identifier">Name</th>
        <th class="px-4 py-2 text-center" data-tooltip="Current query status">Status</th>
        <th class="px-4 py-2 text-center" data-tooltip="Open fields and filters for this query">Details</th>
        <th class="px-4 py-2 text-center" data-tooltip="When this query was last executed before cancellation">Last Run</th>
        <th class="px-4 py-2 text-center" data-tooltip="How long the query ran before being cancelled">Duration</th>
        <th class="px-4 py-2 text-center" data-tooltip="Re-execute this query or save it as a reusable template">Actions</th>
      </tr>
    </thead>`
});

function getDefaultRowDependencies() {
  return {
    formatDuration,
    normalizeUiConfigFilters: null
  };
}

function getHistoryRowFilters(query, dependencies) {
  return typeof dependencies.normalizeUiConfigFilters === 'function'
    ? dependencies.normalizeUiConfigFilters(query.jsonConfig)
    : [];
}

function formatHistoryRowDuration(query, dependencies) {
  if (!query.startTime) {
    return '-';
  }

  const start = new Date(query.startTime);
  const end = query.running
    ? new Date()
    : new Date(query.endTime || query.cancelledTime);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return '-';
  }

  const seconds = Math.max(0, Math.floor((end - start) / 1000));
  return typeof dependencies.formatDuration === 'function'
    ? dependencies.formatDuration(seconds)
    : `${seconds}s`;
}

function formatHistoryRowDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString();
}

function buildHistoryRowMetricHtml(label, value) {
  return `
    <span class="history-row-metric">
      <span class="history-row-metric-label">${escapeHistoryText(label)}</span>
      <span class="history-row-metric-value">${escapeHistoryText(value)}</span>
    </span>`;
}

function buildHistoryProgressHtml(progress) {
  if (!progress) {
    return '';
  }

  const summary = formatBackendProgressSummary(progress);
  const detail = formatBackendProgressDetail(progress);
  const counters = getBackendProgressCounterItems(progress, 2)
    .map(counter => `
      <span class="history-progress-counter">
        <span>${escapeHistoryText(counter.label)}</span>
        <strong>${escapeHistoryText(counter.value)}</strong>
      </span>
    `)
    .join('');

  if (!summary && !detail && !counters) {
    return '';
  }

  return `
    <div class="history-progress-line" role="status" aria-live="polite">
      ${summary ? `<span class="history-progress-title">${escapeHistoryText(summary)}</span>` : ''}
      ${detail ? `<span class="history-progress-detail">${escapeHistoryText(detail)}</span>` : ''}
      ${counters ? `<span class="history-progress-counters">${counters}</span>` : ''}
    </div>`;
}

function buildHistoryReasonSummaryHtml(query) {
  if (!query.error && !query.errorDetails) {
    return '<span class="text-gray-400">None</span>';
  }

  const detailSummary = formatBackendErrorSummary(query.errorDetails);
  return `
    <span class="history-reason-summary">
      <span class="history-reason-icon">Issue</span>
      ${detailSummary ? `<span class="history-reason-detail">${escapeHistoryText(detailSummary)}</span>` : ''}
    </span>`;
}

function buildHistoryRowActions(query, options = {}) {
  const queryId = escapeHistoryText(query.id);
  const isLoading = options.activeHistoryResultLoadQueryId === query.id;
  const loadAttrs = isLoading ? ' disabled aria-busy="true"' : '';
  const loadClass = isLoading ? ' is-loading' : '';
  const loadIcon = isLoading
    ? '<span class="history-action-spinner" aria-hidden="true"></span>'
    : '<svg class="history-results-icon w-4 h-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18"/><path d="M9 4v16"/><path d="M15 4v16"/></svg>';
  const previewBtn = query.running ? `<button class="load-query-btn${loadClass} inline-flex items-center justify-center p-1 rounded-full bg-gray-100 hover:bg-gray-200 text-blue-600" tabindex="-1" data-query-id="${queryId}" data-tooltip="${isLoading ? 'Loading partial results' : 'Open partial results'}" aria-label="${isLoading ? 'Loading partial results' : 'Open partial results'}"${loadAttrs}>${loadIcon}<span class="history-action-label">${isLoading ? 'Loading' : 'Preview'}</span></button>` : '';
  const stopBtn = query.running ? `<button class="stop-query-btn inline-flex items-center justify-center p-1 rounded-full bg-red-100 hover:bg-red-200 text-red-600" tabindex="-1" data-query-id="${queryId}" data-tooltip="Stop query" aria-label="Stop query"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-4 h-4" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2"/></svg><span class="history-action-label">Stop</span></button>` : '';
  const loadTooltipCount = query.resultCount !== undefined ? query.resultCount : 'Unknown';
  const loadBtn = !query.running && !query.cancelled ? `<button class="load-query-btn${loadClass} inline-flex items-center justify-center p-1 rounded-full bg-gray-100 hover:bg-gray-200 text-blue-600" tabindex="-1" data-query-id="${queryId}" data-tooltip="${isLoading ? 'Loading results' : `Open results - ${escapeHistoryText(loadTooltipCount)} rows`}" aria-label="${isLoading ? 'Loading results' : `Open results - ${escapeHistoryText(loadTooltipCount)} rows`}"${loadAttrs}>${loadIcon}<span class="history-action-label">${isLoading ? 'Loading' : 'Open'}</span></button>` : '';
  const rerunBtn = !query.running ? `<button class="rerun-query-btn inline-flex items-center justify-center p-1 rounded-full bg-gray-100 hover:bg-gray-200 text-green-600" tabindex="-1" data-query-id="${queryId}" data-tooltip="Rerun Query" aria-label="Rerun query"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="history-rerun-icon w-4 h-4" aria-hidden="true"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M3 21v-5h5"/></svg><span class="history-action-label">Rerun</span></button>` : '';
  const templateBtn = `<button class="template-query-btn inline-flex items-center justify-center p-1 rounded-full bg-gray-100 hover:bg-gray-200 text-purple-600" tabindex="-1" data-query-id="${queryId}" data-tooltip="Create template from this query" aria-label="Create template from this query"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4" aria-hidden="true"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5"/><path d="M9 13h6"/><path d="M9 17h4"/></svg><span class="history-action-label">Template</span></button>`;

  return { loadBtn, previewBtn, rerunBtn, stopBtn, templateBtn };
}

function buildHistoryActionGroup(actions) {
  const visibleActions = actions.filter(Boolean);
  if (!visibleActions.length) {
    return '';
  }

  return `<div class="history-actions-group">${visibleActions.join('')}</div>`;
}

function createQueriesTableRowHtml(query, options = {}) {
  const dependencies = options.dependencies || getDefaultRowDependencies();
  const activeHistoryDetailQueryId = options.activeHistoryDetailQueryId || null;
  const statusMeta = getQueryStatusMeta(query.status);
  const columns = query.jsonConfig?.DesiredColumnOrder || [];
  const filters = getHistoryRowFilters(query, dependencies);
  const isExpanded = activeHistoryDetailQueryId === query.id;
  const queryId = escapeHistoryText(query.id);
  const rowDate = formatHistoryRowDate(query.startTime);
  const duration = formatHistoryRowDuration(query, dependencies);
  const { loadBtn, previewBtn, rerunBtn, stopBtn, templateBtn } = buildHistoryRowActions(query, options);
  const dateLabel = query.running ? 'Started' : 'Last run';
  const dateCell = buildHistoryRowMetricHtml(dateLabel, rowDate);
  const durationCell = buildHistoryRowMetricHtml('Duration', duration);

  const reasonSummary = buildHistoryReasonSummaryHtml(query);

  const metaPills = [`<span class="history-inline-pill subtle">${queryId}</span>`];
  if (!query.running && query.resultCount !== undefined && query.resultCount !== '-' && query.resultCount !== '?') {
    metaPills.push(`<span class="history-inline-pill">${Number(query.resultCount).toLocaleString()} rows</span>`);
  }
  if (query.launchMode) {
    metaPills.push(`<span class="history-inline-pill subtle">${escapeHistoryText(query.launchMode)}</span>`);
  }
  if (query.deliveryMode) {
    metaPills.push(`<span class="history-inline-pill subtle">${escapeHistoryText(query.deliveryMode)}</span>`);
  }

  const nameCell = `
    <div class="history-name-cell">
      <div class="history-name-block">
        <span class="history-query-name">${escapeHistoryText(query.name || query.id)}</span>
        <div class="history-meta-line">${metaPills.join('')}</div>
        ${query.running ? buildHistoryProgressHtml(query.progress) : ''}
      </div>
    </div>`;
  const statusCell = `<span class="${statusMeta.badgeClass}">${statusMeta.label}</span>`;
  const detailsCell = buildHistoryExpandButton(query.id, isExpanded, columns.length, filters.length);

  if (query.running) {
    return `
      <tr class="history-row ${statusMeta.rowClass} cursor-pointer" data-query-id="${queryId}">
        <td class="history-name-column px-4 py-3 text-xs text-left font-mono">${nameCell}</td>
        <td class="history-status-cell px-4 py-2 text-xs text-center">${statusCell}</td>
        <td class="history-details-cell px-4 py-2 text-xs text-center">${detailsCell}</td>
        <td class="history-date-cell px-4 py-2 text-xs text-center">${dateCell}</td>
        <td class="history-duration-cell px-4 py-2 text-xs text-center" data-query-id="${queryId}">${durationCell}</td>
        <td class="history-actions-cell px-4 py-2 text-center" colspan="2">${buildHistoryActionGroup([previewBtn, templateBtn, stopBtn])}</td>
      </tr>
    `;
  }

  if (query.cancelled) {
    return `
      <tr class="history-row ${statusMeta.rowClass} cursor-pointer" data-query-id="${queryId}">
        <td class="history-name-column px-4 py-3 text-xs text-left font-mono">${nameCell}</td>
        <td class="history-status-cell px-4 py-2 text-xs text-center">${statusCell}</td>
        <td class="history-details-cell px-4 py-2 text-xs text-center">${detailsCell}</td>
        <td class="history-date-cell px-4 py-2 text-xs text-center">${dateCell}</td>
        <td class="history-duration-cell px-4 py-2 text-xs text-center">${durationCell}</td>
        <td class="history-actions-cell px-4 py-2 text-xs text-center">${buildHistoryActionGroup([templateBtn, rerunBtn])}</td>
      </tr>
    `;
  }

  if (query.failed) {
    return `
      <tr class="history-row ${statusMeta.rowClass} cursor-pointer" data-query-id="${queryId}">
        <td class="history-name-column px-4 py-3 text-xs text-left font-mono">${nameCell}</td>
        <td class="history-status-cell px-4 py-2 text-xs text-center">${statusCell}</td>
        <td class="history-details-cell px-4 py-2 text-xs text-center">${detailsCell}</td>
        <td class="history-date-cell px-4 py-2 text-xs text-center">${dateCell}</td>
        <td class="history-duration-cell px-4 py-2 text-xs text-center">${durationCell}</td>
        <td class="history-issue-cell px-4 py-2 text-xs text-center">${reasonSummary}</td>
        <td class="history-actions-cell px-4 py-2 text-xs text-center">${buildHistoryActionGroup([templateBtn, rerunBtn])}</td>
      </tr>
    `;
  }

  return `
    <tr class="history-row ${statusMeta.rowClass} cursor-pointer" data-query-id="${queryId}">
      <td class="history-name-column px-4 py-3 text-xs text-left font-mono">${nameCell}</td>
      <td class="history-status-cell px-4 py-2 text-xs text-center">${statusCell}</td>
      <td class="history-details-cell px-4 py-2 text-xs text-center">${detailsCell}</td>
      <td class="history-date-cell px-4 py-2 text-xs text-center">${dateCell}</td>
      <td class="history-duration-cell px-4 py-2 text-xs text-center">${durationCell}</td>
      <td class="history-actions-cell px-4 py-2 text-xs text-center" colspan="2">${buildHistoryActionGroup([loadBtn, templateBtn, rerunBtn])}</td>
    </tr>
  `;
}

export {
  HISTORY_TABLE_HEADS,
  createQueriesTableRowHtml
};
