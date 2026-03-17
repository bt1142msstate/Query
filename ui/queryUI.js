/**
 * Query UI Management
 * Handles shared DOM lookups plus run/download button state.
 * @module QueryUI
 */

window.DOM = {
  get overlay() { return this._overlay ||= document.getElementById('overlay'); },
  get conditionPanel() { return this._conditionPanel ||= document.getElementById('condition-panel'); },
  get inputWrapper() { return this._inputWrapper ||= document.getElementById('condition-input-wrapper'); },
  get conditionInput() { return this._conditionInput ||= document.getElementById('condition-input'); },
  get conditionInput2() { return this._conditionInput2 ||= document.getElementById('condition-input-2'); },
  get betweenLabel() { return this._betweenLabel ||= document.getElementById('between-label'); },
  get confirmBtn() { return this._confirmBtn ||= document.getElementById('confirm-btn'); },
  get runBtn() { return this._runBtn ||= document.getElementById('run-query-btn'); },
  get runIcon() { return this._runIcon ||= document.getElementById('run-icon'); },
  get refreshIcon() { return this._refreshIcon ||= document.getElementById('refresh-icon'); },
  get stopIcon() { return this._stopIcon ||= document.getElementById('stop-icon'); },
  get downloadBtn() { return this._downloadBtn ||= document.getElementById('download-btn'); },
  get clearQueryBtn() { return this._clearQueryBtn ||= document.getElementById('clear-query-btn'); },
  get queryBox() { return this._queryBox ||= document.getElementById('query-json'); },
  get queryInput() { return this._queryInput ||= document.getElementById('query-input'); },
  get tableShell() { return this._tableShell ||= document.getElementById('table-shell'); },
  get tableContainer() { return this._tableContainer ||= document.getElementById('table-container'); },
  get tableInfoBar() { return this._tableInfoBar ||= document.getElementById('table-info-bar'); },
  get tableToolbar() { return this._tableToolbar ||= document.getElementById('table-toolbar'); },
  get tableNameInput() { return this._tableNameInput ||= document.getElementById('table-name-input'); },
  get tableNameShell() { return this._tableNameShell ||= document.getElementById('table-name-shell'); },
  get tableResultsBadge() { return this._tableResultsBadge ||= document.getElementById('table-results-badge'); },
  get tableResultsCount() { return this._tableResultsCount ||= document.getElementById('table-results-count'); },
  get tableResultsLabel() { return this._tableResultsLabel ||= document.getElementById('table-results-label'); },
  get tableColumnsCount() { return this._tableColumnsCount ||= document.getElementById('table-columns-count'); },
  get tableColumnsLabel() { return this._tableColumnsLabel ||= document.getElementById('table-columns-label'); },
  get tableZoomControls() { return this._tableZoomControls ||= document.getElementById('table-zoom-controls'); },
  get tableZoomOutBtn() { return this._tableZoomOutBtn ||= document.getElementById('table-zoom-out-btn'); },
  get tableZoomInBtn() { return this._tableZoomInBtn ||= document.getElementById('table-zoom-in-btn'); },
  get tableZoomLabel() { return this._tableZoomLabel ||= document.getElementById('table-zoom-label'); },
  get tableExpandBtn() { return this._tableExpandBtn ||= document.getElementById('table-expand-btn'); },
  get clearSearchBtn() { return this._clearSearchBtn ||= document.getElementById('clear-search-btn'); },
  get groupMethodSelect() { return this._groupMethodSelect ||= document.getElementById('group-method-select'); },
  get filterError() { return this._filterError ||= document.getElementById('filter-error'); },
  get headerBar() { return this._headerBar ||= document.getElementById('header-bar'); },
  get categoryBar() { return this._categoryBar ||= document.getElementById('category-bar'); },
  get mobileCategorySelector() { return this._mobileCategorySelector ||= document.getElementById('mobile-category-selector'); }
};

