import { appServices, registerTableService } from '../../../core/appServices.js';
import { appUiActions } from '../../../core/appUiActions.js';
import { QueryChangeManager, QueryStateReaders } from '../../../core/queryState.js';
import { cloneResultCellValue } from '../../../core/resultCellValues.js';
import { showToastMessage } from '../../../core/toast.js';
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
  buildDisplayedFieldRemoval,
  buildSplitModeDisplayedFields,
  getPostFilterActionFieldsForTable,
  getSplitFieldGroupIndices,
  getSplitFieldParentName
} from './splitColumnFields.js';
import { applyImmediateColumnOrder, applyImmediateColumnRemoval } from '../drag-drop/dragDropImmediateReorder.js';
import { QueryTableView } from '../../../ui/queryTableView.js';
import { createVirtualTableEmptyRow, createVirtualTableRow } from './virtualTableRows.js';
import {
  buildDuplicateCollapseSignature,
  buildDuplicateCollapseToastMessage,
  buildVirtualTableProjection,
  cloneDuplicateRowGroups,
  createEmptyDuplicateCollapseStats
} from './virtualTableDuplicateCollapse.js';
import { createVirtualTablePostFilterController } from './virtualTablePostFilters.js';
import { DEFAULT_FULL_RENDER_ROW_LIMIT, createVirtualRenderPlan } from './virtualizer.js';
let VirtualTable;
(function initializeVirtualTable() {
let virtualTableData = {
  headers: [],
  rows: [],
  columnMap: new Map(),
  duplicateRowGroups: [],
  splitColumnGroups: new Map(),
  splitColumnParent: new Map(),
  splitColumnSourceMap: new Map()
};

let baseViewData = {
  headers: [],
  rows: [],
  columnMap: new Map(),
  duplicateRowGroups: [],
  splitColumnGroups: new Map(),
  splitColumnParent: new Map(),
  splitColumnSourceMap: new Map()
};

let rawTableData = null;
let splitViewData = null;
let splitColumnsActive = false;
let duplicateRowCollapseActive = true;
let tableDataGeneration = 0;
let duplicateCollapseToastSignature = '';
let duplicateCollapseStats = createEmptyDuplicateCollapseStats();
let tableRowHeight = 42;    // estimated row height in pixels
let tableScrollTop = 0;
let lastRenderedScrollTop = 0;
let pendingScrollDelta = 0;
let tableScrollContainer = null;
let calculatedColumnWidths = {}; // Store calculated optimal widths for each column
let manualColumnWidths = {};
let splitPrecomputeToken = 0;
let resizeModeState = { active: false, fieldName: '' };
let simpleTableInstance = null; // Store the SimpleTable instance

const HEADER_ACTION_SPACE = 116;
const HEADER_TEXT_BALANCE_SPACE = 116;
const FULL_TABLE_RENDER_ROW_LIMIT = DEFAULT_FULL_RENDER_ROW_LIMIT;
const SCROLLBAR_DRAG_MAX_OVERSCAN_ROWS = 12;
const SCROLLBAR_DRAG_OVERSCAN_ROWS = 4;
var services = appServices, uiActions = appUiActions;
const tableScrollbar = createTableScrollbarController({ getRowHeight: () => tableRowHeight });

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
    rows: Array.isArray(data?.rows) ? data.rows.map(row => Array.isArray(row) ? row.map(cloneResultCellValue) : row) : [],
    columnMap: data?.columnMap instanceof Map ? new Map(data.columnMap) : new Map(),
    duplicateRowGroups: cloneDuplicateRowGroups(data?.duplicateRowGroups),
    splitColumnGroups: cloneSplitColumnGroups(data?.splitColumnGroups),
    splitColumnParent: cloneSplitColumnParent(data?.splitColumnParent),
    splitColumnSourceMap: cloneSplitColumnSourceMap(data?.splitColumnSourceMap)
  };
}

function cloneSplitColumnGroups(groups) {
  return groups instanceof Map ? new Map(Array.from(groups.entries()).map(([field, children]) => [field, [...children]])) : new Map();
}

function cloneSplitColumnParent(parentMap) {
  return parentMap instanceof Map ? new Map(parentMap) : new Map();
}

