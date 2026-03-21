/**
 * Virtual Table Module
 * Handles large dataset rendering with virtual scrolling for performance optimization.
 * Provides efficient rendering of thousands of rows by only displaying visible rows.
 * @module VirtualTable
 */

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
let simpleTableInstance = null; // Store the SimpleTable instance

const HEADER_ACTION_SPACE = 116;
const HEADER_TEXT_BALANCE_SPACE = 116;
const services = window.AppServices;

// Keep track of sorting state
let currentSortColumn = null;
let currentSortDirection = 'asc'; // 'asc' or 'desc'
var getDisplayedFields = window.QueryStateReaders.getDisplayedFields.bind(window.QueryStateReaders);

function getFieldType(fieldName) {
  return window.ValueFormatting.getFieldType(fieldName, { inferMoneyFromName: true });
}

function parseNumericValue(value, type = 'number') {
  if (type === 'money') {
    return window.MoneyUtils.parseNumber(value);
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
  if (value instanceof Date) {
    return value.getTime();
  }

  const text = String(value ?? '').trim();
  if (!text || text.toLowerCase() === 'never') {
    return NaN;
  }

  const compactMatch = text.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compactMatch) {
    const dateValue = new Date(Number(compactMatch[1]), Number(compactMatch[2]) - 1, Number(compactMatch[3]));
    return Number.isNaN(dateValue.getTime()) ? NaN : dateValue.getTime();
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? NaN : parsed.getTime();
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
      default:
        return false;
    }
  }

  const actualText = String(actual || '').toLowerCase();
  const expectedText = String(expected || '').toLowerCase();

  switch (cond) {
    case 'equals':
      return actualText === expectedText;
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

  if (cond === 'equals' && isBlankPostFilterValue(filterValue)) {
    return isBlankCellValue(rawCellValue);
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

function updateHeaderWidthsFromCurrentState() {
  const table = document.getElementById('example-table');
  const headerRow = table?.querySelector('thead tr');
  if (!headerRow) {
    return;
  }

  headerRow.querySelectorAll('th').forEach((th, index) => {
    const field = getDisplayedFields()[index];
    const width = calculatedColumnWidths[field] || 150;
    th.style.width = `${width}px`;
    th.style.minWidth = `${width}px`;
    th.style.maxWidth = `${width}px`;
  });
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

  if (typeof window.updateTableResultsLip === 'function') {
    window.updateTableResultsLip();
  }

  if (typeof window.updateButtonStates === 'function') {
    window.updateButtonStates();
  }

  if (options.notify !== false) {
    notifyPostFiltersUpdated();
  }
}

function sortRowsByColumn(rows, colIndex, type, direction) {
  rows.sort((a, b) => {
    let valA = a[colIndex];
    let valB = b[colIndex];

    const emptyA = valA === undefined || valA === null || valA === '';
    const emptyB = valB === undefined || valB === null || valB === '';

    if (emptyA && emptyB) return 0;
    if (emptyA) return direction === 'asc' ? 1 : -1;
    if (emptyB) return direction === 'asc' ? -1 : 1;

    let result = 0;
    if (type === 'number' || type === 'money') {
      result = (parseNumericValue(valA, type) || 0) - (parseNumericValue(valB, type) || 0);
    } else if (type === 'date') {
      result = (parseInt(valA, 10) || 0) - (parseInt(valB, 10) || 0);
    } else {
      result = String(valA).localeCompare(String(valB));
    }

    return direction === 'asc' ? result : -result;
  });
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
  if (window.updateSortHeadersUI) {
    window.updateSortHeadersUI(currentSortColumn, currentSortDirection);
  }
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
  if (!tableScrollContainer || !virtualTableData.rows || !virtualTableData.rows.length || !displayedFields.length) return;
  
  const table = tableScrollContainer.querySelector('#example-table');
  if (!table) return;
  
  // Check if a drag operation is in progress - don't re-render during active drag
  if (document.body.classList.contains('dragging-cursor')) {
    return;
  }
  
  const tbody = table.querySelector('tbody');
  const { start, end } = calculateVisibleRows();
  
  // Clean up existing event listeners on body cells before clearing them
  services.cleanupDragDropTableListeners(table);
  
  // Clear existing body rows
  tbody.innerHTML = '';
  
  // Create spacer for rows above visible area
  if (start > 0) {
    const topSpacer = document.createElement('tr');
    const spacerCell = document.createElement('td');
    spacerCell.setAttribute('colspan', displayedFields.length.toString());
    spacerCell.style.height = `${start * tableRowHeight}px`;
    spacerCell.style.padding = '0';
    spacerCell.style.border = 'none';
    topSpacer.appendChild(spacerCell);
    tbody.appendChild(topSpacer);
  }
  
  // Render visible rows
  for (let i = start; i < end; i++) {
    const rowData = virtualTableData.rows[i]; // Access the 2D array row
    const tr = window.TableBuilder.createRow();
    tr.style.height = `${tableRowHeight}px`;
    tr.dataset.rowIndex = i;
    
    displayedFields.forEach((field, colIndex) => {
      const td = window.TableBuilder.createCell('', 'px-6 py-3 whitespace-nowrap text-sm text-gray-900');
      td.dataset.colIndex = colIndex;
      
      // Get the column index for this field and access the data by index
      const columnIndex = virtualTableData.columnMap.get(field);
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
          displayValue = window.ValueFormatting.formatValueByType(cellValue, type, {
            invalidDateValue: 'Never'
          });
          td.style.textAlign = 'right';
        } 
        else if (type === 'number' || type === 'money') {
          const n = parseNumericValue(cellValue, type);
          if (!isNaN(n)) {
            displayValue = window.ValueFormatting.formatValueByType(n, type);
            td.style.textAlign = 'right';
          }
        } 
        else if (type === 'boolean') {
          td.style.textAlign = 'center';
        }
      }
      
      // Apply the same fixed width as the header
      const width = calculatedColumnWidths[field] || 150;
      td.style.width = `${width}px`;
      td.style.minWidth = `${width}px`;
      td.style.maxWidth = `${width}px`;

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
          return '<li>' + window.escapeHtml(itm) + '</li>';
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
        const fullTextWidth = window.TextMeasurement.measureText(displayValue);
        
        // If text is too wide, truncate it manually and add tooltip
        if (fullTextWidth > availableWidth) {
          const maxFitChars = window.TextMeasurement.findMaxFittingChars(displayValue, availableWidth);
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
    
    tbody.appendChild(tr);
  }
  
  // Create spacer for rows below visible area
  const remainingRows = virtualTableData.rows.length - end;
  if (remainingRows > 0) {
    const bottomSpacer = document.createElement('tr');
    const spacerCell = document.createElement('td');
    spacerCell.setAttribute('colspan', displayedFields.length.toString());
    spacerCell.style.height = `${remainingRows * tableRowHeight}px`;
    spacerCell.style.padding = '0';
    spacerCell.style.border = 'none';
    bottomSpacer.appendChild(spacerCell);
    tbody.appendChild(bottomSpacer);
  }
  
  // Re-apply drag and drop to the new rows
  if (services.dragDrop?.addDragAndDrop) {
    services.addDragAndDrop(table);
  } else if (typeof addDragAndDrop !== 'undefined') {
    addDragAndDrop(table);
  }
}

/**
 * Handles scroll events for the virtual table container.
 * Updates scroll position and triggers re-rendering of visible rows.
 * Uses requestAnimationFrame to prevent layout thrashing and scrolling glitches.
 * @function handleTableScroll
 * @param {Event} e - The scroll event
 */
let isRenderScheduled = false;

function handleTableScroll(e) {
  // Don't process scroll events during active drag
  if (document.body.classList.contains('dragging-cursor')) {
    return;
  }
  
  tableScrollTop = e.target.scrollTop;
  
  if (!isRenderScheduled) {
    isRenderScheduled = true;
    requestAnimationFrame(() => {
      renderVirtualTable();
      isRenderScheduled = false;
    });
  }
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
  const headerWidth = window.TextMeasurement.measureText(fieldName.toUpperCase()) + HEADER_ACTION_SPACE + HEADER_TEXT_BALANCE_SPACE;
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
          if (type === 'money') {
            const numericValue = parseNumericValue(value, type);
            if (!isNaN(numericValue)) {
              measuredValue = window.ValueFormatting.formatValueByType(numericValue, type);
            }
          }
          const textWidth = window.TextMeasurement.measureText(measuredValue);
          maxWidth = Math.max(maxWidth, textWidth);
        }
      }
    }
  }
  
  // 3. For fields not in data (showing "..."), ensure reasonable width for the placeholder
  if (!data || !data.columnMap || !data.columnMap.has(fieldName)) {
    const placeholderWidth = window.TextMeasurement.measureText('...');
    maxWidth = Math.max(maxWidth, placeholderWidth);
  }
  
  // 4. Add padding (24px left + 24px right from px-6 class) + buffer for comfort
  const paddingAndBuffer = 48 + 32; // 48px padding + 32px buffer
  const requiredHeaderWidth = headerWidth + paddingAndBuffer;
  
  // 5. Calculate max character width for clamping
  const maxCharacterWidth = window.TextMeasurement.measureText('A'.repeat(50)) + paddingAndBuffer;
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

  if (!targetFields || !targetFields.length) return {};
  
  const widths = {};
  targetFields.forEach(field => {
    widths[field] = calculateFieldWidth(field, targetData);
  });
  
  // If we operated on the global data without explicit arguments, update the cache
  if (!fields && !data) {
    calculatedColumnWidths = widths;
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
async function setupVirtualTable(container, fields) {
  // Set up container for virtual scrolling
  container.style.height = container.dataset.expanded === 'true' ? 'calc(100vh - 11rem)' : '400px';
  container.style.overflowY = 'auto';
  
  // Set up scroll container reference
  tableScrollContainer = container;
  tableScrollTop = 0;

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
  container.addEventListener('scroll', handleTableScroll);
  
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
  tableScrollTop = 0;
  tableScrollContainer = null;
  simpleTableInstance = null;
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
    tableRowHeight,
    tableScrollTop,
    tableScrollContainer,
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
 * Also updates window.displayedFields to match the active view.
 * @function setSplitColumnsMode
 * @param {boolean} active
 */
function setSplitColumnsMode(active) {
  splitColumnsActive = active;
  window.splitColumnsActive = active;

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
  window.QueryChangeManager.replaceDisplayedFields(baseViewData.headers, { source: 'VirtualTable.setSplitMode' });

  // Recalculate column widths and re-render
  calculatedColumnWidths = calculateOptimalColumnWidths(virtualTableData.headers, virtualTableData);
  renderVirtualTable();

  // Rebuild the example table fallback when it exists.
  if (typeof showExampleTable === 'function') {
    showExampleTable(baseViewData.headers).catch(() => {});
  }
}

window.VirtualTable = {
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
    window.splitColumnsActive = false;
    applyPostFilters({ refreshView: false, notify: true, resetScroll: false });
    // Reset the toggle button UI if present
    if (typeof window.resetSplitColumnsToggleUI === 'function') {
      window.resetSplitColumnsToggleUI();
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
    return Object.values(postFiltersState).some(data => Array.isArray(data?.filters) && data.filters.length > 0);
  },
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