window.updateTableResultsLip = function() {
  const resultsBadge = window.DOM.tableResultsBadge;
  const resultsCount = window.DOM.tableResultsCount;
  const resultsLabel = window.DOM.tableResultsLabel;
  const columnsCount = window.DOM.tableColumnsCount;
  const columnsLabel = window.DOM.tableColumnsLabel;
  const tableNameShell = window.DOM.tableNameShell;

  if (!resultsBadge || !resultsCount || !resultsLabel || !columnsCount || !columnsLabel) {
    return;
  }

  const rowCount = Array.isArray(window.VirtualTable?.virtualTableData?.rows)
    ? window.VirtualTable.virtualTableData.rows.length
    : 0;
  const columnCount = Array.isArray(window.displayedFields)
    ? window.displayedFields.length
    : 0;
  const hasResults = rowCount > 0 || columnCount > 0;

  resultsCount.textContent = rowCount.toLocaleString();
  resultsLabel.textContent = rowCount === 1 ? 'result' : 'results';
  columnsCount.textContent = columnCount.toLocaleString();
  columnsLabel.textContent = columnCount === 1 ? 'column' : 'columns';
  resultsBadge.classList.toggle('hidden', !hasResults);
  resultsBadge.setAttribute('aria-hidden', hasResults ? 'false' : 'true');

  if (tableNameShell) {
    tableNameShell.classList.toggle('has-results', hasResults);
  }
};

window.getDefaultTableName = function(date = new Date()) {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const year = String(date.getFullYear()).slice(-2);
  return `Results ${month}/${day}/${year}`;
};

window.ensureTableName = function() {
  const tableNameInput = window.DOM.tableNameInput;
  if (!tableNameInput) {
    return window.getDefaultTableName();
  }

  const currentName = tableNameInput.value.trim();
  if (currentName) {
    return currentName;
  }

  const generatedName = window.getDefaultTableName();
  tableNameInput.value = generatedName;
  tableNameInput.classList.remove('error');
  tableNameInput.dispatchEvent(new Event('input', { bubbles: true }));
  return generatedName;
};

window.getTableZoom = function() {
  const tableShell = window.DOM.tableShell;
  if (!tableShell) {
    return 1;
  }

  const zoomValue = Number.parseFloat(tableShell.dataset.zoom || '1');
  return Number.isFinite(zoomValue) ? Math.min(1.4, Math.max(0.8, zoomValue)) : 1;
};

window.refreshTableViewport = function() {
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
    if (!table || !window.VirtualTable) {
      return;
    }

    if (typeof window.VirtualTable.measureRowHeight === 'function' && Array.isArray(window.displayedFields) && window.displayedFields.length > 0) {
      window.VirtualTable.measureRowHeight(table, window.displayedFields);
    }

    if (typeof window.VirtualTable.renderVirtualTable === 'function') {
      window.VirtualTable.renderVirtualTable();
    }
  });
};

window.updateTableChromeState = function() {
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
  const zoom = window.getTableZoom();

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
  }
};

window.setTableZoom = function(nextZoom) {
  const tableShell = window.DOM.tableShell;
  if (!tableShell) {
    return;
  }

  const clampedZoom = Math.min(1.4, Math.max(0.8, Number(nextZoom) || 1));
  tableShell.dataset.zoom = clampedZoom.toFixed(2);
  window.updateTableChromeState();
  window.refreshTableViewport();
};

window.toggleTableExpanded = function(forceExpanded) {
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

  window.updateTableChromeState();
  window.refreshTableViewport();
};

window.onDOMReady(() => {
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
      window.toggleTableExpanded();
    });
  }

  if (tableZoomInBtn) {
    tableZoomInBtn.addEventListener('click', () => {
      window.setTableZoom(window.getTableZoom() + 0.1);
    });
  }

  if (tableZoomOutBtn) {
    tableZoomOutBtn.addEventListener('click', () => {
      window.setTableZoom(window.getTableZoom() - 0.1);
    });
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && window.DOM.tableShell?.classList.contains('table-shell-expanded')) {
      window.toggleTableExpanded(false);
    }
  });

  window.addEventListener('resize', () => {
    if (window.DOM.tableShell?.classList.contains('table-shell-expanded')) {
      window.refreshTableViewport();
      return;
    }
  });

  window.updateTableChromeState();
  window.refreshTableViewport();
});

