/**
 * Query History Management Module
 * Handles display and management of query history, including running, completed, and cancelled queries.
 * @module QueryHistory
 */

/* ---------- Example Queries data & renderer ---------- */
let exampleQueries = [];
let queryDurationUpdateInterval = null;
let lastQueryStatusPollAt = 0;
let activeHistorySection = 'running';
const QUERY_STATUS_POLL_MS = 2000;

function isQueriesPanelOpen() {
  const panel = document.getElementById('queries-panel');
  return !!(panel && !panel.classList.contains('hidden'));
}

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

function classifyQueryStatus(status) {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'running') return 'running';
  if (normalized === 'complete') return 'complete';
  if (normalized === 'canceled') return 'canceled';
  if (normalized === 'failed') return 'failed';
  return normalized || 'unknown';
}

function getQueryStatusMeta(status) {
  const bucket = classifyQueryStatus(status);

  if (bucket === 'running') {
    return { label: 'Running', rowClass: 'history-row-running', badgeClass: 'history-status-badge status-running' };
  }
  if (bucket === 'complete') {
    return { label: 'Completed', rowClass: 'history-row-complete', badgeClass: 'history-status-badge status-complete' };
  }
  if (bucket === 'canceled') {
    return { label: 'Cancelled', rowClass: 'history-row-canceled', badgeClass: 'history-status-badge status-canceled' };
  }
  if (bucket === 'failed') {
    return { label: 'Failed', rowClass: 'history-row-failed', badgeClass: 'history-status-badge status-failed' };
  }

  return { label: 'Interrupted', rowClass: 'history-row-failed', badgeClass: 'history-status-badge status-failed' };
}

function buildHistorySection(sectionKey, count, rows, tableHead, emptyMessage, isOpen = false) {
  const meta = {
    running: {
      title: 'Running',
      subtitle: 'Queries currently executing on the backend.',
      coverLabel: 'Live volume',
      detailsClass: 'history-book running',
      summaryClass: 'history-book-summary running'
    },
    complete: {
      title: 'Completed',
      subtitle: 'Finished results ready to inspect or reload.',
      coverLabel: 'Archive volume',
      detailsClass: 'history-book complete',
      summaryClass: 'history-book-summary complete'
    },
    failed: {
      title: 'Failed / Interrupted',
      subtitle: 'Queries that errored, were abandoned, or quit unexpectedly.',
      coverLabel: 'Incident volume',
      detailsClass: 'history-book failed',
      summaryClass: 'history-book-summary failed'
    },
    canceled: {
      title: 'Cancelled',
      subtitle: 'Queries stopped intentionally before they completed.',
      coverLabel: 'Stopped volume',
      detailsClass: 'history-book canceled',
      summaryClass: 'history-book-summary canceled'
    }
  }[sectionKey];

  const openAttr = isOpen ? ' open' : '';
  const bodyContent = rows
    ? `<div class="history-table-shell"><table class="min-w-full text-sm history-table">${tableHead}<tbody>${rows}</tbody></table></div>`
    : `<div class="history-empty-state">${emptyMessage}</div>`;
  const statusLabel = count === 0
    ? 'Empty'
    : isOpen
      ? 'Open'
      : 'Closed';

  return `
    <details class="${meta.detailsClass}" data-history-book="${sectionKey}"${openAttr}>
      <summary class="${meta.summaryClass}">
        <span class="history-book-spine" aria-hidden="true"></span>
        <span class="history-book-cover">
          <span class="history-book-summary-main">
            <span class="history-book-kicker">${meta.coverLabel}</span>
            <span class="history-book-title">${meta.title}</span>
            <span class="history-book-subtitle">${meta.subtitle}</span>
          </span>
          <span class="history-book-summary-side">
            <span class="history-book-count">${count}</span>
            <span class="history-book-state">${statusLabel}</span>
            <span class="history-book-open-hint">Pull volume</span>
          </span>
        </span>
      </summary>
      <div class="history-book-body">
        <div class="history-book-pages">
          ${bodyContent}
        </div>
      </div>
    </details>
  `;
}

