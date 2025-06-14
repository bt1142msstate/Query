// Drag & Drop System for column reordering and bubble dropping

// Create drop anchor element for visual feedback during drag operations
const dropAnchor = document.createElement('div');
dropAnchor.className = 'drop-anchor';
document.body.appendChild(dropAnchor);

// Create header trash icon for column removal
const headerTrash = document.createElement('span');
headerTrash.className = 'th-trash';
headerTrash.innerHTML = `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M9 3h6a1 1 0 0 1 1 1v1h4v2H4V5h4V4a1 1 0 0 1 1-1Zm-3 6h12l-.8 11.2A2 2 0 0 1 15.2 22H8.8a2 2 0 0 1-1.99-1.8L6 9Z"/>
  </svg>
`;

// Drop anchor positioning and management
function positionDropAnchor(rect, table, clientX) {
  // Both bubble insertion and column reordering use vertical anchors for consistency
  dropAnchor.classList.add('vertical');
  const insertLeft = (clientX - rect.left) < rect.width/2;
  
  // For virtual scrolling tables, use the container height instead of table height
  const tableContainer = table.closest('.overflow-x-auto.shadow.rounded-lg.mb-6.relative');
  const anchorHeight = tableContainer ? tableContainer.offsetHeight : table.offsetHeight;
  
  dropAnchor.style.width  = '4px';
  dropAnchor.style.height = anchorHeight + 'px';
  dropAnchor.style.left   = (insertLeft ? rect.left : rect.right) + window.scrollX - 2 + 'px';
  dropAnchor.style.top    = (tableContainer ? tableContainer.getBoundingClientRect().top : table.getBoundingClientRect().top) + window.scrollY + 'px';
  dropAnchor.style.display = 'block';
}

function clearDropAnchor() {
  dropAnchor.classList.remove('vertical');
  dropAnchor.style.display = 'none';
}

// Column management functions
function refreshColIndices(table) {
  const ths = table.querySelectorAll('thead th');
  ths.forEach((th, i) => {
    th.dataset.colIndex = i;
    if (!th.hasAttribute('draggable')) th.setAttribute('draggable', 'true');
    if (!th.classList.contains('th-wrapper')) {
      th.classList.add('th-wrapper');
    }
  });
  const rows = table.querySelectorAll('tbody tr');
  rows.forEach(row => {
    Array.from(row.children).forEach((cell, i) => {
      cell.dataset.colIndex = i;
    });
  });
}

function moveColumn(table, fromIndex, toIndex) {
  if (fromIndex === toIndex) return;

  // 1️⃣ Keep displayedFields order in sync first
  if (fromIndex < window.displayedFields.length && toIndex < window.displayedFields.length) {
    const [movedField] = window.displayedFields.splice(fromIndex, 1);
    window.displayedFields.splice(toIndex, 0, movedField);
  }

  // 2️⃣ Update the table header
  const headerRow = table.querySelector('thead tr');
  if (headerRow) {
    const headers = Array.from(headerRow.children);
    if (fromIndex < headers.length && toIndex < headers.length) {
      const moving = headers[fromIndex];
      if (fromIndex < toIndex) {
        headerRow.insertBefore(moving, headers[toIndex].nextSibling);
      } else {
        headerRow.insertBefore(moving, headers[toIndex]);
      }
    }
  }

  // 3️⃣ Recalculate column widths for new order
  if (VirtualTable.virtualTableData.length > 0) {
    VirtualTable.calculatedColumnWidths = VirtualTable.calculateOptimalColumnWidths(window.displayedFields, VirtualTable.virtualTableData);
    
    // Update header widths
    headerRow.querySelectorAll('th').forEach((th, index) => {
      const field = window.displayedFields[index];
      const width = VirtualTable.calculatedColumnWidths[field] || 150;
      th.style.width = `${width}px`;
      th.style.minWidth = `${width}px`;
      th.style.maxWidth = `${width}px`;
    });
  }

  // 4️⃣ Re-render virtual table with new column order
  // Use setTimeout to ensure drag state is fully cleared before re-rendering
  setTimeout(() => {
    VirtualTable.renderVirtualTable();
  }, 0);

  // 5️⃣ Refresh index metadata
  refreshColIndices(table);
  updateQueryJson();
  
  // 6️⃣ If in Selected category, re-render bubbles to match new order
  if (window.currentCategory === 'Selected') {
    safeRenderBubbles();
  }
}

