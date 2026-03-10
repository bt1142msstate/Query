/**
 * Virtual Table Module
 * Handles large dataset rendering with virtual scrolling for performance optimization.
 * Provides efficient rendering of thousands of rows by only displaying visible rows.
 * @module VirtualTable
 */

// Virtual scrolling state
let virtualTableData = {
  headers: [],
  rows: [],
  columnMap: new Map()
};
let visibleTableRows = 25;  // number of rows to show at once
let tableRowHeight = 42;    // estimated row height in pixels
let tableScrollTop = 0;
let tableScrollContainer = null;
let calculatedColumnWidths = {}; // Store calculated optimal widths for each column
let simpleTableInstance = null; // Store the SimpleTable instance

// Keep track of sorting state
let currentSortColumn = null;
let currentSortDirection = 'asc'; // 'asc' or 'desc'

/**
 * Sorts the virtual table data by the specified column.
 * Toggles direction if already sorted by this column.
 * @function sortTableBy
 * @param {string} fieldName - The field to sort by
 */
function sortTableBy(fieldName) {
  if (!virtualTableData.rows || virtualTableData.rows.length === 0) return;
  const colIndex = virtualTableData.columnMap.get(fieldName);
  if (colIndex === undefined) return;

  // Toggle direction if same column
  if (currentSortColumn === fieldName) {
    currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';
  } else {
    currentSortColumn = fieldName;
    currentSortDirection = 'asc';
  }

  // Find the exact field definition for sorting typing
  const fieldDef = window.fieldDefs ? window.fieldDefs.get(fieldName) : null;
  const type = fieldDef ? fieldDef.type : 'string';

  virtualTableData.rows.sort((a, b) => {
    let valA = a[colIndex];
    let valB = b[colIndex];

    // Handle nulls/undefined/empty
    const emptyA = valA === undefined || valA === null || valA === '';
    const emptyB = valB === undefined || valB === null || valB === '';
    
    if (emptyA && emptyB) return 0;
    if (emptyA) return currentSortDirection === 'asc' ? 1 : -1;
    if (emptyB) return currentSortDirection === 'asc' ? -1 : 1;

    let res = 0;
    if (type === 'number' || type === 'money') {
      const numA = typeof valA === 'number' ? valA : parseFloat(String(valA).replace(/,/g, ''));
      const numB = typeof valB === 'number' ? valB : parseFloat(String(valB).replace(/,/g, ''));
      res = (numA || 0) - (numB || 0);
    } else if (type === 'date') {
      const numA = parseInt(valA, 10) || 0;
      const numB = parseInt(valB, 10) || 0;
      res = numA - numB;
    } else {
      res = String(valA).localeCompare(String(valB));
    }

    return currentSortDirection === 'asc' ? res : -res;
  });

  // Re-render and update headers UI
  renderVirtualTable();
  if (window.updateSortHeadersUI) {
    window.updateSortHeadersUI(currentSortColumn, currentSortDirection);
  }
}

/**
 * Calculates which table rows should be visible based on current scroll position.
 * Used for virtual scrolling to only render visible rows for performance.
 * @function calculateVisibleRows
 * @returns {{start: number, end: number}} Object containing start and end row indices
 */
function calculateVisibleRows() {
  if (!tableScrollContainer) return { start: 0, end: 0 };
  
  const containerHeight = tableScrollContainer.clientHeight;
  const headerHeight = 40; // approximate header height
  const availableHeight = containerHeight - headerHeight;
  
  const startIndex = Math.floor(tableScrollTop / tableRowHeight);
  const endIndex = Math.min(
    virtualTableData.rows.length, // Use rows array length
    startIndex + Math.ceil(availableHeight / tableRowHeight) + 2 // buffer rows
  );
  
  return { start: Math.max(0, startIndex), end: endIndex };
}

/**
 * Renders only the visible portion of the virtual table based on scroll position.
 * Creates spacer elements for non-visible rows to maintain proper scrolling.
 * Handles text truncation and tooltips for long content.
 * @function renderVirtualTable
 */
