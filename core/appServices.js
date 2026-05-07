/**
 * Thin service facade over major subsystem globals.
 * Keeps consumers from coupling directly to implementation-specific globals.
 */
import { AppState, registerQueryStateRuntimeAccessors } from './queryState.js';
import { appRuntime } from './appRuntime.js';

let appServices;
let filterService = null;
let formModeService = null;
let modalService = null;
let queryExecutionService = null;
let queryHistoryService = null;
let queryTemplatesService = null;

function registerFilterService(service) {
  filterService = service && typeof service === 'object' ? service : null;
}

function registerFormModeService(service) {
  formModeService = service && typeof service === 'object' ? service : null;
}

function registerModalService(service) {
  modalService = service && typeof service === 'object' ? service : null;
}

function registerQueryExecutionService(service) {
  queryExecutionService = service && typeof service === 'object' ? service : null;
}

function registerQueryHistoryService(service) {
  queryHistoryService = service && typeof service === 'object' ? service : null;
}

function registerQueryTemplatesService(service) {
  queryTemplatesService = service && typeof service === 'object' ? service : null;
}

(function initializeAppServices() {
  const appState = AppState;

  function getBubbleService() {
    return appRuntime.BubbleSystem || null;
  }

  function getTableService() {
    return appRuntime.VirtualTable || null;
  }

  function getDragDropService() {
    return appRuntime.DragDropSystem || null;
  }

  function getModalService() {
    return modalService;
  }

  function getQueryHistoryService() {
    return queryHistoryService;
  }

  function rerenderBubbles() {
    const bubble = getBubbleService();
    bubble?.safeRenderBubbles?.();
  }

  function renderBubbles() {
    getBubbleService()?.renderBubbles?.();
  }

  function applyBubbleStyling(target) {
    getBubbleService()?.applyCorrectBubbleStyling?.(target);
  }

  function initializeBubbles() {
    getBubbleService()?.initializeBubbles?.();
  }

  function resetActiveBubbles() {
    getBubbleService()?.resetActiveBubbles?.();
  }

  function resetBubbleEditorUi(options = {}) {
    getBubbleService()?.resetEditorUi?.(options);
  }

  function updateBubbleScrollBar() {
    getBubbleService()?.updateScrollBar?.();
  }

  function getBubbleFilterCardElement() {
    return getBubbleService()?.getFilterCardElement?.() || null;
  }

  function getBubbleOverlayElement() {
    return getBubbleService()?.getOverlayElement?.() || null;
  }

  function getBubbleConditionPanelElement() {
    return getBubbleService()?.getConditionPanelElement?.() || null;
  }

  function getBubbleInputWrapperElement() {
    return getBubbleService()?.getInputWrapperElement?.() || null;
  }

  function getBubbleFilterCardTitleElement(filterCard) {
    return getBubbleService()?.getFilterCardTitleElement?.(filterCard) || null;
  }

  function prepareBubbleFilterCardForOpen(filterCard) {
    return getBubbleService()?.prepareFilterCardForOpen?.(filterCard) || null;
  }

  function markBubbleFilterCardOpen(filterCard, options = {}) {
    return getBubbleService()?.markFilterCardOpen?.(filterCard, options) || null;
  }

  function buildBubbleConditionPanel(bubble) {
    return getBubbleService()?.buildConditionPanel?.(bubble);
  }

  function bubbleDebugLog(eventName, payload = {}) {
    getBubbleService()?.bubbleDebugLog?.(eventName, payload);
  }

  function getBubbleMaxStartRow() {
    return Number(getBubbleService()?.getBubbleMaxStartRow?.() || 0);
  }

  function applyBubbleScrollRow(nextRow, options = {}) {
    return Number(getBubbleService()?.applyBubbleScrollRow?.(nextRow, options) || 0);
  }

  function resetBubbleScroll() {
    const bubble = getBubbleService();
    if (bubble?.resetBubbleScroll) {
      bubble.resetBubbleScroll();
      return;
    }

    appState.scrollRow = 0;
  }

  function scrollBubblesByRows(deltaRows) {
    const bubble = getBubbleService();
    if (!bubble?.scrollBubblesByRows) {
      return false;
    }

    return Boolean(bubble.scrollBubblesByRows(deltaRows));
  }

  function closeAllModals() {
    const modal = getModalService();
    if (typeof modal?.closeAllModals === 'function') {
      modal.closeAllModals();
      return;
    }
    modal?.closeAllPanels?.();
  }

  function lockModalInput(duration = 600) {
    getModalService()?.lockInput?.(duration);
  }

  function isModalInputLocked() {
    return Boolean(getModalService()?.isInputLocked?.());
  }

  function openModalPanel(panelId) {
    getModalService()?.openPanel?.(panelId);
  }

  function closeModalPanel(panelId) {
    getModalService()?.closePanel?.(panelId);
  }

  function addHistoryQuery(query) {
    return getQueryHistoryService()?.addQuery?.(query) || null;
  }

  function updateHistoryQuery(queryId, updates, options = {}) {
    return getQueryHistoryService()?.updateQuery?.(queryId, updates, options) || null;
  }

  function getHistoryQueryById(queryId) {
    return getQueryHistoryService()?.getQueryById?.(queryId) || null;
  }

  function renderHistoryQueries() {
    return getQueryHistoryService()?.renderQueries?.();
  }

  function startHistoryDurationUpdates() {
    return getQueryHistoryService()?.startQueryDurationUpdates?.();
  }

  function stopHistoryDurationUpdates() {
    return getQueryHistoryService()?.stopQueryDurationUpdates?.();
  }

  function fetchHistoryQueryStatus() {
    return getQueryHistoryService()?.fetchQueryStatus?.();
  }

  function closeHistoryDetailsOverlay() {
    getQueryHistoryService()?.closeDetailsOverlay?.();
  }

  function cancelHistoryQuery(queryId) {
    return getQueryHistoryService()?.cancelQuery?.(queryId);
  }

  function applyHistoryQueryConfig(config) {
    return getQueryHistoryService()?.applyQueryConfig?.(config);
  }

  function attachBubbleDropTarget(target) {
    getDragDropService()?.attachBubbleDropTarget?.(target);
  }

  function restoreFieldWithDuplicates(fieldName, insertAt) {
    return getDragDropService()?.restoreFieldWithDuplicates?.(fieldName, insertAt) || false;
  }

  function addDragAndDrop(table) {
    getDragDropService()?.addDragAndDrop?.(table);
  }

  function resetDragDropHeaderUi() {
    getDragDropService()?.resetHeaderUi?.();
  }

  function syncHeaderSortActionState() {
    getDragDropService()?.syncHeaderSortActionState?.();
  }

  function markDropSuccessful() {
    const dragDrop = getDragDropService();
    if (dragDrop?.dragDropManager) {
      dragDrop.dragDropManager.dropSuccessful = true;
    }
  }

  function clearInsertAffordance(options = {}) {
    getDragDropService()?.clearInsertAffordance?.(options);
  }

  function cleanupDragDropTableListeners(table) {
    getDragDropService()?.dragDropManager?.cleanupTableListeners?.(table);
  }

  function getSimpleTable() {
    return getTableService()?.simpleTableInstance || null;
  }

  function getVirtualTableData() {
    return getTableService()?.virtualTableData || null;
  }

  function getRawTableData() {
    return getTableService()?.rawTableData || null;
  }

  function getVirtualTableRows() {
    return getTableService()?.virtualTableData?.rows || [];
  }

  function getBaseViewColumnMap() {
    return getTableService()?.baseViewData?.columnMap || null;
  }

  function setVirtualTableData(data) {
    const table = getTableService();
    if (!table) {
      return false;
    }

    table.virtualTableData = data;
    return true;
  }

  function setupVirtualTable(container, fields, options = {}) {
    return getTableService()?.setupVirtualTable?.(container, fields, options);
  }

  function measureTableRowHeight(tableElement, fields) {
    getTableService()?.measureRowHeight?.(tableElement, fields);
  }

  function renderVirtualTable() {
    getTableService()?.renderVirtualTable?.();
  }

  function calculateOptimalColumnWidths(fields, data) {
    return getTableService()?.calculateOptimalColumnWidths?.(fields, data);
  }

  function getCalculatedColumnWidth(fieldName) {
    return getTableService()?.calculatedColumnWidths?.[fieldName];
  }

  function sortTableBy(fieldName) {
    getTableService()?.sortTableBy?.(fieldName);
  }

  function getVirtualTableState() {
    return getTableService()?.getVirtualTableState?.() || null;
  }

  function clearVirtualTableData() {
    getTableService()?.clearVirtualTableData?.();
  }

  function setManualColumnWidth(fieldName, width) {
    return getTableService()?.setManualColumnWidth?.(fieldName, width);
  }

  function activateColumnResizeMode(fieldName) {
    return Boolean(getTableService()?.activateColumnResizeMode?.(fieldName));
  }

  function clearColumnResizeMode() {
    getTableService()?.clearColumnResizeMode?.();
  }

  function getColumnResizeState() {
    return getTableService()?.getColumnResizeState?.() || { active: false, fieldName: '' };
  }

  function syncColumnResizeModeUi() {
    getTableService()?.syncResizeModeUi?.();
  }

  function clearPostFilters(options = {}) {
    getTableService()?.clearPostFilters?.(options);
  }

  function getPostFilterStats() {
    return getTableService()?.getPostFilterStats?.() || null;
  }

  function getPostFilterState() {
    return getTableService()?.getPostFilterState?.() || {};
  }

  function getPostFilterFieldOptions(fieldName) {
    return getTableService()?.getPostFilterFieldOptions?.(fieldName) || [];
  }

  function replacePostFilters(snapshot, options = {}) {
    getTableService()?.replacePostFilters?.(snapshot, options);
  }

  function hasPostFilters() {
    return Boolean(getTableService()?.hasPostFilters?.());
  }

  function isSplitColumnsActive() {
    return Boolean(getTableService()?.splitColumnsActive);
  }

  function setSplitColumnsMode(nextValue) {
    getTableService()?.setSplitColumnsMode?.(nextValue);
  }

  function renderConditionList(fieldName) {
    filterService?.renderConditionList?.(fieldName);
  }

  function clearCurrentQuery(options = {}) {
    return queryExecutionService?.clearCurrentQuery?.(options);
  }

  function isFormModeActive() {
    return Boolean(formModeService?.isActive?.());
  }

  function isFormModeLimitedView() {
    return Boolean(formModeService?.isLimitedView?.());
  }

  function syncFormModeFromCurrentQuery() {
    return formModeService?.syncFromCurrentQuery?.();
  }

  function openQueryTemplatesPanel() {
    queryTemplatesService?.openPanel?.();
  }

  function closeQueryTemplatesPanel() {
    queryTemplatesService?.closePanel?.();
  }

  function refreshQueryTemplates(options = {}) {
    queryTemplatesService?.refreshTemplates?.(options);
  }

  appServices = Object.freeze({
    get bubble() {
      return getBubbleService();
    },
    get table() {
      return getTableService();
    },
    get dragDrop() {
      return getDragDropService();
    },
    get modal() {
      return getModalService();
    },
    rerenderBubbles,
    renderBubbles,
    applyBubbleStyling,
    initializeBubbles,
    resetActiveBubbles,
    resetBubbleEditorUi,
    resetBubbleScroll,
    scrollBubblesByRows,
    updateBubbleScrollBar,
    getBubbleFilterCardElement,
    getBubbleOverlayElement,
    getBubbleConditionPanelElement,
    getBubbleInputWrapperElement,
    getBubbleFilterCardTitleElement,
    prepareBubbleFilterCardForOpen,
    markBubbleFilterCardOpen,
    buildBubbleConditionPanel,
    bubbleDebugLog,
    getBubbleMaxStartRow,
    applyBubbleScrollRow,
    closeAllModals,
    lockModalInput,
    isModalInputLocked,
    openModalPanel,
    closeModalPanel,
    addHistoryQuery,
    updateHistoryQuery,
    getHistoryQueryById,
    renderHistoryQueries,
    startHistoryDurationUpdates,
    stopHistoryDurationUpdates,
    fetchHistoryQueryStatus,
    closeHistoryDetailsOverlay,
    cancelHistoryQuery,
    applyHistoryQueryConfig,
    attachBubbleDropTarget,
    restoreFieldWithDuplicates,
    addDragAndDrop,
    resetDragDropHeaderUi,
    syncHeaderSortActionState,
    markDropSuccessful,
    clearInsertAffordance,
    cleanupDragDropTableListeners,
    getSimpleTable,
    getVirtualTableData,
    getRawTableData,
    getVirtualTableRows,
    getBaseViewColumnMap,
    setVirtualTableData,
    setupVirtualTable,
    measureTableRowHeight,
    renderVirtualTable,
    calculateOptimalColumnWidths,
    getCalculatedColumnWidth,
    sortTableBy,
    getVirtualTableState,
    clearVirtualTableData,
    setManualColumnWidth,
    activateColumnResizeMode,
    clearColumnResizeMode,
    getColumnResizeState,
    syncColumnResizeModeUi,
    clearPostFilters,
    getPostFilterStats,
    getPostFilterState,
    getPostFilterFieldOptions,
    replacePostFilters,
    hasPostFilters,
    isSplitColumnsActive,
    setSplitColumnsMode,
    renderConditionList,
    clearCurrentQuery,
    isFormModeActive,
    isFormModeLimitedView,
    syncFormModeFromCurrentQuery,
    openQueryTemplatesPanel,
    closeQueryTemplatesPanel,
    refreshQueryTemplates
  });

  registerQueryStateRuntimeAccessors({ getServices: () => appServices });
})();

export {
  appServices,
  registerFilterService,
  registerFormModeService,
  registerModalService,
  registerQueryExecutionService,
  registerQueryHistoryService,
  registerQueryTemplatesService
};