function removeColumn(table, colIndex) {
  // Capture the header text *before* removing, to sync displayedFields
  const headerCell = table.querySelector(`thead th[data-col-index="${colIndex}"]`);
  const fieldName = headerCell ? headerCell.textContent.trim() : null;

  // Update the displayedFields list first
  if (fieldName) {
    const idx = window.displayedFields.indexOf(fieldName);
    if (idx !== -1) window.displayedFields.splice(idx, 1);
  }

  // Remove the header cell
  if (headerCell) {
    headerCell.remove();
  }

  // Re-render virtual table with new column structure
  if (window.displayedFields.length > 0) {
    // Recalculate column widths for remaining fields
    if (VirtualTable.virtualTableData.length > 0) {
      VirtualTable.calculatedColumnWidths = VirtualTable.calculateOptimalColumnWidths(window.displayedFields, VirtualTable.virtualTableData);
      
      // Update remaining header widths
      const headerRow = table.querySelector('thead tr');
      if (headerRow) {
        headerRow.querySelectorAll('th').forEach((th, index) => {
          const field = window.displayedFields[index];
          const width = VirtualTable.calculatedColumnWidths[field] || 150;
          th.style.width = `${width}px`;
          th.style.minWidth = `${width}px`;
          th.style.maxWidth = `${width}px`;
        });
      }
    }
    
    VirtualTable.renderVirtualTable();
  }

  refreshColIndices(table);

  // Update styling for the bubble for this field
  if (fieldName) {
    document.querySelectorAll('.bubble').forEach(bubbleEl => {
      if (bubbleEl.textContent.trim() === fieldName) {
        if (fieldName === 'Marc') {
          bubbleEl.setAttribute('draggable', 'false');
        } else {
          bubbleEl.setAttribute('draggable', 'true');
        }
        applyCorrectBubbleStyling(bubbleEl);
      }
    });
  }

  // Update JSON to reflect removed column
  updateQueryJson();
  // If no columns left, reset to placeholder view
  if (window.displayedFields.length === 0) {
    showExampleTable(window.displayedFields);
  }
  // Update category counts after removing column
  updateCategoryCounts();
  // Re-render bubbles if we're in Selected category
  if (window.currentCategory === 'Selected') {
    safeRenderBubbles();
  }
}

// Bubble drop target functionality
function attachBubbleDropTarget(container) {
  if (container._bubbleDropSetup) return; // guard against double-bind
  container.addEventListener('dragover', e => e.preventDefault());
  container.addEventListener('drop', e => {
    e.preventDefault();
    if (e.target.closest('th')) return; // header drop already handled
    const field = e.dataTransfer.getData('bubble-field'); // will be '' if not a bubble
    if (field && !window.displayedFields.includes(field)) {
      window.displayedFields.push(field);
      showExampleTable(window.displayedFields);
    }
  });
  container._bubbleDropSetup = true;
}

