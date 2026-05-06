import { buildHistoryExpandButton, escapeHistoryText } from './queryHistoryDetails.js';
import { formatDuration } from './dataFormatters.js';
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
        <th class="px-4 py-2 text-center" data-tooltip="Open the results accumulated so far for this running query">Results</th>
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
        <th class="px-4 py-2 text-center" data-tooltip="Re-execute this query with the same settings">Rerun</th>
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
        <th class="px-4 py-2 text-center" data-tooltip="Re-execute this query with the same settings">Rerun</th>
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
        <th class="px-4 py-2 text-center" data-tooltip="Re-execute this query with the same settings">Rerun</th>
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

function buildHistoryRowActions(query) {
  const queryId = escapeHistoryText(query.id);
  const previewBtn = query.running ? `<button class="load-query-btn inline-flex items-center justify-center p-1 rounded-full bg-gray-100 hover:bg-gray-200 text-blue-600" tabindex="-1" data-query-id="${queryId}" style="margin-left:4px;" data-tooltip="Open partial results"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/></svg></button>` : '';
  const stopBtn = query.running ? `<button class="stop-query-btn inline-flex items-center justify-center p-1 rounded-full bg-red-100 hover:bg-red-200 text-red-600" tabindex="-1" data-query-id="${queryId}" data-tooltip="Stop"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-4 h-4"><rect x="6" y="6" width="12" height="12" rx="2"/></svg></button>` : '';
  const loadTooltipCount = query.resultCount !== undefined ? query.resultCount : 'Unknown';
  const loadBtn = !query.running && !query.cancelled ? `<button class="load-query-btn inline-flex items-center justify-center p-1 rounded-full bg-gray-100 hover:bg-gray-200 text-blue-600" tabindex="-1" data-query-id="${queryId}" style="margin-left:4px;" data-tooltip="Open results - ${escapeHistoryText(loadTooltipCount)} rows"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/></svg></button>` : '';
  const rerunBtn = !query.running ? `<button class="rerun-query-btn inline-flex items-center justify-center p-1 rounded-full bg-gray-100 hover:bg-gray-200 text-green-600" tabindex="-1" data-query-id="${queryId}" style="margin-left:4px;" data-tooltip="Rerun Query"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg></button>` : '';

  return { loadBtn, previewBtn, rerunBtn, stopBtn };
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
  const { loadBtn, previewBtn, rerunBtn, stopBtn } = buildHistoryRowActions(query);

  const reasonSummary = query.error
    ? '<span class="history-reason-icon">Issue</span>'
    : '<span class="text-gray-400">None</span>';

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
      </div>
    </div>`;
  const statusCell = `<span class="${statusMeta.badgeClass}">${statusMeta.label}</span>`;
  const detailsCell = buildHistoryExpandButton(query.id, isExpanded, columns.length, filters.length);

  if (query.running) {
    return `
      <tr class="history-row ${statusMeta.rowClass} cursor-pointer" data-query-id="${queryId}">
        <td class="px-4 py-3 text-xs text-left font-mono">${nameCell}</td>
        <td class="px-4 py-2 text-xs text-center">${statusCell}</td>
        <td class="px-4 py-2 text-xs text-center">${detailsCell}</td>
        <td class="px-4 py-2 text-xs text-center">${rowDate}</td>
        <td class="px-4 py-2 text-xs text-center history-duration-cell" data-query-id="${queryId}">${duration}</td>
        <td class="px-4 py-2 text-center">${previewBtn}</td>
        <td class="px-4 py-2 text-center">${stopBtn}</td>
      </tr>
    `;
  }

  if (query.cancelled) {
    return `
      <tr class="history-row ${statusMeta.rowClass} cursor-pointer" data-query-id="${queryId}">
        <td class="px-4 py-3 text-xs text-left font-mono">${nameCell}</td>
        <td class="px-4 py-2 text-xs text-center">${statusCell}</td>
        <td class="px-4 py-2 text-xs text-center">${detailsCell}</td>
        <td class="px-4 py-2 text-xs text-center">${rowDate}</td>
        <td class="px-4 py-2 text-xs text-center">${duration}</td>
        <td class="px-4 py-2 text-xs text-center">${rerunBtn}</td>
      </tr>
    `;
  }

  if (query.failed) {
    return `
      <tr class="history-row ${statusMeta.rowClass} cursor-pointer" data-query-id="${queryId}">
        <td class="px-4 py-3 text-xs text-left font-mono">${nameCell}</td>
        <td class="px-4 py-2 text-xs text-center">${statusCell}</td>
        <td class="px-4 py-2 text-xs text-center">${detailsCell}</td>
        <td class="px-4 py-2 text-xs text-center">${rowDate}</td>
        <td class="px-4 py-2 text-xs text-center">${duration}</td>
        <td class="px-4 py-2 text-xs text-center">${reasonSummary}</td>
        <td class="px-4 py-2 text-xs text-center">${rerunBtn}</td>
      </tr>
    `;
  }

  return `
    <tr class="history-row ${statusMeta.rowClass} cursor-pointer" data-query-id="${queryId}">
      <td class="px-4 py-3 text-xs text-left font-mono">${nameCell}</td>
      <td class="px-4 py-2 text-xs text-center">${statusCell}</td>
      <td class="px-4 py-2 text-xs text-center">${detailsCell}</td>
      <td class="px-4 py-2 text-xs text-center">${rowDate}</td>
      <td class="px-4 py-2 text-xs text-center">${duration}</td>
      <td class="px-4 py-2 text-xs text-center">${loadBtn}</td>
      <td class="px-4 py-2 text-xs text-center">${rerunBtn}</td>
    </tr>
  `;
}

export {
  HISTORY_TABLE_HEADS,
  createQueriesTableRowHtml,
  formatHistoryRowDuration
};