function getPreferredHistorySection(counts) {
  const orderedSections = ['running', 'complete', 'failed', 'canceled'];

  if (activeHistorySection === 'none') {
    return null;
  }

  if (orderedSections.includes(activeHistorySection)) {
    return activeHistorySection;
  }

  return orderedSections.find(sectionKey => counts[sectionKey] > 0) || 'running';
}

function bindHistoryBookShelf(container) {
  const books = Array.from(container.querySelectorAll('[data-history-book]'));
  if (!books.length) return;

  books.forEach(book => {
    book.addEventListener('toggle', () => {
      if (book.open) {
        activeHistorySection = book.dataset.historyBook || 'running';
        books.forEach(otherBook => {
          if (otherBook !== book) {
            otherBook.open = false;
          }
        });
      } else if (!books.some(otherBook => otherBook.open)) {
        activeHistorySection = 'none';
      }
    });
  });
}

function appendUniqueColumn(target, fieldName) {
  if (!fieldName || target.includes(fieldName)) return;
  target.push(fieldName);
}

function resolveSpecialPayloadFieldNames(specialFields) {
  if (!Array.isArray(specialFields) || !Array.isArray(window.fieldDefsArray)) {
    return [];
  }

  return specialFields.reduce((resolved, payload) => {
    const match = window.fieldDefsArray.find(fieldDef => {
      if (!fieldDef || !fieldDef.special_payload) return false;
      return JSON.stringify(fieldDef.special_payload) === JSON.stringify(payload);
    });

    if (match) {
      appendUniqueColumn(resolved, match.name);
    }

    return resolved;
  }, []);
}

function buildUiConfigFromRequest(request) {
  if (!request || typeof request !== 'object') {
    return null;
  }

  const desiredColumns = [];
  const specialFields = Array.isArray(request.special_fields)
    ? request.special_fields.map(field => (field && typeof field === 'object' ? { ...field } : field))
    : [];

  (request.display_fields || []).forEach(fieldName => appendUniqueColumn(desiredColumns, fieldName));
  resolveSpecialPayloadFieldNames(specialFields).forEach(fieldName => appendUniqueColumn(desiredColumns, fieldName));

  const uiConfig = {
    DesiredColumnOrder: desiredColumns,
    Filters: [],
    SpecialFields: specialFields
  };

  if (Array.isArray(request.filters)) {
    request.filters.forEach(f => {
      let opName = 'Equals';
      if (f.operator === '>') opName = 'GreaterThan';
      else if (f.operator === '<') opName = 'LessThan';
      else if (f.operator === '>=') opName = 'GreaterThanOrEqual';
      else if (f.operator === '<=') opName = 'LessThanOrEqual';
      else if (f.operator === '!=') opName = String(f.value || '').includes('*') ? 'DoesNotContain' : 'DoesNotEqual';
      else if (f.operator === '=') {
        if (String(f.value || '').startsWith('*') || String(f.value || '').endsWith('*')) {
          opName = 'Contains';
        }
      }

      uiConfig.Filters.push({
        FieldName: f.field,
        FieldOperator: opName,
        Values: [f.value]
      });
    });
  }

  return uiConfig;
}

/**
 * Fetches status of all queries from the backend.
 * Updates the local query history with current status.
 * @async
 * @function fetchQueryStatus
 */