// Main drag and drop manager
const dragDropManager = {
  // Track state
  isBubbleDrag: false,
  hoverTh: null,
  autoScrollInterval: null,
  scrollContainer: null,
  
  // Auto-scroll functionality
  startAutoScroll(direction, container) {
    if (this.autoScrollInterval) return; // Already scrolling
    
    this.autoScrollInterval = setInterval(() => {
      const scrollAmount = 15; // pixels per scroll step
      if (direction === 'left') {
        container.scrollLeft = Math.max(0, container.scrollLeft - scrollAmount);
      } else if (direction === 'right') {
        container.scrollLeft += scrollAmount;
      }
    }, 50); // scroll every 50ms for smooth scrolling
  },

  stopAutoScroll() {
    if (this.autoScrollInterval) {
      clearInterval(this.autoScrollInterval);
      this.autoScrollInterval = null;
    }
  },

  checkAutoScroll(e, container) {
    if (!container) return;
    
    const rect = container.getBoundingClientRect();
    const scrollThreshold = 300; // Increased from 50px to 100px for earlier triggering
    const mouseX = e.clientX;
    
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
  
  // Header hover handlers
  handleHeaderEnter(th) {
    th.classList.add('th-hover');
    this.hoverTh = th;
    th.appendChild(headerTrash);
    headerTrash.style.display = 'block';
  },
  
  handleHeaderLeave(th) {
    th.classList.remove('th-hover');
    this.hoverTh = null;
    if (headerTrash.parentNode) headerTrash.parentNode.removeChild(headerTrash);
  },
  
  // Header drag start/end
  handleHeaderDragStart(e, th, scrollContainer) {
    this.isBubbleDrag = false; // this is a column drag
    th.classList.add('th-dragging');
    th.classList.remove('th-hover');
    if (scrollContainer) scrollContainer.classList.add('dragging-scroll-lock');
    document.body.classList.add('dragging-cursor');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', th.dataset.colIndex);
    
    // Create drag ghost
    const ghost = document.createElement('div');
    ghost.textContent = th.textContent.trim();
    const thStyle = window.getComputedStyle(th);
    ghost.style.color = thStyle.color;
    ghost.classList.add('ghost-drag');
    ghost.style.width = 'auto';
    ghost.style.fontSize = '0.8rem';
    ghost.style.padding = '2px 8px';
    ghost.style.background = '#fff';
    ghost.style.borderRadius = '6px';
    ghost.style.boxShadow = '0 2px 8px rgba(0,0,0,0.12)';
    ghost.style.opacity = '0.95';
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
    th.classList.remove('th-dragging');
    if (scrollContainer) scrollContainer.classList.remove('dragging-scroll-lock');
    document.body.classList.remove('dragging-cursor');
    document.querySelectorAll('th').forEach(h => h.classList.remove('th-hover'));
    document.querySelectorAll('.th-drag-over').forEach(el => el.classList.remove('th-drag-over'));
    clearDropAnchor();
    this.stopAutoScroll(); // Stop auto-scroll when drag ends
    
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
    e.preventDefault();
    // Clear any existing highlight
    table.querySelectorAll('.th-drag-over').forEach(el => el.classList.remove('th-drag-over'));
    if (!element.classList.contains('th-dragging')) {
      element.classList.add('th-drag-over');
    }
    const rect = element.getBoundingClientRect();
    positionDropAnchor(rect, table, e.clientX);
    
    // Check for auto-scroll when dragging columns
    if (!this.isBubbleDrag && this.scrollContainer) {
      this.checkAutoScroll(e, this.scrollContainer);
    }
  },
  
  handleDragLeave() {
    clearDropAnchor();
    // Note: Don't stop auto-scroll here as dragLeave fires frequently during drag
  },
  
  handleDragOver(e, element, table) {
    e.preventDefault();
    const rect = element.getBoundingClientRect();
    positionDropAnchor(rect, table, e.clientX);
    
    // Check for auto-scroll when dragging columns
    if (!this.isBubbleDrag && this.scrollContainer) {
      this.checkAutoScroll(e, this.scrollContainer);
    }
  },
  
  // Cell-specific handlers
  handleCellDragEnter(e, td, table) {
    e.preventDefault();
    table.querySelectorAll('.th-drag-over').forEach(el => el.classList.remove('th-drag-over'));
    const colIndex = parseInt(td.dataset.colIndex, 10);
    const targetHeader = table.querySelector(`thead th[data-col-index="${colIndex}"]`);
    if (targetHeader && !targetHeader.classList.contains('th-dragging')) {
      targetHeader.classList.add('th-drag-over');
    }
    const rect = targetHeader.getBoundingClientRect();
    positionDropAnchor(rect, table, e.clientX);
    
    // Check for auto-scroll when dragging columns
    if (!this.isBubbleDrag && this.scrollContainer) {
      this.checkAutoScroll(e, this.scrollContainer);
    }
  },
  
  handleCellDragOver(e, td, table) {
    e.preventDefault();
    const colIndex = parseInt(td.dataset.colIndex, 10);
    const targetHeader = table.querySelector(`thead th[data-col-index="${colIndex}"]`);
    const rect = targetHeader.getBoundingClientRect();
    positionDropAnchor(rect, table, e.clientX);
    
    // Check for auto-scroll when dragging columns
    if (!this.isBubbleDrag && this.scrollContainer) {
      this.checkAutoScroll(e, this.scrollContainer);
    }
  },
  
  // Drop handlers
  handleDrop(e, th, table) {
    e.preventDefault();
    e.stopPropagation();
    const toIndex = parseInt(th.dataset.colIndex, 10);
    
    // Stop auto-scroll when dropping
    this.stopAutoScroll();
  
    // Column reorder drop
    const fromIndexStr = e.dataTransfer.getData('text/plain').trim();
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
    const bubbleField = e.dataTransfer.getData('bubble-field');
    if (bubbleField && !window.displayedFields.includes(bubbleField)) {
      const rect = th.getBoundingClientRect();
      const insertAt = (e.clientX - rect.left) < rect.width/2 ? toIndex : toIndex + 1;
      window.displayedFields.splice(insertAt, 0, bubbleField);
      showExampleTable(window.displayedFields);
    }
    
    th.classList.remove('th-drag-over');
    clearDropAnchor();
  },
  
  handleCellDrop(e, td, table) {
    e.preventDefault();
    e.stopPropagation();
    
    const toIndex = parseInt(td.dataset.colIndex, 10);
    
    // Stop auto-scroll when dropping
    this.stopAutoScroll();
  
    // Bubble drop
    const bubbleField = e.dataTransfer.getData('bubble-field');
    if (bubbleField) {
      if (!window.displayedFields.includes(bubbleField)) {
        const rect = td.getBoundingClientRect();
        const insertAt = (e.clientX - rect.left) < rect.width/2 ? toIndex : toIndex + 1;
        window.displayedFields.splice(insertAt, 0, bubbleField);
        showExampleTable(window.displayedFields);
      }
      clearDropAnchor();
      return;
    }
    
    // Header reorder drop
    const fromIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);
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
      // Remove header listeners
      table.querySelectorAll('th').forEach(th => {
        if (th._dragDropListeners) {
          Object.entries(th._dragDropListeners).forEach(([event, handler]) => {
            try {
              th.removeEventListener(event, handler);
            } catch (err) {
              console.warn('Error removing event listener from header:', err);
            }
          });
          delete th._dragDropListeners;
        }
      });
      
      // Remove cell listeners
      table.querySelectorAll('td').forEach(td => {
        if (td._dragDropListeners) {
          Object.entries(td._dragDropListeners).forEach(([event, handler]) => {
            try {
              td.removeEventListener(event, handler);
            } catch (err) {
              console.warn('Error removing event listener from cell:', err);
            }
          });
          delete td._dragDropListeners;
        }
      });
    } catch (error) {
      console.error('Error in cleanupTableListeners:', error);
    }
  },

  // Initialize drag-and-drop for a table
  initTableDragDrop(table) {
    if (!table) return;
    
    // Don't reinitialize during an active drag operation
    if (document.body.classList.contains('dragging-cursor')) {
      return;
    }
    
    // Clean up any existing event listeners to prevent duplicates
    this.cleanupTableListeners(table);
    
    // Ensure every header/cell has an up-to-date col index
    refreshColIndices(table);
    const scrollContainer = document.querySelector('.overflow-x-auto.shadow.rounded-lg.mb-6');
    this.scrollContainer = scrollContainer;
    
    // Get all header cells
    const headers = table.querySelectorAll('th[draggable="true"]');
    
    // Store references to the bound event handlers for cleanup
    table._dragDropListeners = table._dragDropListeners || {};
    
    // Add header hover tracking
    headers.forEach(th => {
      // Create handler references for this header
      const listeners = {
        mouseenter: (e) => this.handleHeaderEnter(th),
        mouseleave: (e) => this.handleHeaderLeave(th),
        dragstart: (e) => this.handleHeaderDragStart(e, th, scrollContainer),
        dragend: (e) => this.handleHeaderDragEnd(th, scrollContainer),
        dragenter: (e) => this.handleDragEnter(e, th, table),
        dragleave: (e) => this.handleDragLeave(),
        dragover: (e) => this.handleDragOver(e, th, table),
        drop: (e) => this.handleDrop(e, th, table)
      };
      
      // Store references to listeners
      th._dragDropListeners = listeners;
      
      // Add all event listeners
      Object.entries(listeners).forEach(([event, handler]) => {
        th.addEventListener(event, handler);
      });
    });
    
    // Handle body cell events
    const bodyCells = table.querySelectorAll('tbody td');
    bodyCells.forEach(td => {
      // Create handler references for this cell
      const listeners = {
        dragenter: (e) => this.handleCellDragEnter(e, td, table),
        dragover: (e) => this.handleCellDragOver(e, td, table),
        dragleave: (e) => this.handleDragLeave(),
        drop: (e) => this.handleCellDrop(e, td, table)
      };
      
      // Store references to listeners
      td._dragDropListeners = listeners;
      
      // Add all event listeners
      Object.entries(listeners).forEach(([event, handler]) => {
        td.addEventListener(event, handler);
      });
    });
  }
};

