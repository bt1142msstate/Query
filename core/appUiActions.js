/**
 * Thin facade for cross-module UI actions.
 * Keeps callers from reaching directly into exported window functions.
 */
import { appServices } from './appServices.js';
import { DOM } from '../ui/domCache.js';

let appUiActions;

(function initializeAppUiActions() {
  function getServices() {
    return appServices || window.AppServices || null;
  }

  function showExampleTable(fields, options = {}) {
    const showTable = window.QueryTableView?.showExampleTable;
    if (typeof showTable !== 'function') {
      return Promise.resolve();
    }

    return showTable(fields, options);
  }

  function updateCategoryCounts() {
    (window.QueryBuilderShell?.updateCategoryCounts || window.updateCategoryCounts)?.();
  }

  function updateButtonStates() {
    window.QueryUI?.updateButtonStates?.();
  }

  function updateRunButtonIcon(validationError) {
    window.QueryUI?.updateRunButtonIcon?.(validationError);
  }

  function updateQueryJson() {
    window.JsonViewerUI?.updateQueryJson?.();
  }

  function updateTableResultsLip() {
    window.QueryUI?.updateTableResultsLip?.();
  }

  function updateFilterSidePanel() {
    window.FilterSidePanel?.update?.();
  }

  function refreshTableViewport() {
    window.QueryUI?.refreshTableViewport?.();
  }

  function updateTableChromeState() {
    window.QueryUI?.updateTableChromeState?.();
  }

  function prepareForQueryClear(options = {}) {
    const previousSelectedField = String(options.previousSelectedField || '').trim();
    const services = getServices();

    services?.closeAllModals?.();
    services?.clearInsertAffordance?.({ immediate: true });
    services?.resetActiveBubbles?.();
    services?.resetBubbleEditorUi?.({
      clearPanelContent: true,
      clearConditionListSelection: !previousSelectedField
    });

    if (window.PostFilterSystem?.close) {
      window.PostFilterSystem.close();
    }

    services?.clearPostFilters?.({ refreshView: false, notify: true, resetScroll: false });

    if (services?.isSplitColumnsActive?.()) {
      services.setSplitColumnsMode(false);
    }

    if (typeof window.resetSplitColumnsToggleUI === 'function') {
      window.resetSplitColumnsToggleUI();
    }
  }

  function finalizeQueryClear(options = {}) {
    const previousSelectedField = String(options.previousSelectedField || '').trim();
    const services = getServices();
    const dom = DOM;

    if (previousSelectedField && typeof window.renderConditionList === 'function') {
      window.renderConditionList(previousSelectedField);
    } else {
      document.getElementById('bubble-cond-list')?.replaceChildren();
    }

    if (dom?.tableNameInput) {
      dom.tableNameInput.value = '';
      dom.tableNameInput.classList.remove('error');
      dom.tableNameInput.dispatchEvent(new Event('input', { bubbles: true }));
    }

    if (dom?.queryInput) {
      dom.queryInput.value = '';
      dom.queryInput.dispatchEvent(new Event('input', { bubbles: true }));
    }

    if (dom?.clearSearchBtn) {
      dom.clearSearchBtn.classList.add('hidden');
    }

    services?.resetBubbleScroll?.();
    updateButtonStates();
  }

  appUiActions = Object.freeze({
    showExampleTable,
    updateCategoryCounts,
    updateButtonStates,
    updateRunButtonIcon,
    updateQueryJson,
    updateTableResultsLip,
    updateFilterSidePanel,
    refreshTableViewport,
    updateTableChromeState,
    prepareForQueryClear,
    finalizeQueryClear
  });

  Object.defineProperty(window, 'AppUiActions', {
    configurable: false,
    enumerable: false,
    writable: false,
    value: appUiActions
  });
})();

export { appUiActions };
