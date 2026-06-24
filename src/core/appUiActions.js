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
  queryTableAnimation: null,
  queryTableView: null,
  duplicateRowsUi: null,
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

  function startTableQueryAnimation() {
    actionDependencies.queryTableAnimation?.startTableQueryAnimation?.();
  }

  function updateTableQueryAnimationProgress(metrics = {}) {
    actionDependencies.queryTableAnimation?.updateTableQueryAnimationProgress?.(metrics);
  }

  function endTableQueryAnimation() {
    actionDependencies.queryTableAnimation?.endTableQueryAnimation?.();
  }

  function updateFilterSidePanel() {
    actionDependencies.filterSidePanel?.update?.();
  }

  function syncFilterSidePanelDisplayOrder(fields) {
    return actionDependencies.filterSidePanel?.syncDisplayListOrder?.(fields) === true;
  }

  function refreshTableViewport() {
    actionDependencies.queryUi?.refreshTableViewport?.();
  }

  function syncTableViewportHeight() {
    actionDependencies.queryUi?.syncTableViewportHeight?.();
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

  function closeMobileFilterPanel() {
    actionDependencies.queryUi?.closeMobileFilterPanel?.();
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

  function updateDuplicateRowsToggleState() {
    actionDependencies.duplicateRowsUi?.updateDuplicateRowsToggleState?.();
  }

  function resetDuplicateRowsToggleUI() {
    actionDependencies.duplicateRowsUi?.resetDuplicateRowsToggleUI?.();
  }

  function setDuplicateRowsToggleUIActive() {
    actionDependencies.duplicateRowsUi?.setDuplicateRowsToggleUIActive?.();
  }

  function prepareForQueryClear(options = {}) {
    const services = getServices();
    void options;

    services?.closeAllModals?.();
    services?.clearInsertAffordance?.({ immediate: true });

    closePostFilters();

    services?.clearPostFilters?.({ refreshView: false, notify: true, resetScroll: false });
  }

  function finalizeQueryClear(options = {}) {
    const dom = DOM;
    void options;

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

    updateButtonStates();
  }

  appUiActions = Object.freeze({
    showExampleTable,
    updateCategoryCounts,
    updateButtonStates,
    updateRunButtonIcon,
    updateQueryJson,
    updateTableResultsLip,
    startTableQueryAnimation,
    updateTableQueryAnimationProgress,
    endTableQueryAnimation,
    updateFilterSidePanel,
    syncFilterSidePanelDisplayOrder,
    refreshTableViewport,
    syncTableViewportHeight,
    updateTableChromeState,
    closeMobileFilterPanel,
    syncPostFilterToolbarButton,
    openPostFilters,
    closePostFilters,
    openPostFilterOverlayForField,
    updateSplitColumnsToggleState,
    resetSplitColumnsToggleUI,
    setSplitColumnsToggleUIActive,
    updateDuplicateRowsToggleState,
    resetDuplicateRowsToggleUI,
    setDuplicateRowsToggleUIActive,
    prepareForQueryClear,
    finalizeQueryClear
  });

  registerQueryStateRuntimeAccessors({ getUiActions: () => appUiActions });
})();

export { appUiActions, registerAppUiActionDependencies };
