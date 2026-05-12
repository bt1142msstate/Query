/**
 * Table and run-state UI management.
 * Shared DOM caching lives in core/domCache.js.
 * @module QueryUI
 */

import { QueryStateSubscriptions } from '../core/queryStateSubscriptions.js';
import { QueryStateReaders } from '../core/queryState.js';
import { appServices } from '../core/appServices.js';
import { appUiActions, registerAppUiActionDependencies } from '../core/appUiActions.js';
import { buildBackendQueryPayload } from '../filters/queryPayload.js';
import { DOM } from '../core/domCache.js';

const getDisplayedFields = QueryStateReaders.getDisplayedFields.bind(QueryStateReaders);
const getActiveFilters = QueryStateReaders.getActiveFilters.bind(QueryStateReaders);
const getLifecycleState = QueryStateReaders.getLifecycleState.bind(QueryStateReaders);
const getQueryStatus = QueryStateReaders.getQueryStatus.bind(QueryStateReaders);
const services = appServices;
let queryUiInitialized = false;
let updateButtonStatesImpl = null;
const MOBILE_TABLE_ACTION_SELECTOR = '.mobile-table-action';
const MOBILE_FILTER_PANEL_CLASS = 'mobile-filter-panel-open';

function getMobileBuilderDrawer() {
  return document.getElementById('mobile-builder-drawer');
}

function getMobileBuilderToggle() {
  return document.getElementById('mobile-builder-toggle');
}

function getMobileBuilderSummary() {
  return document.getElementById('mobile-builder-summary');
}

function getMobileFilterPanelCloseButton() {
  return document.getElementById('filter-panel-mobile-close');
}

function isMobileTableViewport() {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(max-width: 640px)').matches;
}

function getConfiguredFilterCount() {
  return Object.values(getActiveFilters()).reduce((total, data) => {
    return total + (data && Array.isArray(data.filters) ? data.filters.length : 0);
  }, 0);
}

function hasDisplayOrFilterPanelContent() {
  return getDisplayedFields().length > 0 || getConfiguredFilterCount() > 0;
}

function syncMobileBuilderDrawer() {
  const drawer = getMobileBuilderDrawer();
  const toggle = getMobileBuilderToggle();
  const summary = getMobileBuilderSummary();

  if (!drawer || !toggle) {
    return;
  }

  const fieldCount = getDisplayedFields().length;
  const filterCount = getConfiguredFilterCount();
  const rowCount = Array.isArray(services.getVirtualTableData()?.rows)
    ? services.getVirtualTableData().rows.length
    : 0;
  const hasTableSurface = fieldCount > 0 || rowCount > 0;

  drawer.classList.toggle('is-active', hasTableSurface);
  if (!hasTableSurface || !isMobileTableViewport()) {
    drawer.classList.remove('is-open');
  }

  toggle.setAttribute('aria-expanded', drawer.classList.contains('is-open') ? 'true' : 'false');

  if (summary) {
    const fieldsLabel = `${fieldCount} ${fieldCount === 1 ? 'field' : 'fields'}`;
    const filtersLabel = filterCount > 0
      ? `, ${filterCount} ${filterCount === 1 ? 'filter' : 'filters'}`
      : '';
    summary.textContent = hasTableSurface ? `${fieldsLabel}${filtersLabel}` : 'Edit fields and filters';
  }
}

function closeMobileFilterPanel() {
  document.body.classList.remove(MOBILE_FILTER_PANEL_CLASS);
  DOM.filterSidePanel?.classList.remove(MOBILE_FILTER_PANEL_CLASS);
  syncMobileTableActions();
}

function openMobileFilterPanel() {
  if (!hasDisplayOrFilterPanelContent()) {
    closeMobileFilterPanel();
    return;
  }

  appUiActions.updateFilterSidePanel();
  DOM.filterSidePanel?.classList.remove('panel-hidden');
  DOM.filterSidePanel?.classList.add(MOBILE_FILTER_PANEL_CLASS);
  document.body.classList.add(MOBILE_FILTER_PANEL_CLASS);
  getMobileFilterPanelCloseButton()?.focus({ preventScroll: true });
  syncMobileTableActions();
}

function toggleMobileFilterPanel() {
  if (document.body.classList.contains(MOBILE_FILTER_PANEL_CLASS)) {
    closeMobileFilterPanel();
    return;
  }

  openMobileFilterPanel();
}