// Set up trash icon click handler
headerTrash.addEventListener('click', e => {
  e.stopPropagation();
  const th = dragDropManager.hoverTh;
  if (th) {
    const idx = parseInt(th.dataset.colIndex, 10);
    const table = th.closest('table');
    removeColumn(table, idx);
  }
});

// Document-level event listeners for bubble dragging
document.addEventListener('dragstart', e => {
  const bubble = e.target.closest('.bubble');
  if (!bubble) return;
  
  // Check if this bubble is already displayed in the table
  const fieldName = bubble.textContent.trim();
  if (window.displayedFields.includes(fieldName)) {
    // Prevent dragging of already displayed bubbles
    e.preventDefault();
    return;
  }
  
  e.dataTransfer.setData('bubble-field', fieldName);
  e.dataTransfer.effectAllowed = 'copy';
  dragDropManager.setBubbleDrag(true);
  
  // Clone bubble and wrap it in a padded container
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
});

document.addEventListener('dragend', e => {
  if (e.target.closest('.bubble')) dragDropManager.setBubbleDrag(false);
});

// Public API function for initializing drag and drop on a table
function addDragAndDrop(table) {
  dragDropManager.initTableDragDrop(table);
}

// Export the drag and drop system
window.DragDropSystem = {
  dragDropManager,
  addDragAndDrop,
  attachBubbleDropTarget,
  refreshColIndices,
  moveColumn,
  removeColumn,
  positionDropAnchor,
  clearDropAnchor
};
