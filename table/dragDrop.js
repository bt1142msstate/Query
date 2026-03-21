/**
 * Drag & Drop System for column reordering and bubble dropping.
 * Handles dragging bubbles to table headers and reordering columns.
 * @module DragDrop
 */

// Use shared utility function from query.js

// Store information about removed columns - Managed in columnManager.js
var getDisplayedFields = window.QueryStateReaders.getDisplayedFields.bind(window.QueryStateReaders);
var appState = window.AppState;
var services = window.AppServices;
var uiActions = window.AppUiActions;
var dragDropColumnOps = window.DragDropColumnOps;
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
  return window.DragUtils.hasDragType(event, TABLE_COLUMN_DRAG_MIME) || window.DragUtils.hasDragType(event, BUBBLE_FIELD_DRAG_MIME);
}



// Global drop anchor element for visual feedback during drag operations
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

// Create header remove icon for column removal
const headerTrash = document.createElement('button');
headerTrash.type = 'button';
headerTrash.className = 'th-action th-trash';
headerTrash.setAttribute('aria-label', 'Remove column');
headerTrash.setAttribute('data-tooltip', 'Remove column');
headerTrash.innerHTML = window.Icons.trashSVG();

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

  headerSort.disabled = !isSortable || Boolean(appState.queryRunning);
  headerSort.classList.toggle('is-active', isActive);
  headerSort.classList.toggle('is-desc', isActive && sortDirection === 'desc');
  headerSort.setAttribute('aria-label', !isSortable ? 'Sorting unavailable for this column' : (isActive ? `Sorted ${sortDirection === 'asc' ? 'ascending' : 'descending'}. Click to reverse.` : 'Sort column'));
  headerSort.setAttribute('data-tooltip', !isSortable ? 'Sorting unavailable' : (isActive ? `Sorted ${sortDirection === 'asc' ? 'ascending' : 'descending'} - click to reverse` : 'Sort ascending'));
}

const headerInsertAffordance = document.createElement('div');
headerInsertAffordance.className = 'th-insert-affordance';
headerInsertAffordance.appendChild(headerInsertButton);

const INSERT_AFFORDANCE_THRESHOLD = 40;
let insertAffordanceShowTimer = null;
let insertAffordanceHideTimer = null;
let pendingInsertCandidate = null;

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

  let bestCandidate = null;
  let bestDistance = Infinity;

  const firstRect = headers[0].getBoundingClientRect();
  const lastRect = headers[headers.length - 1].getBoundingClientRect();
  const top = Math.min(firstRect.top, lastRect.top);
  const height = Math.max(firstRect.bottom, lastRect.bottom) - top;

  const leadingDistance = Math.abs(clientX - firstRect.left);
  if (leadingDistance < bestDistance) {
    bestDistance = leadingDistance;
    bestCandidate = {
      insertAt: 0,
      boundaryX: firstRect.left,
      top,
      height
    };
  }

  for (let index = 0; index < headers.length - 1; index += 1) {
    const leftHeader = headers[index];
    const rightHeader = headers[index + 1];
    const leftRect = leftHeader.getBoundingClientRect();
    const rightRect = rightHeader.getBoundingClientRect();
    const boundaryX = (leftRect.right + rightRect.left) / 2;
    const distance = Math.abs(clientX - boundaryX);

    if (distance < bestDistance) {
      bestDistance = distance;
      bestCandidate = {
        insertAt: index + 1,
        boundaryX,
        top: Math.min(leftRect.top, rightRect.top),
        height: Math.max(leftRect.bottom, rightRect.bottom) - Math.min(leftRect.top, rightRect.top)
      };
    }
  }

  const trailingDistance = Math.abs(clientX - lastRect.right);
  if (trailingDistance < bestDistance) {
    bestDistance = trailingDistance;
    bestCandidate = {
      insertAt: headers.length,
      boundaryX: lastRect.right,
      top,
      height
    };
  }

  return bestDistance <= INSERT_AFFORDANCE_THRESHOLD ? bestCandidate : null;
}