window.updateRunButtonIcon = function(validationError) {
  const runIcon = window.DOM.runIcon;
  const refreshIcon = window.DOM.refreshIcon;
  const stopIcon = window.DOM.stopIcon;
  const runBtn = window.DOM.runBtn;
  const mobileRunQuery = document.getElementById('mobile-run-query');

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

  if (window.queryRunning) {
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

  if (!window.displayedFields || window.displayedFields.length === 0) {
    runIcon.classList.remove('hidden');
    refreshIcon.classList.add('hidden');
    runBtn.disabled = true;
    runBtn.classList.add('opacity-50', 'cursor-not-allowed');
    setRunTooltip('Add columns to enable query', 'Add columns to enable query');
    return;
  }

  runBtn.disabled = false;
  runBtn.classList.remove('opacity-50', 'cursor-not-allowed');

  if (window.hasQueryChanged && window.hasQueryChanged()) {
    runIcon.classList.remove('hidden');
    refreshIcon.classList.add('hidden');
    setRunTooltip('Run Query', 'Run query');
  } else {
    runIcon.classList.add('hidden');
    refreshIcon.classList.remove('hidden');
    setRunTooltip('Refresh Data', 'Refresh data');
  }
};

window.updateButtonStates = function() {
  const runBtn = window.DOM.runBtn;
  const downloadBtn = window.DOM.downloadBtn;
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
      runBtn.disabled = !hasFields || window.queryRunning;

      window.updateRunButtonIcon(validationError);
    } catch (_) {
      runBtn.disabled = true;
      window.updateRunButtonIcon();
    }
  }

  if (downloadBtn) {
    const hasData =
      window.displayedFields &&
      window.displayedFields.length > 0 &&
      window.VirtualTable &&
      window.VirtualTable.virtualTableData &&
      Array.isArray(window.VirtualTable.virtualTableData.rows) &&
      window.VirtualTable.virtualTableData.rows.length > 0;

    if (tableNameInput) {
      tableNameInput.classList.remove('error');
    }

    downloadBtn.disabled = !hasData;

    if (!hasData) {
      downloadBtn.setAttribute('data-tooltip', 'Add columns to download');
    } else {
      downloadBtn.setAttribute('data-tooltip', 'Download Excel file');
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
    const hasFields = Array.isArray(window.displayedFields) && window.displayedFields.length > 0;
    const hasFilters = !!(window.activeFilters && Object.values(window.activeFilters).some(data => data && Array.isArray(data.filters) && data.filters.length > 0));
    const hasConfiguredPayload = !!(
      payload && (
        (Array.isArray(payload.display_fields) && payload.display_fields.length > 0) ||
        (Array.isArray(payload.special_fields) && payload.special_fields.length > 0) ||
        (Array.isArray(payload.filters) && payload.filters.length > 0)
      )
    );
    const hasData = !!(
      window.VirtualTable &&
      window.VirtualTable.virtualTableData &&
      Array.isArray(window.VirtualTable.virtualTableData.rows) &&
      window.VirtualTable.virtualTableData.rows.length > 0
    );
    const canClear = hasTableName || hasQueryText || hasFields || hasFilters || hasConfiguredPayload || hasData;

    clearQueryBtn.disabled = window.queryRunning || !canClear;
    clearQueryBtn.classList.toggle('opacity-50', clearQueryBtn.disabled);
    clearQueryBtn.classList.toggle('cursor-not-allowed', clearQueryBtn.disabled);
    clearQueryBtn.setAttribute('data-tooltip', window.queryRunning ? 'Stop the running query before clearing' : (clearQueryBtn.disabled ? 'Nothing to clear' : 'Clear current query'));
  }

  if (typeof window.updateSplitColumnsToggleState === 'function') {
    window.updateSplitColumnsToggleState();
  }

  if (typeof window.updateTableResultsLip === 'function') {
    window.updateTableResultsLip();
  }
};
