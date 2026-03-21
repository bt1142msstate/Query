/**
 * Thin service facade over major subsystem globals.
 * Keeps consumers from coupling directly to implementation-specific globals.
 */
(function initializeAppServices() {
  const appState = window.AppState;

  function getBubbleService() {
    return window.BubbleSystem || null;
  }

  function getTableService() {
    return window.VirtualTable || null;
  }

  function getDragDropService() {
    return window.DragDropSystem || null;
  }

  function getModalService() {
    return window.ModalSystem || null;
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
    modal?.closeAllModals?.();
    modal?.closeAllPanels?.();
  }

  function lockModalInput(duration = 600) {
    getModalService()?.lockInput?.(duration);
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

  function setupVirtualTable(container, fields) {
    return getTableService()?.setupVirtualTable?.(container, fields);
  }

  function measureTableRowHeight(tableElement, fields) {
    getTableService()?.measureRowHeight?.(tableElement, fields);
  }

  function renderVirtualTable() {
    getTableService()?.renderVirtualTable?.();
  }

  function calculateOptimalColumnWidths() {
    getTableService()?.calculateOptimalColumnWidths?.();
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

  const appServices = Object.freeze({
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
    clearPostFilters,
    getPostFilterStats,
    getPostFilterState,
    getPostFilterFieldOptions,
    replacePostFilters,
    hasPostFilters,
    isSplitColumnsActive,
    setSplitColumnsMode
  });

  Object.defineProperty(window, 'AppServices', {
    configurable: false,
    enumerable: false,
    writable: false,
    value: appServices
  });
})();
