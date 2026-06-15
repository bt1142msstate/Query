import { TableBuilder } from '../../features/table/virtual-table/tableBuilder.js';
import { calculateOptimalColumnWidths as calculateMeasuredOptimalColumnWidths } from '../../features/table/virtual-table/tableColumnWidthCalculation.js';
import { createTableColumnLayoutController } from '../../features/table/virtual-table/tableColumnLayout.js';
import { createTableScrollbarController } from '../../features/table/virtual-table/tableScrollbar.js';
import { createVirtualTableEmptyRow, createVirtualTableRow } from '../../features/table/virtual-table/virtualTableRows.js';
import { DEFAULT_FULL_RENDER_ROW_LIMIT, createVirtualRenderPlan } from '../../features/table/virtual-table/virtualizer.js';
import { createVirtualTableComponent } from './createVirtualTableComponent.js';

const DEFAULT_ROW_HEIGHT = 42;
const DEFAULT_HEIGHT = '400px';
const DEFAULT_HEADER_ACTION_SPACE = 20;
const DEFAULT_HEADER_TEXT_BALANCE_SPACE = 12;
let virtualTableDomComponentCounter = 0;

const VIRTUAL_TABLE_DOM_COMPONENT_CSS = `
.query-virtual-table-host {
  --table-scrollbar-size: 12px;
  --table-header-height: 42px;
  position: relative;
  min-width: 0;
  background: #fff;
  border: 1px solid rgba(148, 163, 184, 0.28);
  border-radius: 0.75rem;
  overflow: hidden;
}

.query-virtual-table-container {
  position: relative;
  width: 100%;
  height: 400px;
  overflow: auto;
  overscroll-behavior: contain;
  overflow-anchor: none;
  background: #fff;
}

.query-virtual-table-container.table-scrollbar-enhanced::-webkit-scrollbar:vertical {
  width: 0;
}

.query-virtual-table {
  width: auto;
  min-width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  table-layout: fixed;
  font: 14px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: #0f172a;
}

.query-virtual-table thead {
  background: #f8fafc;
}

.query-virtual-table th {
  position: sticky;
  top: 0;
  z-index: 2;
  box-sizing: border-box;
  height: var(--table-header-height, 42px);
  padding: 0.7rem 0.95rem;
  border-bottom: 1px solid rgba(148, 163, 184, 0.35);
  border-right: 1px solid rgba(148, 163, 184, 0.22);
  background: #f8fafc;
  color: #334155;
  font-size: 0.72rem;
  font-weight: 750;
  letter-spacing: 0.03em;
  text-align: left;
  text-transform: uppercase;
  white-space: nowrap;
}

.query-virtual-table td {
  box-sizing: border-box;
  padding: 0.65rem 0.95rem;
  border-bottom: 1px solid rgba(226, 232, 240, 0.9);
  border-right: 1px solid rgba(226, 232, 240, 0.75);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  background: #fff;
}

.query-virtual-table tbody.query-table-virtual-body {
  display: block;
  position: relative;
}

.query-virtual-table tbody.query-table-virtual-body tr {
  transition: none;
  will-change: transform;
}

.query-virtual-table .query-table-truncated-trigger,
.query-virtual-table .query-table-multi-value-trigger {
  max-width: 100%;
}

.query-virtual-table-empty-cell {
  padding: 2rem;
  color: #64748b;
  text-align: center;
}

.query-virtual-table-host .table-scrollbar {
  position: absolute;
  top: var(--table-header-height, 42px);
  right: 0;
  bottom: var(--table-scrollbar-size, 12px);
  width: var(--table-scrollbar-size, 12px);
  z-index: 5;
  display: none;
  padding: 1px;
  border-radius: 999px;
  background: rgba(156, 163, 175, 0.72);
  pointer-events: auto;
  touch-action: none;
  user-select: none;
  contain: layout paint style;
}

.query-virtual-table-host .table-scrollbar.is-visible {
  display: block;
}

.query-virtual-table-host .table-scrollbar-thumb {
  position: absolute;
  top: 0;
  left: 1px;
  right: 1px;
  min-height: 40px;
  border-radius: 999px;
  background: rgba(107, 114, 128, 0.88);
  box-shadow: inset 0 0 0 1px rgba(75, 85, 99, 0.24);
  cursor: grab;
  transform: translate3d(0, 0, 0);
  will-change: transform;
}

.query-virtual-table-host .table-scrollbar.is-dragging .table-scrollbar-thumb {
  cursor: grabbing;
  background: rgba(55, 65, 81, 0.98);
}
`;

