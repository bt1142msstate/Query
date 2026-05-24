import { escapeHtml } from '../core/formatting/html.js';
import { formatFieldOperatorForDisplay, normalizeUiConfigFilters } from '../filters/queryPayload.js';

export function formatColumnsTooltip(columns) {
  if (!columns || !columns.length) return '';

  const columnItems = columns.map((column, index) => (
    '<li class="tt-filter-item tt-column-item">' +
    `  <span class="tt-column-index">${index + 1}</span>` +
    `  <span class="tt-column-name">${escapeHtml(column || '')}</span>` +
    '</li>'
  )).join('');

  return '<div class="tt-filter-container tt-columns-container">' +
    '<div class="tt-filter-title">Displayed Columns</div>' +
    `<ol class="tt-filter-list tt-columns-list">${columnItems}</ol>` +
    '</div>';
}

export function formatHistoryFiltersTooltip(filtersInput) {
  const filters = normalizeUiConfigFilters(filtersInput);
  if (!filters.length) return 'None';

  const lines = [];
  filters.forEach(filter => {
    const op = formatFieldOperatorForDisplay(filter.FieldOperator);
    lines.push(`${filter.FieldName || ''} ${op} ${filter.Values ? filter.Values.join('|') : ''}`);
  });

  return lines.join(', ');
}
