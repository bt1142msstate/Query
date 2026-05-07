import { appRuntime } from '../core/appRuntime.js';
/**
 * Drag & Drop compatibility shim.
 * Runtime behavior now lives in dragDropInteractions.js and dragDropColumns.js.
 */
(function initializeDragDropSystem() {
  const interactions = appRuntime.DragDropInteractions;

  if (!interactions) {
    throw new Error('DragDropInteractions must load before dragDrop.js');
  }

  appRuntime.DragDropSystem = Object.freeze({
    dragDropManager: interactions.dragDropManager,
    addDragAndDrop: interactions.addDragAndDrop,
    attachBubbleDropTarget: interactions.attachBubbleDropTarget,
    resetHeaderUi: interactions.resetHeaderUi,
    clearInsertAffordance: interactions.clearInsertAffordance,
    syncHeaderSortActionState: interactions.syncHeaderSortActionState,
    refreshColIndices: interactions.refreshColIndices,
    moveColumn: interactions.moveColumn,
    removeColumn: interactions.removeColumn,
    positionDropAnchor: interactions.positionDropAnchor,
    clearDropAnchor: interactions.clearDropAnchor,
    restoreFieldWithDuplicates: appRuntime.restoreFieldWithDuplicates,
    getDuplicateGroups: appRuntime.getDuplicateGroups
  });
})();