function renderVirtualTable() {
  if (!tableScrollContainer || !virtualTableData.rows || !virtualTableData.rows.length || !window.displayedFields || !window.displayedFields.length) return;
  
  const table = tableScrollContainer.querySelector('#example-table');
  if (!table) return;
  
  // Check if a drag operation is in progress - don't re-render during active drag
  if (document.body.classList.contains('dragging-cursor')) {
    return;
  }
  
  const tbody = table.querySelector('tbody');
  const { start, end } = calculateVisibleRows();
  
  // Clean up existing event listeners on body cells before clearing them
  if (window.DragDropSystem && window.DragDropSystem.dragDropManager && window.DragDropSystem.dragDropManager.cleanupTableListeners) {
    window.DragDropSystem.dragDropManager.cleanupTableListeners(table);
  }
  
  // Clear existing body rows
  tbody.innerHTML = '';
  
  // Create spacer for rows above visible area
  if (start > 0) {
    const topSpacer = document.createElement('tr');
    const spacerCell = document.createElement('td');
    spacerCell.setAttribute('colspan', window.displayedFields.length.toString());
    spacerCell.style.height = `${start * tableRowHeight}px`;
    spacerCell.style.padding = '0';
    spacerCell.style.border = 'none';
    topSpacer.appendChild(spacerCell);
    tbody.appendChild(topSpacer);
  }
  
  // Render visible rows
  for (let i = start; i < end; i++) {
    const rowData = virtualTableData.rows[i]; // Access the 2D array row
    const tr = window.TableBuilder.createRow();
    tr.style.height = `${tableRowHeight}px`;
    
    window.displayedFields.forEach((field, colIndex) => {
      const td = window.TableBuilder.createCell('', 'px-6 py-3 whitespace-nowrap text-sm text-gray-900');
      td.dataset.colIndex = colIndex;
      
      // Get the column index for this field and access the data by index
      const columnIndex = virtualTableData.columnMap.get(field);
      let cellValue;
      
      if (columnIndex !== undefined && rowData[columnIndex] !== undefined) {
        // Field exists in data and has a value
        cellValue = rowData[columnIndex];
      } else if (columnIndex === undefined) {
        // Field doesn't exist in the current data - show empty
        cellValue = '';
      } else {
        // Field exists but value is empty/undefined - show em dash
        cellValue = '—';
      }
      
      // Apply formatting based on field type (same logic as Excel export)
      const fieldDef = window.fieldDefs ? window.fieldDefs.get(field) : null;
      const type = fieldDef ? fieldDef.type : 'string';
      const lower = field ? field.toLowerCase() : '';
      let displayValue = cellValue;
      
      if (cellValue !== '' && cellValue !== '—' && cellValue !== undefined && cellValue !== null) {
        if (type === 'date' || lower.includes('date') || lower.includes('time')) {
          const raw = cellValue;
          const n = typeof raw === 'string' ? parseInt(raw, 10) : raw;
          if (!n || isNaN(n)) {
            displayValue = 'Never';
          } else {
            const y = Math.floor(n / 10000);
            const m = Math.floor((n % 10000) / 100) - 1;
            const d = n % 100;
            const dt = new Date(y, m, d);
            if (isNaN(dt.getTime())) {
              displayValue = 'Never';
            } else {
              // Same as Excel "mm/dd/yyyy"
              displayValue = `${(m + 1).toString().padStart(2, '0')}/${d.toString().padStart(2, '0')}/${y}`;
            }
            td.style.textAlign = 'right';
          }
        } 
        else if (type === 'number' || type === 'money' || typeof cellValue === 'number' || lower.includes('price') || lower.includes('cost')) {
          const n = typeof cellValue === 'number' ? cellValue : parseFloat(String(cellValue).replace(/,/g, ''));
          if (!isNaN(n)) {
            if (type === 'money' || lower.includes('price') || lower.includes('cost')) {
              displayValue = '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
              td.style.textAlign = 'right';
            } else {
              // check if integer
              if (Number.isInteger(n) || lower.includes('barcode') || lower.includes('count') || lower.includes('number') || lower.includes('key')) {
                displayValue = n.toLocaleString('en-US', { maximumFractionDigits: 0 });
              } else {
                displayValue = n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
              }
              td.style.textAlign = 'right';
            }
          }
        } 
        else if (type === 'boolean') {
          td.style.textAlign = 'center';
        }
      }
      
      // Apply the same fixed width as the header
      const width = calculatedColumnWidths[field] || 150;
      td.style.width = `${width}px`;
      td.style.minWidth = `${width}px`;
      td.style.maxWidth = `${width}px`;
      
      // Check if content would be visually truncated and handle it manually
      if (typeof displayValue === 'string' && displayValue.length > 0 && displayValue !== '—') {
        const availableWidth = width - 48; // Subtract padding (24px left + 24px right)
        const fullTextWidth = window.TextMeasurement.measureText(displayValue);
        
        // If text is too wide, truncate it manually and add tooltip
        if (fullTextWidth > availableWidth) {
          const maxFitChars = window.TextMeasurement.findMaxFittingChars(displayValue, availableWidth);
          const truncatedText = displayValue.substring(0, maxFitChars) + '...';
          td.textContent = truncatedText;
          td.setAttribute('data-tooltip', displayValue);
        } else {
          // Text fits, no truncation needed
          td.textContent = displayValue;
        }
      } else {
        td.textContent = displayValue;
      }
      
      tr.appendChild(td);
    });
    
    tbody.appendChild(tr);
  }
  
  // Create spacer for rows below visible area
  const remainingRows = virtualTableData.rows.length - end;
  if (remainingRows > 0) {
    const bottomSpacer = document.createElement('tr');
    const spacerCell = document.createElement('td');
    spacerCell.setAttribute('colspan', window.displayedFields.length.toString());
    spacerCell.style.height = `${remainingRows * tableRowHeight}px`;
    spacerCell.style.padding = '0';
    spacerCell.style.border = 'none';
    bottomSpacer.appendChild(spacerCell);
    tbody.appendChild(bottomSpacer);
  }
  
  // Re-apply drag and drop to the new rows
  if (window.DragDropSystem && window.DragDropSystem.addDragAndDrop) {
    window.DragDropSystem.addDragAndDrop(table);
  } else if (typeof addDragAndDrop !== 'undefined') {
    addDragAndDrop(table);
  }
}

