/**
 * Query History Management Module
 * Handles display and management of query history, including running, completed, and cancelled queries.
 * @module QueryHistory
 */

/* ---------- Example Queries data & renderer ---------- */
let exampleQueries = [];
let queryDurationUpdateInterval = null;

/**
 * Adds a new query to the history list.
 * @function addQueryToHistory
 * @param {Object} query - The query object to add
 */
function addQueryToHistory(query) {
  exampleQueries.unshift(query);
  // Keep only last 50 queries
  if (exampleQueries.length > 50) {
    exampleQueries.pop();
  }
  renderQueries();
}

/**
 * Fetches status of all queries from the backend.
 * Updates the local query history with current status.
 * @async
 * @function fetchQueryStatus
 */
async function fetchQueryStatus() {
  try {
    const response = await fetch('https://mlp.sirsi.net/uhtbin/query_api.pl', {
      method: 'POST',
      body: JSON.stringify({ action: 'status' })
    });
    
    if (!response.ok) return;
    
    const data = await response.json();
    if (!data.queries) return;
    
    const newHistory = [];
    
    // Sort server queries by ID descending (newest first)
    const serverQueries = Object.entries(data.queries).map(([id, info]) => ({
        id, 
        ...info 
    })).sort((a,b) => (b.id.localeCompare(a.id)));
    
    serverQueries.forEach(sq => {
        // Prepare UI Config from request payload if available
        let jsonConfig = null;
        if (sq.request && sq.request.ui_config) {
            jsonConfig = sq.request.ui_config;
        } else if (sq.request) {
            // Fallback: reconstruct minimal config from raw request
            jsonConfig = {
                DesiredColumnOrder: sq.request.display_fields || [],
                FilterGroups: []
            };
            if (sq.request.filters && sq.request.filters.length > 0) {
                 const group = { LogicalOperator: 'AND', Filters: [] };
                 sq.request.filters.forEach(f => {
                     // Reverse map operator roughly
                     let opName = 'equals';
                     if (f.operator === '>') opName = 'greater';
                     if (f.operator === '<') opName = 'less';
                     if (f.operator === '>=') opName = 'greater'; 
                     if (f.operator === '<=') opName = 'less';    
                     
                     group.Filters.push({
                        FieldName: f.field,
                        FieldOperator: opName,
                        Values: [f.value]
                     });
                 });
                 jsonConfig.FilterGroups.push(group);
            }
        }
        
        const qData = {
            id: sq.id,
            name: sq.name || (sq.request ? sq.request.name : 'Unknown Query'),
            status: sq.status,
            running: (sq.status === 'running'),
            cancelled: (sq.status === 'canceled'),
            startTime: sq.start_time,
            endTime: sq.end_time || '-',
            duration: '-', 
            jsonConfig: jsonConfig,
            resultCount: sq.row_count !== undefined ? sq.row_count : (sq.start_time && sq.end_time ? '?' : '-')
        };
        
        if (sq.start_time && sq.end_time) {
             const start = new Date(sq.start_time.replace(/-/g, '/')); 
             const end = new Date(sq.end_time.replace(/-/g, '/'));
             if (!isNaN(start) && !isNaN(end)) {
                 const diff = Math.floor((end - start) / 1000);
                 qData.duration = `${diff}s`;
             }
        } else if (sq.start_time && sq.status === 'running') {
             const start = new Date(sq.start_time.replace(/-/g, '/'));
             if (!isNaN(start)) {
                 const diff = Math.floor((Date.now() - start) / 1000);
                 qData.duration = `${diff}s...`;
             }
        }
        
        newHistory.push(qData);
    });

    exampleQueries = newHistory;
    renderQueries();
    
  } catch (e) {
    console.warn('Failed to fetch query status', e);
  }
}

/**
 * Cancels a running query.
 * @async
 * @function cancelQuery
 * @param {string} queryId - The ID of the query to cancel
 */
async function cancelQuery(queryId) {
  try {
    const response = await fetch('https://mlp.sirsi.net/uhtbin/query_api.pl', {
      method: 'POST',
      body: JSON.stringify({ action: 'cancel', query_id: queryId })
    });
    
    if (response.ok) {
        const q = exampleQueries.find(q => q.id === queryId);
        if(q) {
            q.running = false;
            q.cancelled = true;
            q.status = 'canceled';
            renderQueries();
        }
        showToastMessage(`Query ${queryId} cancelled`, 'info');
    } else {
        showToastMessage('Failed to cancel query', 'error');
    }
  } catch (e) {
    console.error('Error cancelling query:', e);
    showToastMessage('Error cancelling query', 'error');
  }
}


/* ---------- Tooltip Formatters ---------- */

/**
 * Formats a list of column names into a tooltip string.
 * @function formatColumnsTooltip
 * @param {string[]} columns - Array of column names
 * @returns {string} Formatted tooltip text
 */
window.formatColumnsTooltip = function(columns) {
  if (!columns || !columns.length) return 'None';
  if (columns.length <= 5) return columns.join(', ');
  const remainder = columns.length - 5;
  return columns.slice(0, 5).join(', ') + (remainder > 0 ? ` + ${remainder} more` : '');
};

