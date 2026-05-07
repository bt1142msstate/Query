/**
 * Thin facade for cross-module UI actions.
 * Keeps callers from reaching directly into exported window functions.
 */
import { appServices } from './appServices.js';
import { registerQueryStateRuntimeAccessors } from './queryState.js';
import { DOM } from './domCache.js';
import { appRuntime } from './appRuntime.js';

let appUiActions;

(function initializeAppUiActions() {
  function getServices() {
    return appServices;
  }

  function showExampleTable(fields, options = {}) {
    const showTable = appRuntime.QueryTableView?.showExampleTable;
    if (typeof showTable !== 'function') {
      return Promise.resolve();
    }

    return showTable(fields, options);
  }

  function updateCategoryCounts() {
    (appRuntime.QueryBuilderShell?.updateCategoryCounts || appRuntime.updateCategoryCounts)?.();
  }

  function updateButtonStates() {
    appRuntime.QueryUI?.updateButtonStates?.();
  }

  function updateRunButtonIcon(validationError) {
    appRuntime.QueryUI?.updateRunButtonIcon?.(validationError);
  }

  function updateQueryJson() {
    appRuntime.JsonViewerUI?.updateQueryJson?.();
  }

  function updateTableResultsLip() {
    appRuntime.QueryUI?.updateTableResultsLip?.();
  }

  function updateFilterSidePanel() {
    appRuntime.FilterSidePanel?.update?.();
  }

  function refreshTableViewport() {
    appRuntime.QueryUI?.refreshTableViewport?.();
  }

  function updateTableChromeState() {
    appRuntime.QueryUI?.updateTableChromeState?.();
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

    if (appRuntime.PostFilterSystem?.close) {
      appRuntime.PostFilterSystem.close();
    }

    services?.clearPostFilters?.({ refreshView: false, notify: true, resetScroll: false });

    if (services?.isSplitColumnsActive?.()) {
      services.setSplitColumnsMode(false);
    }

    if (typeof appRuntime.resetSplitColumnsToggleUI === 'function') {
      appRuntime.resetSplitColumnsToggleUI();
    }
  }

  function finalizeQueryClear(options = {}) {
    const previousSelectedField = String(options.previousSelectedField || '').trim();
    const services = getServices();
    const dom = DOM;

    if (previousSelectedField) {
      services.renderConditionList(previousSelectedField);
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

  Object.defineProperty(appRuntime, 'AppUiActions', {
    configurable: false,
    enumerable: false,
    writable: false,
    value: appUiActions
  });
  registerQueryStateRuntimeAccessors({ getUiActions: () => appUiActions });
})();

export { appUiActions };
