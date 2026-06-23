import { formatDuration } from '../../core/formatting/dataFormatters.js';
import { OperatorLabels } from '../../core/formatting/operatorLabels.js';

const WORKBOOK_DETAILS_SHEET_NAME = 'Run Details';
const WORKBOOK_DETAILS_COLUMNS = Object.freeze(['Section', 'Item', 'Value']);
const WORKBOOK_GENERATION_TIME_ITEM = 'Workbook Generation Time';
const WORKBOOK_GENERATION_TIME_PENDING = 'Calculating...';

function formatMetadataValue(value) {
  if (value === undefined || value === null || value === '') return '';
  if (value instanceof Date) return value.toLocaleString();
  if (typeof value === 'number' && Number.isFinite(value)) return value.toLocaleString();
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

function formatDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString();
}

function addDetailRow(rows, section, item, value, options = {}) {
  const formattedValue = formatMetadataValue(value);
  if (!formattedValue && !options.keepBlank) return;
  rows.push([section, item, formattedValue || options.blankValue || '']);
}

function formatWorkbookGenerationDuration(elapsedMs) {
  const safeMs = Number(elapsedMs);
  if (!Number.isFinite(safeMs) || safeMs < 0) {
    return WORKBOOK_GENERATION_TIME_PENDING;
  }
  if (safeMs < 1000) {
    return `${Math.max(1, Math.round(safeMs))} ms`;
  }
  if (safeMs < 60000) {
    const seconds = safeMs / 1000;
    return `${seconds < 10 ? seconds.toFixed(1).replace(/\.0$/u, '') : Math.round(seconds)} sec`;
  }
  return formatDuration(Math.round(safeMs / 1000));
}

function findWorkbookGenerationTimeRow(rows) {
  return (Array.isArray(rows) ? rows : []).find(row => (
    Array.isArray(row)
    && row[0] === 'Export'
    && row[1] === WORKBOOK_GENERATION_TIME_ITEM
  ));
}

function ensureWorkbookGenerationTimeRow(rows) {
  const detailRows = (Array.isArray(rows) ? rows : []).map(row => (Array.isArray(row) ? [...row] : row));
  if (!findWorkbookGenerationTimeRow(detailRows)) {
    detailRows.push(['Export', WORKBOOK_GENERATION_TIME_ITEM, WORKBOOK_GENERATION_TIME_PENDING]);
  }
  return detailRows;
}

function setWorkbookGenerationTimeRow(rows, elapsedMs) {
  const row = findWorkbookGenerationTimeRow(rows);
  if (row) {
    row[2] = formatWorkbookGenerationDuration(elapsedMs);
  }
}

function getQueryDurationSeconds(query) {
  if (!query?.startTime) return null;
  const start = new Date(query.startTime);
  const end = query.running ? new Date() : new Date(query.endTime || query.cancelledTime || '');
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return Math.max(0, Math.floor((end - start) / 1000));
}

function formatQueryDuration(query) {
  const seconds = getQueryDurationSeconds(query);
  return Number.isFinite(seconds) ? formatDuration(seconds) : '';
}

function getFilterValueParts(value) {
  const text = String(value || '').trim();
  if (!text) return [];
  return text.split(',').map(part => part.trim()).filter(Boolean);
}

function formatFilterValue(cond, value) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (String(cond || '').toLowerCase() === 'between') {
    return text.split('|').map(part => part.trim()).filter(Boolean).join(' to ');
  }
  const parts = getFilterValueParts(value);
  if (parts.length > 1) {
    return `\n${formatNumberedList(parts)}`;
  }
  return parts[0] || text;
}

function formatFilterLine(filter) {
  const operator = OperatorLabels.get(filter?.cond, 'Equals');
  const value = formatFilterValue(filter?.cond, filter?.val);
  if (!value) return operator;
  return value.startsWith('\n') ? `${operator}${value}` : `${operator} ${value}`;
}

function formatNumberedList(values) {
  const items = (Array.isArray(values) ? values : [])
    .map(value => String(value || '').trim())
    .filter(Boolean);
  return items.length
    ? items.map((value, index) => `${index + 1}. ${value}`).join('\n')
    : 'None';
}

function appendDisplayedFieldRows(rows, displayedFields) {
  const fields = Array.isArray(displayedFields) ? displayedFields : [];
  addDetailRow(rows, 'Displayed Fields', 'Count', fields.length);
  addDetailRow(rows, 'Displayed Fields', 'Fields', formatNumberedList(fields));
}

function appendFilterRows(rows, section, filtersByField) {
  const entries = Object.entries(filtersByField || {})
    .flatMap(([field, data]) => (Array.isArray(data?.filters) ? data.filters : [])
      .map(filter => ({ field, filter })));

  if (!entries.length) {
    addDetailRow(rows, section, 'Applied', 'None');
    return;
  }

  entries.forEach(({ field, filter }) => {
    addDetailRow(rows, section, field, formatFilterLine(filter));
  });
}

function appendPostFilterRows(rows, postFilters) {
  const entries = Object.entries(postFilters || {})
    .flatMap(([field, data]) => (Array.isArray(data?.filters) ? data.filters : [])
      .map(filter => ({ field, filter, logic: data?.logic || 'all' })));

  if (!entries.length) {
    addDetailRow(rows, 'Post Filters', 'Applied', 'None');
    return;
  }

  entries.forEach(({ field, filter, logic }) => {
    addDetailRow(rows, 'Post Filters', `${field} (${String(logic).toUpperCase()})`, formatFilterLine(filter));
  });
}