/**
 * Formats filter groups into a tooltip string for history display.
 * @function formatHistoryFiltersTooltip
 * @param {Object[]} filterGroups - Array of filter groups
 * @returns {string} Formatted tooltip text
 */
window.formatHistoryFiltersTooltip = function(filterGroups) {
  if (!filterGroups || !filterGroups.length) return 'None';
  
  const lines = [];
  filterGroups.forEach((group, i) => {
    // if (i > 0) lines.push(group.LogicalOperator || 'AND'); 
    // Simplify for tooltip
    
    if (group.Filters) {
        group.Filters.forEach(f => {
            let op = f.FieldOperator;
            if (op === 'equals') op = '=';
            else if (op === 'greater') op = '>';
            else if (op === 'less') op = '<';
            else if (op === 'contains') op = 'contains';
            
            lines.push(`${f.FieldName || ''} ${op} ${f.Values ? f.Values.join('|') : ''}`);
        });
    }
  });
  
  return lines.join(', ');
};

/**
 * Loads a query configuration into the main UI.
 * Updates displayed fields, filters, and JSON display to match the selected query.
 * @function loadQueryConfig
 * @param {Object} q - The query object to load
 * @param {Object} q.jsonConfig - The query configuration
 * @param {string[]} q.jsonConfig.DesiredColumnOrder - Array of column names
 * @param {Object[]} q.jsonConfig.FilterGroups - Array of filter groups
 */
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

/** * Loads query results from backend.
 * @async
 * @function loadQueryResults
 * @param {string} queryId - The ID of the query to load results for
 */
async function loadQueryResults(queryId) {
    const q = exampleQueries.find(q => q.id === queryId);
    if (!q) return;

    // Load configuration first
    loadQueryConfig(q);
    
    // Show toast indicating loading
    if (typeof showToastMessage === 'function') {
        showToastMessage('Fetching results...', 'info');
    }

    try {
        const response = await fetch('https://mlp.sirsi.net/uhtbin/query_api.pl', {
            method: 'POST',
            body: JSON.stringify({ action: 'get_results', query_id: queryId })
        });

        if (!response.ok) {
            throw new Error(`Server error: ${response.status} ${response.statusText}`);
        }

        const text = await response.text();
        
        // Use X-Raw-Columns or fallback to config used
        const rawColsHeader = response.headers.get('X-Raw-Columns');
        // Ensure displayedFields is updated after loadQueryConfig
        const currentDisplayedFields = window.displayedFields || (q.jsonConfig ? q.jsonConfig.DesiredColumnOrder : []);
        
        const rawColumns = rawColsHeader ? rawColsHeader.split('|') : currentDisplayedFields;
        
        const lines = text.split('\n').filter(line => line.trim().length > 0);
        
        const headers = currentDisplayedFields;
        
        const rows = lines.map(line => {
            const values = line.split('|');
            const obj = {};
            // Map raw columns to values
            rawColumns.forEach((h, i) => {
                obj[h] = values[i] !== undefined ? values[i] : '';
            });
            // Ensure all requested headers exist
            headers.forEach(h => {
                if (!(h in obj)) obj[h] = '';
            });
            return obj;
        });

        console.log(`Loaded ${rows.length} rows from history`);

        if (window.VirtualTable) {
            const columnMap = new Map();
            headers.forEach((h, i) => columnMap.set(h, i));
            
            // Map object rows back to array of values in headers order
            const tableRows = rows.map(r => headers.map(h => r[h]));
            
            const newTableData = {
                headers: headers,
                rows: tableRows,
                columnMap: columnMap
            };
            
            window.VirtualTable.virtualTableData = newTableData;
            
            if (typeof showExampleTable === 'function') {
                await showExampleTable(headers);
            } else {
                window.VirtualTable.renderVirtualTable();
                window.VirtualTable.calculateOptimalColumnWidths(); 
            }
            
            window.totalRows = rows.length;
            window.scrollRow = 0;
            if (window.BubbleSystem && typeof window.BubbleSystem.updateScrollBar === 'function') {
                window.BubbleSystem.updateScrollBar();
            }
            if (typeof window.updateButtonStates === 'function') {
                window.updateButtonStates();
            }
        }
        
        if (typeof showToastMessage === 'function') {
            showToastMessage(`Loaded ${rows.length} results.`, 'success');
        }
        
        // Close modal if open
        if (window.ModalSystem && window.ModalSystem.closeAllModals) {
             window.ModalSystem.closeAllModals();
        }

    } catch (error) {
        console.error('Failed to load results:', error);
        if (typeof showToastMessage === 'function') {
            showToastMessage('Failed to load results: ' + error.message, 'error');
        }
    }
}

