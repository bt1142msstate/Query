/**
 * Drag & Drop System for column reordering and bubble dropping.
 * Handles dragging bubbles to table headers and reordering columns.
 * @module DragDrop
 */

// Use shared utility function from query.js

// Store information about removed columns with their duplicates for restoration
window.removedColumnInfo = window.removedColumnInfo || new Map();

/**
 * Checks if a field or any of its duplicates exists in displayedFields.
 * Uses base field name comparison to detect related columns.
 * @function fieldOrDuplicatesExist
 * @param {string} fieldName - The field name to check for
 * @returns {boolean} True if field or its duplicates exist in displayedFields
 */
function fieldOrDuplicatesExist(fieldName) {
  // Extract base field name (remove ordinal prefixes like "2nd ", "3rd ")
  const baseFieldName = window.getBaseFieldName(fieldName);
  
  // Check if any column in displayedFields is related to this field
  const relatedColumns = window.displayedFields.filter(displayedField => {
    const displayedBase = window.getBaseFieldName(displayedField);
    return displayedBase === baseFieldName;
  });
  
  return relatedColumns.length > 0;
}

/**
 * Restores a field and its duplicates from stored information or original data.
 * Attempts to restore from removedColumnInfo first, then falls back to original headers.
 * @function restoreFieldWithDuplicates
 * @param {string} fieldName - The field name to restore
 * @param {number} [insertAt=-1] - Position to insert at (-1 for end)
 * @returns {boolean} True if field was successfully restored
 */
function restoreFieldWithDuplicates(fieldName, insertAt = -1) {
  // Check if any duplicate of this field already exists
  if (fieldOrDuplicatesExist(fieldName)) {
    return false;
  }
  
  // Check if we have stored duplicate information for this field
  const storedInfo = window.removedColumnInfo.get(fieldName);
  
  if (storedInfo && storedInfo.columnNames) {
    // Remove the stored info since we're restoring
    window.removedColumnInfo.delete(fieldName);
    
    // Insert all duplicate columns at the specified position
    if (insertAt >= 0 && insertAt <= window.displayedFields.length) {
      // Insert all duplicate columns at the specific position
      storedInfo.columnNames.forEach((columnName, index) => {
        window.displayedFields.splice(insertAt + index, 0, columnName);
      });
    } else {
      // Append all duplicate columns at the end
      storedInfo.columnNames.forEach(columnName => {
        window.displayedFields.push(columnName);
      });
    }
    
    return true;
  } else {
    // No stored info, check if this field exists in the original data
    const virtualTableData = window.VirtualTable?.virtualTableData;
    if (virtualTableData && virtualTableData.headers) {
      const relatedColumns = virtualTableData.headers.filter(header => {
        const baseFieldName = window.getBaseFieldName(fieldName);
        const headerBase = window.getBaseFieldName(header);
        return header === fieldName || headerBase === baseFieldName;
      });
      
      if (relatedColumns.length > 0) {
        // Insert all related columns from original data
        if (insertAt >= 0 && insertAt <= window.displayedFields.length) {
          relatedColumns.forEach((columnName, index) => {
            window.displayedFields.splice(insertAt + index, 0, columnName);
          });
        } else {
          relatedColumns.forEach(columnName => {
            window.displayedFields.push(columnName);
          });
        }
        
        return true;
      }
    }
    
    // Fallback to single field - this will show "..." in the table
    if (insertAt >= 0 && insertAt <= window.displayedFields.length) {
      window.displayedFields.splice(insertAt, 0, fieldName);
    } else {
      window.displayedFields.push(fieldName);
    }
    return true; // Changed to true since we did add the field
  }
}

// Global drop anchor element for visual feedback during drag operations
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

/**
 * Positions the visual drop anchor during drag operations.
 * Shows where the dragged item will be inserted.
 * @function positionDropAnchor
 * @param {DOMRect} rect - Bounding rectangle of the target element
 * @param {HTMLElement} table - The table element
 * @param {number} clientX - Mouse X coordinate
 */
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

// Helper function to find all related columns (including duplicates) for a field
function findRelatedColumnIndices(fieldName) {
  // Extract base field name (remove ordinal prefixes like "2nd ", "3rd ")
  const baseFieldName = window.getBaseFieldName(fieldName);
  
  // Find all columns with this base field name
  const relatedIndices = [];
  window.displayedFields.forEach((field, index) => {
    const fieldBase = window.getBaseFieldName(field);
    if (fieldBase === baseFieldName) {
      relatedIndices.push(index);
    }
  });
  
  return relatedIndices.sort((a, b) => a - b);
}

