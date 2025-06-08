// Query History Management Module

/* ---------- Example Queries data & renderer ---------- */
const exampleQueries = [
  {
    id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    name: 'Huxley Brave Works',
    running: false,
    cancelled: false,
    jsonConfig: {
      DesiredColumnOrder: ["Title","Author","Publication Date"],
      FilterGroups: [
        {
          LogicalOperator: "And",
          Filters: [
            { FieldName:"Author", FieldOperator:"Contains", Values:["Huxley"] },
            { FieldName:"Title", FieldOperator:"Contains", Values:["Brave"] }
          ]
        }
      ]
    },
    resultCount: 42,
    startTime: '2025-05-05T13:45:00Z',
    endTime:   '2025-05-05T13:46:05Z'
  },
  {
    id: '9f8b7a6c-1234-4d56-a789-0123456789ab',
    name: 'TRLS-A Location Items',
    running: true,
    cancelled: false,
    jsonConfig: {
      DesiredColumnOrder: ["Title","Call Number","Home Location"],
      FilterGroups: [
        {
          LogicalOperator: "Or",
          Filters: [
            { FieldName:"Home Location", FieldOperator:"Equals", Values:["TRLS-A"] }
          ]
        }
      ]
    },
    startTime: '2025-05-05T14:02:00Z',
    endTime:   null
  },
  {
    id: 'b2c3d479-58cc-4372-a567-0e02f47ac10b',
    name: 'Expensive Books',
    running: false,
    cancelled: false,
    jsonConfig: {
      DesiredColumnOrder: ["Barcode","Item Type","Price"],
      FilterGroups: [
        {
          LogicalOperator: "And",
          Filters: [
            { FieldName:"Price", FieldOperator:"GreaterThan", Values:["10"] },
            { FieldName:"Item Type", FieldOperator:"Equals", Values:["Book"] }
          ]
        }
      ]
    },
    resultCount: 1567,
    startTime: '2025-05-06T09:00:00Z',
    endTime:   '2025-05-06T09:01:00Z'
  },
  {
    id: 'c3d479f4-7ac1-0b58-cc43-72a5670e02b2',
    name: 'MLTN-A 2023 Items',
    running: false,
    cancelled: false,
    jsonConfig: {
      DesiredColumnOrder: ["Library","Catalog Key","Item Creation Date"],
      FilterGroups: [
        {
          LogicalOperator: "And",
          Filters: [
            { FieldName:"Library", FieldOperator:"Equals", Values:["MLTN-A"] },
            { FieldName:"Item Creation Date", FieldOperator:"Between", Values:["2023-01-01","2023-12-31"] }
          ]
        }
      ]
    },
    resultCount: 110,
    startTime: '2025-05-07T10:15:00Z',
    endTime:   '2025-05-07T10:16:00Z'
  },
  {
    id: 'd4e5f6a7-1234-5678-9abc-def012345678',
    name: 'Large Dataset Query',
    running: false,
    cancelled: true,
    jsonConfig: {
      DesiredColumnOrder: ["Title","Author","Call Number","Library","Item Type","Price"],
      FilterGroups: [
        {
          LogicalOperator: "Or",
          Filters: [
            { FieldName:"Library", FieldOperator:"Equals", Values:["TRLS-A","TRLS-B","MLTN-A"] }
          ]
        }
      ]
    },
    startTime: '2025-05-08T11:30:00Z',
    cancelledTime: '2025-05-08T11:35:00Z'
  }
];

// Helper to load a query config into the main UI
function loadQueryConfig(q) {
  if(!q || !q.jsonConfig) return;
  
  // Access global variables from query.js
  if (typeof window.displayedFields === 'undefined' || typeof showExampleTable === 'undefined') {
    console.error('Query history module requires global access to query.js variables');
    return;
  }
  
  // Load fields
  window.displayedFields.length = 0; // Clear existing array
  window.displayedFields.push(...q.jsonConfig.DesiredColumnOrder);
  showExampleTable(window.displayedFields);
  
  // Clear filters and reapply from query
  if (typeof activeFilters !== 'undefined') {
    Object.keys(activeFilters).forEach(k => delete activeFilters[k]);
    document.querySelectorAll('.bubble-filter').forEach(b => {
      b.classList.remove('bubble-filter');
      b.removeAttribute('data-filtered');
    });
    
    if(q.jsonConfig.FilterGroups && q.jsonConfig.FilterGroups.length){
      q.jsonConfig.FilterGroups.forEach(group => {
        group.Filters.forEach(ff => {
          if (!activeFilters[ff.FieldName]) {
            activeFilters[ff.FieldName] = { logical: group.LogicalOperator, filters: [] };
          }
          activeFilters[ff.FieldName].filters.push({ cond: ff.FieldOperator.toLowerCase(), val: ff.Values.join('|') });
          const bubbleEl = Array.from(document.querySelectorAll('.bubble'))
            .find(b => b.textContent.trim() === ff.FieldName);
          if(bubbleEl){
            bubbleEl.classList.add('bubble-filter');
            bubbleEl.dataset.filtered = 'true';
          }
        });
      });
    }
  }
  
  // Update JSON display
  if (typeof updateQueryJson === 'function') {
    updateQueryJson();
  }
}