function normalizeStringList(values) {
  return (Array.isArray(values) ? values : [])
    .map(value => String(value || '').trim())
    .filter(Boolean);
}

function normalizeHeight(height) {
  if (typeof height === 'number' && Number.isFinite(height) && height > 0) {
    return `${height}px`;
  }
  return String(height || DEFAULT_HEIGHT);
}

function normalizeRows(rows) {
  return Array.isArray(rows) ? rows : [];
}

function normalizeFieldTypes(fieldTypes) {
  if (fieldTypes instanceof Map) {
    return fieldTypes;
  }
  if (fieldTypes && typeof fieldTypes === 'object') {
    return new Map(Object.entries(fieldTypes));
  }
  return new Map();
}

function createFallbackTextMeasurement(doc) {
  let canvas = null;
  let context = null;

  function getContext() {
    if (context) return context;
    if (!doc?.createElement) return null;
    canvas = canvas || doc.createElement('canvas');
    context = canvas.getContext?.('2d') || null;
    return context;
  }

  return {
    measureText(text, font = '14px ui-sans-serif, system-ui') {
      const value = String(text ?? '');
      const ctx = getContext();
      if (!ctx) {
        return value.length * 7;
      }
      ctx.font = font;
      return ctx.measureText(value).width;
    },
    findMaxFittingChars(text, maxWidth, font = '14px ui-sans-serif, system-ui') {
      const value = String(text ?? '');
      let left = 0;
      let right = value.length;
      let maxFitChars = 0;
      while (left <= right) {
        const mid = Math.floor((left + right) / 2);
        const testText = `${value.substring(0, mid)}...`;
        if (this.measureText(testText, font) <= maxWidth) {
          maxFitChars = mid;
          left = mid + 1;
        } else {
          right = mid - 1;
        }
      }
      return maxFitChars;
    }
  };
}

function createDefaultValueFormatting() {
  return {
    formatValueByType(rawValue, type) {
      if (rawValue === undefined || rawValue === null) {
        return '';
      }
      if (Array.isArray(rawValue)) {
        return rawValue;
      }
      const normalizedType = String(type || 'string').toLowerCase();
      if (normalizedType === 'number' || normalizedType === 'money') {
        const numericValue = Number.parseFloat(String(rawValue).replace(/,/gu, ''));
        return Number.isFinite(numericValue) ? numericValue.toLocaleString('en-US') : String(rawValue);
      }
      return String(rawValue);
    }
  };
}

function parseDefaultNumericValue(value) {
  if (typeof value === 'number') return value;
  return Number.parseFloat(String(value ?? '').replace(/,/gu, ''));
}

function ensureComponentStyles(doc, styleId) {
  if (!doc?.head || doc.getElementById(styleId)) {
    return;
  }

  const style = doc.createElement('style');
  style.id = styleId;
  style.textContent = VIRTUAL_TABLE_DOM_COMPONENT_CSS;
  doc.head.appendChild(style);
}

function createHeaderCell(doc, field, index, options = {}) {
  const th = doc.createElement('th');
  th.dataset.colIndex = String(index);
  th.textContent = field;
  if (typeof options.onHeaderClick === 'function') {
    th.tabIndex = 0;
    th.setAttribute('role', 'button');
    th.addEventListener('click', () => options.onHeaderClick(field, index));
    th.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        options.onHeaderClick(field, index);
      }
    });
  }
  return th;
}

