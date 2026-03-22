/**
 * Table and run-state UI management.
 * Shared DOM caching lives in ui/domCache.js.
 * @module QueryUI
 */

var getDisplayedFields = window.QueryStateReaders.getDisplayedFields.bind(window.QueryStateReaders);
var getActiveFilters = window.QueryStateReaders.getActiveFilters.bind(window.QueryStateReaders);
var getLifecycleState = window.QueryStateReaders.getLifecycleState.bind(window.QueryStateReaders);
var getQueryStatus = window.QueryStateReaders.getQueryStatus.bind(window.QueryStateReaders);
var hasQueryChanged = window.QueryStateReaders.hasQueryChanged.bind(window.QueryStateReaders);
var services = window.AppServices;
let queryUiInitialized = false;
let updateButtonStatesImpl = null;

function updateTableResultsLip() {
  const resultsBadge = window.DOM.tableResultsBadge;
  const resultsCount = window.DOM.tableResultsCount;
  const resultsLabel = window.DOM.tableResultsLabel;
  const columnsCount = window.DOM.tableColumnsCount;
  const columnsLabel = window.DOM.tableColumnsLabel;
  const tableNameShell = window.DOM.tableNameShell;

  if (!resultsBadge || !resultsCount || !resultsLabel || !columnsCount || !columnsLabel) {
    return;
  }

  const tableData = services.getVirtualTableData();
  const rowCount = Array.isArray(tableData?.rows)
    ? tableData.rows.length
    : 0;
  const columnCount = getDisplayedFields().length;
  const hasResults = rowCount > 0 || columnCount > 0;

  const queryStatus = getQueryStatus();
  const isPlanningMode = queryStatus === 'planning';
  document.body.classList.toggle('is-planning', isPlanningMode);
  const isPartialResults = queryStatus === 'partial';
  document.body.classList.toggle('is-partial-results', isPartialResults);
  // has-loaded-data is set only when actual row data is present — used by CSS
  // to scope interaction effects (e.g. cell hover glow) to real results.
  document.body.classList.toggle('has-loaded-data', rowCount > 0);

  resultsCount.textContent = rowCount.toLocaleString();
  resultsLabel.textContent = rowCount === 1 ? 'result' : 'results';
  columnsCount.textContent = columnCount.toLocaleString();
  columnsLabel.textContent = columnCount === 1 ? 'column' : 'columns';
  // Hide the results badge while in planning mode to avoid showing "0 results"
  // alongside the Planning badge — the two are mutually exclusive.
  resultsBadge.classList.toggle('hidden', !hasResults || isPlanningMode);
  resultsBadge.setAttribute('aria-hidden', (hasResults && !isPlanningMode) ? 'false' : 'true');

  if (tableNameShell) {
    tableNameShell.classList.toggle('has-results', hasResults);
  }
}

function getDefaultTableName(date = new Date()) {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const year = String(date.getFullYear()).slice(-2);
  return `Results ${month}/${day}/${year}`;
}

function ensureTableName(options = {}) {
  const tableNameInput = window.DOM.tableNameInput;
  const shouldGenerate = options.generateIfEmpty === true;

  if (!tableNameInput) {
    return shouldGenerate ? getDefaultTableName() : '';
  }

  const currentName = tableNameInput.value.trim();
  if (currentName || !shouldGenerate) {
    return currentName;
  }

  const generatedName = getDefaultTableName();
  tableNameInput.value = generatedName;
  tableNameInput.classList.remove('error');
  tableNameInput.dispatchEvent(new Event('input', { bubbles: true }));
  return generatedName;
}

function getTableZoom() {
  const tableShell = window.DOM.tableShell;
  if (!tableShell) {
    return 1;
  }

  const zoomValue = Number.parseFloat(tableShell.dataset.zoom || '1');
  return Number.isFinite(zoomValue) ? Math.min(1.4, Math.max(0.8, zoomValue)) : 1;
}