function syncMobileFilterPanel() {
  if (!isMobileTableViewport() || !hasDisplayOrFilterPanelContent()) {
    closeMobileFilterPanel();
  }
}

function getMobileActionLabelText({ action, sourceId, source }) {
  if (action === 'fields-panel') {
    return 'Fields';
  }

  if (sourceId === 'run-query-btn') {
    const sourceLabel = source?.getAttribute('aria-label') || '';
    if (/stop/iu.test(sourceLabel)) return 'Stop';
    if (/refresh/iu.test(sourceLabel)) return 'Refresh';
    return 'Run';
  }

  if (sourceId === 'table-add-field-btn') return 'Add';
  if (sourceId === 'post-filter-btn') return 'Filters';
  if (sourceId === 'download-btn') return 'Export';
  if (sourceId === 'clear-query-btn') return 'Clear';
  if (sourceId === 'table-expand-btn') {
    return source?.dataset.state === 'expanded' ? 'Collapse' : 'Expand';
  }

  return source?.getAttribute('data-mobile-label')
    || source?.getAttribute('aria-label')
    || source?.getAttribute('data-tooltip')
    || 'Action';
}

function syncMobileTableActions() {
  document.querySelectorAll(MOBILE_TABLE_ACTION_SELECTOR).forEach(button => {
    const action = button.getAttribute('data-mobile-table-action');
    const sourceId = button.getAttribute('data-mobile-table-action-target');
    const source = sourceId ? document.getElementById(sourceId) : null;
    const isFilterPanelAction = action === 'fields-panel';
    const disabled = isFilterPanelAction
      ? !hasDisplayOrFilterPanelContent()
      : (!source || source.disabled || source.getAttribute('aria-disabled') === 'true');
    const label = isFilterPanelAction
      ? 'Display fields and filters'
      : source?.getAttribute('aria-label')
      || source?.getAttribute('data-tooltip')
      || button.getAttribute('data-default-label')
      || 'Table action';
    const visibleLabel = getMobileActionLabelText({ action, sourceId, source });
    const isActive = isFilterPanelAction
      ? document.body.classList.contains(MOBILE_FILTER_PANEL_CLASS)
      : Boolean(
        source?.classList.contains('table-toolbar-btn-active')
        || (sourceId === 'table-expand-btn' && source?.dataset.state === 'expanded')
      );

    button.disabled = disabled;
    button.setAttribute('aria-disabled', disabled ? 'true' : 'false');
    button.setAttribute('aria-label', label);
    button.setAttribute('data-tooltip', label);
    button.classList.toggle('is-active', isActive);

    if (isFilterPanelAction) {
      button.setAttribute('aria-expanded', document.body.classList.contains(MOBILE_FILTER_PANEL_CLASS) ? 'true' : 'false');
    }

    const labelEl = button.querySelector('.mobile-table-action-label');
    if (labelEl) {
      labelEl.textContent = visibleLabel;
    }
  });
}

function initializeMobileBuilderDrawer() {
  const toggle = getMobileBuilderToggle();
  const drawer = getMobileBuilderDrawer();

  if (!toggle || !drawer || toggle.dataset.bound === 'true') {
    return;
  }

  toggle.addEventListener('click', () => {
    drawer.classList.toggle('is-open');
    syncMobileBuilderDrawer();
  });
  toggle.dataset.bound = 'true';
}

function initializeMobileTableActionBar() {
  const actionBar = document.getElementById('mobile-table-action-bar');
  if (!actionBar || actionBar.dataset.bound === 'true') {
    return;
  }

  actionBar.addEventListener('click', event => {
    const button = event.target.closest(MOBILE_TABLE_ACTION_SELECTOR);
    if (!button || button.disabled) {
      return;
    }

    const action = button.getAttribute('data-mobile-table-action');
    if (action === 'fields-panel') {
      toggleMobileFilterPanel();
      return;
    }

    const sourceId = button.getAttribute('data-mobile-table-action-target');
    const source = sourceId ? document.getElementById(sourceId) : null;
    if (!source || source.disabled || source.getAttribute('aria-disabled') === 'true') {
      syncMobileTableActions();
      return;
    }

    source.click();
    syncMobileTableActions();
  });
  actionBar.dataset.bound = 'true';
}