// Helper function to create HTML for a single query row
function createQueriesTableRowHtml(q, viewIconSVG) {
  // Use tooltip for columns
  const columns = q.jsonConfig?.DesiredColumnOrder || [];
  const columnsTooltip = typeof formatColumnsTooltip === 'function' ? formatColumnsTooltip(columns) : '';
  const columnsSummary = columns.length && columnsTooltip
    ? `<span class="inline-flex items-center gap-1" data-tooltip="${columnsTooltip.replace(/"/g, '&quot;')}">
          ${viewIconSVG}
       </span>`
    : '<span class="text-gray-400">None</span>';
    
  // Use tooltip for filters
  const filterGroups = q.jsonConfig?.FilterGroups || [];
  const filterTooltip = typeof formatFiltersTooltip === 'function' ? formatFiltersTooltip(null, filterGroups) : '';
  const filtersSummary = filterGroups.length && filterTooltip
    ? `<span class="inline-flex items-center gap-1" data-tooltip="${filterTooltip.replace(/"/g, '&quot;')}">
          ${viewIconSVG}
       </span>`
    : '<span class="text-gray-400">None</span>';

  // Stop button for running queries (no 'Running' label)
  const stopBtn = q.running ? `
    <button class="inline-flex items-center justify-center p-1 rounded-full bg-red-100 hover:bg-red-200 text-red-600" tabindex="-1" data-tooltip="Stop"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-4 h-4"><rect x="6" y="6" width="12" height="12" rx="2"/></svg></button>
  ` : '';
  
  // Load button only for completed queries (report icon)
  const loadBtn = !q.running && !q.cancelled ? `<button class="load-query-btn inline-flex items-center justify-center p-1 rounded-full bg-gray-100 hover:bg-gray-200 text-blue-600" tabindex="-1" data-query-id="${q.id}" style="margin-left:4px;" data-tooltip="Open results - ${q.resultCount || 0} rows"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/></svg></button>` : '';
  
  // Rerun button for both completed and cancelled queries (refresh/replay icon)
  const rerunBtn = (!q.running) ? `<button class="rerun-query-btn inline-flex items-center justify-center p-1 rounded-full bg-gray-100 hover:bg-gray-200 text-green-600" tabindex="-1" data-query-id="${q.id}" style="margin-left:4px;" data-tooltip="Rerun Query"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg></button>` : '';
  
  // Duration calculation
  let duration = '—';
  if (q.startTime && (q.endTime || q.cancelledTime)) {
    const start = new Date(q.startTime);
    const end = new Date(q.endTime || q.cancelledTime);
    let seconds = Math.floor((end - start) / 1000);
    duration = typeof formatDuration === 'function' ? formatDuration(seconds) : `${seconds}s`;
  }
  
  // Different row structure for running vs completed vs cancelled queries
  if (q.running) {
    return `
      <tr class="border-b hover:bg-blue-50 cursor-pointer" data-query-id="${q.id}">
        <td class="px-4 py-2 text-xs text-center font-mono">${q.name || q.id}</td>
        <td class="px-4 py-2 text-xs text-center">${columnsSummary}</td>
        <td class="px-4 py-2 text-xs text-center">${filtersSummary}</td>
        <td class="px-4 py-2 text-center">${stopBtn}</td>
        <td class="px-4 py-2 text-xs text-center">${new Date(q.startTime).toLocaleString()}</td>
      </tr>
    `;
  } else if (q.cancelled) {
    return `
      <tr class="border-b hover:bg-red-50 cursor-pointer" data-query-id="${q.id}">
        <td class="px-4 py-2 text-xs text-center font-mono">${q.name || q.id}</td>
        <td class="px-4 py-2 text-xs text-center">${columnsSummary}</td>
        <td class="px-4 py-2 text-xs text-center">${filtersSummary}</td>
        <td class="px-4 py-2 text-xs text-center">${new Date(q.startTime).toLocaleString()}</td>
        <td class="px-4 py-2 text-xs text-center">${duration}</td>
        <td class="px-4 py-2 text-xs text-center">${rerunBtn}</td>
      </tr>
    `;
  } else {
    return `
      <tr class="border-b hover:bg-blue-50 cursor-pointer" data-query-id="${q.id}">
        <td class="px-4 py-2 text-xs text-center font-mono">${q.name || q.id}</td>
        <td class="px-4 py-2 text-xs text-center">${columnsSummary}</td>
        <td class="px-4 py-2 text-xs text-center">${filtersSummary}</td>
        <td class="px-4 py-2 text-xs text-center">${new Date(q.startTime).toLocaleString()}</td>
        <td class="px-4 py-2 text-xs text-center">${duration}</td>
        <td class="px-4 py-2 text-xs text-center">${loadBtn}</td>
        <td class="px-4 py-2 text-xs text-center">${rerunBtn}</td>
      </tr>
    `;
  }
}