function updateHeaderInsertAffordance(table, clientX) {
  if (!table || appState.queryRunning || document.body.classList.contains('dragging-cursor')) {
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


/**
 * Positions the visual drop anchor during drag operations.
 * Hides the anchor when hovering within duplicate field groups.
 * @function positionDropAnchor
 * @param {DOMRect} rect - Bounding rectangle of the target element
 * @param {HTMLElement} table - The table element
 * @param {number} clientX - Mouse X coordinate
 * @param {number} colIndex - Column index for validation
 */
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

  const insertLeft = (clientX - rect.left) < rect.width/2;
  const insertAt = insertLeft ? colIndex : colIndex + 1;
  
  // Check if this position would be within a duplicate group
  const displayedFields = getDisplayedFields();
  if (displayedFields.length > 1 && 
      insertAt > 0 && insertAt < displayedFields.length) {
    
    const beforeField = displayedFields[insertAt - 1];
    const afterField = displayedFields[insertAt];
    
    if (beforeField && afterField) {
      const beforeBase = window.getBaseFieldName(beforeField);
      const afterBase = window.getBaseFieldName(afterField);
      
      // If trying to insert between duplicates, hide the anchor
      if (beforeBase === afterBase) {
        dropAnchor.style.display = 'none';
        return;
      }
    }
  }
  
  // Position is valid, show the anchor
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


// Bubble drop target functionality
function attachBubbleDropTarget(container) {
  if (container._bubbleDropSetup) return; // guard against double-bind
  container.addEventListener('dragover', e => {
    if (!isSupportedTableDrag(e)) {
      clearDropAnchor();
      return;
    }
    e.preventDefault();
    if (e.target.closest('th') || e.target.closest('tbody')) return; // handled by header/body listeners
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
    if (e.target.closest('th') || e.target.closest('tbody')) return; // handled by header/body listeners
    
    const table = container.querySelector('table');
    if (table) {
      const best = getClosestVisibleHeaderByX(table, e.clientX, getDragScrollContainer(table));
      if (best) {
        dragDropManager.handleDrop(e, best, table);
        return;
      }
    }

    // Fallback if no table headers
    const field = e.dataTransfer.getData(BUBBLE_FIELD_DRAG_MIME);
    if (field) {
      if (restoreFieldWithDuplicates(field)) {
        dragDropManager.dropSuccessful = true;
        uiActions.showExampleTable(getDisplayedFields(), { syncQueryState: false });
      }
    }
    clearDropAnchor();
  });
  container._bubbleDropSetup = true;
}

// Main drag and drop manager
const dragDropManager = {
  // Track state
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
  
  // Auto-scroll functionality
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

      const rect = container.getBoundingClientRect();
      const threshold = 90;
      let proximity = 0;

      if (direction === 'left') {
        proximity = Math.max(0, (rect.left + threshold) - this.autoScrollPointerX);
      } else if (direction === 'right') {
        proximity = Math.max(0, this.autoScrollPointerX - (rect.right - threshold));
      }

      const intensity = Math.min(1, proximity / threshold);
      const scrollAmount = Math.max(4, Math.round(4 + (intensity * 8)));
      const previousScrollLeft = container.scrollLeft;

      if (direction === 'left') {
        container.scrollLeft = Math.max(0, container.scrollLeft - scrollAmount);
      } else if (direction === 'right') {
        const maxScrollLeft = Math.max(0, container.scrollWidth - container.clientWidth);
        container.scrollLeft = Math.min(maxScrollLeft, container.scrollLeft + scrollAmount);
      }

      if (container.scrollLeft !== previousScrollLeft && this.activeTable) {
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
    
    const rect = container.getBoundingClientRect();
    const scrollThreshold = 90;
    const mouseX = e.clientX;
    const mouseY = e.clientY;
    this.autoScrollPointerX = mouseX;

    if (mouseX < rect.left || mouseX > rect.right || mouseY < rect.top || mouseY > rect.bottom) {
      this.stopAutoScroll();
      clearDropAnchor();
      return;
    }
    
    // Check if near left edge
    if (mouseX < rect.left + scrollThreshold && container.scrollLeft > 0) {
      this.startAutoScroll('left', container);
    }
    // Check if near right edge
    else if (mouseX > rect.right - scrollThreshold && 
             container.scrollLeft < container.scrollWidth - container.clientWidth) {
      this.startAutoScroll('right', container);
    }
    // Stop auto-scroll if not near edges
    else {
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
  
  // Header hover handlers
  handleHeaderEnter(th) {
    if (appState.queryRunning) return;
    th.classList.add('th-hover');
    this.hoverTh = th;
    th.appendChild(headerActions);
    syncHeaderSortActionState(th);
    // Let CSS handle visibility so flexbox doesn't wrap
  },
  
  handleHeaderLeave(th) {
    th.classList.remove('th-hover');
    this.hoverTh = null;
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
  
  // Header drag start/end
  handleHeaderDragStart(e, th, scrollContainer) {
    if (appState.queryRunning) {
      e.preventDefault();
      return;
    }
    clearInsertAffordance({ immediate: true });
    this.isBubbleDrag = false; // this is a column drag
    this.activeTable = th.closest('table');
    th.classList.add('th-dragging');
    th.classList.remove('th-hover');
    if (scrollContainer) scrollContainer.classList.add('dragging-scroll-lock');
    document.body.classList.add('dragging-cursor');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData(TABLE_COLUMN_DRAG_MIME, th.dataset.colIndex);
    
    // Check if this is part of a group with duplicates
    const colIndex = parseInt(th.dataset.colIndex, 10);
    const fieldName = getDisplayedFields()[colIndex];
    const relatedIndices = findRelatedColumnIndices(fieldName);
    
    // Highlight all related columns being moved
    relatedIndices.forEach(index => {
      const relatedHeader = document.querySelector(`thead th[data-col-index="${index}"]`);
      if (relatedHeader) {
        relatedHeader.classList.add('th-dragging');
      }
    });
    
    // Create drag ghost that looks like a column preview
    const ghost = createColumnDragGhost(th, relatedIndices);
    ghost.classList.add('ghost-drag');
    ghost.style.pointerEvents = 'none';
    ghost.style.position = 'absolute';
    ghost.style.top = '-9999px';
    ghost.style.left = '-9999px';
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, ghost.offsetWidth / 2, ghost.offsetHeight / 2);
    
    // Store a reference to the ghost for cleanup
    if (th._ghost && th._ghost.parentNode) {
      th._ghost.parentNode.removeChild(th._ghost);
    }
    th._ghost = ghost;
    
    // Don't remove the ghost immediately as it causes issues in some browsers
    // Instead, hide it after it's been used as the drag image
    setTimeout(() => {
      if (ghost.parentNode) {
        ghost.style.visibility = 'hidden';
      }
    }, 0);
  },
  
  handleHeaderDragEnd(th, scrollContainer) {
    // Remove dragging class from all headers (in case of group drag)
    document.querySelectorAll('th').forEach(h => {
      h.classList.remove('th-dragging', 'th-hover');
    });
    document.querySelectorAll('.th-drag-over').forEach(el => el.classList.remove('th-drag-over'));
    
    if (scrollContainer) scrollContainer.classList.remove('dragging-scroll-lock');
    document.body.classList.remove('dragging-cursor');
    clearDropAnchor();
    this.stopAutoScroll(); // Stop auto-scroll when drag ends
    this.activeTable = null;
    
    // Clean up the ghost element
    if (th._ghost) {
      if (th._ghost.parentNode) {
        th._ghost.parentNode.removeChild(th._ghost);
      }
      delete th._ghost;
    }
  },
  
  // Common drag event handlers
  handleDragEnter(e, element, table) {
    if (!isSupportedTableDrag(e)) {
      clearDropAnchor();
      return;
    }
    e.preventDefault();
    this.activeTable = table;
    // Clear any existing highlight
    table.querySelectorAll('.th-drag-over').forEach(el => el.classList.remove('th-drag-over'));
    if (!element.classList.contains('th-dragging')) {
      element.classList.add('th-drag-over');
    }
    const rect = element.getBoundingClientRect();
    const colIndex = parseInt(element.dataset.colIndex, 10);
    positionDropAnchor(rect, table, e.clientX, colIndex);
    
    // Check for auto-scroll for both bubble drags and column drags
    if (this.scrollContainer) {
      this.checkAutoScroll(e, this.scrollContainer);
    }
  },
  
  handleDragLeave() {
    clearDropAnchor();
    // Note: Don't stop auto-scroll here as dragLeave fires frequently during drag
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
    
    // Check for auto-scroll for both bubble drags and column drags
    if (this.scrollContainer) {
      this.checkAutoScroll(e, this.scrollContainer);
    }
  },
  
  // Cell-specific handlers
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
    
    // Check for auto-scroll for both bubble drags and column drags
    if (this.scrollContainer) {
      this.checkAutoScroll(e, this.scrollContainer);
    }
  },
  
  // Fallback: show drop anchor based on mouse X vs header positions (used for spacer cells / empty tables)
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
    
    // Check for auto-scroll for both bubble drags and column drags
    if (this.scrollContainer) {
      this.checkAutoScroll(e, this.scrollContainer);
    }
  },
  
  // Drop handlers
  handleDrop(e, th, table) {
    if (!isSupportedTableDrag(e)) {
      clearDropAnchor();
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    this.activeTable = null;
    const toIndex = parseInt(th.dataset.colIndex, 10);
    
    // Stop auto-scroll when dropping
    this.stopAutoScroll();
  
    // Column reorder drop
    const fromIndexStr = e.dataTransfer.getData(TABLE_COLUMN_DRAG_MIME).trim();
    if (/^\d+$/.test(fromIndexStr)) {
      const fromIndex = parseInt(fromIndexStr, 10);
      if (fromIndex !== toIndex) {
        // Calculate insertion position based on mouse position relative to drop target
        const rect = th.getBoundingClientRect();
        const insertAt = (e.clientX - rect.left) < rect.width/2 ? toIndex : toIndex + 1;
        
        // Adjust insertion index when moving from left to right
        const finalInsertAt = fromIndex < insertAt ? insertAt - 1 : insertAt;
        
        moveColumn(table, fromIndex, finalInsertAt);
        refreshColIndices(table);
      }
      th.classList.remove('th-drag-over');
      clearDropAnchor();
      return;
    }
    
    // Bubble drop - insert new field
    const bubbleField = e.dataTransfer.getData(BUBBLE_FIELD_DRAG_MIME);
    if (bubbleField) {
      const rect = th.getBoundingClientRect();
      const insertAt = (e.clientX - rect.left) < rect.width/2 ? toIndex : toIndex + 1;
      if (restoreFieldWithDuplicates(bubbleField, insertAt)) {
        dragDropManager.dropSuccessful = true;
        uiActions.showExampleTable(getDisplayedFields(), { syncQueryState: false });
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
    
    // Stop auto-scroll when dropping
    this.stopAutoScroll();
  
    // Bubble drop
    const bubbleField = e.dataTransfer.getData(BUBBLE_FIELD_DRAG_MIME);
    if (bubbleField) {
      const rect = td.getBoundingClientRect();
      const insertAt = (e.clientX - rect.left) < rect.width/2 ? toIndex : toIndex + 1;
      if (restoreFieldWithDuplicates(bubbleField, insertAt)) {
        dragDropManager.dropSuccessful = true;
        uiActions.showExampleTable(getDisplayedFields(), { syncQueryState: false });
      }
      clearDropAnchor();
      return;
    }
    
    // Header reorder drop
    const fromIndex = parseInt(e.dataTransfer.getData(TABLE_COLUMN_DRAG_MIME), 10);
    if (!isNaN(fromIndex) && fromIndex !== toIndex) {
      // Calculate insertion position based on mouse position relative to drop target
      const targetHeader = table.querySelector(`thead th[data-col-index="${toIndex}"]`);
      const rect = targetHeader.getBoundingClientRect();
      const insertAt = (e.clientX - rect.left) < rect.width/2 ? toIndex : toIndex + 1;
      
      // Adjust insertion index when moving from left to right
      const finalInsertAt = fromIndex < insertAt ? insertAt - 1 : insertAt;
      
      moveColumn(table, fromIndex, finalInsertAt);
      refreshColIndices(table);
    }
    
    // Clear visual states
    table.querySelectorAll('.th-drag-over').forEach(el => el.classList.remove('th-drag-over'));
    clearDropAnchor();
  },
  
  // Set bubble drag state for tracking
  setBubbleDrag(state) {
    this.isBubbleDrag = state;
  },

  // Clean up existing event listeners before adding new ones
  cleanupTableListeners(table) {
    if (!table) return;
    try {
      // Remove delegated tbody listeners
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

  // Initialize drag-and-drop for a table
  initTableDragDrop(table) {
    if (!table) return;
    
    // Ensure every header/cell has an up-to-date col index
    refreshColIndices(table);
    const scrollContainer = getDragScrollContainer(table);
    this.scrollContainer = scrollContainer;
    
    // Bind header listeners only once (headers are never replaced)
    if (!table._headersDragInitialized) {
      const headers = table.querySelectorAll('th[draggable="true"]');
      headers.forEach(th => {
        const listeners = {
          mouseenter: () => this.handleHeaderEnter(th),
          mouseleave: () => this.handleHeaderLeave(th),
          dragstart: (e) => this.handleHeaderDragStart(e, th, scrollContainer),
          dragend:   (e) => this.handleHeaderDragEnd(th, scrollContainer),
          dragenter: (e) => this.handleDragEnter(e, th, table),
          dragleave: () => this.handleDragLeave(),
          dragover:  (e) => this.handleDragOver(e, th, table),
          drop:      (e) => this.handleDrop(e, th, table)
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
      const onPointerMove = event => this.handleHeaderRowPointerMove(event, table);
      const onPointerLeave = event => this.handleHeaderRowPointerLeave(event);
      const onScroll = () => clearInsertAffordance({ immediate: true });

      headerRow.addEventListener('mousemove', onPointerMove);
      headerRow.addEventListener('mouseleave', onPointerLeave);

      const scrollContainerEl = this.scrollContainer;
      if (scrollContainerEl) {
        scrollContainerEl.addEventListener('scroll', onScroll);
      }

      headerRow._insertAffordanceBound = true;
      headerRow._insertAffordanceCleanup = () => {
        headerRow.removeEventListener('mousemove', onPointerMove);
        headerRow.removeEventListener('mouseleave', onPointerLeave);
        if (scrollContainerEl) {
          scrollContainerEl.removeEventListener('scroll', onScroll);
        }
      };
    }
    
    // Use event delegation on tbody so that dynamically rendered rows (virtual
    // scroll) are always covered — no need to rebind on every scroll render.
    const tbody = table.querySelector('tbody');
    if (!tbody) return;
    
    // Remove any previous delegated listeners before re-binding
    this.cleanupTableListeners(table);
    
    const getValidTd = (e) => {
      const td = e.target.closest('td');
      if (!td) return null;
      // If it's a spacer cell (has colspan), treat it as an empty area
      if (td.hasAttribute('colspan')) return null;
      const colIndex = parseInt(td.dataset.colIndex, 10);
      if (isNaN(colIndex)) return null; // spacer cell — ignore
      return td;
    };
    
    const tbodyListeners = {
      dragenter: (e) => {
        const td = getValidTd(e);
        if (td) this.handleCellDragEnter(e, td, table);
        else this.handleDragOverByX(e, table); // spacer / empty table fallback
      },
      dragover: (e) => {
        const td = getValidTd(e);
        if (td) this.handleCellDragOver(e, td, table);
        else this.handleDragOverByX(e, table); // spacer / empty table fallback
      },
      dragleave: (e) => {
        // Only clear when leaving the tbody entirely, not between cells
        if (!tbody.contains(e.relatedTarget)) this.handleDragLeave();
      },
      drop: (e) => {
        const td = getValidTd(e);
        if (td) this.handleCellDrop(e, td, table);
        else {
          // Dropped on spacer/empty area — derive column from X position
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

// Set up copy icon click handler
window.ClipboardUtils.bindCopyButton(headerCopy, async () => {
  if (appState.queryRunning) {
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
  if (appState.queryRunning) return;
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
  if (appState.queryRunning) return;
  const th = dragDropManager.hoverTh;
  if (th) {
    const idx = parseInt(th.dataset.colIndex, 10);
    const table = th.closest('table');
    removeColumn(table, idx);
  }
});

headerInsertButton.addEventListener('click', e => {
  e.stopPropagation();
  if (appState.queryRunning) return;

  const insertAt = parseInt(headerInsertAffordance.dataset.insertAt || '', 10);
  if (!Number.isInteger(insertAt) || !window.SharedFieldPicker || typeof window.SharedFieldPicker.openQueryFieldPicker !== 'function') {
    return;
  }

  clearInsertAffordance();
  window.SharedFieldPicker.openQueryFieldPicker({ insertAt }).catch(error => {
    console.error('Failed to open insert field picker:', error);
    if (window.showToastMessage) {
      window.showToastMessage('Failed to open the field picker.', 'error');
    }
  });
});

headerInsertAffordance.addEventListener('mouseleave', event => {
  if (event.relatedTarget && event.relatedTarget.closest && event.relatedTarget.closest('thead tr')) {
    return;
  }
  clearInsertAffordance();
});

// Document-level event listeners for bubble dragging
document.addEventListener('dragstart', e => {
  if (appState.queryRunning) {
    e.preventDefault();
    return;
  }
  clearInsertAffordance({ immediate: true });
  const bubble = e.target.closest('.bubble');
  if (!bubble) return;
  
  // Check if this bubble is already displayed in the table
  const fieldName = bubble.textContent.trim();
  if (getDisplayedFields().includes(fieldName)) {
    // Prevent dragging of already displayed bubbles
    e.preventDefault();
    return;
  }
  
  // Store original position and bubble for potential return animation
  dragDropManager.draggedBubble = bubble;
  dragDropManager.draggedBubbleOriginalRect = bubble.getBoundingClientRect();
  dragDropManager.dropSuccessful = false;
  
  e.dataTransfer.setData(BUBBLE_FIELD_DRAG_MIME, fieldName);
  e.dataTransfer.effectAllowed = 'copyMove'; // Allow both copy and move
  e.dataTransfer.dropEffect = 'move'; // Set the drop effect
  dragDropManager.setBubbleDrag(true);
  
  // Clone bubble and wrap it in a padded container BEFORE fading original
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
  
  // NOW fade the original bubble after the ghost is created
  bubble.style.opacity = '0.3';
});

// Comprehensive drag event handling to prevent browser snap-back animations
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
    e.preventDefault(); // Always prevent default for bubble drags
    e.dataTransfer.dropEffect = 'move'; // Signal that this is a valid drop zone
    
    // Track mouse position within viewport bounds
    const margin = 50; // pixels from edge
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
    e.preventDefault(); // Prevent browser's default drop behavior
  }
});

// Window-level handlers to catch drags that go outside the document
window.addEventListener('dragover', e => {
  if (dragDropManager.isBubbleDrag) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move'; // Always signal valid drop
  }
}, { capture: true });

window.addEventListener('drop', e => {
  if (dragDropManager.isBubbleDrag) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move'; // Signal successful drop
  }
}, { capture: true });

document.addEventListener('dragend', e => {
  const bubble = e.target.closest('.bubble');
  if (bubble && dragDropManager.draggedBubble) { // Only handle if we have a tracked drag
    console.log('Dragend event fired for:', bubble.textContent.trim());
    dragDropManager.setBubbleDrag(false);
    dragDropManager.stopAutoScroll();
    dragDropManager.activeTable = null;
    
    // Check if drop was actually successful by looking at if the field was added to displayedFields
    const fieldName = bubble.textContent.trim();
    const wasActuallyDropped = getDisplayedFields().includes(fieldName);
    
    // If the bubble was NOT successfully dropped, animate it back
    if (!wasActuallyDropped && dragDropManager.draggedBubble && dragDropManager.draggedBubbleOriginalRect && !dragDropManager.isAnimating) {
      console.log('Starting return animation for:', fieldName);
      dragDropManager.isAnimating = true;
      const originalRect = dragDropManager.draggedBubbleOriginalRect;
      const originalBubble = dragDropManager.draggedBubble;
      
      // Keep the original bubble faded during the return animation
      // (it's already at 0.3 opacity from the drag start)
      
      // Create a clone for return animation - use the original bubble but restore full opacity for the clone
      const returnClone = bubble.cloneNode(true);
      returnClone.style.position = 'fixed';
      returnClone.style.zIndex = '1001';
      returnClone.style.pointerEvents = 'none';
      returnClone.style.opacity = '1'; // Make sure clone is full opacity regardless of original state
      
      // Clear any inherited transitions that might cause conflicts
      returnClone.style.transition = 'transform 0.45s ease';
      returnClone.style.transform = 'translate(0, 0)';
      
      // Start at last drag position, with fallback to center if position is invalid
      let startX = dragDropManager.lastDragX - 25;
      let startY = dragDropManager.lastDragY - 15;
      
      // Fallback to center of screen if we lost tracking (dragged off-screen)
      if (dragDropManager.lastDragX === 0 && dragDropManager.lastDragY === 0) {
        startX = window.innerWidth / 2 - 25;
        startY = window.innerHeight / 2 - 15;
        console.log('Using fallback position - bubble was dragged off-screen');
      }
      
      // Ensure position is within viewport bounds
      const margin = 50;
      startX = Math.max(margin, Math.min(window.innerWidth - margin, startX));
      startY = Math.max(margin, Math.min(window.innerHeight - margin, startY));
      returnClone.style.top = startY + 'px';
      returnClone.style.left = startX + 'px';
      
      document.body.appendChild(returnClone);
      
      // Force reflow to ensure initial position is set
      returnClone.offsetHeight;
      
      // Calculate exact distance and animate using transform
      const deltaX = originalRect.left - startX;  // horizontal distance
      const deltaY = originalRect.top - startY;   // vertical distance
      
      // Use requestAnimationFrame to ensure transform animation starts after initial position
      requestAnimationFrame(() => {
        returnClone.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
      });
      
      // After animation completes, remove clone and restore original opacity
      returnClone.addEventListener('transitionend', function cleanup() {
        console.log('Animation finished for:', fieldName);
        returnClone.remove();
        originalBubble.style.opacity = ''; // Restore original to full opacity
        dragDropManager.isAnimating = false;
      }, { once: true });
      
      // Fallback cleanup
      setTimeout(() => {
        if (returnClone.parentNode) {
          console.log('Fallback cleanup for:', fieldName);
          returnClone.remove();
        }
        originalBubble.style.opacity = ''; // Restore original to full opacity
        dragDropManager.isAnimating = false;
      }, 600);
    } else {
      // If drop was successful or no animation needed, just restore the original bubble
      if (dragDropManager.draggedBubble) {
        dragDropManager.draggedBubble.style.opacity = '';
        dragDropManager.draggedBubble.style.visibility = '';
      }
    }
    
    // Reset drag state
    dragDropManager.draggedBubble = null;
    dragDropManager.draggedBubbleOriginalRect = null;
    dragDropManager.dropSuccessful = false;
    dragDropManager.lastDragX = 0;
    dragDropManager.lastDragY = 0;
    dragDropManager.isAnimating = false;
  }
});

// Public API function for initializing drag and drop on a table
function addDragAndDrop(table) {
  dragDropManager.initTableDragDrop(table);
}

function resetHeaderUi() {
  clearInsertAffordance({ immediate: true });
  clearDropAnchor();

  if (dragDropManager.hoverTh) {
    dragDropManager.hoverTh.classList.remove('th-hover');
  }

  if (headerActions.parentNode) {
    headerActions.parentNode.removeChild(headerActions);
  }

  document.querySelectorAll('#example-table .th-drag-over, #example-table .th-dragging').forEach(el => {
    el.classList.remove('th-drag-over', 'th-dragging');
  });

  dragDropManager.hoverTh = null;
  dragDropManager.activeTable = null;
  dragDropManager.stopAutoScroll();
}

// Export the drag and drop system
window.DragDropSystem = {
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
  restoreFieldWithDuplicates,
  addColumn,
  removeColumnByName,
  getDuplicateGroups
};

// Also export centralized functions globally for easy access
window.addColumn = addColumn;
window.removeColumnByName = removeColumnByName;