function cloneSplitColumnSourceMap(sourceMap) {
  return sourceMap instanceof Map ? new Map(sourceMap) : new Map();
}

function syncVirtualTableStructureFromBaseViewData() {
  virtualTableData = {
    headers: Array.isArray(baseViewData?.headers) ? [...baseViewData.headers] : [],
    rows: Array.isArray(virtualTableData?.rows) ? virtualTableData.rows : [],
    columnMap: baseViewData?.columnMap instanceof Map ? new Map(baseViewData.columnMap) : new Map(),
    duplicateRowGroups: cloneDuplicateRowGroups(virtualTableData?.duplicateRowGroups),
    splitColumnGroups: cloneSplitColumnGroups(baseViewData?.splitColumnGroups),
    splitColumnParent: cloneSplitColumnParent(baseViewData?.splitColumnParent),
    splitColumnSourceMap: cloneSplitColumnSourceMap(baseViewData?.splitColumnSourceMap)
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

function hasActivePostFilters() {
  return postFilters.hasActiveFilters();
}

function isCurrentQueryResultSetLoaded() {
  return Boolean(QueryStateReaders?.getLifecycleState?.().hasLoadedResultSet);
}

function updateHeaderWidthsFromCurrentState() {
  tableColumnLayout.syncRenderedColumnLayout();
}

function getPostFilterStats() {
  return {
    totalRows: duplicateCollapseStats.totalRows,
    filteredRows: duplicateCollapseStats.uniqueRows,
    postFilteredRows: duplicateCollapseStats.postFilteredRows,
    uniqueRows: duplicateCollapseStats.uniqueRows,
    duplicateRowsCollapsed: duplicateCollapseStats.duplicateRowsCollapsed,
    duplicateRowCollapseActive
  };
}

function getCollapsedRowGroup(rowIndex) {
  const index = Number.parseInt(rowIndex, 10);
  if (!Number.isFinite(index) || index < 0) {
    return null;
  }

  const group = virtualTableData?.duplicateRowGroups?.[index] || null;
  return Number(group?.matchingRowCount || 0) > 1 ? group : null;
}

function notifyPostFiltersUpdated() {
  window.dispatchEvent(new CustomEvent('postfilters:updated', {
    detail: {
      filters: postFilters.cloneSnapshot(),
      ...getPostFilterStats()
    }
  }));
}

function maybeShowDuplicateCollapseToast(stats, options = {}) {
  if (options.toast === false || !stats?.duplicateRowsCollapsed) return;
  const signature = buildDuplicateCollapseSignature(stats, tableDataGeneration);
  if (signature === duplicateCollapseToastSignature) return;
  duplicateCollapseToastSignature = signature;
  showToastMessage(buildDuplicateCollapseToastMessage(stats), 'info', 5200);
}

function applyPostFilters(options = {}) {
  postFilters.sanitizeForCurrentView();
  const projection = buildVirtualTableProjection({
    baseViewData,
    displayedFields: getDisplayedFields(),
    filteredRows: postFilters.getFilteredRows(),
    collapseDuplicates: duplicateRowCollapseActive
  });
  duplicateCollapseStats = projection.stats;
  virtualTableData = projection.tableData;
  maybeShowDuplicateCollapseToast(duplicateCollapseStats, options);

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

function syncProjectionFromQueryState(options = {}) {
  applyPostFilters({
    refreshView: false,
    notify: options.notify !== false,
    resetScroll: false,
    recalculateWidths: options.recalculateWidths === true
  });
}

function sortTableBy(fieldName) {
  if (!baseViewData.rows || baseViewData.rows.length === 0) return;
  const colIndex = baseViewData.columnMap.get(fieldName);
  if (colIndex === undefined) return;

  if (currentSortColumn === fieldName) {
    currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';
  } else {
    currentSortColumn = fieldName;
    currentSortDirection = 'asc';
  }

  const type = getFieldType(fieldName);

  sortRowsByColumn(baseViewData.rows, colIndex, type, currentSortDirection);
  applyPostFilters({ refreshView: false, resetScroll: false, recalculateWidths: false });

  renderVirtualTable();
  QueryTableView.updateSortHeadersUI(currentSortColumn, currentSortDirection);
}

function renderVirtualTable(options = {}) {
  const displayedFields = getDisplayedFields();
  if (!tableScrollContainer || !displayedFields.length) return;
  tableScrollbar.attach(tableScrollContainer);
  
  const table = tableScrollContainer.querySelector('#example-table');
  if (!table) return;
  
  if (document.body.classList.contains('dragging-cursor')) {
    return;
  }
  
  const tbody = table.querySelector('tbody');
  if (!tbody) return;
  const syncInteractions = options.syncInteractions !== false;
  const columnLayout = tableColumnLayout.syncRenderedColumnLayout(table, displayedFields, { syncBody: false });
  const nextBody = document.createDocumentFragment();
  
  if (syncInteractions) {
    services.cleanupDragDropTableListeners(table);
  }

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
    lastRenderedScrollTop = 0;
    pendingScrollDelta = 0;
    tableScrollContainer.scrollTop = 0;
    tableScrollbar.scheduleSync({ refreshGeometry: true });
    return;
  }

  const scrollbarDragging = options.scrollbarDragging === true || tableScrollbar.isDragging?.() === true;
  const renderPlan = createVirtualRenderPlan({
    rowCount: virtualTableData.rows.length,
    scrollTop: tableScrollContainer ? tableScrollContainer.scrollTop : tableScrollTop,
    containerHeight: tableScrollContainer.clientHeight,
    headerHeight: Math.ceil(table.querySelector('thead')?.getBoundingClientRect().height || 40),
    rowHeight: tableRowHeight,
    fullRenderRowLimit: FULL_TABLE_RENDER_ROW_LIMIT,
    maxOverscanRows: scrollbarDragging ? SCROLLBAR_DRAG_MAX_OVERSCAN_ROWS : undefined,
    overscanRows: scrollbarDragging ? SCROLLBAR_DRAG_OVERSCAN_ROWS : undefined,
    scrollDelta: options.scrollDelta ?? pendingScrollDelta
  });
  const shouldRenderAllRows = !renderPlan.virtualized;
  const { start, end } = renderPlan;

  table.style.height = '';
  tbody.classList.toggle('query-table-virtual-body', !shouldRenderAllRows);
  tbody.style.height = shouldRenderAllRows ? '' : `${renderPlan.totalHeight}px`;
  tbody.style.position = shouldRenderAllRows ? '' : 'relative';
  if (!shouldRenderAllRows && Math.abs(tableScrollContainer.scrollTop - renderPlan.scrollTop) > 1) {
    tableScrollContainer.scrollTop = renderPlan.scrollTop;
  }
  tableScrollTop = renderPlan.scrollTop;
  lastRenderedScrollTop = renderPlan.scrollTop;
  pendingScrollDelta = 0;
  
  for (let i = start; i < end; i++) {
    nextBody.appendChild(createVirtualTableRow({
      rowData: virtualTableData.rows[i],
      rowIndex: i,
      duplicateRowGroup: getCollapsedRowGroup(i),
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
      document
    }));
  }
  
  tbody.replaceChildren(nextBody);
  document.dispatchEvent(typeof CustomEvent === 'function'
    ? new CustomEvent('query-table-body-rendered')
    : new Event('query-table-body-rendered'));
  
  if (syncInteractions) {
    services.addDragAndDrop(table);
  }
  tableScrollbar.scheduleSync({ refreshGeometry: !scrollbarDragging });
}

let isRenderScheduled = false;

function scheduleVirtualTableRender() {
  if (!isRenderScheduled) {
    isRenderScheduled = true;
    requestAnimationFrame(() => {
      try {
        renderVirtualTable({
          scrollDelta: pendingScrollDelta,
          scrollbarDragging: tableScrollbar.isDragging?.() === true,
          syncInteractions: false
        });
      } finally {
        isRenderScheduled = false;
      }
    });
  }
}

function handleTableScroll(e) {
  // Don't process scroll events during active drag
  if (document.body.classList.contains('dragging-cursor')) {
    return;
  }
  
  tableScrollTop = e.target.scrollTop;
  pendingScrollDelta = tableScrollbar.isDragging?.() === true
    ? 0
    : Math.max(pendingScrollDelta, Math.abs(tableScrollTop - lastRenderedScrollTop));
  tableScrollbar.scheduleSync();

  if (virtualTableData.rows.length <= FULL_TABLE_RENDER_ROW_LIMIT) {
    return;
  }

  scheduleVirtualTableRender();
}

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

function ensureColumnWidths(fields, data = virtualTableData) {
  const targetFields = Array.isArray(fields) ? fields.filter(Boolean) : [];
  if (!targetFields.length) {
    calculatedColumnWidths = {};
    return calculatedColumnWidths;
  }

  const missingFields = targetFields.filter(field => {
    const cachedWidth = Number(calculatedColumnWidths[field]);
    return !Number.isFinite(cachedWidth) || cachedWidth <= 0;
  });

  if (missingFields.length) {
    calculatedColumnWidths = {
      ...calculatedColumnWidths,
      ...calculateOptimalColumnWidths(missingFields, data)
    };
  }

  return calculatedColumnWidths;
}

function scheduleSplitViewPrecompute() {
  if (typeof window === 'undefined') {
    return;
  }

  splitPrecomputeToken += 1;
  const token = splitPrecomputeToken;
  const run = () => {
    if (
      token !== splitPrecomputeToken
      || splitColumnsActive
      || splitViewData
      || !rawTableData
      || !Array.isArray(rawTableData.rows)
      || rawTableData.rows.length === 0
    ) {
      return;
    }

    splitViewData = buildExpandedMultiValueTable(rawTableData, { lazyRows: true });
    const splitDisplayedFields = buildSplitModeDisplayedFields(getDisplayedFields(), splitViewData, true);
    if (splitDisplayedFields.length) {
      ensureColumnWidths(splitDisplayedFields, splitViewData);
    }
  };

  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(run, { timeout: 2500 });
    return;
  }

  window.setTimeout(run, 250);
}

async function setupVirtualTable(container, fields, options = {}) {
  const preservedScrollTop = Math.max(0, Number(options.preserveScrollTop) || 0);
  const preservedScrollLeft = Math.max(0, Number(options.preserveScrollLeft) || 0);
  const shouldPreserveScroll = options.preserveScroll === true;

  // Set up container for virtual scrolling
  container.style.height = container.dataset.expanded === 'true' ? 'calc(100vh - 11rem)' : '400px';
  container.style.overflowX = 'auto';
  container.style.overflowY = 'auto';
  
  // Set up scroll container reference
  tableScrollContainer = container;
  tableScrollTop = shouldPreserveScroll ? preservedScrollTop : 0;
  tableScrollbar.attach(container);
  if (options.skipProjectionSync !== true) applyPostFilters({ refreshView: false, notify: true, resetScroll: false, recalculateWidths: false });

  // Calculate widths if we have fields
  if (fields && fields.length > 0) {
    ensureColumnWidths(fields, virtualTableData);
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
  tableScrollbar.scheduleSync({ refreshGeometry: true });
  scheduleSplitViewPrecompute();
  
  return { virtualTableData, calculatedColumnWidths };
}

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

function clearVirtualTableData() {
  virtualTableData = {
    headers: [],
    rows: [],
    columnMap: new Map(),
    duplicateRowGroups: [],
    splitColumnGroups: new Map(),
    splitColumnParent: new Map(),
    splitColumnSourceMap: new Map()
  };
  baseViewData = {
    headers: [],
    rows: [],
    columnMap: new Map(),
    duplicateRowGroups: [],
    splitColumnGroups: new Map(),
    splitColumnParent: new Map(),
    splitColumnSourceMap: new Map()
  };
  splitViewData = null;
  tableDataGeneration += 1;
  duplicateCollapseToastSignature = '';
  duplicateCollapseStats = createEmptyDuplicateCollapseStats();
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
 * Expands multi-value cells (\x1F-delimited) into separate numbered columns.
 * Operates on rawTableData → virtualTableData non-destructively.
 * @function expandMultiValueColumns
 */
function expandMultiValueColumns() {
  if (!rawTableData || !rawTableData.rows || !rawTableData.rows.length) return;

  if (!splitViewData) {
    splitViewData = buildExpandedMultiValueTable(rawTableData, { lazyRows: true });
  }
  baseViewData = splitViewData;
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
  const currentDisplayedFields = getDisplayedFields();
  splitColumnsActive = active;

  if (active) {
    // Snapshot raw data if not already saved (first time switching to split)
    if (!rawTableData || rawTableData.headers.length === 0) {
      rawTableData = {
        headers: [...virtualTableData.headers],
        rows: virtualTableData.rows.map(r => [...r]),
        columnMap: new Map(virtualTableData.columnMap),
        duplicateRowGroups: []
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
        duplicateRowGroups: [],
        splitColumnGroups: cloneSplitColumnGroups(splitViewData?.splitColumnGroups),
        splitColumnParent: cloneSplitColumnParent(splitViewData?.splitColumnParent),
        splitColumnSourceMap: cloneSplitColumnSourceMap(splitViewData?.splitColumnSourceMap)
      };
      postFilters.invalidateValueOptionsCache();
    }
  }

  // Keep query-state columns aligned with the active split/stacked header set.
  const nextDisplayedFields = buildSplitModeDisplayedFields(currentDisplayedFields, baseViewData, active);
  syncVirtualTableStructureFromBaseViewData();
  QueryTableView.queueNextStateRenderOptions({ preserveScroll: true });
  QueryChangeManager.replaceDisplayedFields(nextDisplayedFields, { source: 'VirtualTable.setSplitMode' });
  notifyPostFiltersUpdated();
  syncResizeModeUi();
}

function setDuplicateRowCollapseMode(active, options = {}) {
  duplicateRowCollapseActive = active !== false;
  duplicateCollapseToastSignature = '';
  applyPostFilters({
    refreshView: options.refreshView !== false,
    notify: options.notify !== false,
    resetScroll: options.resetScroll === true,
    recalculateWidths: options.recalculateWidths === true,
    toast: options.toast !== false
  });
  return duplicateRowCollapseActive;
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
    splitPrecomputeToken += 1;
    tableDataGeneration += 1;
    duplicateCollapseToastSignature = '';
    baseViewData = cloneTableData(nextData);
    calculatedColumnWidths = {};
    postFilters.invalidateValueOptionsCache();
    if (splitColumnsActive) expandMultiValueColumns();
    applyPostFilters({ refreshView: false, notify: true, resetScroll: false });
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
  renderVirtualTable,
  handleTableScroll,
  calculateFieldWidth,
  calculateOptimalColumnWidths,
  setupVirtualTable,
  measureRowHeight,
  clearVirtualTableData,
  getVirtualTableState,
  sortTableBy,
  syncProjectionFromQueryState,
  setSplitColumnsMode,
  setDuplicateRowCollapseMode,
  expandMultiValueColumns,
  getFilterActionFieldName: fieldName => getSplitFieldParentName(fieldName, baseViewData),
  getPostFilterActionFields: fields => getPostFilterActionFieldsForTable(fields, baseViewData),
  getDisplayedFieldMoveGroupIndices: (fieldName, fields = getDisplayedFields()) => getSplitFieldGroupIndices(fieldName, fields, baseViewData),
  buildDisplayedFieldMove: (fields, fromIndex, toIndex) => buildDisplayedFieldMove(fields, fromIndex, toIndex, baseViewData),
  buildDisplayedFieldRemoval: (fields, fieldName) => buildDisplayedFieldRemoval(fields, fieldName, baseViewData),
  applyImmediateColumnOrder: (nextFields, options = {}) => applyImmediateColumnOrder(document.getElementById('example-table'), nextFields, options),
  applyImmediateColumnRemoval: (nextFields, options = {}) => applyImmediateColumnRemoval(document.getElementById('example-table'), nextFields, options),
  getPostFilterState: () => postFilters.cloneSnapshot(),
  getCollapsedRowGroup,
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
  getPostFilterStats,
  get splitColumnsActive() { return splitColumnsActive; },
  get duplicateRowCollapseActive() { return duplicateRowCollapseActive; },
  get rawTableData() { return rawTableData; },
  get baseViewData() { return baseViewData; },
  get postFilterBlankValue() { return postFilters.blankValue; }
};

registerTableService(VirtualTable);
})();

export { VirtualTable };
