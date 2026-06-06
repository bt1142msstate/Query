/**
 * Virtual Table Module
 * Handles large dataset rendering with virtual scrolling for performance optimization.
 * Provides efficient rendering of thousands of rows by only displaying visible rows.
 * @module VirtualTable
 */
import { appServices, registerTableService } from '../../../core/appServices.js';
import { appUiActions } from '../../../core/appUiActions.js';
import { QueryChangeManager, QueryStateReaders } from '../../../core/queryState.js';
import { TableBuilder } from './tableBuilder.js';
import { TextMeasurement } from '../../../core/textMeasurement.js';
import { ValueFormatting } from '../../../core/formatting/valueFormatting.js';
import { parseNumericValue } from '../post-filters/postFilterLogic.js';
import { createTableColumnLayoutController } from './tableColumnLayout.js';
import { createTableScrollbarController } from './tableScrollbar.js';
import { sortRowsByColumn } from './tableSort.js';
import {
  calculateFieldWidth as calculateMeasuredFieldWidth,
  calculateOptimalColumnWidths as calculateMeasuredOptimalColumnWidths
} from './tableColumnWidthCalculation.js';
import { buildExpandedMultiValueTable } from './splitColumnExpansion.js';
import {
  buildDisplayedFieldMove,
  getPostFilterActionFieldsForTable,
  getSplitFieldGroupIndices,
  getSplitFieldParentName
} from './splitColumnFields.js';
import { escapeHtml } from '../../../core/formatting/html.js';
import { QueryTableView } from '../../../ui/queryTableView.js';
import { createVirtualTableEmptyRow, createVirtualTableRow } from './virtualTableRows.js';
import { createVirtualTablePostFilterController } from './virtualTablePostFilters.js';
let VirtualTable;
(function initializeVirtualTable() {
// Virtual scrolling state
let virtualTableData = {
  headers: [],
  rows: [],
  columnMap: new Map(),
  splitColumnGroups: new Map(),
  splitColumnParent: new Map()
};

let baseViewData = {
  headers: [],
  rows: [],
  columnMap: new Map(),
  splitColumnGroups: new Map(),
  splitColumnParent: new Map()
};

// Stores the original collapsed data so split mode can be toggled on/off non-destructively
let rawTableData = null;
let splitViewData = null;
let splitColumnsActive = false;
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

const postFilters = createVirtualTablePostFilterController({
  getBaseViewData: () => baseViewData,
  getDisplayedFields: () => getDisplayedFields(),
  getFieldType
});

function cloneTableData(data) {
  return {
    headers: Array.isArray(data?.headers) ? [...data.headers] : [],
    rows: Array.isArray(data?.rows) ? data.rows.map(row => Array.isArray(row) ? [...row] : row) : [],
    columnMap: data?.columnMap instanceof Map ? new Map(data.columnMap) : new Map(),
    splitColumnGroups: cloneSplitColumnGroups(data?.splitColumnGroups),
    splitColumnParent: cloneSplitColumnParent(data?.splitColumnParent)
  };
}

function cloneSplitColumnGroups(groups) {
  return groups instanceof Map
    ? new Map(Array.from(groups.entries()).map(([field, children]) => [field, [...children]]))
    : new Map();
}

function cloneSplitColumnParent(parentMap) {
  return parentMap instanceof Map ? new Map(parentMap) : new Map();
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

function hasActivePostFilters() {
  return postFilters.hasActiveFilters();
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
      filters: postFilters.cloneSnapshot(),
      totalRows: baseViewData.rows.length,
      filteredRows: virtualTableData.rows.length
    }
  }));
}