function moveColumn(table, fromIndex, toIndex) {
  if (fromIndex === toIndex) return;

  const fromFieldName = window.displayedFields[fromIndex];
  if (!fromFieldName) return;
  
  // Find all related columns (including duplicates)
  const relatedIndices = findRelatedColumnIndices(fromFieldName);
  
  // If moving a single column (no duplicates)
  if (relatedIndices.length === 1) {
    moveSingleColumn(table, fromIndex, toIndex);
  } else {
    // Moving a column that has duplicates - move the entire group
    moveColumnGroup(table, relatedIndices, toIndex);
  }
}

function moveSingleColumn(table, fromIndex, toIndex) {
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
  
  finalizeMoveOperation(table);
}

function moveColumnGroup(table, groupIndices, targetIndex) {
  // Extract all related fields as a group
  const groupFields = groupIndices.map(index => window.displayedFields[index]);
  
  // Remove all related fields from their current positions (in reverse order to maintain indices)
  for (let i = groupIndices.length - 1; i >= 0; i--) {
    window.displayedFields.splice(groupIndices[i], 1);
  }
  
  // Adjust target index if we removed items before it
  let adjustedTargetIndex = targetIndex;
  for (const removedIndex of groupIndices) {
    if (removedIndex < targetIndex) {
      adjustedTargetIndex--;
    }
  }
  
  // Insert all group fields at the target position
  groupFields.forEach((field, i) => {
    window.displayedFields.splice(adjustedTargetIndex + i, 0, field);
  });
  
  // Rebuild the header row completely since we moved multiple columns
  const headerRow = table.querySelector('thead tr');
  if (headerRow) {
    headerRow.innerHTML = '';
    window.displayedFields.forEach((field, index) => {
      // Check if this field exists in the current data
      const virtualTableData = window.VirtualTable?.virtualTableData;
      const fieldExistsInData = virtualTableData && virtualTableData.columnMap && virtualTableData.columnMap.has(field);
      
      const th = document.createElement('th');
      th.draggable = true;
      th.dataset.colIndex = index;
      th.className = 'px-6 py-3 text-left text-xs font-medium uppercase tracking-wider bg-gray-50';
      
      if (fieldExistsInData) {
        th.classList.add('text-gray-500');
      } else {
        th.classList.add('text-red-500');
        th.style.color = '#ef4444 !important';
        th.setAttribute('data-tooltip', 'This field is not in the current data. Run a new query to populate it.');
      }
      
      const span = document.createElement('span');
      span.className = 'th-text';
      span.textContent = field;
      if (!fieldExistsInData) {
        span.style.color = '#ef4444 !important';
      }
      
      th.appendChild(span);
      headerRow.appendChild(th);
    });
  }
  
  finalizeMoveOperation(table);
}