/**
 * Handles scroll events for the virtual table container.
 * Updates scroll position and triggers re-rendering of visible rows.
 * @function handleTableScroll
 * @param {Event} e - The scroll event
 */
function handleTableScroll(e) {
  // Don't process scroll events during active drag
  if (document.body.classList.contains('dragging-cursor')) {
    return;
  }
  
  tableScrollTop = e.target.scrollTop;
  renderVirtualTable();
}

/**
 * Calculates the optimal width for a table column based on header and content.
 * Uses canvas text measurement for accurate width calculation.
 * @function calculateFieldWidth
 * @param {string} fieldName - The name of the field/column
 * @param {Object|null} data - Optional table data for content width measurement
 * @param {Array} data.rows - Array of row data
 * @param {Map} data.columnMap - Map of field names to column indices
 * @returns {number} Optimal column width in pixels (min 150px, max ~50 characters)
 */
function calculateFieldWidth(fieldName, data = null) {
  let maxWidth = 0;
  
  // 1. Always measure header width (uppercase, as it appears in the table)
  const headerWidth = window.TextMeasurement.measureText(fieldName.toUpperCase());
  maxWidth = Math.max(maxWidth, headerWidth);
  
  // 2. If we have data, measure content width
  if (data && data.rows && data.rows.length > 0) {
    const columnIndex = data.columnMap.get(fieldName);
    if (columnIndex !== undefined) {
      // Sample data for performance (check every nth row)
      const sampleStep = Math.max(1, Math.floor(data.rows.length / 1000));
      
      for (let i = 0; i < data.rows.length; i += sampleStep) {
        const value = data.rows[i][columnIndex];
        if (value != null) {
          const textWidth = window.TextMeasurement.measureText(String(value));
          maxWidth = Math.max(maxWidth, textWidth);
        }
      }
    }
  }
  
  // 3. For fields not in data (showing "..."), ensure reasonable width for the placeholder
  if (!data || !data.columnMap || !data.columnMap.has(fieldName)) {
    const placeholderWidth = window.TextMeasurement.measureText('...');
    maxWidth = Math.max(maxWidth, placeholderWidth);
  }
  
  // 4. Add padding (24px left + 24px right from px-6 class) + buffer for comfort
  const paddingAndBuffer = 48 + 32; // 48px padding + 32px buffer
  
  // 5. Calculate max character width for clamping
  const maxCharacterWidth = window.TextMeasurement.measureText('A'.repeat(50)) + paddingAndBuffer;
  
  // 6. Clamp to reasonable bounds: min 150px, max 50 characters worth
  return Math.max(150, Math.min(maxCharacterWidth, maxWidth + paddingAndBuffer));
}

/**
 * Calculates optimal widths for all specified table columns.
 * @function calculateOptimalColumnWidths
 * @param {string[]} [fields] - Array of field names to calculate widths for. Defaults to global virtualTableData.headers.
 * @param {Object} [data] - Table data containing rows and column mapping. Defaults to global virtualTableData.
 * @returns {Object} Object mapping field names to optimal widths in pixels
 */
function calculateOptimalColumnWidths(fields, data) {
  // Use global data if arguments not provided
  const targetFields = fields || virtualTableData.headers;
  const targetData = data || virtualTableData;

  if (!targetFields || !targetFields.length) return {};
  
  const widths = {};
  targetFields.forEach(field => {
    widths[field] = calculateFieldWidth(field, targetData);
  });
  
  // If we operated on the global data without explicit arguments, update the cache
  if (!fields && !data) {
    calculatedColumnWidths = widths;
  }
  
  return widths;
}