/** * Creates HTML for a single query row in the queries table.
 * Handles different display formats for running, completed, and cancelled queries.
 * @function createQueriesTableRowHtml
 * @param {Object} q - The query object
 * @param {string} viewIconSVG - SVG icon for view buttons
 * @returns {string} HTML string for the table row
 */
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
  const filterTooltip = typeof formatHistoryFiltersTooltip === 'function' ? formatHistoryFiltersTooltip(filterGroups) : '';
  const filtersSummary = filterGroups.length && filterTooltip
    ? `<span class="inline-flex items-center gap-1" data-tooltip="${filterTooltip.replace(/"/g, '&quot;')}">
          ${viewIconSVG}
       </span>`
    : '<span class="text-gray-400">None</span>';

  // Stop button for running queries (no 'Running' label)
  const stopBtn = q.running ? `
    <button class="stop-query-btn inline-flex items-center justify-center p-1 rounded-full bg-red-100 hover:bg-red-200 text-red-600" tabindex="-1" data-query-id="${q.id}" data-tooltip="Stop"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-4 h-4"><rect x="6" y="6" width="12" height="12" rx="2"/></svg></button>
  ` : '';
  
  // Load button only for completed queries (report icon)
  const loadBtn = !q.running && !q.cancelled ? `<button class="load-query-btn inline-flex items-center justify-center p-1 rounded-full bg-gray-100 hover:bg-gray-200 text-blue-600" tabindex="-1" data-query-id="${q.id}" style="margin-left:4px;" data-tooltip="Open results - ${q.resultCount !== undefined ? q.resultCount : 'Unknown'} rows"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/></svg></button>` : '';
  
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


// Ensure global access
window.addQueryToHistory = addQueryToHistory;
window.fetchQueryStatus = fetchQueryStatus;

/**
 * Starts real-time updates for running query durations.
 * Updates every second while there are running queries.
 * @function startQueryDurationUpdates
 */
function startQueryDurationUpdates() {
  if (queryDurationUpdateInterval) return; // Already running
  
  queryDurationUpdateInterval = setInterval(() => {
    const hasRunningQueries = exampleQueries.some(q => q.running);
    if (hasRunningQueries) {
        // Update UI durations
        renderQueries(); 
        
        // Poll backend status every 5 seconds (approx) using modulo check
        if (Date.now() % 5000 < 1000) {
             window.fetchQueryStatus();
        }
    } else {
      stopQueryDurationUpdates();
    }
  }, 1000); 
}

/**
 * Stops real-time duration updates for running queries.
 * @function stopQueryDurationUpdates
 */
function stopQueryDurationUpdates() {
  if (queryDurationUpdateInterval) {
    clearInterval(queryDurationUpdateInterval);
    queryDurationUpdateInterval = null;
  }
}

/**
 * Renders the complete queries list with search filtering.
 * Groups queries by status (running, completed, cancelled) and displays them in tables.
 * @function renderQueries
 */
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
      loadQueryResults(id);
    });
  });
  
  // Attach click handlers to rerun buttons
  container.querySelectorAll('.rerun-query-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.getAttribute('data-query-id');
      const q = exampleQueries.find(q => q.id === id);
      q.running = true; 
      q.startTime = new Date().toISOString();
      q.endTime = null;
      q.cancelled = false;
      q.status = 'running';
      
      // We would ideally call the backend 'run' here, but queryHistory.js 
      // is UI-focused. The user should probably load config then click Run.
      // But for "Rerun", let's just populate the UI and simulate a click on the main Run button?
      // For now, load config and let user run it.
      loadQueryConfig(q);
      
      // If we *really* wanted to run immediately, we'd need to emit an event or call a global run function.
      // Let's stick to loading config + focus on main Run button.
      document.getElementById('run-btn')?.click(); // Try to click run button if config loaded
    });
  });

  // Attach click handlers to stop/cancel buttons
  container.querySelectorAll('.stop-query-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.getAttribute('data-query-id');
      if (confirm('Are you sure you want to cancel this query?')) {
        cancelQuery(id);
      }
    });
  });
}

/**
 * Handles clicks on query table rows to load their configuration.
 * @function handleQueryRowClick
 * @param {Event} e - The click event
 */
function handleQueryRowClick(e) {
  const row = e.target.closest('#queries-container tbody tr[data-query-id]');
  if(!row) return;
  const id = row.getAttribute('data-query-id');
  const q = exampleQueries.find(q => q.id === id);
  if(!q || !q.jsonConfig) return;

  loadQueryConfig(q);
}

/**
 * Query History System object providing external access to history functionality.
 * @namespace QueryHistorySystem
 * @global
 */
const QueryHistorySystem = {
  exampleQueries,
  loadQueryConfig,
  createQueriesTableRowHtml,
  startQueryDurationUpdates,
  stopQueryDurationUpdates,
  renderQueries,
  handleQueryRowClick,
  cancelQuery
};

// Make QueryHistorySystem globally accessible
window.QueryHistorySystem = QueryHistorySystem;

// Backwards compatibility or global helper
window.cancelQuery = cancelQuery;
window.loadQueryResults = loadQueryResults;

// Initialize query history functionality
window.onDOMReady(() => {
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

  // Initial fetch of query history
  setTimeout(() => { if (window.fetchQueryStatus) window.fetchQueryStatus(); }, 500);
});