function finalizeMoveOperation(table) {
  // 3️⃣ Recalculate column widths for new order
  if (VirtualTable.virtualTableData.rows && VirtualTable.virtualTableData.rows.length > 0) {
    VirtualTable.calculatedColumnWidths = VirtualTable.calculateOptimalColumnWidths(window.displayedFields, VirtualTable.virtualTableData);
    
    // Update header widths
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

  // 4️⃣ Temporarily clear drag state and force virtual table re-render
  const wasDragging = document.body.classList.contains('dragging-cursor');
  if (wasDragging) {
    document.body.classList.remove('dragging-cursor');
  }
  
  // Force immediate re-render since displayedFields has changed
  VirtualTable.renderVirtualTable();
  
  // Restore drag state if it was active (will be cleared properly in dragend)
  if (wasDragging) {
    document.body.classList.add('dragging-cursor');
  }

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

  if (!fieldName) return;

  // Extract base field name (remove ordinal prefixes like "2nd ", "3rd ")
  const baseFieldName = window.getBaseFieldName(fieldName);
  
  // Find all columns with this base field name (including duplicates)
  const allRelatedColumns = Array.from(table.querySelectorAll('thead th')).filter(th => {
    const text = th.textContent.trim();
    return text === baseFieldName || text.match(new RegExp(`^\\d+(st|nd|rd|th)\\s+${baseFieldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`));
  });

  // Store information about removed columns for restoration
  const removedColumnNames = allRelatedColumns.map(th => th.textContent.trim());
  const removedColumnIndices = allRelatedColumns.map(th => parseInt(th.dataset.colIndex, 10)).sort((a, b) => a - b);
  
  window.removedColumnInfo.set(baseFieldName, {
    columnNames: removedColumnNames,
    originalIndices: removedColumnIndices,
    removedAt: Date.now()
  });

  // Remove all related columns from displayedFields array
  allRelatedColumns.forEach(relatedHeader => {
    const relatedFieldName = relatedHeader.textContent.trim();
    const idx = window.displayedFields.indexOf(relatedFieldName);
    if (idx !== -1) {
      window.displayedFields.splice(idx, 1);
    }
  });

  // Remove all related header cells from DOM
  allRelatedColumns.forEach(relatedHeader => {
    relatedHeader.remove();
  });

  // Re-render virtual table with new column structure
  if (window.displayedFields.length > 0) {
    // Recalculate column widths for remaining fields
    if (VirtualTable.virtualTableData.rows && VirtualTable.virtualTableData.rows.length > 0) {
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

  // Update styling for the bubble for this field (use base field name)
  if (baseFieldName) {
    document.querySelectorAll('.bubble').forEach(bubbleEl => {
      if (bubbleEl.textContent.trim() === baseFieldName) {
        if (baseFieldName === 'Marc') {
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
  // Update button states after removing column
  updateButtonStates();
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
    if (field) {
      if (restoreFieldWithDuplicates(field)) {
        dragDropManager.dropSuccessful = true;
        showExampleTable(window.displayedFields);
      }
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
  draggedBubble: null,
  draggedBubbleOriginalRect: null,
  dropSuccessful: false,
  lastDragX: 0,
  lastDragY: 0,
  isAnimating: false,
  
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
    
    // Check if this is part of a group with duplicates
    const colIndex = parseInt(th.dataset.colIndex, 10);
    const fieldName = window.displayedFields[colIndex];
    const relatedIndices = findRelatedColumnIndices(fieldName);
    
    // Highlight all related columns being moved
    relatedIndices.forEach(index => {
      const relatedHeader = document.querySelector(`thead th[data-col-index="${index}"]`);
      if (relatedHeader) {
        relatedHeader.classList.add('th-dragging');
      }
    });
    
    // Create drag ghost
    const ghost = document.createElement('div');
    if (relatedIndices.length > 1) {
      // Show group indicator in ghost
      ghost.textContent = `${th.textContent.trim()} (+${relatedIndices.length - 1} more)`;
    } else {
      ghost.textContent = th.textContent.trim();
    }
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
    // Remove dragging class from all headers (in case of group drag)
    document.querySelectorAll('th').forEach(h => {
      h.classList.remove('th-dragging', 'th-hover');
    });
    document.querySelectorAll('.th-drag-over').forEach(el => el.classList.remove('th-drag-over'));
    
    if (scrollContainer) scrollContainer.classList.remove('dragging-scroll-lock');
    document.body.classList.remove('dragging-cursor');
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
    if (bubbleField) {
      const rect = th.getBoundingClientRect();
      const insertAt = (e.clientX - rect.left) < rect.width/2 ? toIndex : toIndex + 1;
      if (restoreFieldWithDuplicates(bubbleField, insertAt)) {
        dragDropManager.dropSuccessful = true;
        showExampleTable(window.displayedFields);
      }
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
      const rect = td.getBoundingClientRect();
      const insertAt = (e.clientX - rect.left) < rect.width/2 ? toIndex : toIndex + 1;
      if (restoreFieldWithDuplicates(bubbleField, insertAt)) {
        dragDropManager.dropSuccessful = true;
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
  
  // Store original position and bubble for potential return animation
  dragDropManager.draggedBubble = bubble;
  dragDropManager.draggedBubbleOriginalRect = bubble.getBoundingClientRect();
  dragDropManager.dropSuccessful = false;
  
  e.dataTransfer.setData('bubble-field', fieldName);
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
  if (dragDropManager.isBubbleDrag) {
    e.preventDefault(); // Always prevent default for bubble drags
    e.dataTransfer.dropEffect = 'move'; // Signal that this is a valid drop zone
    
    // Track mouse position within viewport bounds
    const margin = 50; // pixels from edge
    const clampedX = Math.max(margin, Math.min(window.innerWidth - margin, e.clientX));
    const clampedY = Math.max(margin, Math.min(window.innerHeight - margin, e.clientY));
    
    dragDropManager.lastDragX = clampedX;
    dragDropManager.lastDragY = clampedY;
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
    
    // Check if drop was actually successful by looking at if the field was added to displayedFields
    const fieldName = bubble.textContent.trim();
    const wasActuallyDropped = window.displayedFields && window.displayedFields.includes(fieldName);
    
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

// Export the drag and drop system
window.DragDropSystem = {
  dragDropManager,
  addDragAndDrop,
  attachBubbleDropTarget,
  refreshColIndices,
  moveColumn,
  removeColumn,
  positionDropAnchor,
  clearDropAnchor,
  restoreFieldWithDuplicates
};