function getTableExpandIconMarkup(expanded) {
  if (expanded) {
    return `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4 pointer-events-none">
        <path d="M9 9H4V4"/>
        <path d="M15 9h5V4"/>
        <path d="M9 15H4v5"/>
        <path d="M15 15h5v5"/>
        <path d="M10 10 4 4"/>
        <path d="M14 10 20 4"/>
        <path d="M10 14 4 20"/>
        <path d="M14 14 20 20"/>
      </svg>
    `;
  }

  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4 pointer-events-none">
      <path d="M8 3H3v5"/>
      <path d="M16 3h5v5"/>
      <path d="M3 16v5h5"/>
      <path d="M21 16v5h-5"/>
      <path d="M3 8l6-5"/>
      <path d="M21 8l-6-5"/>
      <path d="M3 16l6 5"/>
      <path d="M21 16l-6 5"/>
    </svg>
  `;
}

function refreshTableViewport() {
  const tableShell = window.DOM.tableShell;
  const tableContainer = window.DOM.tableContainer;

  if (!tableShell || !tableContainer) {
    return;
  }

  const expanded = tableShell.classList.contains('table-shell-expanded');
  tableContainer.dataset.expanded = expanded ? 'true' : 'false';
  tableContainer.style.height = expanded ? 'calc(100vh - 11rem)' : '400px';

  window.requestAnimationFrame(() => {
    const table = document.getElementById('example-table');
    if (!table || !services.table) {
      return;
    }

    const displayedFields = getDisplayedFields();
    if (displayedFields.length > 0) {
      services.measureTableRowHeight(table, displayedFields);
    }

    services.renderVirtualTable();
  });
}

function updateTableChromeState() {
  const tableShell = window.DOM.tableShell;
  const tableZoomControls = window.DOM.tableZoomControls;
  const tableZoomLabel = window.DOM.tableZoomLabel;
  const tableZoomInBtn = window.DOM.tableZoomInBtn;
  const tableZoomOutBtn = window.DOM.tableZoomOutBtn;
  const tableExpandBtn = window.DOM.tableExpandBtn;

  if (!tableShell) {
    return;
  }

  const expanded = tableShell.classList.contains('table-shell-expanded');
  const zoom = getTableZoom();

  tableShell.style.setProperty('--table-zoom', zoom.toFixed(2));

  if (tableZoomControls) {
    tableZoomControls.classList.toggle('hidden', !expanded);
  }

  if (tableZoomLabel) {
    tableZoomLabel.textContent = `${Math.round(zoom * 100)}%`;
  }

  if (tableZoomOutBtn) {
    tableZoomOutBtn.disabled = zoom <= 0.8;
  }

  if (tableZoomInBtn) {
    tableZoomInBtn.disabled = zoom >= 1.4;
  }

  if (tableExpandBtn) {
    tableExpandBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    tableExpandBtn.setAttribute('aria-label', expanded ? 'Collapse table' : 'Expand table');
    tableExpandBtn.setAttribute('data-tooltip', expanded ? 'Collapse table' : 'Expand table');
    tableExpandBtn.dataset.state = expanded ? 'expanded' : 'collapsed';

    const iconShell = tableExpandBtn.querySelector('.table-expand-btn-icon');
    if (iconShell) {
      iconShell.innerHTML = getTableExpandIconMarkup(expanded).trim();
    }
  }
}

function setTableZoom(nextZoom) {
  const tableShell = window.DOM.tableShell;
  if (!tableShell) {
    return;
  }

  const clampedZoom = Math.min(1.4, Math.max(0.8, Number(nextZoom) || 1));
  tableShell.dataset.zoom = clampedZoom.toFixed(2);
  updateTableChromeState();
  refreshTableViewport();
}

function toggleTableExpanded(forceExpanded) {
  const tableShell = window.DOM.tableShell;
  if (!tableShell) {
    return;
  }

  const expanded = typeof forceExpanded === 'boolean'
    ? forceExpanded
    : !tableShell.classList.contains('table-shell-expanded');

  tableShell.classList.toggle('table-shell-expanded', expanded);
  document.body.classList.toggle('table-expanded-open', expanded);

  if (!expanded) {
    tableShell.dataset.zoom = '1.00';
  }

  updateTableChromeState();
  refreshTableViewport();
}

function initializeQueryUi() {
  if (queryUiInitialized) {
    return;
  }

  queryUiInitialized = true;
  const tableNameInput = window.DOM.tableNameInput;
  if (!tableNameInput) {
    return;
  }

  const tableShell = window.DOM.tableShell;
  const tableExpandBtn = window.DOM.tableExpandBtn;
  const tableZoomInBtn = window.DOM.tableZoomInBtn;
  const tableZoomOutBtn = window.DOM.tableZoomOutBtn;
  if (tableShell) {
    tableShell.dataset.zoom = tableShell.dataset.zoom || '1.00';
  }

  if (tableExpandBtn) {
    tableExpandBtn.addEventListener('click', () => {
      toggleTableExpanded();
    });
  }

  if (tableZoomInBtn) {
    tableZoomInBtn.addEventListener('click', () => {
      setTableZoom(getTableZoom() + 0.1);
    });
  }

  if (tableZoomOutBtn) {
    tableZoomOutBtn.addEventListener('click', () => {
      setTableZoom(getTableZoom() - 0.1);
    });
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && window.DOM.tableShell?.classList.contains('table-shell-expanded')) {
      toggleTableExpanded(false);
    }
  });

  window.addEventListener('resize', () => {
    if (window.DOM.tableShell?.classList.contains('table-shell-expanded')) {
      refreshTableViewport();
      return;
    }
  });

  updateTableChromeState();
  refreshTableViewport();
}

function updateRunButtonIcon(validationError) {
  const runIcon = window.DOM.runIcon;
  const refreshIcon = window.DOM.refreshIcon;
  const stopIcon = window.DOM.stopIcon;
  const runBtn = window.DOM.runBtn;
  const mobileRunQuery = window.DOM.mobileRunQuery;

  const setRunTooltip = (tooltipText, ariaLabel) => {
    if (runBtn) {
      runBtn.setAttribute('data-tooltip', tooltipText);
      runBtn.setAttribute('aria-label', ariaLabel);
    }
    if (mobileRunQuery) {
      mobileRunQuery.setAttribute('data-tooltip', tooltipText);
      mobileRunQuery.setAttribute('aria-label', ariaLabel);
    }
  };

  if (!runIcon || !refreshIcon || !stopIcon || !runBtn) return;

  if (getLifecycleState().queryRunning) {
    runIcon.classList.add('hidden');
    refreshIcon.classList.add('hidden');
    stopIcon.classList.remove('hidden');
    runBtn.disabled = false;
    runBtn.classList.remove('opacity-50', 'cursor-not-allowed');
    runBtn.classList.add('bg-red-500', 'hover:bg-red-600');
    runBtn.classList.remove('bg-green-500', 'hover:bg-green-600');
    setRunTooltip('Stop Query', 'Stop query');
    return;
  }

  runBtn.classList.remove('bg-red-500', 'hover:bg-red-600');
  runBtn.classList.add('bg-green-500', 'hover:bg-green-600');
  stopIcon.classList.add('hidden');

  if (validationError) {
    runIcon.classList.remove('hidden');
    refreshIcon.classList.add('hidden');
    runBtn.disabled = true;
    runBtn.classList.add('opacity-50', 'cursor-not-allowed');
    setRunTooltip(validationError, validationError);
    return;
  }

  if (getDisplayedFields().length === 0) {
    runIcon.classList.remove('hidden');
    refreshIcon.classList.add('hidden');
    runBtn.disabled = true;
    runBtn.classList.add('opacity-50', 'cursor-not-allowed');
    setRunTooltip('Add columns to enable query', 'Add columns to enable query');
    return;
  }

  runBtn.disabled = false;
  runBtn.classList.remove('opacity-50', 'cursor-not-allowed');

  if (hasQueryChanged()) {
    runIcon.classList.remove('hidden');
    refreshIcon.classList.add('hidden');
    setRunTooltip('Run Query', 'Run query');
  } else {
    runIcon.classList.add('hidden');
    refreshIcon.classList.remove('hidden');
    setRunTooltip('Refresh Data', 'Refresh data');
  }
}

function updateButtonStates() {
  return updateButtonStatesImpl();
}

function getDisplayedFieldsMissingFromLoadedData() {
  const displayedFields = getDisplayedFields();
  const virtualTableData = services.getVirtualTableData();
  const hasLoadedData = Boolean(
    virtualTableData
    && virtualTableData.columnMap instanceof Map
    && virtualTableData.columnMap.size > 0
  );

  if (!hasLoadedData) {
    return [];
  }

  return displayedFields.filter(field => !virtualTableData.columnMap.has(field));
}

function hasDisplayedFieldsMissingFromLoadedData() {
  return getDisplayedFieldsMissingFromLoadedData().length > 0;
}

function baseUpdateButtonStates() {
  const runBtn = window.DOM.runBtn;
  const downloadBtn = window.DOM.downloadBtn;
  const postFilterBtn = window.DOM.postFilterBtn;
  const clearQueryBtn = window.DOM.clearQueryBtn;
  const tableNameInput = window.DOM.tableNameInput;
  const tableName = tableNameInput ? tableNameInput.value.trim() : '';

  if (runBtn) {
    try {
      const payload = window.buildBackendQueryPayload ? window.buildBackendQueryPayload(tableName) : null;
      const hasFields = !!(
        payload && (
          (Array.isArray(payload.display_fields) && payload.display_fields.length > 0) ||
          (Array.isArray(payload.special_fields) && payload.special_fields.length > 0)
        )
      );

      let validationError = null;
      runBtn.disabled = !hasFields || getLifecycleState().queryRunning;

      updateRunButtonIcon(validationError);
    } catch (_) {
      runBtn.disabled = true;
      updateRunButtonIcon();
    }
  }

  if (downloadBtn) {
    const hasData =
      getDisplayedFields().length > 0 &&
      Array.isArray(services.getVirtualTableData()?.rows) &&
      services.getVirtualTableData().rows.length > 0;
    const missingLoadedColumns = getDisplayedFieldsMissingFromLoadedData();
    const hasMissingLoadedColumns = missingLoadedColumns.length > 0;

    if (tableNameInput) {
      tableNameInput.classList.remove('error');
    }

    downloadBtn.disabled = !hasData || hasMissingLoadedColumns;

    if (!hasData) {
      downloadBtn.setAttribute('data-tooltip', 'Add columns to download');
    } else if (hasMissingLoadedColumns) {
      downloadBtn.setAttribute(
        'data-tooltip',
        missingLoadedColumns.length === 1
          ? `${missingLoadedColumns[0]} is not in the current data. Run a new query before downloading.`
          : 'Some displayed columns are not in the current data. Run a new query before downloading.'
      );
    } else {
      downloadBtn.setAttribute('data-tooltip', 'Download Excel file');
    }
  }

  if (postFilterBtn) {
    const postFilterStats = services.getPostFilterStats();
    const hasLoadedResults =
      getDisplayedFields().length > 0 &&
      Number(postFilterStats?.totalRows || 0) > 0;
    const hasPostFilters = services.hasPostFilters();

    postFilterBtn.disabled = !hasLoadedResults;
    postFilterBtn.classList.toggle('table-toolbar-btn-active', hasPostFilters);

    if (!hasLoadedResults) {
      postFilterBtn.setAttribute('data-tooltip', 'Run a query to use post filters');
    } else if (hasPostFilters) {
      postFilterBtn.setAttribute('data-tooltip', 'Edit active post filters');
    } else {
      postFilterBtn.setAttribute('data-tooltip', 'Post Filters');
    }
  }

  if (clearQueryBtn) {
    let payload = null;
    try {
      payload = window.buildBackendQueryPayload ? window.buildBackendQueryPayload(tableName) : null;
    } catch (_) {
      payload = null;
    }

    const hasTableName = !!(tableNameInput && tableNameInput.value.trim());
    const hasQueryText = !!(window.DOM.queryInput && window.DOM.queryInput.value.trim());
    const hasFields = getDisplayedFields().length > 0;
    const hasFilters = Object.values(getActiveFilters()).some(data => data && Array.isArray(data.filters) && data.filters.length > 0);
    const hasConfiguredPayload = !!(
      payload && (
        (Array.isArray(payload.display_fields) && payload.display_fields.length > 0) ||
        (Array.isArray(payload.special_fields) && payload.special_fields.length > 0) ||
        (Array.isArray(payload.filters) && payload.filters.length > 0)
      )
    );
    const hasData = !!(
      Array.isArray(services.getVirtualTableData()?.rows) &&
      services.getVirtualTableData().rows.length > 0
    );
    const canClear = hasTableName || hasQueryText || hasFields || hasFilters || hasConfiguredPayload || hasData;

    const isQueryRunning = getLifecycleState().queryRunning;
    clearQueryBtn.disabled = isQueryRunning || !canClear;
    clearQueryBtn.classList.toggle('opacity-50', clearQueryBtn.disabled);
    clearQueryBtn.classList.toggle('cursor-not-allowed', clearQueryBtn.disabled);
    clearQueryBtn.setAttribute('data-tooltip', isQueryRunning ? 'Stop the running query before clearing' : (clearQueryBtn.disabled ? 'Nothing to clear' : 'Clear current query'));
  }

  if (typeof window.updateSplitColumnsToggleState === 'function') {
    window.updateSplitColumnsToggleState();
  }

  updateTableResultsLip();

  if (window.PostFilterSystem && typeof window.PostFilterSystem.syncToolbarButton === 'function') {
    window.PostFilterSystem.syncToolbarButton();
  }
}

function setUpdateButtonStatesImpl(nextImpl) {
  updateButtonStatesImpl = typeof nextImpl === 'function' ? nextImpl : baseUpdateButtonStates;
}

function getBaseUpdateButtonStates() {
  return baseUpdateButtonStates;
}

// Keep button states in sync with all query-state changes, including lifecycle-only
// transitions like running/partial/results that do not change fields or filters.
window.QueryStateSubscriptions.subscribe(() => {
  updateButtonStates();
});

setUpdateButtonStatesImpl(baseUpdateButtonStates);

const queryUi = {
  initialize: initializeQueryUi,
  updateTableResultsLip,
  getDefaultTableName,
  ensureTableName,
  getTableZoom,
  refreshTableViewport,
  updateTableChromeState,
  setTableZoom,
  toggleTableExpanded,
  getDisplayedFieldsMissingFromLoadedData,
  hasDisplayedFieldsMissingFromLoadedData,
  updateRunButtonIcon,
  updateButtonStates,
  setUpdateButtonStatesImpl,
  getBaseUpdateButtonStates
};

window.getDefaultTableName = getDefaultTableName;
window.ensureTableName = ensureTableName;
window.getTableZoom = getTableZoom;
window.refreshTableViewport = refreshTableViewport;
window.updateTableChromeState = updateTableChromeState;
window.setTableZoom = setTableZoom;
window.toggleTableExpanded = toggleTableExpanded;

window.QueryUI = Object.freeze(queryUi);
