import { formatStandardFilterTooltipHTML } from '../core/tooltipFormatters.js';

function getDefaultHistoryDetailsDependencies() {
  return {
    formatStandardFilterTooltipHTML,
    normalizeUiConfigFilters: null
  };
}

function escapeHistoryText(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildHistoryColumnsMarkup(columns) {
  const safeColumns = Array.isArray(columns) ? columns : [];
  if (!safeColumns.length) {
    return '<p class="history-details-empty">No displayed columns saved for this query.</p>';
  }

  const items = safeColumns.map((column, index) => (
    '<li class="tt-filter-item tt-column-item">' +
    `  <span class="tt-column-index">${index + 1}</span>` +
    `  <span class="tt-column-name">${escapeHistoryText(column)}</span>` +
    '</li>'
  )).join('');

  return '<div class="tt-filter-container tt-columns-container">' +
    `<ol class="tt-filter-list tt-columns-list">${items}</ol>` +
    '</div>';
}

function buildHistoryFiltersMarkup(filters, dependencies = getDefaultHistoryDetailsDependencies()) {
  if (typeof dependencies.formatStandardFilterTooltipHTML === 'function') {
    return dependencies.formatStandardFilterTooltipHTML(filters, '') || '<p class="history-details-empty">No filters saved for this query.</p>';
  }

  return '<p class="history-details-empty">No filters saved for this query.</p>';
}

function buildHistoryIssueMarkup(reason) {
  if (!reason) {
    return '<p class="history-details-empty">No issue recorded.</p>';
  }

  return `<p class="history-details-issue">${escapeHistoryText(reason)}</p>`;
}

function buildHistoryExpandButton(queryId, isExpanded, columnCount, filterCount) {
  const safeQueryId = escapeHistoryText(queryId);
  return `
    <button
      type="button"
      class="history-expand-btn"
      data-history-expand="${safeQueryId}"
      aria-expanded="${isExpanded ? 'true' : 'false'}"
      aria-controls="history-details-${safeQueryId}"
    >
      <span>${isExpanded ? 'Hide details' : 'Details'}</span>
      <span class="history-expand-meta">${columnCount} ${columnCount === 1 ? 'field' : 'fields'} &bull; ${filterCount} ${filterCount === 1 ? 'filter' : 'filters'}</span>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4" aria-hidden="true">
        <path d="M6 9l6 6 6-6"></path>
      </svg>
    </button>
  `;
}

function buildHistoryDetailsOverlayHtml(q, dependencies = getDefaultHistoryDetailsDependencies()) {
  if (!q) {
    return '';
  }

  const columns = q.jsonConfig?.DesiredColumnOrder || [];
  const filters = typeof dependencies.normalizeUiConfigFilters === 'function'
    ? dependencies.normalizeUiConfigFilters(q.jsonConfig)
    : [];

  return `
    <div class="history-details-modal-backdrop" data-history-details-close></div>
    <section class="history-details-modal" role="dialog" aria-modal="true" aria-labelledby="history-details-title">
      <button type="button" class="history-details-modal-close" aria-label="Close details" data-history-details-close>
        <span aria-hidden="true">&times;</span>
      </button>
      <div class="history-details-modal-header">
        <p class="history-details-modal-kicker">Query details</p>
        <h4 id="history-details-title" class="history-details-modal-title">${escapeHistoryText(q.name || q.id)}</h4>
        <div class="history-meta-line">
          <span class="history-inline-pill subtle">${escapeHistoryText(q.id)}</span>
          <span class="history-inline-pill">${columns.length} ${columns.length === 1 ? 'field' : 'fields'}</span>
          <span class="history-inline-pill">${filters.length} ${filters.length === 1 ? 'filter' : 'filters'}</span>
        </div>
      </div>
      <div class="history-details-grid">
        <section class="history-details-panel">
          <h5>Displayed Fields</h5>
          ${buildHistoryColumnsMarkup(columns)}
        </section>
        <section class="history-details-panel">
          <h5>Filters</h5>
          ${buildHistoryFiltersMarkup(filters, dependencies)}
        </section>
        ${q.failed ? `
          <section class="history-details-panel history-details-panel-full">
            <h5>Issue</h5>
            ${buildHistoryIssueMarkup(q.error || '')}
          </section>
        ` : ''}
      </div>
    </section>
  `;
}

export {
  buildHistoryColumnsMarkup,
  buildHistoryDetailsOverlayHtml,
  buildHistoryExpandButton,
  buildHistoryFiltersMarkup,
  buildHistoryIssueMarkup,
  escapeHistoryText
};
