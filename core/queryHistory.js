/**
 * Query History Management Module
 * Handles display and management of query history, including running, completed, and cancelled queries.
 * @module QueryHistory
 */

/* ---------- Example Queries data & renderer ---------- */
let exampleQueries = [];
let queryDurationUpdateInterval = null;
let lastQueryStatusPollAt = 0;
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

function parseHistoryDate(value) {
  if (!value || value === '-') return null;
  const normalized = typeof value === 'string' && /^\d{4}-\d{2}-\d{2} /.test(value)
    ? value.replace(/-/g, '/')
    : value;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatHistoryTimestamp(value) {
  const parsed = parseHistoryDate(value);
  return parsed ? parsed.toLocaleString() : '—';
}

function formatHistoryDuration(startValue, endValue, isRunning = false) {
  const start = parseHistoryDate(startValue);
  if (!start) return '—';

  const end = isRunning ? new Date() : parseHistoryDate(endValue);
  if (!end) return '—';

  const seconds = Math.max(0, Math.floor((end - start) / 1000));
  if (typeof formatDuration === 'function') {
    return formatDuration(seconds);
  }

  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

function getLaunchModeMeta(mode) {
  const normalized = String(mode || '').toLowerCase();
  if (normalized === 'headless') {
    return { label: 'Headless', className: 'history-mode-pill history-mode-launch-headless' };
  }
  return { label: 'Browser', className: 'history-mode-pill history-mode-launch-client' };
}

function getDeliveryModeMeta(mode) {
  const normalized = String(mode || '').toLowerCase();
  if (normalized === 'disconnected') {
    return { label: 'Detached', className: 'history-mode-pill history-mode-delivery-detached' };
  }
  if (normalized === 'none') {
    return { label: 'No Client', className: 'history-mode-pill history-mode-delivery-none' };
  }
  return { label: 'Live Stream', className: 'history-mode-pill history-mode-delivery-streaming' };
}

function summarizeColumns(columns) {
  if (!columns.length) return 'No displayed columns';
  if (columns.length <= 3) return columns.join(', ');
  return `${columns.slice(0, 3).join(', ')} +${columns.length - 3} more`;
}

function summarizeFilters(filters) {
  if (!filters.length) return 'No filters applied';
  if (filters.length === 1) {
    const filter = filters[0];
    const valueText = (filter.Values || []).join(' or ');
    return `${filter.FieldName} ${window.formatFieldOperatorForDisplay ? window.formatFieldOperatorForDisplay(filter.FieldOperator) : filter.FieldOperator} ${valueText}`;
  }
  return `${filters.length} filters active`;
}

function buildHistorySection(sectionKey, count, cardsHtml, emptyMessage, openByDefault = true) {
  const meta = {
    running: {
      title: 'Running',
      subtitle: 'Queries actively executing right now.',
      detailsClass: 'history-section running',
      summaryClass: 'history-section-summary running'
    },
    complete: {
      title: 'Completed',
      subtitle: 'Finished queries with results ready to inspect or rerun.',
      detailsClass: 'history-section complete',
      summaryClass: 'history-section-summary complete'
    },
    failed: {
      title: 'Failed / Interrupted',
      subtitle: 'Queries that stopped unexpectedly or need another look.',
      detailsClass: 'history-section failed',
      summaryClass: 'history-section-summary failed'
    },
    canceled: {
      title: 'Cancelled',
      subtitle: 'Queries intentionally stopped before they finished.',
      detailsClass: 'history-section canceled',
      summaryClass: 'history-section-summary canceled'
    }
  }[sectionKey];

  const openAttr = openByDefault ? ' open' : '';
  const bodyContent = cardsHtml
    ? `<div class="history-card-list">${cardsHtml}</div>`
    : `<div class="history-empty-state">${emptyMessage}</div>`;

  return `
    <details class="${meta.detailsClass}"${openAttr}>
      <summary class="${meta.summaryClass}">
        <span class="history-section-heading">
          <span class="history-section-title">${meta.title}</span>
          <span class="history-section-subtitle">${meta.subtitle}</span>
        </span>
        <span class="history-section-count">${count}</span>
      </summary>
      ${bodyContent}
    </details>
  `;
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
            rowCount: sq.row_count,
            warning: sq.warning || '',
            issue: sq.error || sq.warning || '',
            error: sq.error || '',
            launchMode: sq.launch_mode || '',
            deliveryMode: sq.delivery_mode || ''
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
  const columns = q.jsonConfig?.DesiredColumnOrder || [];
  const columnsTooltip = typeof formatColumnsTooltip === 'function' ? formatColumnsTooltip(columns) : '';
  const filters = typeof window.normalizeUiConfigFilters === 'function'
    ? window.normalizeUiConfigFilters(q.jsonConfig)
    : [];
  const filtersSummaryText = summarizeFilters(filters);
  const columnsSummaryText = summarizeColumns(columns);

  let columnsSummary = `<span class="history-inline-summary">${columnsSummaryText}</span>`;
  if (columnsTooltip) {
    columnsSummary = `<span class="history-inline-summary" data-tooltip-html="${columnsTooltip.replace(/"/g, '&quot;')}">${columnsSummaryText}</span>`;
  }

  let filtersSummary = `<span class="history-inline-summary">${filtersSummaryText}</span>`;
  if (filters.length > 0) {
    if (typeof window.formatStandardFilterTooltipHTML === 'function') {
      const filterHtml = window.formatStandardFilterTooltipHTML(filters, 'Query Filters');
      filtersSummary = `<span class="history-inline-summary" data-tooltip-html="${filterHtml.replace(/"/g, '&quot;')}">${filtersSummaryText}</span>`;
    } else {
      const filterTooltip = typeof formatHistoryFiltersTooltip === 'function' ? formatHistoryFiltersTooltip(filters) : '';
      if (filterTooltip) {
        filtersSummary = `<span class="history-inline-summary" data-tooltip="${filterTooltip.replace(/"/g, '&quot;')}">${filtersSummaryText}</span>`;
      }
    }
  }
  const launchMeta = getLaunchModeMeta(q.launchMode);
  const deliveryMeta = getDeliveryModeMeta(q.deliveryMode);
  const startedLabel = formatHistoryTimestamp(q.startTime);
  const endedLabel = q.running ? 'In progress' : formatHistoryTimestamp(q.endTime);
  const durationLabel = formatHistoryDuration(q.startTime, q.endTime, q.running);
  const resultCount = q.resultCount !== undefined && q.resultCount !== null ? q.resultCount : '—';
  const issueText = q.issue || '';
  const issueToneClass = q.error ? 'history-issue-card error' : (q.warning ? 'history-issue-card warning' : '');
  const issueBlock = issueText
    ? `<div class="${issueToneClass}"><span class="history-issue-label">${q.error ? 'Issue' : 'Note'}</span><p>${issueText}</p></div>`
    : '';

  const previewBtn = q.running || (q.failed && Number.isFinite(Number(resultCount)) && Number(resultCount) > 0)
    ? `<button class="load-query-btn history-action-btn primary" tabindex="-1" data-query-id="${q.id}">${q.running ? 'Open partial results' : 'Open saved results'}</button>`
    : '';
  const loadBtn = !q.running && !q.cancelled && !q.failed
    ? `<button class="load-query-btn history-action-btn primary" tabindex="-1" data-query-id="${q.id}">Open results</button>`
    : '';
  const stopBtn = q.running
    ? `<button class="stop-query-btn history-action-btn danger" tabindex="-1" data-query-id="${q.id}">Cancel run</button>`
    : '';
  const rerunBtn = !q.running
    ? `<button class="rerun-query-btn history-action-btn secondary" tabindex="-1" data-query-id="${q.id}">Rerun query</button>`
    : '';

  return `
    <article class="history-query-card ${statusMeta.rowClass} cursor-pointer" data-query-id="${q.id}">
      <div class="history-query-card-top">
        <div class="history-query-heading">
          <div class="history-name-cell">
            <span class="history-query-name">${q.name || q.id}</span>
            <span class="${statusMeta.badgeClass}">${statusMeta.label}</span>
          </div>
          <p class="history-query-id">${q.id}</p>
        </div>
        <div class="history-mode-pills">
          <span class="${launchMeta.className}">${launchMeta.label}</span>
          <span class="${deliveryMeta.className}">${deliveryMeta.label}</span>
        </div>
      </div>

      <div class="history-query-metrics">
        <div class="history-metric"><span class="history-metric-label">Rows</span><span class="history-metric-value">${resultCount}</span></div>
        <div class="history-metric"><span class="history-metric-label">Started</span><span class="history-metric-value">${startedLabel}</span></div>
        <div class="history-metric"><span class="history-metric-label">Finished</span><span class="history-metric-value">${endedLabel}</span></div>
        <div class="history-metric"><span class="history-metric-label">Duration</span><span class="history-metric-value">${durationLabel}</span></div>
      </div>

      <div class="history-query-details">
        <div class="history-detail-block">
          <span class="history-detail-label">Columns</span>
          ${columnsSummary}
        </div>
        <div class="history-detail-block">
          <span class="history-detail-label">Filters</span>
          ${filtersSummary}
        </div>
      </div>

      ${issueBlock}

      <div class="history-query-actions">
        ${loadBtn || previewBtn}
        ${rerunBtn}
        ${stopBtn}
      </div>
    </article>
  `;
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
  const liveIndicator = document.getElementById('queries-live-indicator');
  
  // Get search value
  const searchInput = document.getElementById('queries-search');
  const searchTerm = searchInput ? searchInput.value.trim().toLowerCase() : '';
  
  let runningList = exampleQueries.filter(q => q.running);
  let doneList = exampleQueries.filter(q => !q.running && !q.cancelled && !q.failed);
  let failedList = exampleQueries.filter(q => q.failed);
  let cancelledList = exampleQueries.filter(q => q.cancelled);
  
  // Apply search filter if there's a search term
  if (searchTerm) {
    runningList = runningList.filter(q => 
      (q.name && q.name.toLowerCase().includes(searchTerm)) ||
      q.id.toLowerCase().includes(searchTerm) ||
      String(q.launchMode || '').toLowerCase().includes(searchTerm) ||
      String(q.deliveryMode || '').toLowerCase().includes(searchTerm) ||
      String(q.issue || '').toLowerCase().includes(searchTerm) ||
      (q.jsonConfig?.DesiredColumnOrder || []).some(col => col.toLowerCase().includes(searchTerm))
    );
    doneList = doneList.filter(q => 
      (q.name && q.name.toLowerCase().includes(searchTerm)) ||
      q.id.toLowerCase().includes(searchTerm) ||
      String(q.launchMode || '').toLowerCase().includes(searchTerm) ||
      String(q.deliveryMode || '').toLowerCase().includes(searchTerm) ||
      String(q.issue || '').toLowerCase().includes(searchTerm) ||
      (q.jsonConfig?.DesiredColumnOrder || []).some(col => col.toLowerCase().includes(searchTerm))
    );
    failedList = failedList.filter(q => 
      (q.name && q.name.toLowerCase().includes(searchTerm)) ||
      q.id.toLowerCase().includes(searchTerm) ||
      String(q.issue || '').toLowerCase().includes(searchTerm) ||
      String(q.launchMode || '').toLowerCase().includes(searchTerm) ||
      String(q.deliveryMode || '').toLowerCase().includes(searchTerm) ||
      (q.jsonConfig?.DesiredColumnOrder || []).some(col => col.toLowerCase().includes(searchTerm))
    );
    cancelledList = cancelledList.filter(q => 
      (q.name && q.name.toLowerCase().includes(searchTerm)) ||
      q.id.toLowerCase().includes(searchTerm) ||
      String(q.launchMode || '').toLowerCase().includes(searchTerm) ||
      String(q.deliveryMode || '').toLowerCase().includes(searchTerm) ||
      String(q.issue || '').toLowerCase().includes(searchTerm) ||
      (q.jsonConfig?.DesiredColumnOrder || []).some(col => col.toLowerCase().includes(searchTerm))
    );
  }
  
  const runningRows = runningList.map(q => createQueriesTableRowHtml(q)).join('');
  const doneRows = doneList.map(q => createQueriesTableRowHtml(q)).join('');
  const failedRows = failedList.map(q => createQueriesTableRowHtml(q)).join('');
  const cancelledRows = cancelledList.map(q => createQueriesTableRowHtml(q)).join('');

  const runningCount = runningList.length;
  const doneCount = doneList.length;
  const failedCount = failedList.length;
  const cancelledCount = cancelledList.length;
  const totalQueries = runningCount + doneCount + failedCount + cancelledCount;
  const disconnectedCount = [...runningList, ...doneList, ...failedList, ...cancelledList]
    .filter(q => q.deliveryMode === 'disconnected').length;
  const loadedRows = [...doneList, ...runningList, ...failedList]
    .reduce((sum, q) => sum + (Number.isFinite(Number(q.resultCount)) ? Number(q.resultCount) : 0), 0);

  let content = '';

  if (liveIndicator) {
    const runningText = runningCount > 0 ? `${runningCount} live ${runningCount === 1 ? 'query' : 'queries'} updating while this panel is open` : 'No live queries right now';
    liveIndicator.textContent = runningText;
    liveIndicator.classList.toggle('is-live', runningCount > 0);
  }

  // Show "no results" message if search returns nothing
  if (searchTerm && runningCount === 0 && doneCount === 0 && failedCount === 0 && cancelledCount === 0) {
    content = `
      <div class="history-overview-grid">
        <div class="history-overview-card total"><span class="history-overview-count">0</span><span class="history-overview-label">Matching queries</span></div>
      </div>
      <div class="history-empty-state history-empty-search">No queries found matching "${searchTerm}".</div>`;
  } else {
    const runningSection = buildHistorySection('running', runningCount, runningRows, 'No running queries right now.', true);
    const doneSection = buildHistorySection('complete', doneCount, doneRows, 'No completed queries yet.', true);
    const failedSection = buildHistorySection('failed', failedCount, failedRows, 'No failed or interrupted queries.', failedCount > 0);
    const cancelledSection = buildHistorySection('canceled', cancelledCount, cancelledRows, 'No cancelled queries yet.', false);

    content = `
      <div class="history-overview-grid">
        <div class="history-overview-card total"><span class="history-overview-count">${totalQueries}</span><span class="history-overview-label">Visible</span></div>
        <div class="history-overview-card running"><span class="history-overview-count">${runningCount}</span><span class="history-overview-label">Running</span></div>
        <div class="history-overview-card complete"><span class="history-overview-count">${doneCount}</span><span class="history-overview-label">Completed</span></div>
        <div class="history-overview-card failed"><span class="history-overview-count">${failedCount}</span><span class="history-overview-label">Failed</span></div>
        <div class="history-overview-card canceled"><span class="history-overview-count">${cancelledCount}</span><span class="history-overview-label">Cancelled</span></div>
        <div class="history-overview-card disconnected"><span class="history-overview-count">${disconnectedCount}</span><span class="history-overview-label">Detached</span></div>
        <div class="history-overview-card rows"><span class="history-overview-count">${loadedRows.toLocaleString()}</span><span class="history-overview-label">Rows surfaced</span></div>
      </div>
      ${runningSection}
      ${doneSection}
      ${failedSection}
      ${cancelledSection}
    `;
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
      if (!q) return;
      q.running = true; 
      q.startTime = new Date().toISOString();
      q.endTime = null;
      q.cancelled = false;
      q.failed = false;
      q.status = 'running';
      q.error = '';
      q.warning = '';
      q.issue = '';
      q.resultCount = 0;
      q.launchMode = 'client';
      q.deliveryMode = 'streaming';
      
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
  const row = e.target.closest('#queries-container [data-query-id].history-query-card');
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
