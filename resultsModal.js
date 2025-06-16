/**
 * Results Modal Module
 * Handles the display of query results with interactive controls
 * including GroupMethod switching functionality
 */

// Results modal state
let currentResultsTable = null;
let resultsModalOpen = false;

/**
 * Create the results modal HTML structure
 * This is called once during initialization
 */
function createResultsModalHTML() {
  // Check if modal already exists
  if (document.getElementById('results-modal')) {
    return;
  }

  // Create modal HTML
  const modalHTML = `
    <div id="results-modal" class="fixed inset-0 z-50 hidden">
      <!-- Backdrop -->
      <div class="fixed inset-0 bg-black bg-opacity-50" id="results-backdrop"></div>
      
      <!-- Modal Content -->
      <div class="fixed inset-0 overflow-y-auto">
        <div class="flex items-center justify-center min-h-screen p-4">
          <div class="bg-white rounded-lg shadow-xl max-w-7xl w-full max-h-[90vh] flex flex-col">
            <!-- Modal Header -->
            <div class="flex items-center justify-between p-4 border-b">
              <h2 class="text-xl font-semibold text-gray-800" id="results-title">Query Results</h2>
              <div class="flex items-center gap-4">
                <!-- Group Method Switcher -->
                <div class="flex items-center gap-2" id="group-method-controls" style="display: none;">
                  <label class="text-sm font-medium text-gray-700">Group Method:</label>
                  <select id="group-method-select" class="px-3 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="ExpandIntoColumns">Expand Into Columns</option>
                    <option value="Commas">Comma Separated</option>
                    <option value="None">No Grouping</option>
                  </select>
                </div>
                
                <!-- Export Button -->
                <button id="export-results-btn" class="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500">
                  Export to Excel
                </button>
                
                <!-- Close Button -->
                <button id="close-results-btn" class="p-2 text-gray-400 hover:text-gray-600 focus:outline-none">
                  <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                  </svg>
                </button>
              </div>
            </div>
            
            <!-- Results Info Bar -->
            <div class="px-4 py-2 bg-gray-50 border-b">
              <div class="flex items-center justify-between text-sm text-gray-600">
                <span id="results-info">Loading results...</span>
                <span id="results-timing"></span>
              </div>
            </div>
            
            <!-- Table Container -->
            <div class="flex-1 overflow-auto p-4" id="results-table-container">
              <div id="results-table-wrapper" class="min-w-full">
                <!-- Table will be inserted here -->
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  // Add modal to body
  document.body.insertAdjacentHTML('beforeend', modalHTML);

  // Set up event listeners
  setupResultsModalListeners();
}

/**
 * Set up event listeners for the results modal
 */
function setupResultsModalListeners() {
  // Close button
  const closeBtn = document.getElementById('close-results-btn');
  if (closeBtn) {
    closeBtn.addEventListener('click', closeResultsModal);
  }

  // Backdrop click to close
  const backdrop = document.getElementById('results-backdrop');
  if (backdrop) {
    backdrop.addEventListener('click', closeResultsModal);
  }

  // Export button
  const exportBtn = document.getElementById('export-results-btn');
  if (exportBtn) {
    exportBtn.addEventListener('click', exportResults);
  }

  // Group method selector
  const groupMethodSelect = document.getElementById('group-method-select');
  if (groupMethodSelect) {
    groupMethodSelect.addEventListener('change', handleGroupMethodChange);
  }

  // ESC key to close
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && resultsModalOpen) {
      closeResultsModal();
    }
  });
}

/**
 * Open the results modal with data
 * @param {Object} data - The query results data
 * @param {Object} queryInfo - Information about the query execution
 */
function openResultsModal(data, queryInfo = {}) {
  const modal = document.getElementById('results-modal');
  if (!modal) {
    createResultsModalHTML();
  }

  // Store the current results table instance
  currentResultsTable = data.simpleTable || null;

  // Update modal title
  const title = document.getElementById('results-title');
  if (title && queryInfo.tableName) {
    title.textContent = queryInfo.tableName || 'Query Results';
  }

  // Update results info
  updateResultsInfo(data, queryInfo);

  // Show/hide group method controls based on whether grouping is applied
  const groupControls = document.getElementById('group-method-controls');
  if (groupControls) {
    if (currentResultsTable && currentResultsTable.groupByField) {
      groupControls.style.display = 'flex';
      // Set the current group method in the selector
      const groupMethodSelect = document.getElementById('group-method-select');
      if (groupMethodSelect) {
        groupMethodSelect.value = currentResultsTable.groupMethod || 'ExpandIntoColumns';
      }
    } else {
      groupControls.style.display = 'none';
    }
  }

  // Render the table
  renderResultsTable(data);

  // Show the modal
  const modalElement = document.getElementById('results-modal');
  if (modalElement) {
    modalElement.classList.remove('hidden');
    resultsModalOpen = true;
  }
}

/**
 * Close the results modal
 */
function closeResultsModal() {
  const modal = document.getElementById('results-modal');
  if (modal) {
    modal.classList.add('hidden');
    resultsModalOpen = false;
    currentResultsTable = null;
  }
}

/**
 * Update the results info bar
 * @param {Object} data - The results data
 * @param {Object} queryInfo - Query execution information
 */
function updateResultsInfo(data, queryInfo) {
  const infoElement = document.getElementById('results-info');
  const timingElement = document.getElementById('results-timing');

  if (infoElement) {
    const rowCount = data.simpleTable ? data.simpleTable.numberOf_Rows : 0;
    const columnCount = data.simpleTable ? data.simpleTable.numberOf_Columns : 0;
    infoElement.textContent = `${rowCount} rows × ${columnCount} columns`;
  }

  if (timingElement && queryInfo.executionTime) {
    timingElement.textContent = `Executed in ${queryInfo.executionTime}ms`;
  }
}

/**
 * Render the results table
 * @param {Object} data - The results data containing simpleTable instance
 */
function renderResultsTable(data) {
  const container = document.getElementById('results-table-wrapper');
  if (!container) return;

  // Clear existing content
  container.innerHTML = '';

  if (!data.simpleTable) {
    container.innerHTML = '<p class="text-gray-500 text-center py-8">No results to display</p>';
    return;
  }

  // Get table data
  const rawTable = data.simpleTable.getRawTable();
  if (!rawTable || rawTable.length === 0) {
    container.innerHTML = '<p class="text-gray-500 text-center py-8">No data available</p>';
    return;
  }

  // Create table element
  const table = document.createElement('table');
  table.className = 'min-w-full divide-y divide-gray-200';

  // Create header
  const thead = document.createElement('thead');
  thead.className = 'bg-gray-50';
  const headerRow = document.createElement('tr');

  rawTable[0].forEach(header => {
    const th = document.createElement('th');
    th.className = 'px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider';
    th.textContent = header;
    headerRow.appendChild(th);
  });

  thead.appendChild(headerRow);
  table.appendChild(thead);

  // Create body
  const tbody = document.createElement('tbody');
  tbody.className = 'bg-white divide-y divide-gray-200';

  // Add data rows (skip header row at index 0)
  for (let i = 1; i < rawTable.length; i++) {
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-gray-50';

    rawTable[i].forEach(cell => {
      const td = document.createElement('td');
      td.className = 'px-6 py-4 whitespace-nowrap text-sm text-gray-900';
      td.textContent = cell || '';
      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  }

  table.appendChild(tbody);
  container.appendChild(table);
}

/**
 * Handle group method change
 * @param {Event} event - The change event
 */
function handleGroupMethodChange(event) {
  const newMethod = event.target.value;
  
  if (!currentResultsTable) return;

  // Show loading state
  const container = document.getElementById('results-table-wrapper');
  if (container) {
    container.innerHTML = '<p class="text-gray-500 text-center py-8">Applying new grouping method...</p>';
  }

  // Change the group method
  currentResultsTable.changeGroupMethod(newMethod);

  // Re-render the table
  renderResultsTable({ simpleTable: currentResultsTable });

  // Update results info
  updateResultsInfo({ simpleTable: currentResultsTable }, {});
}

/**
 * Export results to Excel
 */
function exportResults() {
  if (!currentResultsTable) {
    alert('No results to export');
    return;
  }

  // Use the existing Excel export functionality if available
  if (window.exportToExcel) {
    const rawTable = currentResultsTable.getRawTable();
    const tableName = document.getElementById('results-title').textContent || 'Query Results';
    
    // Convert to format expected by exportToExcel
    const headers = rawTable[0];
    const data = rawTable.slice(1).map(row => {
      const obj = {};
      headers.forEach((header, index) => {
        obj[header] = row[index];
      });
      return obj;
    });

    window.exportToExcel(headers, data, tableName);
  } else {
    alert('Export functionality not available');
  }
}

/**
 * Initialize the results modal module
 */
function initializeResultsModal() {
  // Create the modal HTML on page load
  createResultsModalHTML();
}

// Export functions for use in other modules
window.ResultsModal = {
  open: openResultsModal,
  close: closeResultsModal,
  initialize: initializeResultsModal,
  isOpen: () => resultsModalOpen
};

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeResultsModal);
} else {
  // DOM is already ready
  initializeResultsModal();
}