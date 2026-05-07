/**
 * Virtual Table Module
 * Handles large dataset rendering with virtual scrolling for performance optimization.
 * Provides efficient rendering of thousands of rows by only displaying visible rows.
 * @module VirtualTable
 */
import { appServices } from '../core/appServices.js';
import { appUiActions } from '../core/appUiActions.js';
import { QueryChangeManager, QueryStateReaders } from '../core/queryState.js';
import { MoneyUtils, TableBuilder, TextMeasurement, ValueFormatting } from '../core/utils.js';
import { getComparableValue } from '../core/dateValues.js';
import { createTableColumnLayoutController } from './tableColumnLayout.js';
import { createTableScrollbarController } from './tableScrollbar.js';
import { sortRowsByColumn } from './tableSort.js';
import { appRuntime } from '../core/appRuntime.js';
import { escapeHtml } from '../core/html.js';
(function initializeVirtualTable() {
// Virtual scrolling state
let virtualTableData = {
  headers: [],
  rows: [],
  columnMap: new Map()
};

let baseViewData = {
  headers: [],
  rows: [],
  columnMap: new Map()
};

// Stores the original collapsed data so split mode can be toggled on/off non-destructively
let rawTableData = null;
let splitColumnsActive = false;
const postFiltersState = {};
const postFilterValueOptionsCache = new Map();
const POST_FILTER_BLANK_SENTINEL = '__QUERY_POST_FILTER_BLANK__';

let tableRowHeight = 42;    // estimated row height in pixels
let tableScrollTop = 0;
let tableScrollContainer = null;
let calculatedColumnWidths = {}; // Store calculated optimal widths for each column
let manualColumnWidths = {};
let resizeModeState = {
  active: false,
  fieldName: ''
};
let simpleTableInstance = null; // Store the SimpleTable instance

const HEADER_ACTION_SPACE = 116;
const HEADER_TEXT_BALANCE_SPACE = 116;
const FULL_TABLE_RENDER_ROW_LIMIT = 2000;
var services = appServices, uiActions = appUiActions;
const tableScrollbar = createTableScrollbarController({
  getRowHeight: () => tableRowHeight
});

// Keep track of sorting state
let currentSortColumn = null;
let currentSortDirection = 'asc'; // 'asc' or 'desc'
var getDisplayedFields = QueryStateReaders.getDisplayedFields.bind(QueryStateReaders);
const tableColumnLayout = createTableColumnLayoutController({
  getContainer: () => tableScrollContainer,
  getDisplayedFields: () => getDisplayedFields(),
  getColumnWidth: field => calculatedColumnWidths[field],
  isManualColumnWidth: field => Object.prototype.hasOwnProperty.call(manualColumnWidths, field),
  calculateColumnWidths: (fields, data) => calculateOptimalColumnWidths(fields, data),
  getTableData: () => virtualTableData
});

function getFieldType(fieldName) {
  return ValueFormatting.getFieldType(fieldName, { inferMoneyFromName: true });
}

function parseNumericValue(value, type = 'number') {
  if (type === 'money') {
    return MoneyUtils.parseNumber(value);
  }

  if (typeof value === 'number') return value;
  return parseFloat(String(value).replace(/,/g, ''));
}

function invalidatePostFilterValueOptionsCache() {
  postFilterValueOptionsCache.clear();
}

function isBlankPostFilterValue(value) {
  return String(value || '') === POST_FILTER_BLANK_SENTINEL;
}

function isBlankCellValue(rawValue) {
  if (rawValue === undefined || rawValue === null) {
    return true;
  }

  if (typeof rawValue === 'string') {
    if (rawValue.includes('\x1F')) {
      const parts = rawValue.split('\x1F').map(part => String(part).trim());
      return parts.length === 0 || parts.every(part => !part);
    }

    return String(rawValue).trim() === '';
  }

  return false;
}

function cloneTableData(data) {
  return {
    headers: Array.isArray(data?.headers) ? [...data.headers] : [],
    rows: Array.isArray(data?.rows) ? data.rows.map(row => Array.isArray(row) ? [...row] : row) : [],
    columnMap: data?.columnMap instanceof Map ? new Map(data.columnMap) : new Map()
  };
}

function applyManualWidthsToMap(widths, fields = null) {
  const targetFields = Array.isArray(fields) && fields.length ? fields : Object.keys(widths || {});
  targetFields.forEach(field => {
    if (Object.prototype.hasOwnProperty.call(manualColumnWidths, field)) {
      widths[field] = manualColumnWidths[field];
    }
  });
  return widths;
}

function syncResizeModeBodyClass() {
  document.body.classList.toggle('table-resize-mode', resizeModeState.active);
}

function getDisplayedFieldIndex(fieldName) {
  return getDisplayedFields().findIndex(field => field === fieldName);
}

function updateRenderedColumnWidth(fieldName, width) {
  const normalizedWidth = tableColumnLayout.normalizeColumnWidth(width);
  const fieldIndex = getDisplayedFieldIndex(fieldName);
  if (fieldIndex === -1) {
    return;
  }

  const table = document.getElementById('example-table');
  if (!table) {
    return;
  }

  calculatedColumnWidths[fieldName] = normalizedWidth;
  tableColumnLayout.syncRenderedColumnLayout(table);
}

function syncResizeModeUi() {
  if (resizeModeState.active && getDisplayedFieldIndex(resizeModeState.fieldName) === -1) {
    resizeModeState.active = false;
    resizeModeState.fieldName = '';
  }

  syncResizeModeBodyClass();

  const addFieldBtn = document.getElementById('table-add-field-btn');
  if (addFieldBtn) {
    addFieldBtn.disabled = resizeModeState.active;
    addFieldBtn.classList.toggle('is-disabled-for-resize', resizeModeState.active);
  }

  document.querySelectorAll('#example-table thead th').forEach(th => {
    const fieldName = th.getAttribute('data-sort-field') || th.textContent.trim();
    const isTarget = resizeModeState.active && fieldName === resizeModeState.fieldName;
    th.classList.toggle('query-table-column-resize-target', isTarget);
    th.classList.toggle('query-table-column-resize-dimmed', resizeModeState.active && !isTarget);
    th.querySelectorAll('.th-resize-handle').forEach(handle => {
      handle.classList.toggle('hidden', !isTarget);
      handle.setAttribute('aria-hidden', isTarget ? 'false' : 'true');
    });
  });

  const targetIndex = resizeModeState.active ? getDisplayedFieldIndex(resizeModeState.fieldName) : -1;
  document.querySelectorAll('#example-table tbody td[data-col-index]').forEach(cell => {
    const cellIndex = Number.parseInt(cell.dataset.colIndex || '', 10);
    const isTarget = resizeModeState.active && cellIndex === targetIndex;
    cell.classList.toggle('query-table-column-resize-target', isTarget);
    cell.classList.toggle('query-table-column-resize-dimmed', resizeModeState.active && !isTarget);
  });
}

function setManualColumnWidth(fieldName, width) {
  const normalizedField = String(fieldName || '').trim();
  const normalizedWidth = tableColumnLayout.normalizeColumnWidth(width);
  if (!normalizedField) {
    return normalizedWidth;
  }

  manualColumnWidths[normalizedField] = normalizedWidth;
  calculatedColumnWidths[normalizedField] = normalizedWidth;
  updateRenderedColumnWidth(normalizedField, normalizedWidth);
  return normalizedWidth;
}

function activateColumnResizeMode(fieldName) {
  const normalizedField = String(fieldName || '').trim();
  if (!normalizedField) {
    return false;
  }

  resizeModeState.active = true;
  resizeModeState.fieldName = normalizedField;
  syncResizeModeUi();
  return true;
}

function clearColumnResizeMode() {
  resizeModeState.active = false;
  resizeModeState.fieldName = '';
  syncResizeModeUi();
}

function clonePostFilterEntry(filter) {
  const entry = {
    cond: String(filter?.cond || '').trim().toLowerCase(),
    val: String(filter?.val || '')
  };

  if (Array.isArray(filter?.vals)) {
    entry.vals = filter.vals.map(value => String(value || ''));
  }

  return entry;
}

function getPostFilterEntryValues(filter) {
  if (Array.isArray(filter?.vals)) {
    return filter.vals.map(value => String(value || '')).filter(value => value || isBlankPostFilterValue(value));
  }

  const scalarValue = String(filter?.val || '');
  return scalarValue || isBlankPostFilterValue(scalarValue) ? [scalarValue] : [];
}

function clonePostFiltersSnapshot() {
  return Object.fromEntries(
    Object.entries(postFiltersState).map(([field, data]) => [
      field,
      {
        logic: String(data?.logic || 'all').toLowerCase() === 'any' ? 'any' : 'all',
        filters: Array.isArray(data?.filters) ? data.filters.map(clonePostFilterEntry) : []
      }
    ])
  );
}

function assignPostFilters(nextFilters) {
  Object.keys(postFiltersState).forEach(key => delete postFiltersState[key]);

  if (!nextFilters || typeof nextFilters !== 'object') {
    return;
  }

  Object.entries(nextFilters).forEach(([field, data]) => {
    const normalizedField = String(field || '').trim();
    if (!normalizedField) {
      return;
    }

    const filters = Array.isArray(data?.filters)
      ? data.filters.map(clonePostFilterEntry).filter(filter => filter.cond && getPostFilterEntryValues(filter).length > 0)
      : [];

    if (filters.length) {
      postFiltersState[normalizedField] = {
        logic: String(data?.logic || 'all').toLowerCase() === 'any' ? 'any' : 'all',
        filters
      };
    }
  });
}

function getVisibleFieldSet() {
  return new Set(
    getDisplayedFields()
      .map(field => String(field || '').trim())
      .filter(Boolean)
  );
}

function sanitizePostFiltersForCurrentView() {
  const visibleFieldSet = getVisibleFieldSet();

  Object.keys(postFiltersState).forEach(field => {
    if (!visibleFieldSet.has(field) || !baseViewData.columnMap.has(field)) {
      delete postFiltersState[field];
      return;
    }

    const nextFilters = Array.isArray(postFiltersState[field]?.filters)
      ? postFiltersState[field].filters.filter(filter => filter.cond && getPostFilterEntryValues(filter).length > 0)
      : [];

    if (nextFilters.length) {
      postFiltersState[field].filters = nextFilters;
      postFiltersState[field].logic = String(postFiltersState[field]?.logic || 'all').toLowerCase() === 'any' ? 'any' : 'all';
    } else {
      delete postFiltersState[field];
    }
  });
}

function doesRowMatchFieldPostFilters(row, field, data) {
  const filters = Array.isArray(data?.filters) ? data.filters : [];
  if (!filters.length) {
    return true;
  }

  const logic = String(data?.logic || 'all').toLowerCase() === 'any' ? 'any' : 'all';
  if (logic === 'any') {
    return filters.some(filter => doesRowMatchPostFilter(row, field, filter));
  }

  return filters.every(filter => doesRowMatchPostFilter(row, field, filter));
}

function parseComparableDateValue(value) {
  return getComparableValue(value);
}

function getComparableRowValues(rawValue, type) {
  if (isBlankCellValue(rawValue)) {
    return [''];
  }

  if (type === 'number' || type === 'money') {
    return [parseNumericValue(rawValue, type)];
  }

  if (type === 'date') {
    return [parseComparableDateValue(rawValue)];
  }

  if (typeof rawValue === 'string' && rawValue.includes('\x1F')) {
    return rawValue.split('\x1F').map(part => String(part).trim()).filter(Boolean);
  }

  return [String(rawValue ?? '').trim()];
}

function compareScalarCondition(actual, expected, cond, type) {
  if (type === 'number' || type === 'money' || type === 'date') {
    if (Number.isNaN(actual) || Number.isNaN(expected)) {
      return false;
    }

    switch (cond) {
      case 'greater':
      case 'after':
        return actual > expected;
      case 'less':
      case 'before':
        return actual < expected;
      case 'greater_or_equal':
      case 'on_or_after':
        return actual >= expected;
      case 'less_or_equal':
      case 'on_or_before':
        return actual <= expected;
      case 'equals':
        return actual === expected;
      case 'does_not_equal':
        return actual !== expected;
      default:
        return false;
    }
  }

  const actualText = String(actual || '').toLowerCase();
  const expectedText = String(expected || '').toLowerCase();

  switch (cond) {
    case 'equals':
      return actualText === expectedText;
    case 'does_not_equal':
      return actualText !== expectedText;
    case 'starts':
    case 'starts_with':
      return actualText.startsWith(expectedText);
    case 'contains':
      return actualText.includes(expectedText);
    default:
      return false;
  }
}

function rowMatchesEqualsSelection(rawCellValue, type, selectedValues) {
  if (isBlankCellValue(rawCellValue) && selectedValues.some(isBlankPostFilterValue)) {
    return true;
  }

  const rowValues = getComparableRowValues(rawCellValue, type);
  return selectedValues.some(selectedValue => {
    if (isBlankPostFilterValue(selectedValue)) {
      return false;
    }

    const comparableExpected = (type === 'number' || type === 'money')
      ? parseNumericValue(selectedValue, type)
      : (type === 'date' ? parseComparableDateValue(selectedValue) : selectedValue);

    return rowValues.some(value => compareScalarCondition(value, comparableExpected, 'equals', type));
  });
}

function rowMatchesDoesNotEqualSelection(rawCellValue, type, selectedValues) {
  if (isBlankCellValue(rawCellValue) && selectedValues.some(isBlankPostFilterValue)) {
    return false;
  }

  const rowValues = getComparableRowValues(rawCellValue, type);
  return selectedValues.every(selectedValue => {
    if (isBlankPostFilterValue(selectedValue)) {
      return true;
    }

    const comparableExpected = (type === 'number' || type === 'money')
      ? parseNumericValue(selectedValue, type)
      : (type === 'date' ? parseComparableDateValue(selectedValue) : selectedValue);

    return rowValues.every(value => !compareScalarCondition(value, comparableExpected, 'equals', type));
  });
}

function doesRowMatchPostFilter(row, field, filter) {
  const columnIndex = baseViewData.columnMap.get(field);
  if (columnIndex === undefined) {
    return true;
  }

  const type = getFieldType(field);
  const cond = String(filter?.cond || '').trim().toLowerCase();
  const filterValues = getPostFilterEntryValues(filter);
  const filterValue = filterValues[0] || '';
  const rawCellValue = row[columnIndex];

  if (cond === 'equals' && filterValues.length > 1) {
    return rowMatchesEqualsSelection(rawCellValue, type, filterValues);
  }

  if (cond === 'does_not_equal' && filterValues.length > 1) {
    return rowMatchesDoesNotEqualSelection(rawCellValue, type, filterValues);
  }

  if (cond === 'equals' && isBlankPostFilterValue(filterValue)) {
    return isBlankCellValue(rawCellValue);
  }

  if (cond === 'does_not_equal' && isBlankPostFilterValue(filterValue)) {
    return !isBlankCellValue(rawCellValue);
  }

  const rowValues = getComparableRowValues(row[columnIndex], type);

  if (cond === 'between') {
    const [leftRaw, rightRaw] = filterValue.split('|');
    let left = leftRaw;
    let right = rightRaw;

    if (type === 'number' || type === 'money') {
      left = parseNumericValue(leftRaw, type);
      right = parseNumericValue(rightRaw, type);
    } else if (type === 'date') {
      left = parseComparableDateValue(leftRaw);
      right = parseComparableDateValue(rightRaw);
    }

    if (Number.isNaN(left) || Number.isNaN(right)) {
      return false;
    }

    const minValue = Math.min(left, right);
    const maxValue = Math.max(left, right);
    return rowValues.some(value => !Number.isNaN(value) && value >= minValue && value <= maxValue);
  }

  const comparableExpected = (type === 'number' || type === 'money')
    ? parseNumericValue(filterValue, type)
    : (type === 'date' ? parseComparableDateValue(filterValue) : filterValue);

  return rowValues.some(value => compareScalarCondition(value, comparableExpected, cond, type));
}

function getPostFilterFieldOptions(fieldName) {
  const normalizedField = String(fieldName || '').trim();
  if (!normalizedField) {
    return [];
  }

  if (postFilterValueOptionsCache.has(normalizedField)) {
    return postFilterValueOptionsCache.get(normalizedField).map(option => ({ ...option }));
  }

  const columnIndex = baseViewData.columnMap.get(normalizedField);
  if (columnIndex === undefined) {
    return [];
  }

  const fieldType = getFieldType(normalizedField);
  const counts = new Map();
  let blankCount = 0;

  baseViewData.rows.forEach(row => {
    const rawValue = row[columnIndex];

    if (isBlankCellValue(rawValue)) {
      blankCount += 1;
      return;
    }

    const values = getComparableRowValues(rawValue, fieldType)
      .map(value => fieldType === 'number' || fieldType === 'money' || fieldType === 'date'
        ? String(rawValue).trim()
        : String(value ?? '').trim())
      .filter(Boolean);

    const seenInRow = new Set();
    values.forEach(value => {
      if (seenInRow.has(value)) {
        return;
      }
      seenInRow.add(value);
      counts.set(value, (counts.get(value) || 0) + 1);
    });
  });

  const options = Array.from(counts.entries())
    .map(([value, count]) => ({
      value,
      label: value,
      count,
      isBlank: false
    }))
    .sort((left, right) => String(left.label).localeCompare(String(right.label), undefined, { numeric: true, sensitivity: 'base' }));

  if (blankCount > 0) {
    options.unshift({
      value: POST_FILTER_BLANK_SENTINEL,
      label: '(Blank values)',
      count: blankCount,
      isBlank: true
    });
  }

  postFilterValueOptionsCache.set(normalizedField, options);
  return options.map(option => ({ ...option }));
}

function getFilteredRowsFromSource() {
  const activeEntries = Object.entries(postFiltersState).filter(([, data]) => Array.isArray(data?.filters) && data.filters.length > 0);
  if (!activeEntries.length) {
    return baseViewData.rows.map(row => [...row]);
  }

  return baseViewData.rows
    .filter(row => activeEntries.every(([field, data]) => doesRowMatchFieldPostFilters(row, field, data)))
    .map(row => [...row]);
}

function hasActivePostFilters() {
  return Object.values(postFiltersState).some(data => Array.isArray(data?.filters) && data.filters.length > 0);
}

function isCurrentQueryResultSetLoaded() {
  return Boolean(QueryStateReaders?.getLifecycleState?.().hasLoadedResultSet);
}

function updateHeaderWidthsFromCurrentState() {
  tableColumnLayout.syncRenderedColumnLayout();
}

function notifyPostFiltersUpdated() {
  window.dispatchEvent(new CustomEvent('postfilters:updated', {
    detail: {
      filters: clonePostFiltersSnapshot(),
      totalRows: baseViewData.rows.length,
      filteredRows: virtualTableData.rows.length
    }
  }));
}

function applyPostFilters(options = {}) {
  sanitizePostFiltersForCurrentView();

  virtualTableData = {
    headers: [...baseViewData.headers],
    rows: getFilteredRowsFromSource(),
    columnMap: new Map(baseViewData.columnMap)
  };

  if (options.resetScroll !== false && tableScrollContainer) {
    tableScrollTop = 0;
    tableScrollContainer.scrollTop = 0;
  }

  const displayedFields = getDisplayedFields();
  const fieldsForWidth = displayedFields.length
    ? displayedFields
    : virtualTableData.headers;
  calculatedColumnWidths = calculateOptimalColumnWidths(fieldsForWidth, virtualTableData);

  if (options.refreshView !== false) {
    updateHeaderWidthsFromCurrentState();
    renderVirtualTable();
  }

  uiActions.updateTableResultsLip();

  uiActions.updateButtonStates();

  if (options.notify !== false) {
    notifyPostFiltersUpdated();
  }
}

/**
 * Sorts the virtual table data by the specified column.
 * Toggles direction if already sorted by this column.
 * @function sortTableBy
 * @param {string} fieldName - The field to sort by
 */
function sortTableBy(fieldName) {
  if (!virtualTableData.rows || virtualTableData.rows.length === 0) return;
  const colIndex = virtualTableData.columnMap.get(fieldName);
  if (colIndex === undefined) return;

  // Toggle direction if same column
  if (currentSortColumn === fieldName) {
    currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';
  } else {
    currentSortColumn = fieldName;
    currentSortDirection = 'asc';
  }

  // Find the exact field definition for sorting typing
  const type = getFieldType(fieldName);

  sortRowsByColumn(virtualTableData.rows, colIndex, type, currentSortDirection);

  const sourceColIndex = baseViewData.columnMap.get(fieldName);
  if (sourceColIndex !== undefined && Array.isArray(baseViewData.rows)) {
    sortRowsByColumn(baseViewData.rows, sourceColIndex, type, currentSortDirection);
  }

  // Re-render and update headers UI
  renderVirtualTable();
  appRuntime.QueryTableView?.updateSortHeadersUI?.(currentSortColumn, currentSortDirection);
}

/**
 * Calculates which table rows should be visible based on current scroll position.
 * Used for virtual scrolling to only render visible rows for performance.
 * @function calculateVisibleRows
 * @returns {{start: number, end: number}} Object containing start and end row indices
 */
function calculateVisibleRows() {
  if (!tableScrollContainer) return { start: 0, end: 0 };
  
  const containerHeight = tableScrollContainer.clientHeight;
  const headerRow = tableScrollContainer.querySelector('#example-table thead');
  const headerHeight = headerRow ? Math.ceil(headerRow.getBoundingClientRect().height) : 40;
  const availableHeight = containerHeight > 0 ? (containerHeight - headerHeight) : 400;
  
  // Add a generous overscan buffer (10 rows above and below) to prevent scroll glitches
  const overscanRows = 10;
  
  const visibleRowsCount = Math.ceil(availableHeight / tableRowHeight);
  const baseStartIndex = Math.floor(tableScrollTop / tableRowHeight);
  
  const startIndex = Math.max(0, baseStartIndex - overscanRows);
  const endIndex = Math.min(
    virtualTableData.rows.length,
    baseStartIndex + visibleRowsCount + overscanRows
  );
  
  return { start: startIndex, end: endIndex };
}

/**
 * Renders only the visible portion of the virtual table based on scroll position.
 * Creates spacer elements for non-visible rows to maintain proper scrolling.
 * Handles text truncation and tooltips for long content.
 * @function renderVirtualTable
 */
function renderVirtualTable() {
  const displayedFields = getDisplayedFields();
  if (!tableScrollContainer || !displayedFields.length) return;
  tableScrollbar.attach(tableScrollContainer);
  
  const table = tableScrollContainer.querySelector('#example-table');
  if (!table) return;
  
  // Check if a drag operation is in progress - don't re-render during active drag
  if (document.body.classList.contains('dragging-cursor')) {
    return;
  }
  
  const tbody = table.querySelector('tbody');
  if (!tbody) return;
  const columnLayout = tableColumnLayout.syncRenderedColumnLayout(table, displayedFields);
  const nextBody = document.createDocumentFragment();
  
  // Clean up existing event listeners on body cells before clearing them
  services.cleanupDragDropTableListeners(table);

  if (!Array.isArray(virtualTableData.rows) || virtualTableData.rows.length === 0) {
    const emptyRow = document.createElement('tr');
    const emptyCell = document.createElement('td');
    const hasLoadedRows = Array.isArray(baseViewData.rows) && baseViewData.rows.length > 0;
    const message = hasLoadedRows && hasActivePostFilters()
      ? 'No rows match the active post filters.'
      : (isCurrentQueryResultSetLoaded() ? 'No results matched this query.' : 'Run a query to load results.');

    tbody.classList.remove('query-table-virtual-body');
    tbody.style.height = '';
    tbody.style.position = '';
    table.style.height = '';
    emptyCell.setAttribute('colspan', displayedFields.length.toString());
    emptyCell.className = 'px-6 py-10 text-center text-sm text-gray-500 italic';
    emptyCell.textContent = message;
    emptyRow.appendChild(emptyCell);
    nextBody.appendChild(emptyRow);
    tbody.replaceChildren(nextBody);
    tableScrollTop = 0;
    tableScrollContainer.scrollTop = 0;
    tableScrollbar.scheduleSync();
    return;
  }

  const shouldRenderAllRows = virtualTableData.rows.length <= FULL_TABLE_RENDER_ROW_LIMIT;
  const { start, end } = shouldRenderAllRows
    ? { start: 0, end: virtualTableData.rows.length }
    : calculateVisibleRows();

  table.style.height = '';
  tbody.classList.toggle('query-table-virtual-body', !shouldRenderAllRows);
  tbody.style.height = shouldRenderAllRows ? '' : `${virtualTableData.rows.length * tableRowHeight}px`;
  tbody.style.position = shouldRenderAllRows ? '' : 'relative';
  
  // Render visible rows
  for (let i = start; i < end; i++) {
    const rowData = virtualTableData.rows[i]; // Access the 2D array row
    const tr = TableBuilder.createRow();
    tr.style.height = `${tableRowHeight}px`;

    if (!shouldRenderAllRows) {
      tr.style.position = 'absolute';
      tr.style.top = `${i * tableRowHeight}px`;
      tr.style.left = '0';
      tr.style.right = '0';
      tr.style.display = 'table';
      tr.style.tableLayout = 'fixed';
      tr.style.width = `${columnLayout.totalWidth}px`;
    }

    tr.dataset.rowIndex = i;
    
    displayedFields.forEach((field, colIndex) => {
      const td = TableBuilder.createCell('', 'px-6 py-3 whitespace-nowrap text-sm text-gray-900');
      td.dataset.colIndex = colIndex;
      
      // Get the column index for this field and access the data by index
      const columnIndex = virtualTableData.columnMap.get(field);
      const fieldExistsInData = columnIndex !== undefined;
      let cellValue;
      
      if (columnIndex !== undefined && rowData[columnIndex] !== undefined) {
        // Field exists in data and has a value
        cellValue = rowData[columnIndex];
      } else if (columnIndex === undefined) {
        // Field doesn't exist in the current data - show empty
        cellValue = '';
      } else {
        // Field exists but value is empty/undefined - show em dash
        cellValue = '—';
      }
      
      // Apply formatting based on field type (same logic as Excel export)
      const type = getFieldType(field);
      let displayValue = cellValue;
      
      if (cellValue !== '' && cellValue !== '—' && cellValue !== undefined && cellValue !== null) {
        if (type === 'date') {
          displayValue = ValueFormatting.formatValueByType(cellValue, type, {
            fieldName: field,
            invalidDateValue: 'Never'
          });
          td.style.textAlign = 'right';
        } 
        else if (type === 'number' || type === 'money') {
          const n = parseNumericValue(cellValue, type);
          if (!isNaN(n)) {
            displayValue = ValueFormatting.formatValueByType(n, type, { fieldName: field });
            td.style.textAlign = 'right';
          }
        } 
        else if (type === 'boolean') {
          td.style.textAlign = 'center';
        }
      }
      
      // Apply the same fixed width as the header
      const width = columnLayout.widths[colIndex] || calculatedColumnWidths[field] || 150;
      tableColumnLayout.applyElementColumnWidth(td, width);

      if (!fieldExistsInData) {
        td.classList.add('query-table-column-missing-data');
        td.setAttribute('data-tooltip', 'This field is not in the current data. Run a new query to populate it.');
      }

      if (typeof displayValue === 'string' && displayValue.includes('\x1F')) {
        // Special handling for multi-value cells (e.g. MARC fields with multiple instances)
        const items = displayValue.split('\x1F').filter(s => s.trim() !== '');
        
        // Override default line-clamp classes
        td.className = 'px-3 py-2 text-sm text-gray-900 align-top'; 
        td.style.whiteSpace = 'normal';
        
        const scrollContainer = document.createElement('div');
        // Force strict height confinement to maintain virtual scroll map integrity
        // Subtract vertical padding to ensure the row height stays exactly at tableRowHeight
        const paddingOffset = 16; 
        scrollContainer.style.maxHeight = `${tableRowHeight - paddingOffset > 20 ? tableRowHeight - paddingOffset : 26}px`; 
        scrollContainer.style.overflowY = 'auto';
        scrollContainer.style.paddingRight = '4px'; 
        scrollContainer.style.scrollbarWidth = 'thin'; // Clean scrollbar UI for modern browsers
        
        items.forEach((itm, idx) => {
           const div = document.createElement('div');
           div.style.marginBottom = idx < items.length - 1 ? '4px' : '0';
           div.style.paddingBottom = idx < items.length - 1 ? '4px' : '0';
           div.style.borderBottom = idx < items.length - 1 ? '1px solid #f3f4f6' : 'none';
           div.style.wordBreak = 'break-word';
           div.textContent = itm;
           scrollContainer.appendChild(div);
        });
        
        // Build an elegant HTML tooltip with a list
        const tooltipItems = items.map(function(itm) {
          return '<li>' + escapeHtml(itm) + '</li>';
        }).join('');
        const tooltipHtml = '<div class="text-left font-sans text-sm pb-1"><div class="font-bold border-b border-gray-500 pb-1 mb-2">Multiple Values (' + items.length + ')</div><ul class="list-disc pl-4 space-y-1">' + tooltipItems + '</ul></div>';
        
          td.setAttribute('data-tooltip-html', tooltipHtml);
        
        td.textContent = '';
        td.appendChild(scrollContainer);
        tr.appendChild(td);
        return; // skip standard truncation below
      }
      
      // Check if content would be visually truncated and handle it manually
      if (typeof displayValue === 'string' && displayValue.length > 0 && displayValue !== '—') {
        const availableWidth = width - 48; // Subtract padding (24px left + 24px right)
        const fullTextWidth = TextMeasurement.measureText(displayValue);
        
        // If text is too wide, truncate it manually and add tooltip
        if (fullTextWidth > availableWidth) {
          const maxFitChars = TextMeasurement.findMaxFittingChars(displayValue, availableWidth);
          const truncatedText = displayValue.substring(0, maxFitChars) + '...';
          td.textContent = truncatedText;
          td.setAttribute('data-tooltip', displayValue);
        } else {
          // Text fits, no truncation needed
          td.textContent = displayValue;
        }
      } else {
        td.textContent = displayValue;
      }
      
      tr.appendChild(td);
    });
    
    nextBody.appendChild(tr);
  }
  
  tbody.replaceChildren(nextBody);
  
  // Re-apply drag and drop to the new rows
  services.addDragAndDrop(table);
  tableScrollbar.scheduleSync();
}

/**
 * Handles scroll events for the virtual table container.
 * Updates scroll position and triggers re-rendering of visible rows.
 * Uses requestAnimationFrame to prevent layout thrashing and scrolling glitches.
 * @function handleTableScroll
 * @param {Event} e - The scroll event
 */
let isRenderScheduled = false;

function scheduleVirtualTableRender() {
  if (!isRenderScheduled) {
    isRenderScheduled = true;
    requestAnimationFrame(() => {
      renderVirtualTable();
      isRenderScheduled = false;
    });
  }
}

function handleTableScroll(e) {
  // Don't process scroll events during active drag
  if (document.body.classList.contains('dragging-cursor')) {
    return;
  }
  
  tableScrollTop = e.target.scrollTop;
  tableScrollbar.scheduleSync();

  if (virtualTableData.rows.length <= FULL_TABLE_RENDER_ROW_LIMIT) {
    return;
  }

  scheduleVirtualTableRender();
}

/**
 * Calculates the optimal width for a table column based on header and content.
 * Uses canvas text measurement for accurate width calculation.
 * @function calculateFieldWidth
 * @param {string} fieldName - The name of the field/column
 * @param {Object|null} data - Optional table data for content width measurement
 * @param {Array} data.rows - Array of row data
 * @param {Map} data.columnMap - Map of field names to column indices
 * @returns {number} Optimal column width in pixels (min 150px, max ~50 characters)
 */
function calculateFieldWidth(fieldName, data = null) {
  let maxWidth = 0;
  
  // 1. Always measure header width (uppercase, as it appears in the table)
  const headerWidth = TextMeasurement.measureText(fieldName.toUpperCase()) + HEADER_ACTION_SPACE + HEADER_TEXT_BALANCE_SPACE;
  maxWidth = Math.max(maxWidth, headerWidth);
  
  // 2. If we have data, measure content width
  if (data && data.rows && data.rows.length > 0) {
    const columnIndex = data.columnMap.get(fieldName);
    if (columnIndex !== undefined) {
      const type = getFieldType(fieldName);
      // Sample data for performance (check every nth row)
      const sampleStep = Math.max(1, Math.floor(data.rows.length / 1000));
      
      for (let i = 0; i < data.rows.length; i += sampleStep) {
        const value = data.rows[i][columnIndex];
        if (value != null) {
          let measuredValue = String(value);
          if (type === 'date') {
            measuredValue = ValueFormatting.formatValueByType(value, type, {
              fieldName,
              invalidDateValue: 'Never',
              dateFallbackToRaw: true
            });
          } else if (type === 'number' || type === 'money') {
            const numericValue = parseNumericValue(value, type);
            if (!isNaN(numericValue)) {
              measuredValue = ValueFormatting.formatValueByType(numericValue, type, { fieldName });
            }
          }
          const textWidth = TextMeasurement.measureText(measuredValue);
          maxWidth = Math.max(maxWidth, textWidth);
        }
      }
    }
  }
  
  // 3. For fields not in data (showing "..."), ensure reasonable width for the placeholder
  if (!data || !data.columnMap || !data.columnMap.has(fieldName)) {
    const placeholderWidth = TextMeasurement.measureText('...');
    maxWidth = Math.max(maxWidth, placeholderWidth);
  }
  
  // 4. Add padding (24px left + 24px right from px-6 class) + buffer for comfort
  const paddingAndBuffer = 48 + 32; // 48px padding + 32px buffer
  const requiredHeaderWidth = headerWidth + paddingAndBuffer;
  
  // 5. Calculate max character width for clamping
  const maxCharacterWidth = TextMeasurement.measureText('A'.repeat(50)) + paddingAndBuffer;
  const maxAllowedWidth = Math.max(maxCharacterWidth, requiredHeaderWidth);
  
  // 6. Clamp to reasonable bounds: min 150px, max 50 characters worth
  return Math.max(150, Math.min(maxAllowedWidth, maxWidth + paddingAndBuffer));
}

/**
 * Calculates optimal widths for all specified table columns.
 * @function calculateOptimalColumnWidths
 * @param {string[]} [fields] - Array of field names to calculate widths for. Defaults to global virtualTableData.headers.
 * @param {Object} [data] - Table data containing rows and column mapping. Defaults to global virtualTableData.
 * @returns {Object} Object mapping field names to optimal widths in pixels
 */
function calculateOptimalColumnWidths(fields, data) {
  // Use global data if arguments not provided
  const targetFields = fields || virtualTableData.headers;
  const targetData = data || virtualTableData;
  const shouldUpdateCache = !data || targetData === virtualTableData;

  if (!targetFields || !targetFields.length) {
    if (shouldUpdateCache) {
      calculatedColumnWidths = {};
    }
    return {};
  }
  
  const widths = {};
  targetFields.forEach(field => {
    widths[field] = calculateFieldWidth(field, targetData);
  });
  applyManualWidthsToMap(widths, targetFields);
  
  // Keep the shared width cache current whenever we measure against the active table data.
  if (shouldUpdateCache) {
    calculatedColumnWidths = {
      ...calculatedColumnWidths,
      ...widths
    };
  }
  
  return widths;
}

/**
 * Sets up a virtual table with the specified container and fields.
 * Initializes scrolling and column widths.
 * @async
 * @function setupVirtualTable
 * @param {HTMLElement} container - The DOM element to contain the virtual table
 * @param {string[]} fields - Array of field names to display as columns
 * @returns {Promise<{virtualTableData: Object, calculatedColumnWidths: Object}>} Table data and column widths
 */
async function setupVirtualTable(container, fields, options = {}) {
  const preservedScrollTop = Math.max(0, Number(options.preserveScrollTop) || 0);
  const preservedScrollLeft = Math.max(0, Number(options.preserveScrollLeft) || 0);
  const shouldPreserveScroll = options.preserveScroll === true;

  // Set up container for virtual scrolling
  container.style.height = container.dataset.expanded === 'true' ? 'calc(100vh - 11rem)' : '400px';
  container.style.overflowY = 'auto';
  
  // Set up scroll container reference
  tableScrollContainer = container;
  tableScrollTop = shouldPreserveScroll ? preservedScrollTop : 0;
  tableScrollbar.attach(container);

  // Calculate widths if we have fields
  if (fields && fields.length > 0) {
    console.log('Calculating optimal column widths...');
    calculatedColumnWidths = calculateOptimalColumnWidths(fields, virtualTableData);
    console.log('Column widths calculated:', calculatedColumnWidths);
  } else {
    // Just initialize empty if no fields yet
    calculatedColumnWidths = {};
  }

  
  // Add scroll event listener
  container.removeEventListener('scroll', handleTableScroll);
  container.addEventListener('scroll', handleTableScroll);

  if (shouldPreserveScroll) {
    container.scrollTop = preservedScrollTop;
    container.scrollLeft = preservedScrollLeft;
  }
  tableScrollbar.scheduleSync();
  
  return { virtualTableData, calculatedColumnWidths };
}

/**
 * Measures the actual height of a table row by temporarily rendering one.
 * Updates the global tableRowHeight variable for virtual scrolling calculations.
 * @function measureRowHeight
 * @param {HTMLElement} table - The table element to measure
 * @param {string[]} fields - Array of field names for the columns
 */
function measureRowHeight(table, fields) {
  if (virtualTableData.rows && virtualTableData.rows.length > 0) {
    // Temporarily render one row to measure height
    const tbody = table.querySelector('tbody');
    const tempRow = document.createElement('tr');
    tempRow.className = 'hover:bg-gray-50';
    fields.forEach((field, colIndex) => {
      const td = document.createElement('td');
      td.className = 'px-6 py-3 whitespace-nowrap text-sm text-gray-900';
      
      // Get the column index for this field and access the data by index
      const columnIndex = virtualTableData.columnMap.get(field);
      const cellValue = (columnIndex !== undefined && virtualTableData.rows[0][columnIndex] !== undefined) 
        ? virtualTableData.rows[0][columnIndex] : '—';
      
      td.textContent = cellValue;
      tempRow.appendChild(td);
    });
    tbody.appendChild(tempRow);
    
    // Measure and remove
    const measuredHeight = tempRow.offsetHeight;
    if (measuredHeight > 0) {
      tableRowHeight = measuredHeight;
    }
    tbody.removeChild(tempRow);
  }
}

/**
 * Clears all virtual table data and resets state variables.
 * Used when switching between different datasets or clearing the table.
 * @function clearVirtualTableData
 */
function clearVirtualTableData() {
  virtualTableData = {
    headers: [],
    rows: [],
    columnMap: new Map()
  };
  baseViewData = {
    headers: [],
    rows: [],
    columnMap: new Map()
  };
  Object.keys(postFiltersState).forEach(key => delete postFiltersState[key]);
  invalidatePostFilterValueOptionsCache();
  calculatedColumnWidths = {};
  manualColumnWidths = {};
  tableScrollTop = 0;
  tableScrollbar.remove();
  tableScrollContainer = null;
  clearColumnResizeMode();
  simpleTableInstance = null;

  QueryChangeManager?.setLifecycleState?.(
    { hasLoadedResultSet: false },
    { source: 'VirtualTable.clearVirtualTableData', silent: true }
  );
}

/**
 * Returns the current state of the virtual table for debugging or external access.
 * @function getVirtualTableState
 * @returns {Object} Object containing all virtual table state variables
 */
function getVirtualTableState() {
  return {
    virtualTableData,
    baseViewData,
    calculatedColumnWidths,
    manualColumnWidths: { ...manualColumnWidths },
    tableRowHeight,
    tableScrollTop,
    tableScrollContainer,
    resizeMode: {
      active: resizeModeState.active,
      fieldName: resizeModeState.fieldName
    },
    currentSortColumn,
    currentSortDirection
  };
}

/**
 * Global VirtualTable object containing all virtual table functionality.
 * Exported to window for use by other modules.
 * @namespace VirtualTable
 * @global
 */
/**
 * Expands multi-value cells (\x1F-delimited) into separate numbered columns.
 * Operates on rawTableData → virtualTableData non-destructively.
 * @function expandMultiValueColumns
 */
function expandMultiValueColumns() {
  if (!rawTableData || !rawTableData.rows || !rawTableData.rows.length) return;

  // Find max count for every multi-value column
  const multiMax = new Map();
  rawTableData.headers.forEach(field => {
    const idx = rawTableData.columnMap.get(field);
    if (idx === undefined) return;
    let max = 1;
    rawTableData.rows.forEach(row => {
      const v = row[idx];
      if (v != null && typeof v === 'string' && v.includes('\x1F')) {
        const c = v.split('\x1F').length;
        if (c > max) max = c;
      }
    });
    if (max > 1) multiMax.set(field, max);
  });

  if (multiMax.size === 0) {
    // Nothing to split — just mirror raw data
    baseViewData = {
      headers: [...rawTableData.headers],
      rows: rawTableData.rows.map(r => [...r]),
      columnMap: new Map(rawTableData.columnMap)
    };
    invalidatePostFilterValueOptionsCache();
    return;
  }

  // Build expanded header list
  const newHeaders = [];
  rawTableData.headers.forEach(field => {
    const max = multiMax.get(field);
    if (max !== undefined) {
      for (let i = 0; i < max; i++) newHeaders.push(`${field} ${i + 1}`);
    } else {
      newHeaders.push(field);
    }
  });

  const newColumnMap = new Map(newHeaders.map((h, i) => [h, i]));

  const newRows = rawTableData.rows.map(row => {
    const newRow = [];
    rawTableData.headers.forEach(field => {
      const srcIdx = rawTableData.columnMap.get(field);
      const raw = srcIdx !== undefined ? row[srcIdx] : undefined;
      const max = multiMax.get(field);
      if (max !== undefined) {
        const parts = (raw != null && typeof raw === 'string' && raw.includes('\x1F'))
          ? raw.split('\x1F')
          : [raw ?? ''];
        for (let i = 0; i < max; i++) newRow.push(parts[i] ?? '');
      } else {
        newRow.push(raw ?? '');
      }
    });
    return newRow;
  });

  baseViewData = { headers: newHeaders, rows: newRows, columnMap: newColumnMap };
  invalidatePostFilterValueOptionsCache();
}

/**
 * Toggles split-column mode on/off.
 * When enabled, multi-value columns are expanded into N numbered columns and the
 * table re-renders. When disabled, the raw collapsed data is restored.
 * Also updates QueryChangeManager state to match the active view.
 * @function setSplitColumnsMode
 * @param {boolean} active
 */
function setSplitColumnsMode(active) {
  splitColumnsActive = active;
  appRuntime.splitColumnsActive = active;

  if (active) {
    // Snapshot raw data if not already saved (first time switching to split)
    if (!rawTableData || rawTableData.headers.length === 0) {
      rawTableData = {
        headers: [...virtualTableData.headers],
        rows: virtualTableData.rows.map(r => [...r]),
        columnMap: new Map(virtualTableData.columnMap)
      };
    }
    expandMultiValueColumns();
  } else {
    // Restore raw data
    if (rawTableData && rawTableData.headers.length > 0) {
      baseViewData = {
        headers: [...rawTableData.headers],
        rows: rawTableData.rows.map(r => [...r]),
        columnMap: new Map(rawTableData.columnMap)
      };
      invalidatePostFilterValueOptionsCache();
    }
  }

  applyPostFilters({ refreshView: false, notify: true, resetScroll: false });

  // Keep query-state columns aligned with the active split/stacked header set.
  QueryChangeManager.replaceDisplayedFields(baseViewData.headers, { source: 'VirtualTable.setSplitMode' });

  // Recalculate column widths and re-render
  calculatedColumnWidths = calculateOptimalColumnWidths(virtualTableData.headers, virtualTableData);
  renderVirtualTable();
  syncResizeModeUi();

  // Rebuild the example table fallback when it exists.
  uiActions.showExampleTable(baseViewData.headers).catch(() => {});
}

appRuntime.VirtualTable = {
  // State
  get virtualTableData() { return virtualTableData; },
  set virtualTableData(v) {
    const nextData = cloneTableData(v);
    // When new data is loaded from outside, update rawTableData so split mode
    // always has a fresh snapshot to work from.
    rawTableData = cloneTableData(nextData);
    baseViewData = cloneTableData(nextData);
    invalidatePostFilterValueOptionsCache();
    // Reset split mode — caller will re-expand if needed
    splitColumnsActive = false;
    appRuntime.splitColumnsActive = false;
    applyPostFilters({ refreshView: false, notify: true, resetScroll: false });
    // Reset the toggle button UI if present
    if (typeof appRuntime.resetSplitColumnsToggleUI === 'function') {
      appRuntime.resetSplitColumnsToggleUI();
    }
  },
  get calculatedColumnWidths() { return calculatedColumnWidths; },
  set calculatedColumnWidths(value) { calculatedColumnWidths = value; },
  get tableRowHeight() { return tableRowHeight; },
  set tableRowHeight(value) { tableRowHeight = value; },
  get tableScrollTop() { return tableScrollTop; },
  set tableScrollTop(value) { tableScrollTop = value; },
  get tableScrollContainer() { return tableScrollContainer; },
  set tableScrollContainer(value) { tableScrollContainer = value; },
  get simpleTableInstance() { return simpleTableInstance; },
  
  // Functions
  calculateVisibleRows,
  renderVirtualTable,
  handleTableScroll,
  calculateFieldWidth,
  calculateOptimalColumnWidths,
  setupVirtualTable,
  measureRowHeight,
  clearVirtualTableData,
  getVirtualTableState,
  sortTableBy,
  setSplitColumnsMode,
  expandMultiValueColumns,
  getPostFilterState: clonePostFiltersSnapshot,
  getPostFilterFieldOptions,
  replacePostFilters(nextFilters, options = {}) {
    assignPostFilters(nextFilters);
    applyPostFilters({
      refreshView: options.refreshView !== false,
      notify: options.notify !== false,
      resetScroll: options.resetScroll !== false
    });
  },
  clearPostFilters(options = {}) {
    assignPostFilters({});
    applyPostFilters({
      refreshView: options.refreshView !== false,
      notify: options.notify !== false,
      resetScroll: options.resetScroll !== false
    });
  },
  hasPostFilters() {
    return hasActivePostFilters();
  },
  setManualColumnWidth,
  updateRenderedColumnWidth,
  activateColumnResizeMode,
  clearColumnResizeMode,
  getColumnResizeState() {
    return {
      active: resizeModeState.active,
      fieldName: resizeModeState.fieldName
    };
  },
  syncResizeModeUi,
  getPostFilterStats() {
    return {
      totalRows: baseViewData.rows.length,
      filteredRows: virtualTableData.rows.length
    };
  },
  get splitColumnsActive() { return splitColumnsActive; },
  get rawTableData() { return rawTableData; },
  get baseViewData() { return baseViewData; },
  get postFilterBlankValue() { return POST_FILTER_BLANK_SENTINEL; }
};
})();