// Global variable to track the update interval
let queryDurationUpdateInterval = null;

// Function to start real-time updates for running query durations
function startQueryDurationUpdates() {
  if (queryDurationUpdateInterval) return; // Already running
  
  queryDurationUpdateInterval = setInterval(() => {
    // Only update if queries panel is visible and there are running queries
    const queriesPanel = document.getElementById('queries-panel');
    const hasRunningQueries = exampleQueries.some(q => q.running);
    
    if (queriesPanel && !queriesPanel.classList.contains('hidden') && hasRunningQueries) {
      renderQueries(); // Re-render to update durations
    } else if (!hasRunningQueries) {
      // Stop updates if no running queries
      stopQueryDurationUpdates();
    }
  }, 1000); // Update every second
}

// Function to stop real-time updates
function stopQueryDurationUpdates() {
  if (queryDurationUpdateInterval) {
    clearInterval(queryDurationUpdateInterval);
    queryDurationUpdateInterval = null;
  }
}

function renderQueries(){
  const container = document.getElementById('queries-list');
  if(!container) return;
  
  // Get search value
  const searchInput = document.getElementById('queries-search');
  const searchTerm = searchInput ? searchInput.value.trim().toLowerCase() : '';
  
  // Use an eye icon SVG for both columns and filters
  const viewIconSVG = `<svg class="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M1.5 12s4-7 10.5-7 10.5 7 10.5 7-4 7-10.5 7S1.5 12 1.5 12z"/><circle cx="12" cy="12" r="3.5"/></svg>`;
  
  let runningList = exampleQueries.filter(q => q.running);
  let doneList = exampleQueries.filter(q => !q.running && !q.cancelled);
  let cancelledList = exampleQueries.filter(q => q.cancelled);
  
  // Apply search filter if there's a search term
  if (searchTerm) {
    runningList = runningList.filter(q => 
      (q.name && q.name.toLowerCase().includes(searchTerm)) ||
      q.id.toLowerCase().includes(searchTerm) ||
      (q.jsonConfig?.DesiredColumnOrder || []).some(col => col.toLowerCase().includes(searchTerm))
    );
    doneList = doneList.filter(q => 
      (q.name && q.name.toLowerCase().includes(searchTerm)) ||
      q.id.toLowerCase().includes(searchTerm) ||
      (q.jsonConfig?.DesiredColumnOrder || []).some(col => col.toLowerCase().includes(searchTerm))
    );
    cancelledList = cancelledList.filter(q => 
      (q.name && q.name.toLowerCase().includes(searchTerm)) ||
      q.id.toLowerCase().includes(searchTerm) ||
      (q.jsonConfig?.DesiredColumnOrder || []).some(col => col.toLowerCase().includes(searchTerm))
    );
  }
  
  const runningRows = runningList.map(q => createQueriesTableRowHtml(q, viewIconSVG)).join('');
  const doneRows = doneList.map(q => createQueriesTableRowHtml(q, viewIconSVG)).join('');
  const cancelledRows = cancelledList.map(q => createQueriesTableRowHtml(q, viewIconSVG)).join('');

  // Different table headers for running vs completed queries
  const runningTableHead = `
    <thead class="bg-blue-50">
      <tr>
        <th class="px-4 py-2 text-center" data-tooltip="Query name or identifier">Name</th>
        <th class="px-4 py-2 text-center" data-tooltip="Columns being displayed in the query results">Displaying</th>
        <th class="px-4 py-2 text-center" data-tooltip="Active filters applied to the query">Filters</th>
        <th class="px-4 py-2 text-center" data-tooltip="Stop the currently running query">Stop/Cancel</th>
        <th class="px-4 py-2 text-center" data-tooltip="When this query was started">Started</th>
      </tr>
    </thead>`;

  const completedTableHead = `
    <thead class="bg-blue-50">
      <tr>
        <th class="px-4 py-2 text-center" data-tooltip="Query name or identifier">Name</th>
        <th class="px-4 py-2 text-center" data-tooltip="Columns being displayed in the query results">Displaying</th>
        <th class="px-4 py-2 text-center" data-tooltip="Active filters applied to the query">Filters</th>
        <th class="px-4 py-2 text-center" data-tooltip="When this query was last executed">Last Run</th>
        <th class="px-4 py-2 text-center" data-tooltip="How long the query took to complete">Duration</th>
        <th class="px-4 py-2 text-center" data-tooltip="Load the query results or view report">Results</th>
        <th class="px-4 py-2 text-center" data-tooltip="Re-execute this query with the same settings">Rerun</th>
      </tr>
    </thead>`;

  const cancelledTableHead = `
    <thead class="bg-red-50">
      <tr>
        <th class="px-4 py-2 text-center" data-tooltip="Query name or identifier">Name</th>
        <th class="px-4 py-2 text-center" data-tooltip="Columns being displayed in the query results">Displaying</th>
        <th class="px-4 py-2 text-center" data-tooltip="Active filters applied to the query">Filters</th>
        <th class="px-4 py-2 text-center" data-tooltip="When this query was last executed before cancellation">Last Run</th>
        <th class="px-4 py-2 text-center" data-tooltip="How long the query ran before being cancelled">Duration</th>
        <th class="px-4 py-2 text-center" data-tooltip="Re-execute this query with the same settings">Rerun</th>
      </tr>
    </thead>`;

  const runningCount = runningList.length;
  const doneCount = doneList.length;
  const cancelledCount = cancelledList.length;

  let content = '';

  // Show "no results" message if search returns nothing
  if (searchTerm && runningCount === 0 && doneCount === 0 && cancelledCount === 0) {
    content = `<p class="text-center text-gray-500 italic py-4">No queries found matching "${searchTerm}".</p>`;
  } else {
    const runningSection = runningRows ? `
      <details class="mb-6" open>
        <summary class="bg-blue-100 text-left px-4 py-2 font-semibold cursor-pointer">${runningCount} Running</summary>
        <table class="min-w-full text-sm">
          ${runningTableHead}
          <tbody>
            ${runningRows}
          </tbody>
        </table>
      </details>
    ` : '';

    const doneSection = doneRows ? `
      <details class="mb-6" open>
        <summary class="bg-blue-100 text-left px-4 py-2 font-semibold cursor-pointer">${doneCount} Completed</summary>
        <table class="min-w-full text-sm">
          ${completedTableHead}
          <tbody>
            ${doneRows}
          </tbody>
        </table>
      </details>
    ` : '';

    const cancelledSection = cancelledRows ? `
      <details>
        <summary class="bg-red-100 text-left px-4 py-2 font-semibold cursor-pointer">${cancelledCount} Cancelled</summary>
        <table class="min-w-full text-sm">
          ${cancelledTableHead}
          <tbody>
            ${cancelledRows}
          </tbody>
        </table>
      </details>
    ` : (cancelledCount === 0 && !searchTerm ? `
      <details>
        <summary class="bg-red-100 text-left px-4 py-2 font-semibold cursor-pointer">0 Cancelled</summary>
        <p class="text-center text-gray-500 italic py-4">No cancelled queries yet.</p>
      </details>
    ` : '');

    content = runningSection + doneSection + cancelledSection;
  }

  container.innerHTML = content;

  // Attach click handlers to load buttons
  container.querySelectorAll('.load-query-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.getAttribute('data-query-id');
      const q = exampleQueries.find(q => q.id === id);
      loadQueryConfig(q);
    });
  });
  
  // Attach click handlers to rerun buttons
  container.querySelectorAll('.rerun-query-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.getAttribute('data-query-id');
      const q = exampleQueries.find(q => q.id === id);
      loadQueryConfig(q);
    });
  });
}

