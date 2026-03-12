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
  get queryBox() { return this._queryBox ||= document.getElementById('query-json'); },
  get queryInput() { return this._queryInput ||= document.getElementById('query-input'); },
  get tableNameInput() { return this._tableNameInput ||= document.getElementById('table-name-input'); },
  get clearSearchBtn() { return this._clearSearchBtn ||= document.getElementById('clear-search-btn'); },
  get groupMethodSelect() { return this._groupMethodSelect ||= document.getElementById('group-method-select'); },
  get filterError() { return this._filterError ||= document.getElementById('filter-error'); },
  get headerBar() { return this._headerBar ||= document.getElementById('header-bar'); },
  get categoryBar() { return this._categoryBar ||= document.getElementById('category-bar'); },
  get mobileCategorySelector() { return this._mobileCategorySelector ||= document.getElementById('mobile-category-selector'); }
};

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
  const tableNameInput = window.DOM.tableNameInput;
  const tableName = tableNameInput ? tableNameInput.value.trim() : '';
  const hasName = tableName !== '';

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
      if (!hasName) {
        validationError = 'Please name your query to run';
        runBtn.disabled = true;
      } else {
        runBtn.disabled = !hasFields || window.queryRunning;
      }

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
      if (!hasName && (hasData || (window.displayedFields && window.displayedFields.length > 0))) {
        tableNameInput.classList.add('error');
      } else {
        tableNameInput.classList.remove('error');
      }
    }

    downloadBtn.disabled = !hasData || !hasName;

    if (!hasData && !hasName) {
      downloadBtn.setAttribute('data-tooltip', 'Add columns and name your table to download');
    } else if (!hasData) {
      downloadBtn.setAttribute('data-tooltip', 'Add columns to download');
    } else if (!hasName) {
      downloadBtn.setAttribute('data-tooltip', 'Name your table to download');
    } else {
      downloadBtn.setAttribute('data-tooltip', 'Download Excel file');
    }
  }
};
