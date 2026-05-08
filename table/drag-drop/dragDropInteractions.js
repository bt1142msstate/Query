import { ClipboardUtils } from '../../core/clipboard.js';
import { appServices } from '../../core/appServices.js';
import { DragUtils } from '../../core/dragUtils.js';
import { Icons } from '../../core/icons.js';
import { QueryStateReaders, getBaseFieldName } from '../../core/queryState.js';
import { showToastMessage } from '../../core/toast.js';
import {
  findRelatedColumnIndices,
  getDuplicateGroups,
  restoreFieldWithDuplicates
} from './columnManager.js';
import { createColumnResizeController } from './columnResizeController.js';
import { dragDropColumnOps } from './dragDropColumns.js';
import {
  calculateAutoScrollStep,
  calculateHeaderActionLayout,
  getAutoScrollIntent,
  getHeaderInsertPositionFromRects
} from './dragDropInteractionMath.js';
import { SharedFieldPicker } from '../../ui/field-picker/fieldPicker.js';
let DragDropInteractions;
(function initializeDragDropInteractions() {
  var getDisplayedFields = QueryStateReaders.getDisplayedFields.bind(QueryStateReaders), getLifecycleState = QueryStateReaders.getLifecycleState.bind(QueryStateReaders), services = appServices;
  const TABLE_COLUMN_DRAG_MIME = 'application/x-query-table-column-index';
  const BUBBLE_FIELD_DRAG_MIME = 'bubble-field';
  const {
    addColumn,
    removeColumnByName,
    formatColumnClipboardValue,
    createColumnDragGhost,
    refreshColIndices,
    moveColumn,
    removeColumn
  } = dragDropColumnOps;
  function isSupportedTableDrag(event) {
    return DragUtils.hasDragType(event, TABLE_COLUMN_DRAG_MIME) || DragUtils.hasDragType(event, BUBBLE_FIELD_DRAG_MIME);
  }
  const dropAnchor = document.createElement('div');
  dropAnchor.className = 'drop-anchor';
  document.body.appendChild(dropAnchor);

  const headerActions = document.createElement('div');
  headerActions.className = 'th-actions';

  const headerInsertButton = document.createElement('button');
  headerInsertButton.type = 'button';
  headerInsertButton.className = 'th-insert-button';
  headerInsertButton.setAttribute('aria-label', 'Insert field at this position');
  headerInsertButton.setAttribute('data-tooltip', 'Add field here');
  headerInsertButton.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M19 11H13V5h-2v6H5v2h6v6h2v-6h6z"/>
    </svg>
  `;

  const headerCopy = document.createElement('button');
  headerCopy.type = 'button';
  headerCopy.className = 'th-action th-copy';
  headerCopy.setAttribute('aria-label', 'Copy column values');
  headerCopy.setAttribute('data-tooltip', 'Copy column values');
  headerCopy.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M16 1H6a2 2 0 0 0-2 2v12h2V3h10V1zm3 4H10a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm0 16H10V7h9v14z"/>
    </svg>
  `;

  const headerSort = document.createElement('button');
  headerSort.type = 'button';
  headerSort.className = 'th-action th-sort';
  headerSort.setAttribute('aria-label', 'Sort column');
  headerSort.setAttribute('data-tooltip', 'Sort ascending');
  headerSort.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true" class="th-sort-icon">
      <path fill="currentColor" d="M8 5l-4 4h3v10h2V9h3L8 5zm8 14l4-4h-3V5h-2v10h-3l4 4z"/>
    </svg>
  `;

  const headerTrash = document.createElement('button');
  headerTrash.type = 'button';
  headerTrash.className = 'th-action th-trash';
  headerTrash.setAttribute('aria-label', 'Remove column');
  headerTrash.setAttribute('data-tooltip', 'Remove column');
  headerTrash.innerHTML = Icons.trashSVG();

  headerActions.appendChild(headerSort);
  headerActions.appendChild(headerCopy);
  headerActions.appendChild(headerTrash);

  function syncHeaderSortActionState(th = dragDropManager.hoverTh) {
    if (!headerSort) {
      return;
    }

    const state = services.getVirtualTableState();
    const sortField = String(state?.currentSortColumn || '');
    const sortDirection = String(state?.currentSortDirection || 'asc');
    const fieldName = th?.getAttribute('data-sort-field') || '';
    const isSortable = Boolean(fieldName);
    const isActive = isSortable && fieldName === sortField;

    headerSort.disabled = !isSortable || Boolean(getLifecycleState().queryRunning);
    headerSort.classList.toggle('is-active', isActive);
    headerSort.classList.toggle('is-desc', isActive && sortDirection === 'desc');
    headerSort.setAttribute('aria-label', !isSortable ? 'Sorting unavailable for this column' : (isActive ? `Sorted ${sortDirection === 'asc' ? 'ascending' : 'descending'}. Click to reverse.` : 'Sort column'));
    headerSort.setAttribute('data-tooltip', !isSortable ? 'Sorting unavailable' : (isActive ? `Sorted ${sortDirection === 'asc' ? 'ascending' : 'descending'} - click to reverse` : 'Sort ascending'));
  }

  const headerInsertAffordance = document.createElement('div');
  headerInsertAffordance.className = 'th-insert-affordance';
  headerInsertAffordance.appendChild(headerInsertButton);

  let insertAffordanceShowTimer = null;
  let insertAffordanceHideTimer = null;
  let pendingInsertCandidate = null;

  function getColumnResizeState() {
    return services.getColumnResizeState?.() || { active: false, fieldName: '' };
  }

  function isResizeModeActive() {
    return Boolean(getColumnResizeState().active);
  }

  const columnResizeController = createColumnResizeController({
    services,
    getColumnResizeState
  });

  function clearHeaderLayoutState(th) {
    if (!th) {
      return;
    }

    th.classList.remove('th-actions-below');
    th.style.removeProperty('--th-balance-space');
  }

  function updateHeaderActionLayout(th) {
    if (!th) {
      return;
    }

    const headerContent = th.querySelector('.th-header-content');
    const labelText = th.querySelector('.th-text');
    const sortIcon = th.querySelector('.sort-icon');
    if (!headerContent || !labelText) {
      clearHeaderLayoutState(th);
      return;
    }

    const actionsVisible = headerActions.parentNode === th;
    const sortWidth = sortIcon ? Math.ceil(sortIcon.getBoundingClientRect().width) : 0;
    const actionsWidth = actionsVisible ? Math.ceil(headerActions.getBoundingClientRect().width) : 0;
    const labelWidth = Math.ceil(labelText.scrollWidth);
    const layout = calculateHeaderActionLayout({
      containerWidth: th.clientWidth,
      labelWidth,
      sortWidth,
      actionsWidth,
      actionsVisible
    });

    th.classList.toggle('th-actions-below', layout.stackActions);
    th.style.setProperty('--th-balance-space', `${layout.balanceSpace}px`);
  }

  function isEventInsideActiveResizeColumn(target) {
    if (!target || !isResizeModeActive()) {
      return false;
    }

    const resizeState = getColumnResizeState();
    const targetIndex = getDisplayedFields().findIndex(field => field === resizeState.fieldName);
    if (targetIndex === -1) {
      return false;
    }

    const cell = target.closest?.('#example-table th[data-col-index], #example-table td[data-col-index]');
    if (!cell) {
      return false;
    }

    return Number.parseInt(cell.dataset.colIndex || '', 10) === targetIndex;
  }

  function applyInsertAffordancePosition(candidate) {
    headerInsertAffordance.dataset.insertAt = String(candidate.insertAt);
    headerInsertAffordance.style.left = `${candidate.boundaryX + window.scrollX}px`;
    headerInsertAffordance.style.top = `${candidate.top + (candidate.height / 2) + window.scrollY}px`;
  }

  function showInsertAffordance(candidate) {
    if (!candidate) return;

    clearTimeout(insertAffordanceHideTimer);
    applyInsertAffordancePosition(candidate);

    if (!headerInsertAffordance.parentNode) {
      document.body.appendChild(headerInsertAffordance);
    }

    window.requestAnimationFrame(() => {
      headerInsertAffordance.classList.add('is-visible');
    });
  }

  function clearInsertAffordance(options = {}) {
    const immediate = options.immediate === true;
    clearTimeout(insertAffordanceShowTimer);
    pendingInsertCandidate = null;
    headerInsertAffordance.removeAttribute('data-insert-at');

    if (!headerInsertAffordance.parentNode) {
      return;
    }

    headerInsertAffordance.classList.remove('is-visible');

    clearTimeout(insertAffordanceHideTimer);
    if (immediate) {
      headerInsertAffordance.parentNode.removeChild(headerInsertAffordance);
      return;
    }

    insertAffordanceHideTimer = window.setTimeout(() => {
      if (headerInsertAffordance.parentNode && !headerInsertAffordance.classList.contains('is-visible')) {
        headerInsertAffordance.parentNode.removeChild(headerInsertAffordance);
      }
    }, 160);
  }

  function getHeaderInsertPosition(table, clientX) {
    const headers = Array.from(table.querySelectorAll('thead th[data-col-index]'));
    if (headers.length === 0) {
      return null;
    }

    return getHeaderInsertPositionFromRects(
      headers.map(header => header.getBoundingClientRect()),
      clientX
    );
  }

  function updateHeaderInsertAffordance(table, clientX) {
    if (!table || getLifecycleState().queryRunning || document.body.classList.contains('dragging-cursor') || isResizeModeActive()) {
      clearInsertAffordance({ immediate: true });
      return;
    }

    const candidate = getHeaderInsertPosition(table, clientX);
    if (!candidate) {
      clearInsertAffordance();
      return;
    }

    const currentInsertAt = parseInt(headerInsertAffordance.dataset.insertAt || '', 10);
    const hasVisibleAffordance = headerInsertAffordance.parentNode && headerInsertAffordance.classList.contains('is-visible');

    if (hasVisibleAffordance && currentInsertAt === candidate.insertAt) {
      clearTimeout(insertAffordanceHideTimer);
      applyInsertAffordancePosition(candidate);
      return;
    }

    pendingInsertCandidate = candidate;
    clearTimeout(insertAffordanceShowTimer);
    clearTimeout(insertAffordanceHideTimer);
    if (pendingInsertCandidate && pendingInsertCandidate.insertAt === candidate.insertAt) {
      showInsertAffordance(candidate);
    }
  }

  function positionDropAnchor(rect, table, clientX, colIndex) {
    const viewportRect = getDropIndicatorViewportRect(table);
    if (!viewportRect) {
      clearDropAnchor();
      return;
    }

    if (rect.right < viewportRect.left || rect.left > viewportRect.right) {
      clearDropAnchor();
      return;
    }

    const insertLeft = (clientX - rect.left) < rect.width / 2;
    const insertAt = insertLeft ? colIndex : colIndex + 1;
    const displayedFields = getDisplayedFields();

    if (displayedFields.length > 1 && insertAt > 0 && insertAt < displayedFields.length) {
      const beforeField = displayedFields[insertAt - 1];
      const afterField = displayedFields[insertAt];

      if (beforeField && afterField) {
        const beforeBase = getBaseFieldName(beforeField);
        const afterBase = getBaseFieldName(afterField);

        if (beforeBase === afterBase) {
          dropAnchor.style.display = 'none';
          return;
        }
      }
    }

    dropAnchor.classList.add('vertical');

    const rawAnchorX = insertLeft ? rect.left : rect.right;
    const clampedAnchorX = Math.max(viewportRect.left, Math.min(rawAnchorX, viewportRect.right));
    const anchorHeight = Math.max(0, viewportRect.height);

    dropAnchor.style.width = '4px';
    dropAnchor.style.height = anchorHeight + 'px';
    dropAnchor.style.left = clampedAnchorX + window.scrollX - 2 + 'px';
    dropAnchor.style.top = viewportRect.top + window.scrollY + 'px';
    dropAnchor.style.display = 'block';
  }

  function clearDropAnchor() {
    dropAnchor.classList.remove('vertical');
    dropAnchor.style.display = 'none';
  }

  function getDragScrollContainer(table) {
    return table?.closest('.overflow-x-auto') || null;
  }

  function getDropIndicatorViewportRect(table) {
    const scrollContainer = getDragScrollContainer(table);
    const target = scrollContainer || table;
    return target ? target.getBoundingClientRect() : null;
  }

  function isPointerWithinDropViewport(table, clientX, clientY) {
    const rect = getDropIndicatorViewportRect(table);
    if (!rect) {
      return false;
    }

    return clientX >= rect.left
      && clientX <= rect.right
      && clientY >= rect.top
      && clientY <= rect.bottom;
  }

  function getVisibleHeaderTargets(table, scrollContainer = getDragScrollContainer(table)) {
    const headers = Array.from(table.querySelectorAll('thead th[data-col-index]'));
    if (!headers.length || !scrollContainer) {
      return headers;
    }

    const containerRect = scrollContainer.getBoundingClientRect();
    const visibleHeaders = headers.filter(th => {
      const rect = th.getBoundingClientRect();
      return rect.right > containerRect.left + 1 && rect.left < containerRect.right - 1;
    });

    return visibleHeaders.length ? visibleHeaders : headers;
  }

  function getClosestVisibleHeaderByX(table, clientX, scrollContainer = getDragScrollContainer(table)) {
    const headers = getVisibleHeaderTargets(table, scrollContainer);
    if (!headers.length) {
      return null;
    }

    let best = headers[0];
    let bestDist = Infinity;

    headers.forEach(th => {
      const rect = th.getBoundingClientRect();
      const center = rect.left + rect.width / 2;
      const dist = Math.abs(clientX - center);
      if (dist < bestDist) {
        bestDist = dist;
        best = th;
      }
    });

    return best;
  }

  function attachBubbleDropTarget(container) {
    if (container._bubbleDropSetup) return;

    container.addEventListener('dragover', e => {
      if (!isSupportedTableDrag(e)) {
        clearDropAnchor();
        return;
      }
      e.preventDefault();
      if (e.target.closest('th') || e.target.closest('tbody')) return;
      const table = container.querySelector('table');
      if (table) dragDropManager.handleDragOverByX(e, table);
    });

    container.addEventListener('dragleave', e => {
      if (!container.contains(e.relatedTarget)) {
        clearDropAnchor();
      }
    });

    container.addEventListener('drop', e => {
      if (!isSupportedTableDrag(e)) {
        clearDropAnchor();
        return;
      }
      e.preventDefault();
      if (e.target.closest('th') || e.target.closest('tbody')) return;

      const table = container.querySelector('table');
      if (table) {
        const best = getClosestVisibleHeaderByX(table, e.clientX, getDragScrollContainer(table));
        if (best) {
          dragDropManager.handleDrop(e, best, table);
          return;
        }
      }

      const field = e.dataTransfer.getData(BUBBLE_FIELD_DRAG_MIME);
      if (field) {
        if (restoreFieldWithDuplicates(field)) {
          dragDropManager.dropSuccessful = true;
        }
      }
      clearDropAnchor();
    });

    container._bubbleDropSetup = true;
  }

  const dragDropManager = {
    isBubbleDrag: false,
    hoverTh: null,
    autoScrollInterval: null,
    autoScrollDirection: null,
    autoScrollPointerX: 0,
    scrollContainer: null,
    draggedBubble: null,
    draggedBubbleOriginalRect: null,
    dropSuccessful: false,
    lastDragX: 0,
    lastDragY: 0,
    isAnimating: false,
    activeTable: null,

    startAutoScroll(direction, container) {
      this.autoScrollPointerX = this.lastDragX || this.autoScrollPointerX;

      if (this.autoScrollInterval && this.autoScrollDirection === direction) {
        return;
      }

      this.stopAutoScroll();
      this.autoScrollDirection = direction;

      this.autoScrollInterval = setInterval(() => {
        if (this.activeTable && !isPointerWithinDropViewport(this.activeTable, this.autoScrollPointerX, this.lastDragY)) {
          clearDropAnchor();
          this.stopAutoScroll();
          return;
        }

        const step = calculateAutoScrollStep({
          direction,
          pointerX: this.autoScrollPointerX,
          containerRect: container.getBoundingClientRect(),
          scrollLeft: container.scrollLeft,
          scrollWidth: container.scrollWidth,
          clientWidth: container.clientWidth
        });

        container.scrollLeft = step.nextScrollLeft;

        if (step.changed && this.activeTable) {
          this.updateDropIndicatorFromPointer(this.activeTable, this.autoScrollPointerX, this.lastDragY);
        }
      }, 16);
    },

    stopAutoScroll() {
      if (this.autoScrollInterval) {
        clearInterval(this.autoScrollInterval);
        this.autoScrollInterval = null;
      }
      this.autoScrollDirection = null;
    },

    checkAutoScroll(e, container) {
      if (!container) return;

      const mouseX = e.clientX;
      const mouseY = e.clientY;
      this.autoScrollPointerX = mouseX;

      const intent = getAutoScrollIntent({
        pointerX: mouseX,
        pointerY: mouseY,
        containerRect: container.getBoundingClientRect(),
        scrollLeft: container.scrollLeft,
        scrollWidth: container.scrollWidth,
        clientWidth: container.clientWidth
      });

      if (intent.outside) {
        this.stopAutoScroll();
        clearDropAnchor();
        return;
      }

      if (intent.direction) {
        this.startAutoScroll(intent.direction, container);
      } else {
        this.stopAutoScroll();
      }
    },

    updateDropIndicatorFromPointer(table, clientX, clientY = this.lastDragY) {
      if (!isPointerWithinDropViewport(table, clientX, clientY)) {
        table.querySelectorAll('.th-drag-over').forEach(el => el.classList.remove('th-drag-over'));
        clearDropAnchor();
        return;
      }

      const scrollContainer = this.scrollContainer || getDragScrollContainer(table);
      const targetHeader = getClosestVisibleHeaderByX(table, clientX, scrollContainer);
      if (!targetHeader) {
        clearDropAnchor();
        return;
      }

      table.querySelectorAll('.th-drag-over').forEach(el => el.classList.remove('th-drag-over'));
      if (!targetHeader.classList.contains('th-dragging')) {
        targetHeader.classList.add('th-drag-over');
      }

      const colIndex = parseInt(targetHeader.dataset.colIndex, 10);
      const rect = targetHeader.getBoundingClientRect();
      positionDropAnchor(rect, table, clientX, colIndex);
    },

    handleHeaderEnter(th) {
      if (getLifecycleState().queryRunning) return;
      if (isResizeModeActive()) {
        this.hoverTh = th;
        return;
      }
      th.classList.add('th-hover');
      this.hoverTh = th;
      th.appendChild(headerActions);
      syncHeaderSortActionState(th);
      window.requestAnimationFrame(() => updateHeaderActionLayout(th));
    },

    handleHeaderLeave(th) {
      th.classList.remove('th-hover');
      this.hoverTh = null;
      clearHeaderLayoutState(th);
      if (headerActions.parentNode) headerActions.parentNode.removeChild(headerActions);
    },

    handleHeaderRowPointerMove(event, table) {
      updateHeaderInsertAffordance(table, event.clientX);
    },

    handleHeaderRowPointerLeave(event) {
      if (event && headerInsertAffordance.contains(event.relatedTarget)) {
        return;
      }
      clearInsertAffordance();
    },

    handleHeaderDragStart(e, th, scrollContainer) {
      if (getLifecycleState().queryRunning || isResizeModeActive() || e.target.closest('.th-resize-handle')) {
        e.preventDefault();
        return;
      }
      clearInsertAffordance({ immediate: true });
      this.isBubbleDrag = false;
      this.activeTable = th.closest('table');
      th.classList.add('th-dragging');
      th.classList.remove('th-hover');
      if (scrollContainer) scrollContainer.classList.add('dragging-scroll-lock');
      document.body.classList.add('dragging-cursor');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData(TABLE_COLUMN_DRAG_MIME, th.dataset.colIndex);

      const colIndex = parseInt(th.dataset.colIndex, 10);
      const fieldName = getDisplayedFields()[colIndex];
      const relatedIndices = findRelatedColumnIndices(fieldName);

      relatedIndices.forEach(index => {
        const relatedHeader = document.querySelector(`thead th[data-col-index="${index}"]`);
        if (relatedHeader) {
          relatedHeader.classList.add('th-dragging');
        }
      });

      const ghost = createColumnDragGhost(th, relatedIndices);
      ghost.classList.add('ghost-drag');
      ghost.style.pointerEvents = 'none';
      ghost.style.position = 'absolute';
      ghost.style.top = '-9999px';
      ghost.style.left = '-9999px';
      document.body.appendChild(ghost);
      e.dataTransfer.setDragImage(ghost, ghost.offsetWidth / 2, ghost.offsetHeight / 2);

      if (th._ghost && th._ghost.parentNode) {
        th._ghost.parentNode.removeChild(th._ghost);
      }
      th._ghost = ghost;

      setTimeout(() => {
        if (ghost.parentNode) {
          ghost.style.visibility = 'hidden';
        }
      }, 0);
    },

    handleHeaderDragEnd(th, scrollContainer) {
      document.querySelectorAll('th').forEach(h => {
        h.classList.remove('th-dragging', 'th-hover');
      });
      document.querySelectorAll('.th-drag-over').forEach(el => el.classList.remove('th-drag-over'));

      if (scrollContainer) scrollContainer.classList.remove('dragging-scroll-lock');
      document.body.classList.remove('dragging-cursor');
      clearDropAnchor();
      this.stopAutoScroll();
      this.activeTable = null;

      if (th._ghost) {
        if (th._ghost.parentNode) {
          th._ghost.parentNode.removeChild(th._ghost);
        }
        delete th._ghost;
      }
    },

    handleDragEnter(e, element, table) {
      if (!isSupportedTableDrag(e)) {
        clearDropAnchor();
        return;
      }
      e.preventDefault();
      this.activeTable = table;
      table.querySelectorAll('.th-drag-over').forEach(el => el.classList.remove('th-drag-over'));
      if (!element.classList.contains('th-dragging')) {
        element.classList.add('th-drag-over');
      }
      const rect = element.getBoundingClientRect();
      const colIndex = parseInt(element.dataset.colIndex, 10);
      positionDropAnchor(rect, table, e.clientX, colIndex);

      if (this.scrollContainer) {
        this.checkAutoScroll(e, this.scrollContainer);
      }
    },

    handleDragLeave() {
      clearDropAnchor();
    },

    handleDragOver(e, element, table) {
      if (!isSupportedTableDrag(e)) {
        clearDropAnchor();
        return;
      }
      e.preventDefault();
      this.activeTable = table;
      const rect = element.getBoundingClientRect();
      const colIndex = parseInt(element.dataset.colIndex, 10);
      positionDropAnchor(rect, table, e.clientX, colIndex);

      if (this.scrollContainer) {
        this.checkAutoScroll(e, this.scrollContainer);
      }
    },

    handleCellDragEnter(e, td, table) {
      if (!isSupportedTableDrag(e)) {
        clearDropAnchor();
        return;
      }
      e.preventDefault();
      this.activeTable = table;
      table.querySelectorAll('.th-drag-over').forEach(el => el.classList.remove('th-drag-over'));
      const colIndex = parseInt(td.dataset.colIndex, 10);
      if (isNaN(colIndex)) return;
      const targetHeader = table.querySelector(`thead th[data-col-index="${colIndex}"]`);
      if (!targetHeader) return;
      if (!targetHeader.classList.contains('th-dragging')) {
        targetHeader.classList.add('th-drag-over');
      }
      const rect = targetHeader.getBoundingClientRect();
      positionDropAnchor(rect, table, e.clientX, colIndex);

      if (this.scrollContainer) {
        this.checkAutoScroll(e, this.scrollContainer);
      }
    },

    handleDragOverByX(e, table) {
      if (!isSupportedTableDrag(e)) {
        clearDropAnchor();
        return;
      }
      e.preventDefault();
      this.activeTable = table;
      this.updateDropIndicatorFromPointer(table, e.clientX, e.clientY);

      if (this.scrollContainer) {
        this.checkAutoScroll(e, this.scrollContainer);
      }
    },

    handleCellDragOver(e, td, table) {
      if (!isSupportedTableDrag(e)) {
        clearDropAnchor();
        return;
      }
      e.preventDefault();
      this.activeTable = table;
      const colIndex = parseInt(td.dataset.colIndex, 10);
      if (isNaN(colIndex)) return;
      const targetHeader = table.querySelector(`thead th[data-col-index="${colIndex}"]`);
      if (!targetHeader) return;
      const rect = targetHeader.getBoundingClientRect();
      positionDropAnchor(rect, table, e.clientX, colIndex);

      if (this.scrollContainer) {
        this.checkAutoScroll(e, this.scrollContainer);
      }
    },

    handleDrop(e, th, table) {
      if (!isSupportedTableDrag(e)) {
        clearDropAnchor();
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      this.activeTable = null;
      const toIndex = parseInt(th.dataset.colIndex, 10);

      this.stopAutoScroll();

      const fromIndexStr = e.dataTransfer.getData(TABLE_COLUMN_DRAG_MIME).trim();
      if (/^\d+$/.test(fromIndexStr)) {
        const fromIndex = parseInt(fromIndexStr, 10);
        if (fromIndex !== toIndex) {
          const rect = th.getBoundingClientRect();
          const insertAt = (e.clientX - rect.left) < rect.width / 2 ? toIndex : toIndex + 1;
          const finalInsertAt = fromIndex < insertAt ? insertAt - 1 : insertAt;

          moveColumn(table, fromIndex, finalInsertAt);
          refreshColIndices(table);
        }
        th.classList.remove('th-drag-over');
        clearDropAnchor();
        return;
      }

      const bubbleField = e.dataTransfer.getData(BUBBLE_FIELD_DRAG_MIME);
      if (bubbleField) {
        const rect = th.getBoundingClientRect();
        const insertAt = (e.clientX - rect.left) < rect.width / 2 ? toIndex : toIndex + 1;
        if (restoreFieldWithDuplicates(bubbleField, insertAt)) {
          dragDropManager.dropSuccessful = true;
        }
      }

      th.classList.remove('th-drag-over');
      clearDropAnchor();
    },

    handleCellDrop(e, td, table) {
      if (!isSupportedTableDrag(e)) {
        clearDropAnchor();
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      this.activeTable = null;

      const toIndex = parseInt(td.dataset.colIndex, 10);
      this.stopAutoScroll();

      const bubbleField = e.dataTransfer.getData(BUBBLE_FIELD_DRAG_MIME);
      if (bubbleField) {
        const rect = td.getBoundingClientRect();
        const insertAt = (e.clientX - rect.left) < rect.width / 2 ? toIndex : toIndex + 1;
        if (restoreFieldWithDuplicates(bubbleField, insertAt)) {
          dragDropManager.dropSuccessful = true;
        }
        clearDropAnchor();
        return;
      }

      const fromIndex = parseInt(e.dataTransfer.getData(TABLE_COLUMN_DRAG_MIME), 10);
      if (!isNaN(fromIndex) && fromIndex !== toIndex) {
        const targetHeader = table.querySelector(`thead th[data-col-index="${toIndex}"]`);
        const rect = targetHeader.getBoundingClientRect();
        const insertAt = (e.clientX - rect.left) < rect.width / 2 ? toIndex : toIndex + 1;
        const finalInsertAt = fromIndex < insertAt ? insertAt - 1 : insertAt;

        moveColumn(table, fromIndex, finalInsertAt);
        refreshColIndices(table);
      }

      table.querySelectorAll('.th-drag-over').forEach(el => el.classList.remove('th-drag-over'));
      clearDropAnchor();
    },

    setBubbleDrag(state) {
      this.isBubbleDrag = state;
    },

    cleanupTableListeners(table) {
      if (!table) return;
      try {
        const tbody = table.querySelector('tbody');
        if (tbody && tbody._dragDropListeners) {
          Object.entries(tbody._dragDropListeners).forEach(([event, handler]) => {
            try { tbody.removeEventListener(event, handler); } catch {}
          });
          delete tbody._dragDropListeners;
        }
      } catch (error) {
        console.error('Error in cleanupTableListeners:', error);
      }
    },

    initTableDragDrop(table) {
      if (!table) return;

      refreshColIndices(table);
      const scrollContainer = getDragScrollContainer(table);
      this.scrollContainer = scrollContainer;

      if (!table._headersDragInitialized) {
        const headers = table.querySelectorAll('th[draggable="true"]');
        headers.forEach(th => {
          const listeners = {
            mouseenter: () => this.handleHeaderEnter(th),
            mouseleave: () => this.handleHeaderLeave(th),
            dragstart: e => this.handleHeaderDragStart(e, th, scrollContainer),
            dragend: () => this.handleHeaderDragEnd(th, scrollContainer),
            dragenter: e => this.handleDragEnter(e, th, table),
            dragleave: () => this.handleDragLeave(),
            dragover: e => this.handleDragOver(e, th, table),
            drop: e => this.handleDrop(e, th, table)
          };
          th._dragDropListeners = listeners;
          Object.entries(listeners).forEach(([event, handler]) => {
            th.addEventListener(event, handler);
          });
        });
        table._headersDragInitialized = true;
      }

      const headerRow = table.querySelector('thead tr');
      if (headerRow && !headerRow._insertAffordanceBound) {
        const onPointerDown = event => {
          const resizeHandle = event.target.closest('.th-resize-handle');
          const th = resizeHandle?.closest('th');
          if (!resizeHandle || !th) {
            return;
          }

          columnResizeController.begin(event, resizeHandle, th);
        };
        const onPointerMove = event => this.handleHeaderRowPointerMove(event, table);
        const onPointerLeave = event => this.handleHeaderRowPointerLeave(event);
        const onScroll = () => clearInsertAffordance({ immediate: true });

        headerRow.addEventListener('pointerdown', onPointerDown);
        headerRow.addEventListener('mousemove', onPointerMove);
        headerRow.addEventListener('mouseleave', onPointerLeave);

        const scrollContainerEl = this.scrollContainer;
        if (scrollContainerEl) {
          scrollContainerEl.addEventListener('scroll', onScroll);
        }

        headerRow._insertAffordanceBound = true;
        headerRow._insertAffordanceCleanup = () => {
          headerRow.removeEventListener('pointerdown', onPointerDown);
          headerRow.removeEventListener('mousemove', onPointerMove);
          headerRow.removeEventListener('mouseleave', onPointerLeave);
          if (scrollContainerEl) {
            scrollContainerEl.removeEventListener('scroll', onScroll);
          }
        };
      }

      const tbody = table.querySelector('tbody');
      if (!tbody) return;

      this.cleanupTableListeners(table);

      const getValidTd = e => {
        const td = e.target.closest('td');
        if (!td) return null;
        if (td.hasAttribute('colspan')) return null;
        const colIndex = parseInt(td.dataset.colIndex, 10);
        if (isNaN(colIndex)) return null;
        return td;
      };

      const tbodyListeners = {
        dragenter: e => {
          const td = getValidTd(e);
          if (td) this.handleCellDragEnter(e, td, table);
          else this.handleDragOverByX(e, table);
        },
        dragover: e => {
          const td = getValidTd(e);
          if (td) this.handleCellDragOver(e, td, table);
          else this.handleDragOverByX(e, table);
        },
        dragleave: e => {
          if (!tbody.contains(e.relatedTarget)) this.handleDragLeave();
        },
        drop: e => {
          const td = getValidTd(e);
          if (td) {
            this.handleCellDrop(e, td, table);
          } else {
            e.preventDefault();
            e.stopPropagation();
            const best = getClosestVisibleHeaderByX(table, e.clientX, getDragScrollContainer(table));
            if (!best) return;
            this.handleDrop(e, best, table);
          }
        }
      };

      tbody._dragDropListeners = tbodyListeners;
      Object.entries(tbodyListeners).forEach(([event, handler]) => {
        tbody.addEventListener(event, handler);
      });
    }
  };

  ClipboardUtils.bindCopyButton(headerCopy, async () => {
    if (getLifecycleState().queryRunning) {
      return '';
    }

    const th = dragDropManager.hoverTh;
    if (!th) {
      return '';
    }

    const idx = parseInt(th.dataset.colIndex, 10);
    const fieldName = getDisplayedFields()[idx];
    const virtualTableData = services.getVirtualTableData();
    if (!fieldName || !virtualTableData?.rows?.length || !virtualTableData.columnMap) {
      return '';
    }

    const columnIndex = virtualTableData.columnMap.get(fieldName);
    if (columnIndex === undefined) {
      return '';
    }

    return virtualTableData.rows
      .map(row => formatColumnClipboardValue(row[columnIndex], fieldName))
      .join('\n');
  }, {
    successMessage: 'Column values copied to clipboard.',
    errorMessage: 'Failed to copy column values.',
    emptyMessage: 'No column data available to copy.'
  });

  headerSort.addEventListener('click', e => {
    e.stopPropagation();
    if (getLifecycleState().queryRunning) return;
    const th = dragDropManager.hoverTh;
    const fieldName = th?.getAttribute('data-sort-field');
    if (!fieldName) {
      return;
    }

    services.sortTableBy(fieldName);
    syncHeaderSortActionState(th);
  });

  headerTrash.addEventListener('click', e => {
    e.stopPropagation();
    if (getLifecycleState().queryRunning) return;
    const th = dragDropManager.hoverTh;
    if (th) {
      const idx = parseInt(th.dataset.colIndex, 10);
      const table = th.closest('table');
      removeColumn(table, idx);
    }
  });

  headerInsertButton.addEventListener('click', e => {
    e.stopPropagation();
    if (getLifecycleState().queryRunning) return;

    const insertAt = parseInt(headerInsertAffordance.dataset.insertAt || '', 10);
    if (!Number.isInteger(insertAt)) {
      return;
    }

    clearInsertAffordance();
    SharedFieldPicker.openQueryFieldPicker({ insertAt }).catch(error => {
      console.error('Failed to open insert field picker:', error);
      showToastMessage('Failed to open the field picker.', 'error');
    });
  });

  headerInsertAffordance.addEventListener('mouseleave', event => {
    if (event.relatedTarget && event.relatedTarget.closest && event.relatedTarget.closest('thead tr')) {
      return;
    }
    clearInsertAffordance();
  });

  document.addEventListener('dragstart', e => {
    if (getLifecycleState().queryRunning || isResizeModeActive()) {
      e.preventDefault();
      return;
    }
    clearInsertAffordance({ immediate: true });
    const bubble = e.target.closest('.bubble');
    if (!bubble) return;

    const fieldName = bubble.textContent.trim();
    if (getDisplayedFields().includes(fieldName)) {
      e.preventDefault();
      return;
    }

    dragDropManager.draggedBubble = bubble;
    dragDropManager.draggedBubbleOriginalRect = bubble.getBoundingClientRect();
    dragDropManager.dropSuccessful = false;

    e.dataTransfer.setData(BUBBLE_FIELD_DRAG_MIME, fieldName);
    e.dataTransfer.effectAllowed = 'copyMove';
    e.dataTransfer.dropEffect = 'move';
    dragDropManager.setBubbleDrag(true);

    const wrapper = document.createElement('div');
    const pad = 16;
    wrapper.style.position = 'absolute';
    wrapper.style.top = '-9999px';
    wrapper.style.left = '-9999px';
    wrapper.style.padding = pad / 2 + 'px';
    wrapper.style.pointerEvents = 'none';
    wrapper.style.boxSizing = 'content-box';
    const ghost = bubble.cloneNode(true);
    ghost.style.overflow = 'visible';
    wrapper.appendChild(ghost);
    document.body.appendChild(wrapper);
    const gw = wrapper.offsetWidth;
    const gh = wrapper.offsetHeight;
    e.dataTransfer.setDragImage(wrapper, gw / 2, gh / 2);
    setTimeout(() => wrapper.remove(), 0);

    bubble.style.opacity = '0.3';
  });

  document.addEventListener('dragover', e => {
    if (document.body.classList.contains('dragging-cursor') && !dragDropManager.isBubbleDrag) {
      dragDropManager.lastDragX = e.clientX;
      dragDropManager.lastDragY = e.clientY;

      if (dragDropManager.activeTable && !isPointerWithinDropViewport(dragDropManager.activeTable, e.clientX, e.clientY)) {
        clearDropAnchor();
      }

      if (dragDropManager.scrollContainer) {
        dragDropManager.checkAutoScroll(e, dragDropManager.scrollContainer);
      }
    }

    if (dragDropManager.isBubbleDrag) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';

      const margin = 50;
      const clampedX = Math.max(margin, Math.min(window.innerWidth - margin, e.clientX));
      const clampedY = Math.max(margin, Math.min(window.innerHeight - margin, e.clientY));

      dragDropManager.lastDragX = clampedX;
      dragDropManager.lastDragY = clampedY;

      if (dragDropManager.scrollContainer) {
        dragDropManager.checkAutoScroll(e, dragDropManager.scrollContainer);
      }
    }
  });

  document.addEventListener('drop', e => {
    if (dragDropManager.isBubbleDrag) {
      e.preventDefault();
    }
  });

  window.addEventListener('dragover', e => {
    if (dragDropManager.isBubbleDrag) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    }
  }, { capture: true });

  window.addEventListener('drop', e => {
    if (dragDropManager.isBubbleDrag) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    }
  }, { capture: true });

  document.addEventListener('dragend', e => {
    const bubble = e.target.closest('.bubble');
    if (bubble && dragDropManager.draggedBubble) {
      console.log('Dragend event fired for:', bubble.textContent.trim());
      dragDropManager.setBubbleDrag(false);
      dragDropManager.stopAutoScroll();
      dragDropManager.activeTable = null;

      const fieldName = bubble.textContent.trim();
      const wasActuallyDropped = getDisplayedFields().includes(fieldName);

      if (!wasActuallyDropped && dragDropManager.draggedBubble && dragDropManager.draggedBubbleOriginalRect && !dragDropManager.isAnimating) {
        console.log('Starting return animation for:', fieldName);
        dragDropManager.isAnimating = true;
        const originalRect = dragDropManager.draggedBubbleOriginalRect;
        const originalBubble = dragDropManager.draggedBubble;

        const returnClone = bubble.cloneNode(true);
        const rootStyles = getComputedStyle(document.documentElement);
        returnClone.style.position = 'fixed';
        returnClone.style.zIndex = rootStyles.getPropertyValue('--z-drag-ghost').trim() || '1000';
        returnClone.style.pointerEvents = 'none';
        returnClone.style.opacity = '1';
        returnClone.style.transition = 'transform 0.45s ease';
        returnClone.style.transform = 'translate(0, 0)';

        let startX = dragDropManager.lastDragX - 25;
        let startY = dragDropManager.lastDragY - 15;

        if (dragDropManager.lastDragX === 0 && dragDropManager.lastDragY === 0) {
          startX = window.innerWidth / 2 - 25;
          startY = window.innerHeight / 2 - 15;
          console.log('Using fallback position - bubble was dragged off-screen');
        }

        const margin = 50;
        startX = Math.max(margin, Math.min(window.innerWidth - margin, startX));
        startY = Math.max(margin, Math.min(window.innerHeight - margin, startY));
        returnClone.style.top = startY + 'px';
        returnClone.style.left = startX + 'px';

        document.body.appendChild(returnClone);
        returnClone.offsetHeight;

        const deltaX = originalRect.left - startX;
        const deltaY = originalRect.top - startY;

        requestAnimationFrame(() => {
          returnClone.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
        });

        returnClone.addEventListener('transitionend', function cleanup() {
          console.log('Animation finished for:', fieldName);
          returnClone.remove();
          originalBubble.style.opacity = '';
          dragDropManager.isAnimating = false;
        }, { once: true });

        setTimeout(() => {
          if (returnClone.parentNode) {
            console.log('Fallback cleanup for:', fieldName);
            returnClone.remove();
          }
          originalBubble.style.opacity = '';
          dragDropManager.isAnimating = false;
        }, 600);
      } else if (dragDropManager.draggedBubble) {
        dragDropManager.draggedBubble.style.opacity = '';
        dragDropManager.draggedBubble.style.visibility = '';
      }

      dragDropManager.draggedBubble = null;
      dragDropManager.draggedBubbleOriginalRect = null;
      dragDropManager.dropSuccessful = false;
      dragDropManager.lastDragX = 0;
      dragDropManager.lastDragY = 0;
      dragDropManager.isAnimating = false;
    }
  });

  function addDragAndDrop(table) {
    dragDropManager.initTableDragDrop(table);
    services.syncColumnResizeModeUi?.();
  }

  function resetHeaderUi() {
    clearInsertAffordance({ immediate: true });
    clearDropAnchor();
    columnResizeController.stop({ keepMode: true });

    if (dragDropManager.hoverTh) {
      dragDropManager.hoverTh.classList.remove('th-hover');
    }

    if (headerActions.parentNode) {
      headerActions.parentNode.removeChild(headerActions);
    }

    document.querySelectorAll('#example-table th').forEach(th => clearHeaderLayoutState(th));

    document.querySelectorAll('#example-table .th-drag-over, #example-table .th-dragging').forEach(el => {
      el.classList.remove('th-drag-over', 'th-dragging');
    });

    dragDropManager.hoverTh = null;
    dragDropManager.activeTable = null;
    dragDropManager.stopAutoScroll();
  }

  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') {
      return;
    }

    if (columnResizeController.hasActiveSession() || isResizeModeActive()) {
      columnResizeController.stop();
    }
  });

  document.addEventListener('pointerdown', event => {
    if (!isResizeModeActive() || columnResizeController.hasActiveSession()) {
      return;
    }

    if (!isEventInsideActiveResizeColumn(event.target)) {
      columnResizeController.stop();
    }
  }, true);

  DragDropInteractions = Object.freeze({
    dragDropManager,
    addDragAndDrop,
    attachBubbleDropTarget,
    resetHeaderUi,
    clearInsertAffordance,
    syncHeaderSortActionState,
    refreshColIndices,
    moveColumn,
    removeColumn,
    positionDropAnchor,
    clearDropAnchor,
    addColumn,
    removeColumnByName,
    getDuplicateGroups
  });
})();

export { DragDropInteractions };
