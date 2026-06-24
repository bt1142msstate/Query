import { getDropAnchorLayout } from '../../../lib/drag-drop/dragDropAnchorLayout.js';
import { getDropIndicatorViewportRect } from '../../../lib/drag-drop/dragDropViewport.js';

function createDropAnchorController({
  document,
  getActiveDragGroupIndices,
  getActiveDragIndex,
  getBaseFieldName,
  getDisplayedFields,
  window
}) {
  const dropAnchor = document.createElement('div');
  dropAnchor.className = 'drop-anchor';
  document.body.appendChild(dropAnchor);

  function clearTargetColumn(root = document) {
    const scope = root || document;
    scope.querySelectorAll('.th-drag-over, .query-table-column-drop-target').forEach(el => {
      el.classList.remove('th-drag-over', 'query-table-column-drop-target');
    });
  }

  function highlightTargetColumn(table, colIndex) {
    if (!table || !Number.isInteger(colIndex)) {
      return;
    }

    clearTargetColumn(table);
    table.querySelectorAll(`[data-col-index="${colIndex}"]`).forEach(cell => {
      cell.classList.add('query-table-column-drop-target');
    });

    const targetHeader = table.querySelector(`thead th[data-col-index="${colIndex}"]`);
    if (targetHeader && !targetHeader.classList.contains('th-dragging')) {
      targetHeader.classList.add('th-drag-over');
    }
  }

  function clear(root = document) {
    dropAnchor.classList.remove('vertical');
    dropAnchor.style.display = 'none';
    clearTargetColumn(root);
  }

  function position(rect, table, clientX, colIndex) {
    const layout = getDropAnchorLayout({
      columnRect: rect,
      viewportRect: getDropIndicatorViewportRect(table),
      clientX,
      colIndex,
      draggedIndex: getActiveDragIndex(),
      dragGroupIndices: getActiveDragGroupIndices(),
      displayedFields: getDisplayedFields(),
      getBaseFieldName,
      scrollX: window.scrollX,
      scrollY: window.scrollY
    });
    if (!layout.visible) {
      clear(table);
      return false;
    }

    highlightTargetColumn(table, colIndex);
    dropAnchor.classList.add('vertical');
    dropAnchor.style.width = `${layout.width}px`;
    dropAnchor.style.height = `${layout.height}px`;
    dropAnchor.style.left = `${layout.left}px`;
    dropAnchor.style.top = `${layout.top}px`;
    dropAnchor.style.display = 'block';
    return true;
  }

  return {
    clear,
    clearTargetColumn,
    highlightTargetColumn,
    position
  };
}

export { createDropAnchorController };
