// Virtual Table Module
// Handles large dataset rendering with virtual scrolling for performance

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

// Load test data and create SimpleTable instance
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
        filteredDefs.push(newMarcFieldDef);
        
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

// Virtual scrolling helper functions
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
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-gray-50';
    tr.style.height = `${tableRowHeight}px`;
    
    window.displayedFields.forEach((field, colIndex) => {
      const td = document.createElement('td');
      td.className = 'px-6 py-3 whitespace-nowrap text-sm text-gray-900';
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
      
      // Apply the same fixed width as the header
      const width = calculatedColumnWidths[field] || 150;
      td.style.width = `${width}px`;
      td.style.minWidth = `${width}px`;
      td.style.maxWidth = `${width}px`;
      
      // Check if content would be visually truncated and handle it manually
      if (typeof cellValue === 'string' && cellValue.length > 0 && cellValue !== '—') {
        // Create a temporary canvas to measure text width
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        ctx.font = '14px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto';
        
        const availableWidth = width - 48; // Subtract padding (24px left + 24px right)
        const fullTextWidth = ctx.measureText(cellValue).width;
        
        // If text is too wide, truncate it manually and add tooltip
        if (fullTextWidth > availableWidth) {
          // Binary search to find maximum characters that fit
          let left = 0;
          let right = cellValue.length;
          let maxFitChars = 0;
          
          while (left <= right) {
            const mid = Math.floor((left + right) / 2);
            const testText = cellValue.substring(0, mid) + '...';
            const testWidth = ctx.measureText(testText).width;
            
            if (testWidth <= availableWidth) {
              maxFitChars = mid;
              left = mid + 1;
            } else {
              right = mid - 1;
            }
          }
          
          // Set truncated text with ellipsis
          const truncatedText = cellValue.substring(0, maxFitChars) + '...';
          td.textContent = truncatedText;
          td.setAttribute('data-tooltip', cellValue);
        } else {
          // Text fits, no truncation needed
          td.textContent = cellValue;
        }
      } else {
        td.textContent = cellValue;
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

function handleTableScroll(e) {
  // Don't process scroll events during active drag
  if (document.body.classList.contains('dragging-cursor')) {
    return;
  }
  
  tableScrollTop = e.target.scrollTop;
  renderVirtualTable();
}

// Function to calculate optimal column widths from all data
function calculateOptimalColumnWidths(fields, data) {
  if (!data.rows || !data.rows.length || !fields.length) return {};
  
  const widths = {};
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  // Set font to match table cells - use the actual computed styles
  ctx.font = '14px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto';
  
  // Calculate max width based on 50 characters
  const maxCharacterWidth = ctx.measureText('A'.repeat(50)).width;
  
  fields.forEach(field => {
    let maxWidth = 0;
    
    // Check header width first (uppercase) - ensure headers are considered
    const headerWidth = ctx.measureText(field.toUpperCase()).width;
    maxWidth = Math.max(maxWidth, headerWidth);
    
    // Get the column index for this field
    const columnIndex = data.columnMap.get(field);
    if (columnIndex === undefined) {
      // Field not found, use minimum width
      widths[field] = 120;
      return;
    }
    
    // Check data to find max content width (check every 100th row for performance)
    const sampleStep = Math.max(1, Math.floor(data.rows.length / 1000)); // Sample ~1000 rows max
    
    for (let i = 0; i < data.rows.length; i += sampleStep) {
      const value = data.rows[i][columnIndex];
      if (value != null) {
        const textWidth = ctx.measureText(String(value)).width;
        maxWidth = Math.max(maxWidth, textWidth);
      }
    }
    
    // Add padding (24px left + 24px right from px-6 class) + some buffer
    const paddingAndBuffer = 48 + 20; // 48px padding + 20px buffer
    
    // Clamp to minimum 120px and maximum based on 50 characters
    const maxWidthWithPadding = maxCharacterWidth + paddingAndBuffer;
    widths[field] = Math.max(120, Math.min(maxWidthWithPadding, maxWidth + paddingAndBuffer));
  });
  
  return widths;
}

// Function to set up virtual table container and event listeners
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

// Function to measure row height from a rendered row
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

// Function to clear virtual table data
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

// Function to get virtual table state
function getVirtualTableState() {
  return {
    virtualTableData,
    calculatedColumnWidths,
    tableRowHeight,
    tableScrollTop,
    tableScrollContainer
  };
}

// Export functions for use in other modules
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
  calculateOptimalColumnWidths,
  setupVirtualTable,
  measureRowHeight,
  clearVirtualTableData,
  getVirtualTableState
};
