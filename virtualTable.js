/**
 * Virtual Table Module
 * Handles large dataset rendering with virtual scrolling for performance optimization.
 * Provides efficient rendering of thousands of rows by only displaying visible rows.
 * @module VirtualTable
 */

import { fieldDefs, fieldDefState } from './fieldDefs.js';

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

/**
 * Loads test data from testJobData.json and creates a SimpleTable instance.
 * Automatically creates MARC field definitions for any MARC fields referenced in DesiredColumnOrder.
 * @async
 * @function loadTestData
 * @returns {Promise<boolean>} True if data loaded successfully
 * @throws {Error} If test data cannot be loaded or parsed
 */
async function loadTestData() {
  try {
    const response = await fetch('./testJobData.json');
    const testData = await response.json();
    
    // Validate that all DesiredColumnOrder fields exist in fieldDefs or are valid Marc fields
    // Create any missing MARC fields automatically
    const desiredColumns = testData.DesiredColumnOrder || [];
    const fieldDefsNames = fieldDefsArray.map(f => f.name);
    
    for (const fieldName of desiredColumns) {
      const exists = fieldDefsNames.includes(fieldName);
      const isMarcField = fieldName.startsWith('Marc') && fieldName.length > 4 && /^\d+$/.test(fieldName.substring(4));
      
      if (!exists && !isMarcField) {
        throw new Error(`Field "${fieldName}" from DesiredColumnOrder does not exist in fieldDefs and is not a valid Marc field`);
      }
      
      // Create MARC field definition if it doesn't exist
      if (isMarcField && !exists) {
        const marcNumber = fieldName.substring(4);
        const newMarcFieldDef = {
          name: fieldName,
          type: 'string',
          category: 'Marc',
          desc: `MARC ${marcNumber} field`
        };
        
        // Add to fieldDefs map
        fieldDefs.set(fieldName, newMarcFieldDef);
        
        // Add to filteredDefs array  
        fieldDefState.filteredDefs.push(newMarcFieldDef);
        
        console.log(`Created MARC field definition for: ${fieldName}`);
      }
    }
    
    // Create SimpleTable instance from the test data
    simpleTableInstance = new SimpleTable(testData);
    
    // Get the raw 2D table data directly (like C# version)
    const rawTable = simpleTableInstance.getRawTable();
    
    if (rawTable.length === 0) {
      throw new Error('SimpleTable returned empty raw table data');
    }
    
    // Store the 2D table data directly - headers are row 0, data starts at row 1
    const headers = rawTable[0];
    const dataRows = rawTable.slice(1);
    
    // Store as 2D array with header mapping for column lookup
    virtualTableData = {
      headers: headers,
      rows: dataRows,
      columnMap: new Map(headers.map((header, index) => [header, index]))
    };
    
    console.log('Loaded test data with SimpleTable (2D array):', {
      rows: dataRows.length,
      columns: headers,
      dimensions: simpleTableInstance.getDimensions(),
      desiredColumnOrder: testData.DesiredColumnOrder,
      actualHeaders: headers,
      simpleTableDesiredOrder: simpleTableInstance.desiredColumnOrder,
      columnMap: Object.fromEntries(virtualTableData.columnMap)
    });
    
    // Log the MARC fields that were created
    const createdMarcFields = desiredColumns.filter(name => 
      name.startsWith('Marc') && name.length > 4 && /^\d+$/.test(name.substring(4))
    );
    if (createdMarcFields.length > 0) {
      console.log('MARC fields created from test data:', createdMarcFields);
    }
    
    return true;
  } catch (error) {
    console.error('Failed to load test data:', error);
    throw new Error('Test data is required but could not be loaded: ' + error.message);
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
  if (typeof dragDropManager !== 'undefined' && dragDropManager.cleanupTableListeners) {
    dragDropManager.cleanupTableListeners(table);
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
        // Field doesn't exist in the current data - show "..." to indicate query rerun needed
        cellValue = '...';
        td.style.color = '#ef4444';
        td.style.fontStyle = 'italic';
        td.style.fontWeight = '500';
        td.setAttribute('data-tooltip', 'This field is not in the current data. Run a new query to populate it.');
      } else {
        // Field exists but value is empty/undefined - show em dash
        cellValue = '—';
      }
      
      // Apply formatting based on field type (same logic as Excel export)
      const lower = field ? field.toLowerCase() : '';
      let displayValue = cellValue;
      
      // Money fields - currency formatting
      if ((lower.includes('price') || lower.includes('cost')) && typeof cellValue === 'number') {
        displayValue = '$' + cellValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      }
      // Date fields - date formatting  
      else if ((lower.includes('date') || lower.includes('time')) && cellValue instanceof Date) {
        displayValue = cellValue.toLocaleDateString('en-US');
      }
      // Whole number fields - no decimal formatting
      else if ((lower.includes('barcode') || lower.includes('count') || lower.includes('number') || 
                lower.includes('key') || lower.includes('charges') || lower.includes('bills') || 
                lower.includes('inventory') || lower.includes('hold') || lower.includes('offset')) && 
               typeof cellValue === 'number' && Number.isInteger(cellValue)) {
        displayValue = cellValue.toLocaleString('en-US', { maximumFractionDigits: 0 });
      }
      // Other numbers - preserve formatting
      else if (typeof cellValue === 'number') {
        if (Number.isInteger(cellValue)) {
          displayValue = cellValue.toLocaleString('en-US', { maximumFractionDigits: 0 });
        } else {
          displayValue = cellValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
  if (typeof addDragAndDrop !== 'undefined') {
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
 * @param {string[]} fields - Array of field names to calculate widths for
 * @param {Object} data - Table data containing rows and column mapping
 * @returns {Object} Object mapping field names to optimal widths in pixels
 */
function calculateOptimalColumnWidths(fields, data) {
  if (!fields.length) return {};
  
  const widths = {};
  fields.forEach(field => {
    widths[field] = calculateFieldWidth(field, data);
  });
  
  return widths;
}

/**
 * Sets up a virtual table with the specified container and fields.
 * Loads test data if not already loaded, calculates column widths, and sets up scrolling.
 * @async
 * @function setupVirtualTable
 * @param {HTMLElement} container - The DOM element to contain the virtual table
 * @param {string[]} fields - Array of field names to display as columns
 * @returns {Promise<{virtualTableData: Object, calculatedColumnWidths: Object}>} Table data and column widths
 * @throws {Error} If test data cannot be loaded
 */
async function setupVirtualTable(container, fields) {
  // Load test data if not already loaded
  if (!virtualTableData.rows || virtualTableData.rows.length === 0) {
    console.log('Loading test data...');
    try {
      await loadTestData();
      console.log(`Test data loaded successfully: ${virtualTableData.rows.length} rows`);
    } catch (error) {
      console.error('Failed to set up virtual table:', error);
      throw new Error('Cannot set up virtual table without test data');
    }
  }

  // Calculate optimal column widths based on all data
  console.log('Calculating optimal column widths...');
  calculatedColumnWidths = calculateOptimalColumnWidths(fields, virtualTableData);
  console.log('Column widths calculated:', calculatedColumnWidths);

  // Set up container for virtual scrolling
  container.style.height = '400px'; // Fixed height for virtual scrolling
  container.style.overflowY = 'auto';
  
  // Set up scroll container reference
  tableScrollContainer = container;
  tableScrollTop = 0;
  
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
  loadTestData,
  calculateVisibleRows,
  renderVirtualTable,
  handleTableScroll,
  calculateFieldWidth,
  calculateOptimalColumnWidths,
  setupVirtualTable,
  measureRowHeight,
  clearVirtualTableData,
  getVirtualTableState
};