// Handle click on a table row to load its jsonConfig
function handleQueryRowClick(e) {
  const row = e.target.closest('#queries-container tbody tr[data-query-id]');
  if(!row) return;
  const id = row.getAttribute('data-query-id');
  const q = exampleQueries.find(q => q.id === id);
  if(!q || !q.jsonConfig) return;

  loadQueryConfig(q);
}

// Query History System object for external access
const QueryHistorySystem = {
  exampleQueries,
  loadQueryConfig,
  createQueriesTableRowHtml,
  startQueryDurationUpdates,
  stopQueryDurationUpdates,
  renderQueries,
  handleQueryRowClick
};

// Make QueryHistorySystem globally accessible
window.QueryHistorySystem = QueryHistorySystem;

// Initialize query history functionality
document.addEventListener('DOMContentLoaded', () => {
  // Initial render of example Queries list
  renderQueries();

  // Start duration updates if there are running queries
  if (exampleQueries.some(q => q.running)) {
    // Don't start immediately - only when the panel is opened
    // The openModal function will handle starting updates
  }

  // Attach queries search event listener
  const queriesSearchInput = document.getElementById('queries-search');
  if (queriesSearchInput) {
    queriesSearchInput.addEventListener('input', renderQueries);
  }

  // Add row click event listener
  document.addEventListener('click', handleQueryRowClick);
});
