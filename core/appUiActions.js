/**
 * Thin facade for cross-module UI actions.
 * Keeps callers from reaching directly into exported window functions.
 */
import { appServices } from './appServices.js';
import { registerQueryStateRuntimeAccessors } from './queryState.js';
import { DOM } from './domCache.js';
import { updateQueryJson as updateJsonPreview } from '../ui/jsonViewerUI.js';

let appUiActions;
const actionDependencies = {
  filterSidePanel: null,
  postFilterSystem: null,
  queryBuilderShell: null,
  queryTableView: null,
  queryUi: null,
  splitColumnsUi: null
};

function registerAppUiActionDependencies(dependencies = {}) {
  if (!dependencies || typeof dependencies !== 'object') {
    return;
  }

  Object.entries(dependencies).forEach(([key, value]) => {
    if (Object.prototype.hasOwnProperty.call(actionDependencies, key) && value && typeof value === 'object') {
      actionDependencies[key] = value;
    }
  });
}

(function initializeAppUiActions() {
  function getServices() {
    return appServices;
  }

  function showExampleTable(fields, options = {}) {
    const showTable = actionDependencies.queryTableView?.showExampleTable;
    if (typeof showTable !== 'function') {
      return Promise.resolve();
    }

    return showTable(fields, options);
  }

  function updateCategoryCounts() {
    actionDependencies.queryBuilderShell?.updateCategoryCounts?.();
  }

  function updateButtonStates() {
    actionDependencies.queryUi?.updateButtonStates?.();
  }

  function updateRunButtonIcon(validationError) {
    actionDependencies.queryUi?.updateRunButtonIcon?.(validationError);
  }

  function updateQueryJson() {
    updateJsonPreview();
  }

  function updateTableResultsLip() {
    actionDependencies.queryUi?.updateTableResultsLip?.();
  }

  function updateFilterSidePanel() {
    actionDependencies.filterSidePanel?.update?.();
  }

  function refreshTableViewport() {
    actionDependencies.queryUi?.refreshTableViewport?.();
  }

  function updateTableChromeState() {
    actionDependencies.queryUi?.updateTableChromeState?.();
  }

  function syncPostFilterToolbarButton() {
    actionDependencies.postFilterSystem?.syncToolbarButton?.();
  }

  function openPostFilters() {
    actionDependencies.postFilterSystem?.open?.();
  }

  function closePostFilters() {
    actionDependencies.postFilterSystem?.close?.();
  }

  function openPostFilterOverlayForField(fieldName) {
    actionDependencies.postFilterSystem?.openOverlayForField?.(fieldName);
  }

  function updateSplitColumnsToggleState() {
    actionDependencies.splitColumnsUi?.updateSplitColumnsToggleState?.();
  }

  function resetSplitColumnsToggleUI() {
    actionDependencies.splitColumnsUi?.resetSplitColumnsToggleUI?.();
  }

  function setSplitColumnsToggleUIActive() {
    actionDependencies.splitColumnsUi?.setSplitColumnsToggleUIActive?.();
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

    closePostFilters();

    services?.clearPostFilters?.({ refreshView: false, notify: true, resetScroll: false });

    if (services?.isSplitColumnsActive?.()) {
      services.setSplitColumnsMode(false);
    }

    resetSplitColumnsToggleUI();
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
    syncPostFilterToolbarButton,
    openPostFilters,
    closePostFilters,
    openPostFilterOverlayForField,
    updateSplitColumnsToggleState,
    resetSplitColumnsToggleUI,
    setSplitColumnsToggleUIActive,
    prepareForQueryClear,
    finalizeQueryClear
  });

  registerQueryStateRuntimeAccessors({ getUiActions: () => appUiActions });
})();

export { appUiActions, registerAppUiActionDependencies };