function applyPostFilters(options = {}) {
  postFilters.sanitizeForCurrentView();

  virtualTableData = {
    headers: [...baseViewData.headers],
    rows: postFilters.getFilteredRows(),
    columnMap: new Map(baseViewData.columnMap)
  };

  if (options.resetScroll !== false && tableScrollContainer) {
    tableScrollTop = 0;
    tableScrollContainer.scrollTop = 0;
  }

  if (options.recalculateWidths !== false) {
    const displayedFields = getDisplayedFields();
    const fieldsForWidth = displayedFields.length
      ? displayedFields
      : virtualTableData.headers;
    calculatedColumnWidths = calculateOptimalColumnWidths(fieldsForWidth, virtualTableData);
  }

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
  QueryTableView.updateSortHeadersUI(currentSortColumn, currentSortDirection);
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
    const hasLoadedRows = Array.isArray(baseViewData.rows) && baseViewData.rows.length > 0;
    const message = hasLoadedRows && hasActivePostFilters()
      ? 'No rows match the active post filters.'
      : (isCurrentQueryResultSetLoaded() ? 'No results matched this query.' : 'Run a query to load results.');

    tbody.classList.remove('query-table-virtual-body');
    tbody.style.height = '';
    tbody.style.position = '';
    table.style.height = '';
    nextBody.appendChild(createVirtualTableEmptyRow({
      colSpan: displayedFields.length,
      message,
      document
    }));
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
  
  for (let i = start; i < end; i++) {
    nextBody.appendChild(createVirtualTableRow({
      rowData: virtualTableData.rows[i],
      rowIndex: i,
      displayedFields,
      columnLayout,
      calculatedColumnWidths,
      columnMap: virtualTableData.columnMap,
      rowHeight: tableRowHeight,
      shouldRenderAllRows,
      tableBuilder: TableBuilder,
      tableColumnLayout,
      textMeasurement: TextMeasurement,
      valueFormatting: ValueFormatting,
      parseNumericValue,
      getFieldType,
      escapeHtml,
      document
    }));
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
  return calculateMeasuredFieldWidth(fieldName, data, {
    getFieldType,
    parseNumericValue,
    textMeasurement: TextMeasurement,
    valueFormatting: ValueFormatting,
    headerActionSpace: HEADER_ACTION_SPACE,
    headerTextBalanceSpace: HEADER_TEXT_BALANCE_SPACE
  });
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
  
  const widths = calculateMeasuredOptimalColumnWidths(targetFields, targetData, {
    getFieldType,
    parseNumericValue,
    textMeasurement: TextMeasurement,
    valueFormatting: ValueFormatting,
    headerActionSpace: HEADER_ACTION_SPACE,
    headerTextBalanceSpace: HEADER_TEXT_BALANCE_SPACE
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
    calculatedColumnWidths = calculateOptimalColumnWidths(fields, virtualTableData);
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
    columnMap: new Map(),
    splitColumnGroups: new Map(),
    splitColumnParent: new Map()
  };
  baseViewData = {
    headers: [],
    rows: [],
    columnMap: new Map(),
    splitColumnGroups: new Map(),
    splitColumnParent: new Map()
  };
  splitViewData = null;
  postFilters.clear();
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

  if (!splitViewData) {
    splitViewData = buildExpandedMultiValueTable(rawTableData);
  }
  baseViewData = cloneTableData(splitViewData);
  postFilters.invalidateValueOptionsCache();
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
        columnMap: new Map(rawTableData.columnMap),
        splitColumnGroups: cloneSplitColumnGroups(splitViewData?.splitColumnGroups),
        splitColumnParent: cloneSplitColumnParent(splitViewData?.splitColumnParent)
      };
      postFilters.invalidateValueOptionsCache();
    }
  }

  applyPostFilters({
    refreshView: false,
    notify: false,
    resetScroll: false,
    recalculateWidths: false
  });

  // Keep query-state columns aligned with the active split/stacked header set.
  QueryTableView.queueNextStateRenderOptions({ preserveScroll: true });
  QueryChangeManager.replaceDisplayedFields(baseViewData.headers, { source: 'VirtualTable.setSplitMode' });
  notifyPostFiltersUpdated();
  syncResizeModeUi();
}

VirtualTable = {
  // State
  get virtualTableData() { return virtualTableData; },
  set virtualTableData(v) {
    const nextData = cloneTableData(v);
    // When new data is loaded from outside, update rawTableData so split mode
    // always has a fresh snapshot to work from.
    rawTableData = cloneTableData(nextData);
    splitViewData = null;
    baseViewData = cloneTableData(nextData);
    postFilters.invalidateValueOptionsCache();
    // Reset split mode — caller will re-expand if needed
    splitColumnsActive = false;
    applyPostFilters({ refreshView: false, notify: true, resetScroll: false });
    appUiActions.resetSplitColumnsToggleUI();
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
  getFilterActionFieldName: fieldName => getSplitFieldParentName(fieldName, baseViewData),
  getPostFilterActionFields: fields => getPostFilterActionFieldsForTable(fields, baseViewData),
  getDisplayedFieldMoveGroupIndices: (fieldName, fields = getDisplayedFields()) => getSplitFieldGroupIndices(fieldName, fields, baseViewData),
  buildDisplayedFieldMove: (fields, fromIndex, toIndex) => buildDisplayedFieldMove(fields, fromIndex, toIndex, baseViewData),
  getPostFilterState: () => postFilters.cloneSnapshot(),
  getPostFilterFieldOptions: fieldName => postFilters.getFieldOptions(fieldName),
  replacePostFilters(nextFilters, options = {}) {
    postFilters.assign(nextFilters);
    applyPostFilters({
      refreshView: options.refreshView !== false,
      notify: options.notify !== false,
      resetScroll: options.resetScroll !== false
    });
  },
  clearPostFilters(options = {}) {
    postFilters.assign({});
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
  get postFilterBlankValue() { return postFilters.blankValue; }
};

registerTableService(VirtualTable);
})();

export { VirtualTable };