/**
 * Sets up a virtual table with the specified container and fields.
 * Initializes scrolling and column widths.
 * @async
 * @function setupVirtualTable
 * @param {HTMLElement} container - The DOM element to contain the virtual table
 * @param {string[]} fields - Array of field names to display as columns
 * @returns {Promise<{virtualTableData: Object, calculatedColumnWidths: Object}>} Table data and column widths
 */
async function setupVirtualTable(container, fields) {
  // Set up container for virtual scrolling
  container.style.height = '400px'; // Fixed height for virtual scrolling
  container.style.overflowY = 'auto';
  
  // Set up scroll container reference
  tableScrollContainer = container;
  tableScrollTop = 0;

  // Calculate widths if we have data and fields
  if (virtualTableData && virtualTableData.rows && virtualTableData.rows.length > 0 && fields && fields.length > 0) {
    console.log('Calculating optimal column widths...');
    calculatedColumnWidths = calculateOptimalColumnWidths(fields, virtualTableData);
    console.log('Column widths calculated:', calculatedColumnWidths);
  } else {
    // Just initialize empty if no data yet
    calculatedColumnWidths = {};
  }

  
  // Add scroll event listener
  container.addEventListener('scroll', handleTableScroll);
  
  return { virtualTableData, calculatedColumnWidths };
}

/**
 * Measures the actual height of a table row by temporarily rendering one.
 * Updates the global tableRowHeight variable for virtual scrolling calculations.
 * @function measureRowHeight
 * @param {HTMLElement} table - The table element to measure
 * @param {string[]} fields - Array of field names for the columns
 */
function measureRowHeight(table, fields) {
  if (virtualTableData.rows && virtualTableData.rows.length > 0) {
    // Temporarily render one row to measure height
    const tbody = table.querySelector('tbody');
    const tempRow = document.createElement('tr');
    tempRow.className = 'hover:bg-gray-50';
    fields.forEach((field, colIndex) => {
      const td = document.createElement('td');
      td.className = 'px-6 py-3 whitespace-nowrap text-sm text-gray-900';
      
      // Get the column index for this field and access the data by index
      const columnIndex = virtualTableData.columnMap.get(field);
      const cellValue = (columnIndex !== undefined && virtualTableData.rows[0][columnIndex] !== undefined) 
        ? virtualTableData.rows[0][columnIndex] : '—';
      
      td.textContent = cellValue;
      tempRow.appendChild(td);
    });
    tbody.appendChild(tempRow);
    
    // Measure and remove
    const measuredHeight = tempRow.offsetHeight;
    if (measuredHeight > 0) {
      tableRowHeight = measuredHeight;
    }
    tbody.removeChild(tempRow);
  }
}

/**
 * Clears all virtual table data and resets state variables.
 * Used when switching between different datasets or clearing the table.
 * @function clearVirtualTableData
 */
function clearVirtualTableData() {
  virtualTableData = {
    headers: [],
    rows: [],
    columnMap: new Map()
  };
  calculatedColumnWidths = {};
  tableScrollTop = 0;
  tableScrollContainer = null;
  simpleTableInstance = null;
}

/**
 * Returns the current state of the virtual table for debugging or external access.
 * @function getVirtualTableState
 * @returns {Object} Object containing all virtual table state variables
 */
function getVirtualTableState() {
  return {
    virtualTableData,
    calculatedColumnWidths,
    tableRowHeight,
    tableScrollTop,
    tableScrollContainer
  };
}

/**
 * Global VirtualTable object containing all virtual table functionality.
 * Exported to window for use by other modules.
 * @namespace VirtualTable
 * @global
 */
window.VirtualTable = {
  // State
  get virtualTableData() { return virtualTableData; },
  set virtualTableData(value) { virtualTableData = value; },
  get calculatedColumnWidths() { return calculatedColumnWidths; },
  set calculatedColumnWidths(value) { calculatedColumnWidths = value; },
  get tableRowHeight() { return tableRowHeight; },
  set tableRowHeight(value) { tableRowHeight = value; },
  get tableScrollTop() { return tableScrollTop; },
  set tableScrollTop(value) { tableScrollTop = value; },
  get tableScrollContainer() { return tableScrollContainer; },
  set tableScrollContainer(value) { tableScrollContainer = value; },
  get simpleTableInstance() { return simpleTableInstance; },
  
  // Functions
  calculateVisibleRows,
  renderVirtualTable,
  handleTableScroll,
  calculateFieldWidth,
  calculateOptimalColumnWidths,
  setupVirtualTable,
  measureRowHeight,
  clearVirtualTableData,
  getVirtualTableState,
  sortTableBy
};