function buildWorkbookDetailsRows({
  activeFilters = {},
  config = {},
  displayedFields = [],
  exportedAt = new Date(),
  postFilters = {},
  postFilterStats = null,
  query = null,
  queryId = '',
  rowCount = 0,
  splitMultiValues = false,
  tableName = ''
} = {}) {
  const rows = [];
  const hasPostFilters = Object.values(postFilters || {}).some(data => Array.isArray(data?.filters) && data.filters.length);
  const totalRows = hasPostFilters && Number.isFinite(Number(postFilterStats?.totalRows))
    ? Number(postFilterStats.totalRows)
    : rowCount;
  const rowsAfterPostFilters = Number.isFinite(Number(postFilterStats?.postFilteredRows))
    ? Number(postFilterStats.postFilteredRows)
    : (postFilterStats?.filteredRows ?? rowCount);
  const duplicateRowsCollapsed = Number(postFilterStats?.duplicateRowsCollapsed || 0);

  addDetailRow(rows, 'Export', 'Workbook', tableName || 'Query Results');
  addDetailRow(rows, 'Export', 'Exported At', exportedAt);
  addDetailRow(rows, 'Export', 'Mode', config.mode === 'grouped' ? 'Split into sheets' : 'One sheet');
  addDetailRow(rows, 'Export', 'Group Field', config.mode === 'grouped' ? config.groupField : '');
  addDetailRow(rows, 'Export', 'Multi-value Layout', splitMultiValues ? 'Split into numbered columns' : 'Stacked in one cell');
  addDetailRow(rows, 'Export', WORKBOOK_GENERATION_TIME_ITEM, WORKBOOK_GENERATION_TIME_PENDING);
  addDetailRow(rows, 'Query', 'Query ID', query?.id || queryId);
  addDetailRow(rows, 'Query', 'Status', query?.status || '');
  addDetailRow(rows, 'Query', 'Started', formatDateTime(query?.startTime));
  addDetailRow(rows, 'Query', 'Completed', formatDateTime(query?.endTime || query?.cancelledTime));
  addDetailRow(rows, 'Query', 'Duration', formatQueryDuration(query), { keepBlank: true, blankValue: 'Unknown' });
  addDetailRow(rows, 'Rows', 'Exported Rows', rowCount);
  addDetailRow(rows, 'Rows', 'Loaded Rows Before Post Filters', totalRows);
  if (hasPostFilters) {
    addDetailRow(rows, 'Rows', 'Rows After Post Filters', rowsAfterPostFilters);
  }
  if (duplicateRowsCollapsed > 0) {
    addDetailRow(rows, 'Rows', 'Duplicate Rows Collapsed', duplicateRowsCollapsed);
  }
  appendDisplayedFieldRows(rows, displayedFields);
  appendFilterRows(rows, 'Query Filters', activeFilters);
  appendPostFilterRows(rows, postFilters);
  return rows;
}

function buildWorkbookDetailsRowsFromRuntime({
  config,
  queryStateReaders,
  services,
  splitMultiValues,
  state
} = {}) {
  const lifecycle = queryStateReaders?.getLifecycleState?.() || {};
  const query = services?.getHistoryQueryById?.(lifecycle.currentQueryId) || null;
  return buildWorkbookDetailsRows({
    activeFilters: queryStateReaders?.getActiveFilters?.() || {},
    config,
    displayedFields: state?.sourceData?.displayedFields || [],
    postFilters: services?.getPostFilterState?.() || {},
    postFilterStats: services?.getPostFilterStats?.() || null,
    query,
    queryId: lifecycle.currentQueryId || '',
    rowCount: state?.rowCount || 0,
    splitMultiValues,
    tableName: state?.tableName || ''
  });
}

function getWorkbookDetailsColumns() {
  return [...WORKBOOK_DETAILS_COLUMNS];
}

function addWorkbookDetailsWorksheet(workbook, { getUniqueSheetName, rows, usedNames }) {
  const worksheet = workbook.addWorksheet(getUniqueSheetName(WORKBOOK_DETAILS_SHEET_NAME, usedNames));
  worksheet.views = [{ state: 'frozen', ySplit: 1 }];
  worksheet.columns = [
    { header: WORKBOOK_DETAILS_COLUMNS[0], key: 'section', width: 20 },
    { header: WORKBOOK_DETAILS_COLUMNS[1], key: 'item', width: 28 },
    { header: WORKBOOK_DETAILS_COLUMNS[2], key: 'value', width: 52 }
  ];
  worksheet.addTable({
    name: `Run_Details_${Date.now()}`,
    ref: 'A1',
    headerRow: true,
    style: { theme: 'TableStyleMedium9', showRowStripes: true },
    columns: WORKBOOK_DETAILS_COLUMNS.map(name => ({ name, filterButton: true })),
    rows
  });
  worksheet.getColumn(3).alignment = { wrapText: true, vertical: 'top' };
}

export {
  WORKBOOK_DETAILS_COLUMNS,
  WORKBOOK_DETAILS_SHEET_NAME,
  addWorkbookDetailsWorksheet,
  buildWorkbookDetailsRows,
  buildWorkbookDetailsRowsFromRuntime,
  ensureWorkbookGenerationTimeRow,
  formatWorkbookGenerationDuration,
  getWorkbookDetailsColumns,
  setWorkbookGenerationTimeRow
};