function createTableElement(doc, instanceId, className) {
  const table = doc.createElement('table');
  table.className = className;
  table.dataset.queryVirtualTableInstance = instanceId;

  const thead = doc.createElement('thead');
  const tbody = doc.createElement('tbody');
  thead.appendChild(doc.createElement('tr'));
  table.append(thead, tbody);
  return table;
}

function createVirtualTableDomComponent(options = {}) {
  const explicitDocument = options.document || options.host?.ownerDocument || options.container?.ownerDocument || null;
  let doc = explicitDocument || (typeof document === 'undefined' ? null : document);
  const instanceId = String(options.id || `query-virtual-table-${virtualTableDomComponentCounter += 1}`);
  const hostSelector = `[data-query-virtual-table-host="${instanceId}"]`;
  const tableSelector = `[data-query-virtual-table-instance="${instanceId}"]`;
  const tableClassName = String(options.tableClassName || 'query-virtual-table').trim();
  const fieldTypes = normalizeFieldTypes(options.fieldTypes);
  const getFieldType = typeof options.getFieldType === 'function'
    ? options.getFieldType
    : fieldName => fieldTypes.get(fieldName) || 'string';
  const textMeasurement = options.textMeasurement || createFallbackTextMeasurement(doc);
  const valueFormatting = options.valueFormatting || createDefaultValueFormatting();
  const parseNumericValue = typeof options.parseNumericValue === 'function'
    ? options.parseNumericValue
    : parseDefaultNumericValue;
  const fullRenderRowLimit = Number.isFinite(Number(options.fullRenderRowLimit))
    ? Number(options.fullRenderRowLimit)
    : DEFAULT_FULL_RENDER_ROW_LIMIT;

  let host = null;
  let viewport = null;
  let table = null;
  let tbody = null;
  let rowHeight = Math.max(1, Number(options.rowHeight) || DEFAULT_ROW_HEIGHT);
  let tableScrollTop = 0;
  let lastRenderedScrollTop = 0;
  let pendingScrollDelta = 0;
  let isRenderScheduled = false;
  let lastHeaderSignature = '';
  let lastRenderPlan = null;
  let projection = null;
  let calculatedColumnWidths = {};
  const headlessTable = createVirtualTableComponent(options);
  const scrollbar = createTableScrollbarController({
    getRowHeight: () => rowHeight,
    hostSelector,
    tableSelector,
    ariaControls: `${instanceId}-viewport`
  });
  const columnLayout = createTableColumnLayoutController({
    getContainer: () => viewport,
    getDisplayedFields: () => headlessTable.displayedFields,
    getColumnWidth: field => calculatedColumnWidths[field],
    calculateColumnWidths: (fields, data) => calculateColumnWidths(fields, data),
    getTableData: () => projection?.tableData || null
  });

  function calculateColumnWidths(fields, data) {
    return calculateMeasuredOptimalColumnWidths(fields, data, {
      getFieldType,
      headerActionSpace: DEFAULT_HEADER_ACTION_SPACE,
      headerTextBalanceSpace: DEFAULT_HEADER_TEXT_BALANCE_SPACE,
      parseNumericValue,
      textMeasurement,
      valueFormatting
    });
  }

  function project(projectOptions = {}) {
    projection = headlessTable.project(projectOptions);
    calculatedColumnWidths = {
      ...calculatedColumnWidths,
      ...calculateColumnWidths(headlessTable.displayedFields, projection.tableData)
    };
    return projection;
  }

  function getTableData() {
    return (projection || project()).tableData;
  }

  function ensureMountedTable() {
    if (!viewport || !doc) return null;
    if (table && tbody) return table;

    table = createTableElement(doc, instanceId, tableClassName);
    tbody = table.querySelector('tbody');
    viewport.replaceChildren(table);
    return table;
  }

  function renderHeader(fields) {
    const currentTable = ensureMountedTable();
    const headerRow = currentTable?.querySelector('thead tr');
    if (!headerRow) return;
    const headerSignature = fields.join('\x1F');
    if (headerSignature === lastHeaderSignature && headerRow.children.length === fields.length) {
      return;
    }

    const fragment = doc.createDocumentFragment();
    fields.forEach((field, index) => {
      fragment.appendChild(createHeaderCell(doc, field, index, options));
    });
    headerRow.replaceChildren(fragment);
    lastHeaderSignature = headerSignature;
  }

  function renderEmptyBody(fields, message) {
    const fragment = doc.createDocumentFragment();
    const emptyRow = createVirtualTableEmptyRow({
      colSpan: Math.max(1, fields.length),
      message,
      document: doc
    });
    emptyRow.firstElementChild?.classList.add('query-virtual-table-empty-cell');
    fragment.appendChild(emptyRow);
    tbody.classList.remove('query-table-virtual-body');
    tbody.style.height = '';
    tbody.style.position = '';
    tbody.replaceChildren(fragment);
    lastRenderPlan = null;
    scrollbar.scheduleSync({ refreshGeometry: true });
  }

  function render(options = {}) {
    if (!doc || !viewport) {
      return { projection: projection || project(), renderPlan: null };
    }

    const currentProjection = options.project === false ? (projection || project()) : project();
    const tableData = currentProjection.tableData;
    const displayedFields = headlessTable.displayedFields;
    const currentTable = ensureMountedTable();
    if (!currentTable || !tbody) {
      return { projection: currentProjection, renderPlan: null };
    }

    renderHeader(displayedFields);
    const layout = columnLayout.syncRenderedColumnLayout(currentTable, displayedFields, { syncBody: false });
    scrollbar.attach(viewport);

    if (!displayedFields.length || !normalizeRows(tableData.rows).length) {
      renderEmptyBody(displayedFields, options.emptyMessage || 'No rows to display.');
      return { projection: currentProjection, renderPlan: null };
    }

    const renderPlan = createVirtualRenderPlan({
      rowCount: tableData.rows.length,
      scrollTop: viewport.scrollTop || tableScrollTop,
      containerHeight: viewport.clientHeight,
      headerHeight: Math.ceil(currentTable.querySelector('thead')?.getBoundingClientRect().height || rowHeight),
      rowHeight,
      fullRenderRowLimit,
      scrollDelta: options.scrollDelta ?? pendingScrollDelta
    });
    const shouldRenderAllRows = !renderPlan.virtualized;
    const fragment = doc.createDocumentFragment();

    currentTable.style.height = '';
    tbody.classList.toggle('query-table-virtual-body', !shouldRenderAllRows);
    tbody.style.height = shouldRenderAllRows ? '' : `${renderPlan.totalHeight}px`;
    tbody.style.position = shouldRenderAllRows ? '' : 'relative';

    if (!shouldRenderAllRows && Math.abs(viewport.scrollTop - renderPlan.scrollTop) > 1) {
      viewport.scrollTop = renderPlan.scrollTop;
    }

    tableScrollTop = renderPlan.scrollTop;
    lastRenderedScrollTop = renderPlan.scrollTop;
    pendingScrollDelta = 0;

    for (let rowIndex = renderPlan.start; rowIndex < renderPlan.end; rowIndex += 1) {
      fragment.appendChild(createVirtualTableRow({
        rowData: tableData.rows[rowIndex],
        rowIndex,
        duplicateRowGroup: tableData.duplicateRowGroups?.[rowIndex] || null,
        displayedFields,
        columnLayout: layout,
        calculatedColumnWidths,
        columnMap: tableData.columnMap,
        rowHeight,
        shouldRenderAllRows,
        tableBuilder: TableBuilder,
        tableColumnLayout: columnLayout,
        textMeasurement,
        valueFormatting,
        parseNumericValue,
        getFieldType,
        document: doc
      }));
    }

    tbody.replaceChildren(fragment);
    columnLayout.syncRenderedColumnLayout(currentTable, displayedFields);
    scrollbar.scheduleSync({ refreshGeometry: true });
    lastRenderPlan = renderPlan;
    return { projection: currentProjection, renderPlan };
  }

  function scheduleRender() {
    if (isRenderScheduled) return;
    isRenderScheduled = true;
    const requestFrame = viewport?.ownerDocument?.defaultView?.requestAnimationFrame || globalThis.requestAnimationFrame;
    const run = () => {
      isRenderScheduled = false;
      render({ project: false, scrollDelta: pendingScrollDelta });
    };
    if (typeof requestFrame === 'function') {
      requestFrame(run);
    } else {
      setTimeout(run, 16);
    }
  }

  function handleScroll(event) {
    tableScrollTop = event.target.scrollTop;
    pendingScrollDelta = Math.max(pendingScrollDelta, Math.abs(tableScrollTop - lastRenderedScrollTop));
    scrollbar.scheduleSync();
    if ((projection?.tableData?.rows?.length || 0) > fullRenderRowLimit) {
      scheduleRender();
    }
  }

  function mount(nextHost = options.host || options.container) {
    if (!nextHost) {
      return false;
    }

    doc = nextHost.ownerDocument || doc;
    if (options.injectStyles !== false) {
      ensureComponentStyles(doc, String(options.styleId || 'query-virtual-table-component-styles'));
    }

    host = nextHost;
    host.classList.add('query-virtual-table-host');
    host.dataset.queryVirtualTableHost = instanceId;
    if (!host.style.position) {
      host.style.position = 'relative';
    }

    viewport = doc.createElement('div');
    viewport.id = `${instanceId}-viewport`;
    viewport.className = 'query-virtual-table-container';
    viewport.style.height = normalizeHeight(options.height);
    viewport.addEventListener('scroll', handleScroll, { passive: true });
    host.replaceChildren(viewport);
    table = null;
    tbody = null;
    lastHeaderSignature = '';
    render();
    return true;
  }

  function destroy() {
    if (viewport) {
      viewport.removeEventListener('scroll', handleScroll);
    }
    scrollbar.remove();
    if (host?.dataset?.queryVirtualTableHost === instanceId) {
      delete host.dataset.queryVirtualTableHost;
    }
    host?.classList?.remove('query-virtual-table-host');
    host = null;
    viewport = null;
    table = null;
    tbody = null;
    isRenderScheduled = false;
    lastHeaderSignature = '';
  }

  function rerenderFromSetter(setterResult) {
    projection = setterResult || project();
    render({ project: false });
    return projection;
  }

  return Object.freeze({
    destroy,
    get calculatedColumnWidths() { return { ...calculatedColumnWidths }; },
    get displayedFields() { return headlessTable.displayedFields; },
    get host() { return host; },
    get projection() { return projection || project(); },
    get renderPlan() { return lastRenderPlan; },
    get splitColumnsActive() { return headlessTable.splitColumnsActive; },
    get tableData() { return getTableData(); },
    get viewport() { return viewport; },
    mount,
    project,
    render,
    setCollapseDuplicateRows(active) {
      return rerenderFromSetter(headlessTable.setCollapseDuplicateRows(active));
    },
    setData(data) {
      calculatedColumnWidths = {};
      tableScrollTop = 0;
      if (viewport) viewport.scrollTop = 0;
      return rerenderFromSetter(headlessTable.setData(data));
    },
    setDisplayedFields(fields) {
      calculatedColumnWidths = {};
      return rerenderFromSetter(headlessTable.setDisplayedFields(normalizeStringList(fields)));
    },
    setHeight(height) {
      if (viewport) {
        viewport.style.height = normalizeHeight(height);
        scrollbar.scheduleSync({ refreshGeometry: true });
      }
      return normalizeHeight(height);
    },
    setRowHeight(nextRowHeight) {
      rowHeight = Math.max(1, Number(nextRowHeight) || DEFAULT_ROW_HEIGHT);
      render({ project: false });
      return rowHeight;
    },
    setSplitColumns(active) {
      calculatedColumnWidths = {};
      return rerenderFromSetter(headlessTable.setSplitColumns(active));
    }
  });
}

export {
  VIRTUAL_TABLE_DOM_COMPONENT_CSS,
  createVirtualTableDomComponent
};