async function fetchQueryStatus() {
  try {
    lastQueryStatusPollAt = Date.now();
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
            jsonConfig = buildUiConfigFromRequest(sq.request);
        }
        
        const qData = {
            id: sq.id,
            name: sq.name || (sq.request ? sq.request.name : 'Unknown Query'),
            status: sq.status,
            statusBucket: classifyQueryStatus(sq.status),
            launchMode: sq.launch_mode || '',
            deliveryMode: sq.delivery_mode || '',
            running: (sq.status === 'running'),
            cancelled: (sq.status === 'canceled'),
            failed: (classifyQueryStatus(sq.status) !== 'running'
              && classifyQueryStatus(sq.status) !== 'complete'
              && classifyQueryStatus(sq.status) !== 'canceled'),
            startTime: sq.start_time,
            endTime: sq.end_time || '-',
            duration: '-', 
            jsonConfig: jsonConfig,
            resultCount: sq.row_count !== undefined ? sq.row_count : (sq.start_time && sq.end_time ? '?' : '-'),
            error: sq.error || sq.warning || ''
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

    if (isQueriesPanelOpen() && newHistory.some(q => q.running)) {
      startQueryDurationUpdates();
    } else {
      stopQueryDurationUpdates();
    }
    
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
 * Formats a list of column names into an HTML tooltip.
 * @function formatColumnsTooltip
 * @param {string[]} columns - Array of column names
 * @returns {string} Formatted tooltip HTML
 */
window.formatColumnsTooltip = function(columns) {
  if (!columns || !columns.length) return '';

  const columnItems = columns.map((column, index) => (
    '<li class="tt-filter-item tt-column-item">' +
    `  <span class="tt-column-index">${index + 1}</span>` +
    `  <span class="tt-column-name">${escapeHtml(column || '')}</span>` +
    '</li>'
  )).join('');

  return '<div class="tt-filter-container tt-columns-container">' +
    '<div class="tt-filter-title">Displayed Columns</div>' +
    `<ol class="tt-filter-list tt-columns-list">${columnItems}</ol>` +
    '</div>';
};

function createTooltipIconSummary(viewIconSVG, attributeName, tooltipContent) {
  if (!tooltipContent) {
    return '<span class="text-gray-400">None</span>';
  }

  return `<span class="inline-flex items-center gap-1" ${attributeName}="${tooltipContent.replace(/"/g, '&quot;')}">`
    + viewIconSVG
    + '</span>';
}

/**
 * Formats filters into a tooltip string for history display.
 * @function formatHistoryFiltersTooltip
 * @param {Object[]|Object} filtersInput - Filters array or ui_config object
 * @returns {string} Formatted tooltip text
 */
window.formatHistoryFiltersTooltip = function(filtersInput) {
  const filters = typeof window.normalizeUiConfigFilters === 'function'
    ? window.normalizeUiConfigFilters(filtersInput)
    : [];
  if (!filters.length) return 'None';
  
  const lines = [];
  filters.forEach(f => {
    const op = typeof window.formatFieldOperatorForDisplay === 'function'
      ? window.formatFieldOperatorForDisplay(f.FieldOperator)
      : f.FieldOperator;

    lines.push(`${f.FieldName || ''} ${op} ${f.Values ? f.Values.join('|') : ''}`);
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
 * @param {Object[]} q.jsonConfig.Filters - Array of flat filters
 */
function loadQueryConfig(q) {
  if(!q || !q.jsonConfig) return;
  
  // Access global variables from query.js
  if (typeof window.displayedFields === 'undefined' || typeof showExampleTable === 'undefined') {
    console.error('Query history module requires global access to query.js variables');
    return;
  }
  
  // Load fields
  const desiredColumns = Array.isArray(q.jsonConfig.DesiredColumnOrder)
    ? [...q.jsonConfig.DesiredColumnOrder]
    : [];
  const resolvedSpecialFields = resolveSpecialPayloadFieldNames(
    q.jsonConfig.SpecialFields || q.jsonConfig.specialFields || []
  );
  resolvedSpecialFields.forEach(fieldName => appendUniqueColumn(desiredColumns, fieldName));

  window.displayedFields.length = 0; // Clear existing array
  window.displayedFields.push(...desiredColumns);

  // Register any dynamically-built fields (e.g. Marc590) that may not exist
  // in the current session's fieldDefs registry.
  if (typeof window.registerDynamicField === 'function') {
    window.displayedFields.forEach(f => window.registerDynamicField(f));
  }

  showExampleTable(window.displayedFields);
  
  // Clear filters and reapply from query
  if (typeof activeFilters !== 'undefined') {
    Object.keys(activeFilters).forEach(k => delete activeFilters[k]);
    document.querySelectorAll('.bubble-filter').forEach(b => {
      b.classList.remove('bubble-filter');
      b.removeAttribute('data-filtered');
    });
    
    const filters = typeof window.normalizeUiConfigFilters === 'function'
      ? window.normalizeUiConfigFilters(q.jsonConfig)
      : [];

    if(filters.length){
      filters.forEach(ff => {
        if (!activeFilters[ff.FieldName]) {
          activeFilters[ff.FieldName] = { filters: [] };
        }

        const uiCond = typeof window.mapFieldOperatorToUiCond === 'function'
          ? window.mapFieldOperatorToUiCond(ff.FieldOperator)
          : String(ff.FieldOperator || '').toLowerCase();
        const valueGlue = uiCond === 'between' ? '|' : ',';

        activeFilters[ff.FieldName].filters.push({
          cond: uiCond,
          val: (ff.Values || []).join(valueGlue)
        });

        const bubbleEl = Array.from(document.querySelectorAll('.bubble'))
          .find(b => b.textContent.trim() === ff.FieldName);
        if(bubbleEl){
          bubbleEl.classList.add('bubble-filter');
          bubbleEl.dataset.filtered = 'true';
        }
      });
      // Ensure the filter panel shows up right away if there are filters
      if (window.FilterSidePanel && window.FilterSidePanel.update) {
        window.FilterSidePanel.update();
      }
    } else {
      // If no filters were loaded but panel was open, it should re-evaluate to close
      if (window.FilterSidePanel && window.FilterSidePanel.update) {
        window.FilterSidePanel.update();
      }
    }
  }
  
  // Update JSON display
  if (typeof updateQueryJson === 'function') {
    updateQueryJson();
  }

  // Ensure bubbles re-render to reflect their new filter state and positions
  if (window.BubbleSystem && typeof window.BubbleSystem.safeRenderBubbles === 'function') {
    window.BubbleSystem.safeRenderBubbles();
  }

  // Update button state to "Refresh" instead of "Run Query" since it's an existing query
  if (typeof window.getCurrentQueryState === 'function') {
    window.lastExecutedQueryState = window.getCurrentQueryState();
  }
  if (typeof window.updateButtonStates === 'function') {
    window.updateButtonStates();
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
      showToastMessage(q.running ? 'Fetching live results...' : 'Fetching results...', 'info');
    }

    try {
        const response = await fetch('https://mlp.sirsi.net/uhtbin/query_api.pl', {
            method: 'POST',
            body: JSON.stringify({ action: 'get_results', query_id: queryId })
        });

        if (!response.ok) {
            throw new Error(`Server error: ${response.status} ${response.statusText}`);
        }

        const contentType = response.headers.get('Content-Type') || '';
        if (contentType.includes('application/json')) {
          const payload = await response.json();
          throw new Error(payload.error || 'Results are not available yet.');
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

        if (q.running) {
          q.resultCount = rows.length;
          renderQueries();
        }

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
            
            // Re-render the full table to reset red column headers and redraw the rows with new widths
            if (typeof showExampleTable === 'function') {
                await showExampleTable(headers);
            } else {
                window.VirtualTable.renderVirtualTable();
                window.VirtualTable.calculateOptimalColumnWidths(); 
            }
            
            // Re-render the bubbles to update grouping for new active filters
            if (window.BubbleSystem && typeof window.BubbleSystem.safeRenderBubbles === 'function') {
                window.BubbleSystem.safeRenderBubbles();
            }
            
            // Reset bubble scroll position since we may have new filters/selected fields
            if (window.BubbleSystem && typeof window.BubbleSystem.resetBubbleScroll === 'function') {
              window.BubbleSystem.resetBubbleScroll();
            } else {
              window.scrollRow = 0;
              if (window.BubbleSystem && typeof window.BubbleSystem.updateScrollBar === 'function') {
                window.BubbleSystem.updateScrollBar();
              }
            }
            if (typeof window.updateButtonStates === 'function') {
                window.updateButtonStates();
            }
        }
        
        if (typeof showToastMessage === 'function') {
            showToastMessage(q.running
              ? `Loaded ${rows.length} partial results from running query.`
              : `Loaded ${rows.length} results.`, 'success');
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
  const statusMeta = getQueryStatusMeta(q.status);
  // Use tooltip for columns
  const columns = q.jsonConfig?.DesiredColumnOrder || [];
  const columnsTooltip = typeof formatColumnsTooltip === 'function' ? formatColumnsTooltip(columns) : '';
  const columnsSummary = columns.length
    ? createTooltipIconSummary(viewIconSVG, 'data-tooltip-html', columnsTooltip)
    : '<span class="text-gray-400">None</span>';
    
  // Use tooltip for filters
  const filters = typeof window.normalizeUiConfigFilters === 'function'
    ? window.normalizeUiConfigFilters(q.jsonConfig)
    : [];
  let filtersSummary = '<span class="text-gray-400">None</span>';
  
  if (filters.length > 0) {
      if (typeof window.formatStandardFilterTooltipHTML === 'function') {
          const filterHtml = window.formatStandardFilterTooltipHTML(filters, "Query Filters");
        filtersSummary = createTooltipIconSummary(viewIconSVG, 'data-tooltip-html', filterHtml);
      } else {
          const filterTooltip = typeof formatHistoryFiltersTooltip === 'function' ? formatHistoryFiltersTooltip(filters) : '';
          if (filterTooltip) {
          filtersSummary = createTooltipIconSummary(viewIconSVG, 'data-tooltip', filterTooltip);
          }
      }
  }

  const escapedReason = (q.error || '').replace(/"/g, '&quot;');
  const reasonSummary = q.error
    ? `<span class="history-reason-icon" data-tooltip="${escapedReason}">Issue</span>`
    : '<span class="text-gray-400">None</span>';

  const metaPills = [`<span class="history-inline-pill subtle">${q.id}</span>`];
  if (!q.running && q.resultCount !== undefined && q.resultCount !== '-' && q.resultCount !== '?') {
    metaPills.push(`<span class="history-inline-pill">${Number(q.resultCount).toLocaleString()} rows</span>`);
  }
  if (q.launchMode) {
    metaPills.push(`<span class="history-inline-pill subtle">${q.launchMode}</span>`);
  }
  if (q.deliveryMode) {
    metaPills.push(`<span class="history-inline-pill subtle">${q.deliveryMode}</span>`);
  }

  const nameCell = `
    <div class="history-name-cell">
      <div class="history-name-block">
        <span class="history-query-name">${q.name || q.id}</span>
        <div class="history-meta-line">${metaPills.join('')}</div>
      </div>
      <span class="${statusMeta.badgeClass}">${statusMeta.label}</span>
    </div>`;

  const previewBtn = q.running ? `<button class="load-query-btn inline-flex items-center justify-center p-1 rounded-full bg-gray-100 hover:bg-gray-200 text-blue-600" tabindex="-1" data-query-id="${q.id}" style="margin-left:4px;" data-tooltip="Open partial results"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/></svg></button>` : '';

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
      <tr class="history-row ${statusMeta.rowClass} cursor-pointer" data-query-id="${q.id}">
        <td class="px-4 py-3 text-xs text-left font-mono">${nameCell}</td>
        <td class="px-4 py-2 text-xs text-center">${columnsSummary}</td>
        <td class="px-4 py-2 text-xs text-center">${filtersSummary}</td>
        <td class="px-4 py-2 text-center">${previewBtn}</td>
        <td class="px-4 py-2 text-center">${stopBtn}</td>
        <td class="px-4 py-2 text-xs text-center">${new Date(q.startTime).toLocaleString()}</td>
      </tr>
    `;
  } else if (q.cancelled) {
    return `
      <tr class="history-row ${statusMeta.rowClass} cursor-pointer" data-query-id="${q.id}">
        <td class="px-4 py-3 text-xs text-left font-mono">${nameCell}</td>
        <td class="px-4 py-2 text-xs text-center">${columnsSummary}</td>
        <td class="px-4 py-2 text-xs text-center">${filtersSummary}</td>
        <td class="px-4 py-2 text-xs text-center">${new Date(q.startTime).toLocaleString()}</td>
        <td class="px-4 py-2 text-xs text-center">${duration}</td>
        <td class="px-4 py-2 text-xs text-center">${rerunBtn}</td>
      </tr>
    `;
  } else if (q.failed) {
    return `
      <tr class="history-row ${statusMeta.rowClass} cursor-pointer" data-query-id="${q.id}">
        <td class="px-4 py-3 text-xs text-left font-mono">${nameCell}</td>
        <td class="px-4 py-2 text-xs text-center">${columnsSummary}</td>
        <td class="px-4 py-2 text-xs text-center">${filtersSummary}</td>
        <td class="px-4 py-2 text-xs text-center">${new Date(q.startTime).toLocaleString()}</td>
        <td class="px-4 py-2 text-xs text-center">${duration}</td>
        <td class="px-4 py-2 text-xs text-center">${reasonSummary}</td>
        <td class="px-4 py-2 text-xs text-center">${rerunBtn}</td>
      </tr>
    `;
  } else {
    return `
      <tr class="history-row ${statusMeta.rowClass} cursor-pointer" data-query-id="${q.id}">
        <td class="px-4 py-3 text-xs text-left font-mono">${nameCell}</td>
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
  if (!isQueriesPanelOpen()) return;
  if (queryDurationUpdateInterval) return; // Already running

  lastQueryStatusPollAt = 0;
  window.fetchQueryStatus();
  
  queryDurationUpdateInterval = setInterval(() => {
    if (!isQueriesPanelOpen()) {
      stopQueryDurationUpdates();
      return;
    }

    const hasRunningQueries = exampleQueries.some(q => q.running);
    if (hasRunningQueries) {
        // Update UI durations
        renderQueries(); 
        
        if ((Date.now() - lastQueryStatusPollAt) >= QUERY_STATUS_POLL_MS) {
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
  let doneList = exampleQueries.filter(q => !q.running && !q.cancelled && !q.failed);
  let failedList = exampleQueries.filter(q => q.failed);
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
    failedList = failedList.filter(q => 
      (q.name && q.name.toLowerCase().includes(searchTerm)) ||
      q.id.toLowerCase().includes(searchTerm) ||
      (q.error && q.error.toLowerCase().includes(searchTerm)) ||
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
  const failedRows = failedList.map(q => createQueriesTableRowHtml(q, viewIconSVG)).join('');
  const cancelledRows = cancelledList.map(q => createQueriesTableRowHtml(q, viewIconSVG)).join('');

  // Different table headers for running vs completed queries
  const runningTableHead = `
    <thead class="history-table-head running">
      <tr>
        <th class="px-4 py-2 text-center" data-tooltip="Query name or identifier">Name</th>
        <th class="px-4 py-2 text-center" data-tooltip="Columns being displayed in the query results">Displaying</th>
        <th class="px-4 py-2 text-center" data-tooltip="Active filters applied to the query">Filters</th>
        <th class="px-4 py-2 text-center" data-tooltip="Open the results accumulated so far for this running query">Results</th>
        <th class="px-4 py-2 text-center" data-tooltip="Stop the currently running query">Stop/Cancel</th>
        <th class="px-4 py-2 text-center" data-tooltip="When this query was started">Started</th>
      </tr>
    </thead>`;

  const completedTableHead = `
    <thead class="history-table-head complete">
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

  const failedTableHead = `
    <thead class="history-table-head failed">
      <tr>
        <th class="px-4 py-2 text-center" data-tooltip="Query name or identifier">Name</th>
        <th class="px-4 py-2 text-center" data-tooltip="Columns being displayed in the query results">Displaying</th>
        <th class="px-4 py-2 text-center" data-tooltip="Active filters applied to the query">Filters</th>
        <th class="px-4 py-2 text-center" data-tooltip="When this query last ran">Last Run</th>
        <th class="px-4 py-2 text-center" data-tooltip="How long the query ran before failing">Duration</th>
        <th class="px-4 py-2 text-center" data-tooltip="Failure reason or backend warning">Issue</th>
        <th class="px-4 py-2 text-center" data-tooltip="Re-execute this query with the same settings">Rerun</th>
      </tr>
    </thead>`;

  const cancelledTableHead = `
    <thead class="history-table-head canceled">
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
  const failedCount = failedList.length;
  const cancelledCount = cancelledList.length;
  const visibleCount = runningCount + doneCount + failedCount + cancelledCount;
  const totalCount = exampleQueries.length;
  const liveSignal = runningCount > 0
    ? `${runningCount} live ${runningCount === 1 ? 'query is' : 'queries are'} still updating.`
    : 'No active queries are running right now.';
  const searchLabel = searchTerm
    ? `Showing ${visibleCount} of ${totalCount} saved queries matching "${searchTerm}".`
    : `Showing ${visibleCount} recent ${visibleCount === 1 ? 'query' : 'queries'} across your workspace history.`;
  const refreshedAt = lastQueryStatusPollAt
    ? new Date(lastQueryStatusPollAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : 'Awaiting refresh';
  const isPollingActive = !!(queryDurationUpdateInterval && isQueriesPanelOpen());
  const pollingLabel = isPollingActive ? 'Polling live' : 'Polling paused';
  const openSection = getPreferredHistorySection({
    running: runningCount,
    complete: doneCount,
    failed: failedCount,
    canceled: cancelledCount
  });

  let content = '';

  // Show "no results" message if search returns nothing
  if (searchTerm && runningCount === 0 && doneCount === 0 && failedCount === 0 && cancelledCount === 0) {
    content = `<div class="history-empty-state history-empty-search">No queries found matching "${searchTerm}".</div>`;
  } else {
    const runningSection = buildHistorySection('running', runningCount, runningRows, runningTableHead, 'No running queries right now.', openSection === 'running');
    const doneSection = buildHistorySection('complete', doneCount, doneRows, completedTableHead, 'No completed queries yet.', openSection === 'complete');
    const failedSection = buildHistorySection('failed', failedCount, failedRows, failedTableHead, 'No failed or interrupted queries.', openSection === 'failed');
    const cancelledSection = buildHistorySection('canceled', cancelledCount, cancelledRows, cancelledTableHead, 'No cancelled queries yet.', openSection === 'canceled');

    content = `
      <section class="history-editorial-hero">
        <div class="history-editorial-copy">
          <span class="history-kicker">Query Ledger</span>
          <h3 class="history-editorial-title">Recent runs, live work, and recoverable results in one place.</h3>
          <p class="history-editorial-subtitle">${searchLabel} ${liveSignal}</p>
        </div>
        <div class="history-editorial-meta">
          <div class="history-meta-card">
            <span class="history-meta-label">Polling</span>
            <span class="history-meta-value history-polling-value ${isPollingActive ? 'active' : 'idle'}">${pollingLabel}</span>
            <span class="history-meta-detail">Last refresh ${refreshedAt}</span>
          </div>
          <div class="history-meta-card">
            <span class="history-meta-label">Visible Queries</span>
            <span class="history-meta-value">${visibleCount}</span>
            <span class="history-meta-detail">${searchTerm ? 'Filtered shelf' : 'Across all four volumes'}</span>
          </div>
        </div>
      </section>
      <div class="history-bookshelf">
        ${runningSection}
        ${doneSection}
        ${failedSection}
        ${cancelledSection}
      </div>
    `;
  }

  container.innerHTML = content;
  bindHistoryBookShelf(container);

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
  loadQueryResults,
  createQueriesTableRowHtml,
  startQueryDurationUpdates,
  stopQueryDurationUpdates,
  isQueriesPanelOpen,
  renderQueries,
  handleQueryRowClick,
  cancelQuery
};

// Make QueryHistorySystem globally accessible
window.QueryHistorySystem = QueryHistorySystem;

window.cancelQuery = cancelQuery;

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
