import { getBackendErrorDetailItems } from '../../../core/queryErrorDetails.js';
import { formatStandardFilterTooltipHTML } from '../../../core/formatting/tooltipFormatters.js';

const HISTORY_DETAILS_PREVIEW_LIMIT = 6;

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

function buildHistoryColumnItems(columns) {
  return columns.map((column, index) => (
    '<li class="tt-filter-item tt-column-item">' +
    `  <span class="tt-column-index">${index + 1}</span>` +
    `  <span class="tt-column-name">${escapeHistoryText(column)}</span>` +
    '</li>'
  )).join('');
}

function buildHistoryColumnsMarkup(columns) {
  const safeColumns = Array.isArray(columns) ? columns : [];
  if (!safeColumns.length) {
    return '<p class="history-details-empty">No displayed columns saved for this query.</p>';
  }

  const buildColumnContainer = items => '<div class="tt-filter-container tt-columns-container">' +
    `<ol class="tt-filter-list tt-columns-list">${items}</ol>` +
    '</div>';

  if (safeColumns.length <= HISTORY_DETAILS_PREVIEW_LIMIT) {
    return buildColumnContainer(buildHistoryColumnItems(safeColumns));
  }

  const previewColumns = safeColumns.slice(0, HISTORY_DETAILS_PREVIEW_LIMIT);
  const hiddenCount = safeColumns.length - previewColumns.length;

  return `
    <details class="history-details-list-expander">
      <summary>
        <span>Showing ${previewColumns.length} of ${safeColumns.length} fields</span>
        <span class="history-details-list-expander-action">Show all</span>
      </summary>
      <div class="history-details-list-preview">
        ${buildColumnContainer(buildHistoryColumnItems(previewColumns))}
        <span class="history-details-list-more">... ${hiddenCount} more</span>
      </div>
      <div class="history-details-list-full">
        ${buildColumnContainer(buildHistoryColumnItems(safeColumns))}
      </div>
    </details>`;
}

function formatFilterOperatorLabel(operator) {
  const normalized = String(operator || '').trim();
  const labels = {
    Equals: '=',
    equals: '=',
    '=': '=',
    DoesNotEqual: '!=',
    does_not_equal: '!=',
    '!=': '!=',
    GreaterThan: '>',
    greater: '>',
    '>': '>',
    LessThan: '<',
    less: '<',
    '<': '<',
    GreaterThanOrEqual: '>=',
    greater_or_equal: '>=',
    '>=': '>=',
    LessThanOrEqual: '<=',
    less_or_equal: '<=',
    '<=': '<=',
    Contains: 'contains',
    contains: 'contains',
    DoesNotContain: 'does not contain',
    does_not_contain: 'does not contain',
    doesnotcontain: 'does not contain',
    Between: 'between',
    between: 'between',
    Never: 'never',
    never: 'never',
    Before: 'before',
    before: 'before',
    After: 'after',
    after: 'after',
    OnOrBefore: 'on or before',
    on_or_before: 'on or before',
    OnOrAfter: 'on or after',
    on_or_after: 'on or after'
  };

  return labels[normalized] || normalized;
}

function buildHistoryFilterPreviewItem(filter) {
  const values = Array.isArray(filter?.Values) ? filter.Values : [];
  const valuePreview = values
    .slice(0, 2)
    .map(value => escapeHistoryText(value))
    .join(', ');
  const valueSuffix = values.length > 2 ? ` +${values.length - 2} more` : '';
  const valueMarkup = valuePreview
    ? `<span class="history-details-filter-preview-values">${valuePreview}${escapeHistoryText(valueSuffix)}</span>`
    : '<span class="history-details-filter-preview-values muted">No value</span>';

  return `
    <li class="history-details-filter-preview-item">
      <span class="history-details-filter-preview-field">${escapeHistoryText(filter?.FieldName || '')}</span>
      <span class="history-details-filter-preview-op">${escapeHistoryText(formatFilterOperatorLabel(filter?.FieldOperator))}</span>
      ${valueMarkup}
    </li>`;
}

function buildHistoryFiltersMarkup(filters, dependencies = getDefaultHistoryDetailsDependencies()) {
  const safeFilters = Array.isArray(filters) ? filters : [];
  const fullMarkup = typeof dependencies.formatStandardFilterTooltipHTML === 'function'
    ? dependencies.formatStandardFilterTooltipHTML(safeFilters, '')
    : '';

  if (!fullMarkup) {
    return '<p class="history-details-empty">No filters saved for this query.</p>';
  }

  if (safeFilters.length <= HISTORY_DETAILS_PREVIEW_LIMIT) {
    return fullMarkup;
  }

  const previewFilters = safeFilters.slice(0, HISTORY_DETAILS_PREVIEW_LIMIT);
  const hiddenCount = safeFilters.length - previewFilters.length;

  return `
    <details class="history-details-list-expander">
      <summary>
        <span>Showing ${previewFilters.length} of ${safeFilters.length} filters</span>
        <span class="history-details-list-expander-action">Show all</span>
      </summary>
      <div class="history-details-list-preview">
        <ul class="history-details-filter-preview-list">
          ${previewFilters.map(buildHistoryFilterPreviewItem).join('')}
        </ul>
        <span class="history-details-list-more">... ${hiddenCount} more</span>
      </div>
      <div class="history-details-list-full">
        ${fullMarkup}
      </div>
    </details>`;
}

function buildHistoryIssueMarkup(reason, errorDetails) {
  const detailItems = getBackendErrorDetailItems(errorDetails);
  if (!reason && !detailItems.length) {
    return '<p class="history-details-empty">No issue recorded.</p>';
  }

  const detailsMarkup = detailItems.length
    ? `
      <dl class="history-error-details-list">
        ${detailItems.map(item => `
          <div class="history-error-details-item">
            <dt>${escapeHistoryText(item.label)}</dt>
            <dd>${escapeHistoryText(item.value)}</dd>
          </div>
        `).join('')}
      </dl>`
    : '';

  return `
    ${reason ? `<p class="history-details-issue">${escapeHistoryText(reason)}</p>` : ''}
    ${detailsMarkup}`;
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
            ${buildHistoryIssueMarkup(q.error || '', q.errorDetails)}
          </section>
        ` : ''}
      </div>
    </section>
  `;
}

export {
  buildHistoryDetailsOverlayHtml,
  buildHistoryExpandButton,
  escapeHistoryText
};