function initializeMobileFilterPanelControls() {
  const closeButton = getMobileFilterPanelCloseButton();
  if (!closeButton || closeButton.dataset.bound === 'true') {
    return;
  }

  closeButton.addEventListener('click', () => {
    closeMobileFilterPanel();
  });
  closeButton.dataset.bound = 'true';
}

function updateTableResultsLip() {
  const resultsBadge = DOM.tableResultsBadge;
  const resultsCount = DOM.tableResultsCount;
  const resultsLabel = DOM.tableResultsLabel;
  const columnsCount = DOM.tableColumnsCount;
  const columnsLabel = DOM.tableColumnsLabel;
  const tableNameShell = DOM.tableNameShell;

  if (!resultsBadge || !resultsCount || !resultsLabel || !columnsCount || !columnsLabel) {
    return;
  }

  const tableData = services.getVirtualTableData();
  const rowCount = Array.isArray(tableData?.rows)
    ? tableData.rows.length
    : 0;
  const postFilterStats = services.getPostFilterStats?.() || null;
  const hasPostFilters = services.hasPostFilters?.() === true;
  const totalRowCount = Number(postFilterStats?.totalRows || 0);
  const isFilteredResultView = hasPostFilters && totalRowCount > 0 && totalRowCount !== rowCount;
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
  document.body.classList.toggle('has-query-columns', columnCount > 0);

  resultsCount.textContent = isFilteredResultView
    ? `${rowCount.toLocaleString()} of ${totalRowCount.toLocaleString()}`
    : rowCount.toLocaleString();
  resultsLabel.textContent = rowCount === 1 ? 'result' : 'results';
  columnsCount.textContent = columnCount.toLocaleString();
  columnsLabel.textContent = columnCount === 1 ? 'column' : 'columns';
  // Hide the results badge while in planning mode to avoid showing "0 results"
  // alongside the Planning badge — the two are mutually exclusive.
  resultsBadge.classList.toggle('hidden', !hasResults || isPlanningMode);
  resultsBadge.setAttribute('aria-hidden', (hasResults && !isPlanningMode) ? 'false' : 'true');
  if (isFilteredResultView) {
    resultsBadge.setAttribute('data-tooltip', `Showing ${rowCount.toLocaleString()} of ${totalRowCount.toLocaleString()} rows after post filters`);
  } else {
    resultsBadge.removeAttribute('data-tooltip');
  }

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
  const tableNameInput = DOM.tableNameInput;
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
  const tableShell = DOM.tableShell;
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
  const tableShell = DOM.tableShell;
  const tableContainer = DOM.tableContainer;

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
      services.calculateOptimalColumnWidths(displayedFields);
      services.measureTableRowHeight(table, displayedFields);
    }

    services.renderVirtualTable();
  });
}

function updateTableChromeState() {
  const tableShell = DOM.tableShell;
  const tableZoomControls = DOM.tableZoomControls;
  const tableZoomLabel = DOM.tableZoomLabel;
  const tableZoomInBtn = DOM.tableZoomInBtn;
  const tableZoomOutBtn = DOM.tableZoomOutBtn;
  const tableExpandBtn = DOM.tableExpandBtn;

  if (!tableShell) {
    return;
  }

  const expanded = tableShell.classList.contains('table-shell-expanded');
  const isMobileViewport = isMobileTableViewport();
  if (expanded && isMobileViewport && getTableZoom() > 0.9) {
    tableShell.dataset.zoom = '0.90';
    tableShell.dataset.responsiveMobileZoom = 'true';
  } else if (expanded && !isMobileViewport && tableShell.dataset.responsiveMobileZoom === 'true') {
    tableShell.dataset.zoom = '1.00';
    delete tableShell.dataset.responsiveMobileZoom;
  } else if (!expanded) {
    delete tableShell.dataset.responsiveMobileZoom;
  }

  const zoom = getTableZoom();
  const effectiveZoom = !expanded && isMobileViewport ? 0.84 : zoom;

  tableShell.style.setProperty('--table-zoom', effectiveZoom.toFixed(2));

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

  syncMobileTableActions();
}

function setTableZoom(nextZoom) {
  const tableShell = DOM.tableShell;
  if (!tableShell) {
    return;
  }

  const clampedZoom = Math.min(1.4, Math.max(0.8, Number(nextZoom) || 1));
  tableShell.dataset.zoom = clampedZoom.toFixed(2);
  updateTableChromeState();
  refreshTableViewport();
}

