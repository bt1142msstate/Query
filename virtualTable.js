// Virtual Table Module
// Handles large dataset rendering with virtual scrolling for performance

// Virtual scrolling state
let virtualTableData = [];
let visibleTableRows = 25;  // number of rows to show at once
let tableRowHeight = 42;    // estimated row height in pixels
let tableScrollTop = 0;
let tableScrollContainer = null;
let calculatedColumnWidths = {}; // Store calculated optimal widths for each column

// Helper function to generate sample data for testing
function generateSampleData(rowCount = 30000) {
  const sampleAuthors = ['Smith, John', 'Johnson, Mary', 'Williams, Robert', 'Brown, Patricia', 'Jones, Michael', 'Garcia, Linda', 'Miller, William', 'Davis, Elizabeth', 'Rodriguez, James', 'Martinez, Barbara'];
  const sampleTitles = ['The Great Adventure', 'Mystery of the Lost City', 'Modern Cooking Techniques', 'History of Science', 'Digital Photography', 'Programming Fundamentals', 'Art and Culture', 'Music Theory Basics', 'Environmental Studies', 'Psychology Today'];
  const sampleCallNumbers = ['QA76.73', 'PS3566', 'TX714', 'Q125', 'TR267', 'QA76.6', 'N7260', 'MT6', 'GE105', 'BF121'];
  const sampleLibraries = ['TRLS-A', 'TRLS-B', 'TRLS-C', 'MLTN-A', 'MLTN-B', 'WSPR-X'];
  const sampleItemTypes = ['Book', 'DVD', 'CD', 'Magazine', 'eBook', 'Audiobook'];
  const sampleLocations = ['Fiction', 'Non-Fiction', 'Reference', 'Periodicals', 'Children', 'Young Adult'];

  const data = [];
  for (let i = 0; i < rowCount; i++) {
    const row = {};
    
    // Generate data for each potential field
    row['Author'] = sampleAuthors[Math.floor(Math.random() * sampleAuthors.length)];
    
    // Add a really long title for the first row to test ellipsis
    if (i === 0) {
      row['Title'] = 'The Extraordinarily Long and Comprehensive Guide to Understanding the Complexities of Modern Digital Data Management Systems and Their Implementation in Enterprise Environments: A Complete Reference Manual';
    } else {
      row['Title'] = `${sampleTitles[Math.floor(Math.random() * sampleTitles.length)]} ${i + 1}`;
    }
    
    row['Call Number'] = `${sampleCallNumbers[Math.floor(Math.random() * sampleCallNumbers.length)]}.${Math.floor(Math.random() * 999).toString().padStart(3, '0')}`;
    row['Library'] = sampleLibraries[Math.floor(Math.random() * sampleLibraries.length)];
    row['Item Type'] = sampleItemTypes[Math.floor(Math.random() * sampleItemTypes.length)];
    row['Home Location'] = sampleLocations[Math.floor(Math.random() * sampleLocations.length)];
    row['Barcode'] = `${Math.floor(Math.random() * 90000000) + 10000000}`;
    row['Price'] = `$${(Math.random() * 100 + 5).toFixed(2)}`;
    row['Catalog Key'] = `cat${Math.floor(Math.random() * 1000000)}`;
    row['Publication Date'] = `${Math.floor(Math.random() * 50) + 1970}-${Math.floor(Math.random() * 12) + 1}-${Math.floor(Math.random() * 28) + 1}`;
    row['Item Creation Date'] = `${Math.floor(Math.random() * 5) + 2019}-${Math.floor(Math.random() * 12) + 1}-${Math.floor(Math.random() * 28) + 1}`;
    row['Item Total Charges'] = Math.floor(Math.random() * 50);
    row['Number of Copies'] = Math.floor(Math.random() * 10) + 1;
    
    // Add more sample fields as needed
    if (typeof fieldDefs !== 'undefined') {
      fieldDefs.forEach(field => {
        if (!row[field.name]) {
          switch (field.type) {
            case 'string':
              row[field.name] = `Sample ${field.name} ${i + 1}`;
              break;
            case 'number':
              row[field.name] = Math.floor(Math.random() * 1000);
              break;
            case 'money':
              row[field.name] = `$${(Math.random() * 1000).toFixed(2)}`;
              break;
            case 'date':
              row[field.name] = `${Math.floor(Math.random() * 50) + 1970}-${Math.floor(Math.random() * 12) + 1}-${Math.floor(Math.random() * 28) + 1}`;
              break;
            default:
              row[field.name] = `Sample ${i + 1}`;
          }
        }
      });
    }
    
    data.push(row);
  }
  return data;
}

// Virtual scrolling helper functions
function calculateVisibleRows() {
  if (!tableScrollContainer) return { start: 0, end: 0 };
  
  const containerHeight = tableScrollContainer.clientHeight;
  const headerHeight = 40; // approximate header height
  const availableHeight = containerHeight - headerHeight;
  
  const startIndex = Math.floor(tableScrollTop / tableRowHeight);
  const endIndex = Math.min(
    virtualTableData.length,
    startIndex + Math.ceil(availableHeight / tableRowHeight) + 2 // buffer rows
  );
  
  return { start: Math.max(0, startIndex), end: endIndex };
}

function renderVirtualTable() {
  if (!tableScrollContainer || !virtualTableData.length || !window.displayedFields || !window.displayedFields.length) return;
  
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
    const rowData = virtualTableData[i];
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-gray-50';
    tr.style.height = `${tableRowHeight}px`;
    
    window.displayedFields.forEach((field, colIndex) => {
      const td = document.createElement('td');
      td.className = 'px-6 py-3 whitespace-nowrap text-sm text-gray-900';
      td.dataset.colIndex = colIndex;
      
      const cellValue = rowData[field] || '—';
      
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
  const remainingRows = virtualTableData.length - end;
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
  if (!data.length || !fields.length) return {};
  
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
    
    // Sample data to find max content width (check every 100th row for performance)
    const sampleStep = Math.max(1, Math.floor(data.length / 1000)); // Sample ~1000 rows max
    
    for (let i = 0; i < data.length; i += sampleStep) {
      const value = data[i][field];
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
function setupVirtualTable(container, fields) {
  // Generate sample data if not already generated or if fields changed
  if (virtualTableData.length === 0 || virtualTableData.length < 30000) {
    console.log('Generating 30,000 sample rows...');
    virtualTableData = generateSampleData(30000);
    console.log('Sample data generated successfully');
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
  if (virtualTableData.length > 0) {
    // Temporarily render one row to measure height
    const tbody = table.querySelector('tbody');
    const tempRow = document.createElement('tr');
    tempRow.className = 'hover:bg-gray-50';
    fields.forEach((field, colIndex) => {
      const td = document.createElement('td');
      td.className = 'px-6 py-3 whitespace-nowrap text-sm text-gray-900';
      td.textContent = virtualTableData[0][field] || '—';
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
  virtualTableData = [];
  calculatedColumnWidths = {};
  tableScrollTop = 0;
  tableScrollContainer = null;
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
  
  // Functions
  generateSampleData,
  calculateVisibleRows,
  renderVirtualTable,
  handleTableScroll,
  calculateOptimalColumnWidths,
  setupVirtualTable,
  measureRowHeight,
  clearVirtualTableData,
  getVirtualTableState
};
