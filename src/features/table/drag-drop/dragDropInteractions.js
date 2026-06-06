import { ClipboardUtils } from '../../../core/clipboard.js';
import { appServices, registerDragDropService } from '../../../core/appServices.js';
import { Icons } from '../../../core/icons.js';
import { QueryStateReaders, getBaseFieldName } from '../../../core/queryState.js';
import { showToastMessage } from '../../../core/toast.js';
import {
  getDuplicateGroups,
  restoreFieldWithDuplicates
} from './columnManager.js';
import { createColumnResizeController } from './columnResizeController.js';
import { dragDropColumnOps } from './dragDropColumns.js';
import { createDragDropHeaderActions } from './dragDropHeaderActions.js';
import { createDragDropHeaderInsertAffordance } from './dragDropHeaderInsertAffordance.js';
import {
  calculateAutoScrollStep,
  calculateHeaderActionLayout,
  getAutoScrollIntent,
  getHeaderInsertPositionFromRects
} from './dragDropInteractionMath.js';
import { resolveColumnResizeStartTarget } from './resizeStartTarget.js';
import { SharedFieldPicker } from '../../../ui/field-picker/fieldPicker.js';
import {
  getClosestVisibleHeaderByX,
  getDragScrollContainer,
  getDropIndicatorViewportRect,
  getOutsideDropViewportOptions,
  isPointerNearDropViewport,
  isPointerWithinDropViewport
} from './dragDropViewport.js';
import { getDropAnchorLayout } from './dragDropAnchorLayout.js';
let DragDropInteractions;
(function initializeDragDropInteractions() {
  var getDisplayedFields = QueryStateReaders.getDisplayedFields.bind(QueryStateReaders), getLifecycleState = QueryStateReaders.getLifecycleState.bind(QueryStateReaders), services = appServices;
  const TABLE_COLUMN_DRAG_MIME = 'application/x-query-table-column-index';
  const {
    addColumn,
    removeColumnByName,
    formatColumnClipboardValue,
    createColumnDragGhost,
    refreshColIndices,
    getColumnMoveGroupIndices,
    moveColumn,
    removeColumn
  } = dragDropColumnOps;

  function hasDragType(event, dragType) {
    const types = event?.dataTransfer?.types;
    return Boolean(types && Array.from(types).includes(dragType));
  }

  function isSupportedTableDrag(event) {
    return hasDragType(event, TABLE_COLUMN_DRAG_MIME);
  }
  const dropAnchor = document.createElement('div');
  dropAnchor.className = 'drop-anchor';
  document.body.appendChild(dropAnchor);

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

  const headerActionControls = createDragDropHeaderActions({
    document,
    window,
    icons: Icons,
    services,
    getLifecycleState,
    calculateHeaderActionLayout,
    getHoverHeader: () => dragDropManager.hoverTh
  });

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

  const headerInsertAffordance = createDragDropHeaderInsertAffordance({
    document,
    window,
    getLifecycleState,
    getHeaderInsertPosition,
    isResizeModeActive,
    isDragging: () => document.body.classList.contains('dragging-cursor')
  });

  function positionDropAnchor(rect, table, clientX, colIndex) {
    const viewportRect = getDropIndicatorViewportRect(table);
    const layout = getDropAnchorLayout({
      columnRect: rect,
      viewportRect,
      clientX,
      colIndex,
      draggedIndex: dragDropManager.activeDragIndex,
      dragGroupIndices: dragDropManager.activeDragGroupIndices,
      displayedFields: getDisplayedFields(),
      getBaseFieldName,
      scrollX: window.scrollX,
      scrollY: window.scrollY
    });
    if (!layout.visible) {
      clearDropAnchor(table);
      return false;
    }

    highlightDropTargetColumn(table, colIndex);
    dropAnchor.classList.add('vertical');
    dropAnchor.style.width = layout.width + 'px';
    dropAnchor.style.height = layout.height + 'px';
    dropAnchor.style.left = layout.left + 'px';
    dropAnchor.style.top = layout.top + 'px';
    dropAnchor.style.display = 'block';
    return true;
  }

  function clearDropTargetColumn(root = document) {
    const scope = root || document;
    scope.querySelectorAll('.th-drag-over, .query-table-column-drop-target').forEach(el => {
      el.classList.remove('th-drag-over', 'query-table-column-drop-target');
    });
  }

  function highlightDropTargetColumn(table, colIndex) {
    if (!table || !Number.isInteger(colIndex)) {
      return;
    }

    clearDropTargetColumn(table);
    table.querySelectorAll(`[data-col-index="${colIndex}"]`).forEach(cell => {
      cell.classList.add('query-table-column-drop-target');
    });

    const targetHeader = table.querySelector(`thead th[data-col-index="${colIndex}"]`);
    if (targetHeader && !targetHeader.classList.contains('th-dragging')) {
      targetHeader.classList.add('th-drag-over');
    }
  }

  function clearDropAnchor(root = document) {
    dropAnchor.classList.remove('vertical');
    dropAnchor.style.display = 'none';
    clearDropTargetColumn(root);
  }

  const dragDropManager = {
    hoverTh: null,
    autoScrollInterval: null,
    autoScrollDirection: null,
    autoScrollPointerX: 0,
    scrollContainer: null,
    lastDragX: 0,
    lastDragY: 0,
    isAnimating: false,
    activeTable: null,
    activeDragIndex: -1,
    activeDragGroupIndices: [],
    autoScrollAllowOutsideViewport: true,

    startAutoScroll(direction, container, options = {}) {
      if (Number.isFinite(this.lastDragX)) {
        this.autoScrollPointerX = this.lastDragX;
      }

      if (this.autoScrollInterval && this.autoScrollDirection === direction) {
        return;
      }

      this.stopAutoScroll();
      this.autoScrollDirection = direction;
      this.autoScrollAllowOutsideViewport = options.allowOutsideViewport !== false;

      this.autoScrollInterval = setInterval(() => {
        if (!this.activeTable) {
          this.stopAutoScroll();
          return;
        }

        const pointerStillNearTable = this.autoScrollAllowOutsideViewport
          ? isPointerNearDropViewport(this.activeTable, this.autoScrollPointerX, this.lastDragY, getOutsideDropViewportOptions(window))
          : isPointerWithinDropViewport(this.activeTable, this.autoScrollPointerX, this.lastDragY);

        if (!pointerStillNearTable) {
          clearDropAnchor(this.activeTable);
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

        if (this.activeTable) {
          this.updateDropIndicatorFromPointer(this.activeTable, this.autoScrollPointerX, this.lastDragY, {
            allowOutsideViewport: this.autoScrollAllowOutsideViewport
          });
        }

        if (!step.changed) {
          this.stopAutoScroll();
        }
      }, 16);
    },

    stopAutoScroll() {
      if (this.autoScrollInterval) {
        clearInterval(this.autoScrollInterval);
        this.autoScrollInterval = null;
      }
      this.autoScrollDirection = null;
      this.autoScrollAllowOutsideViewport = true;
    },

    checkAutoScroll(e, container, options = {}) {
      if (!container) return;

      const mouseX = e.clientX;
      const mouseY = e.clientY;
      this.lastDragX = mouseX;
      this.lastDragY = mouseY;
      this.autoScrollPointerX = mouseX;

      const intent = getAutoScrollIntent({
        pointerX: mouseX,
        pointerY: mouseY,
        containerRect: container.getBoundingClientRect(),
        scrollLeft: container.scrollLeft,
        scrollWidth: container.scrollWidth,
        clientWidth: container.clientWidth,
        allowOutsideViewport: options.allowOutsideViewport !== false,
        ...(options.allowOutsideViewport !== false ? getOutsideDropViewportOptions(window) : {})
      });

      if (intent.outside) {
        this.stopAutoScroll();
        clearDropAnchor(this.activeTable || document);
        return;
      }

      if (intent.direction) {
        this.startAutoScroll(intent.direction, container, {
          allowOutsideViewport: options.allowOutsideViewport !== false
        });
      } else {
        this.stopAutoScroll();
      }
    },

    updateDropIndicatorFromPointer(table, clientX, clientY = this.lastDragY, options = {}) {
      const pointerIsInTargetZone = options.allowOutsideViewport
        ? isPointerNearDropViewport(table, clientX, clientY, getOutsideDropViewportOptions(window))
        : isPointerWithinDropViewport(table, clientX, clientY);

      if (!pointerIsInTargetZone) {
        clearDropAnchor(table);
        return;
      }

      const scrollContainer = this.scrollContainer || getDragScrollContainer(table);
      const targetHeader = getClosestVisibleHeaderByX(table, clientX, scrollContainer);
      if (!targetHeader) {
        clearDropAnchor(table);
        return;
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
      headerActionControls.attachToHeader(th);
    },

    handleHeaderLeave(th) {
      th.classList.remove('th-hover');
      this.hoverTh = null;
      headerActionControls.detachFromHeader(th);
    },

    handleHeaderRowPointerMove(event, table) {
      headerInsertAffordance.update(table, event.clientX);
    },

    handleHeaderRowPointerLeave(event) {
      if (event && headerInsertAffordance.contains(event.relatedTarget)) {
        return;
      }
      headerInsertAffordance.clear();
    },

    handleHeaderDragStart(e, th, scrollContainer) {
      if (getLifecycleState().queryRunning || isResizeModeActive() || e.target.closest('.th-resize-handle')) {
        e.preventDefault();
        return;
      }
      headerInsertAffordance.clear({ immediate: true });
      this.activeTable = th.closest('table');
      th.classList.add('th-dragging');
      th.classList.remove('th-hover');
      if (scrollContainer) scrollContainer.classList.add('dragging-scroll-lock');
      document.body.classList.add('dragging-cursor');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData(TABLE_COLUMN_DRAG_MIME, th.dataset.colIndex);

      const colIndex = parseInt(th.dataset.colIndex, 10);
      const fieldName = getDisplayedFields()[colIndex];
      const relatedIndices = getColumnMoveGroupIndices(fieldName, getDisplayedFields());
      this.activeDragIndex = colIndex;
      this.activeDragGroupIndices = relatedIndices;

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
      this.activeDragIndex = -1;
      this.activeDragGroupIndices = [];
      this.lastDragX = 0;
      this.lastDragY = 0;

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
      const rect = element.getBoundingClientRect();
      const colIndex = parseInt(element.dataset.colIndex, 10);
      positionDropAnchor(rect, table, e.clientX, colIndex);

      if (this.scrollContainer) {
        this.checkAutoScroll(e, this.scrollContainer, { allowOutsideViewport: true });
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
        this.checkAutoScroll(e, this.scrollContainer, { allowOutsideViewport: true });
      }
    },

    handleCellDragEnter(e, td, table) {
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
        this.checkAutoScroll(e, this.scrollContainer, { allowOutsideViewport: true });
      }
    },

    handleDragOverByX(e, table) {
      if (!isSupportedTableDrag(e)) {
        clearDropAnchor();
        this.activeDragIndex = -1;
        this.activeDragGroupIndices = [];
        this.lastDragX = 0;
        this.lastDragY = 0;
        return;
      }
      e.preventDefault();
      this.activeTable = table;
      this.updateDropIndicatorFromPointer(table, e.clientX, e.clientY, { allowOutsideViewport: true });

      if (this.scrollContainer) {
        this.checkAutoScroll(e, this.scrollContainer, { allowOutsideViewport: true });
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
        this.checkAutoScroll(e, this.scrollContainer, { allowOutsideViewport: true });
      }
    },

    handleDocumentDragOver(e) {
      if (!this.activeTable || !isSupportedTableDrag(e) || this.activeTable.contains(e.target)) {
        return;
      }

      if (!isPointerNearDropViewport(this.activeTable, e.clientX, e.clientY, getOutsideDropViewportOptions(window))) {
        if (this.scrollContainer) {
          this.checkAutoScroll(e, this.scrollContainer, { allowOutsideViewport: true });
        } else {
          clearDropAnchor(this.activeTable);
        }
        return;
      }

      e.preventDefault();
      this.updateDropIndicatorFromPointer(this.activeTable, e.clientX, e.clientY, { allowOutsideViewport: true });

      if (this.scrollContainer) {
        this.checkAutoScroll(e, this.scrollContainer, { allowOutsideViewport: true });
      }
    },

    handleDocumentDrop(e) {
      if (!this.activeTable || !isSupportedTableDrag(e) || this.activeTable.contains(e.target)) {
        return;
      }

      const table = this.activeTable;
      if (!isPointerNearDropViewport(table, e.clientX, e.clientY, getOutsideDropViewportOptions(window))) {
        clearDropAnchor(table);
        this.stopAutoScroll();
        this.activeTable = null;
        return;
      }

      e.preventDefault();
      e.stopPropagation();

      const best = getClosestVisibleHeaderByX(table, e.clientX, getDragScrollContainer(table));
      if (!best) {
        clearDropAnchor(table);
        this.stopAutoScroll();
        this.activeTable = null;
        return;
      }

      this.handleDrop(e, best, table);
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
        this.activeDragIndex = -1;
        this.activeDragGroupIndices = [];
        this.lastDragX = 0;
        this.lastDragY = 0;
        return;
      }

      th.classList.remove('th-drag-over');
      clearDropAnchor();
      this.activeDragIndex = -1;
      this.activeDragGroupIndices = [];
      this.lastDragX = 0;
      this.lastDragY = 0;
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
      this.activeDragIndex = -1;
      this.activeDragGroupIndices = [];
      this.lastDragX = 0;
      this.lastDragY = 0;
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
        const onResizeStart = event => {
          const resizeTarget = resolveColumnResizeStartTarget(event, { getColumnResizeState, isResizeModeActive });
          if (resizeTarget) {
            columnResizeController.begin(event, resizeTarget.resizeHandle, resizeTarget.th);
          }
        };
        const onPointerMove = event => this.handleHeaderRowPointerMove(event, table);
        const onPointerLeave = event => this.handleHeaderRowPointerLeave(event);
        const onScroll = () => headerInsertAffordance.clear({ immediate: true });

        headerRow.addEventListener('pointerdown', onResizeStart);
        headerRow.addEventListener('touchstart', onResizeStart, { passive: false });
        headerRow.addEventListener('mousemove', onPointerMove);
        headerRow.addEventListener('mouseleave', onPointerLeave);

        const scrollContainerEl = this.scrollContainer;
        if (scrollContainerEl) {
          scrollContainerEl.addEventListener('scroll', onScroll);
        }

        headerRow._insertAffordanceBound = true;
        headerRow._insertAffordanceCleanup = () => {
          headerRow.removeEventListener('pointerdown', onResizeStart);
          headerRow.removeEventListener('touchstart', onResizeStart);
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

  ClipboardUtils.bindCopyButton(headerActionControls.copyButton, async () => {
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

  headerActionControls.sortButton.addEventListener('click', e => {
    e.stopPropagation();
    if (getLifecycleState().queryRunning) return;
    const th = dragDropManager.hoverTh;
    const fieldName = th?.getAttribute('data-sort-field');
    if (!fieldName) {
      return;
    }

    services.sortTableBy(fieldName);
    headerActionControls.syncSortState(th);
  });

  headerActionControls.trashButton.addEventListener('click', e => {
    e.stopPropagation();
    if (getLifecycleState().queryRunning) return;
    const th = dragDropManager.hoverTh;
    if (th) {
      const idx = parseInt(th.dataset.colIndex, 10);
      const table = th.closest('table');
      removeColumn(table, idx);
    }
  });

  headerInsertAffordance.insertButton.addEventListener('click', e => {
    e.stopPropagation();
    if (getLifecycleState().queryRunning) return;

    const insertAt = headerInsertAffordance.getInsertAt();
    if (!Number.isInteger(insertAt)) {
      return;
    }

    headerInsertAffordance.clear();
    SharedFieldPicker.openQueryFieldPicker({ insertAt }).catch(error => {
      console.error('Failed to open insert field picker:', error);
      showToastMessage('Failed to open the field picker.', 'error');
    });
  });

  headerInsertAffordance.root.addEventListener('mouseleave', event => {
    if (event.relatedTarget && event.relatedTarget.closest && event.relatedTarget.closest('thead tr')) {
      return;
    }
    headerInsertAffordance.clear();
  });

  function addDragAndDrop(table) {
    dragDropManager.initTableDragDrop(table);
    services.syncColumnResizeModeUi?.();
  }

  function resetHeaderUi() {
    headerInsertAffordance.clear({ immediate: true });
    clearDropAnchor();
    columnResizeController.stop({ keepMode: true });

    if (dragDropManager.hoverTh) {
      dragDropManager.hoverTh.classList.remove('th-hover');
    }

    headerActionControls.detachFromHeader(dragDropManager.hoverTh);

    document.querySelectorAll('#example-table th').forEach(th => headerActionControls.clearLayoutState(th));

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

  document.addEventListener('dragover', event => dragDropManager.handleDocumentDragOver(event), true);
  document.addEventListener('drop', event => dragDropManager.handleDocumentDrop(event), true);

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
    resetHeaderUi,
    clearInsertAffordance: headerInsertAffordance.clear,
    syncHeaderSortActionState: headerActionControls.syncSortState,
    refreshColIndices,
    moveColumn,
    removeColumn,
    positionDropAnchor,
    clearDropAnchor,
    addColumn,
    removeColumnByName,
    restoreFieldWithDuplicates,
    getDuplicateGroups
  });

  registerDragDropService(DragDropInteractions);
})();

export { DragDropInteractions };