function toggleTableExpanded(forceExpanded) {
  const tableShell = DOM.tableShell;
  if (!tableShell) {
    return;
  }

  const expanded = typeof forceExpanded === 'boolean'
    ? forceExpanded
    : !tableShell.classList.contains('table-shell-expanded');

  tableShell.classList.toggle('table-shell-expanded', expanded);
  document.body.classList.toggle('table-expanded-open', expanded);

  if (expanded && isMobileTableViewport() && getTableZoom() > 0.9) {
    tableShell.dataset.zoom = '0.90';
  }

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
  const tableNameInput = DOM.tableNameInput;
  if (!tableNameInput) {
    return;
  }

  const tableShell = DOM.tableShell;
  const tableExpandBtn = DOM.tableExpandBtn;
  const tableZoomInBtn = DOM.tableZoomInBtn;
  const tableZoomOutBtn = DOM.tableZoomOutBtn;
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

  initializeMobileBuilderDrawer();
  initializeMobileTableActionBar();
  initializeMobileFilterPanelControls();

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && document.body.classList.contains(MOBILE_FILTER_PANEL_CLASS)) {
      closeMobileFilterPanel();
    }

    if (event.key === 'Escape' && DOM.tableShell?.classList.contains('table-shell-expanded')) {
      toggleTableExpanded(false);
    }
  });

  window.addEventListener('resize', () => {
    updateTableChromeState();
    syncMobileBuilderDrawer();
    syncMobileFilterPanel();
    syncMobileTableActions();
    refreshTableViewport();
  });

  updateTableChromeState();
  syncMobileBuilderDrawer();
  syncMobileFilterPanel();
  syncMobileTableActions();
  refreshTableViewport();
}

function updateRunButtonIcon(validationError) {
  const runIcon = DOM.runIcon;
  const refreshIcon = DOM.refreshIcon;
  const stopIcon = DOM.stopIcon;
  const runBtn = DOM.runBtn;
  const mobileRunQuery = DOM.mobileRunQuery;

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

  if (QueryStateReaders.hasQueryChanged()) {
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
  const runBtn = DOM.runBtn;
  const downloadBtn = DOM.downloadBtn;
  const postFilterBtn = DOM.postFilterBtn;
  const clearQueryBtn = DOM.clearQueryBtn;
  const tableNameInput = DOM.tableNameInput;
  const tableName = tableNameInput ? tableNameInput.value.trim() : '';

  if (runBtn) {
    try {
      const payload = buildBackendQueryPayload(tableName);
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
      payload = buildBackendQueryPayload(tableName);
    } catch (_) {
      payload = null;
    }

    const hasTableName = !!(tableNameInput && tableNameInput.value.trim());
    const hasQueryText = !!(DOM.queryInput && DOM.queryInput.value.trim());
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

  appUiActions.updateSplitColumnsToggleState();

  updateTableResultsLip();
  syncMobileBuilderDrawer();
  syncMobileFilterPanel();
  appUiActions.syncPostFilterToolbarButton();
  syncMobileTableActions();
}

function setUpdateButtonStatesImpl(nextImpl) {
  updateButtonStatesImpl = typeof nextImpl === 'function' ? nextImpl : baseUpdateButtonStates;
}

function getBaseUpdateButtonStates() {
  return baseUpdateButtonStates;
}

// Keep button states in sync with all query-state changes, including lifecycle-only
// transitions like running/partial/results that do not change fields or filters.
QueryStateSubscriptions.subscribe(() => {
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
  closeMobileFilterPanel,
  setTableZoom,
  toggleTableExpanded,
  getDisplayedFieldsMissingFromLoadedData,
  hasDisplayedFieldsMissingFromLoadedData,
  updateRunButtonIcon,
  updateButtonStates,
  setUpdateButtonStatesImpl,
  getBaseUpdateButtonStates
};

const QueryUI = Object.freeze(queryUi);
registerAppUiActionDependencies({ queryUi: QueryUI });

export {
  QueryUI,
  ensureTableName,
  getDefaultTableName,
  getTableZoom,
  refreshTableViewport,
  setTableZoom,
  toggleTableExpanded,
  closeMobileFilterPanel,
  updateTableChromeState
};
