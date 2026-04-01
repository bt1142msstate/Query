/**
 * Query History Management Module
 * Handles display and management of query history, including running, completed, and cancelled queries.
 * @module QueryHistory
 */

/* ---------- Query history state and renderer ---------- */
let exampleQueries = [];
let queryDurationUpdateInterval = null;
let lastQueryStatusPollAt = 0;
let activeHistorySection = 'none';
var services = window.AppServices;
var historyViewHelpers = window.QueryHistoryViewHelpers;
var uiActions = window.AppUiActions;
const QUERY_STATUS_POLL_MS = 2000;
const IDLE_POLL_MS = 8000;
let lastHistoryRenderKey = '';

const VIEW_ICON_SVG = `<svg class="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M1.5 12s4-7 10.5-7 10.5 7 10.5 7-4 7-10.5 7S1.5 12 1.5 12z"/><circle cx="12" cy="12" r="3.5"/></svg>`;

function isQueriesPanelOpen() {
  const panel = window.DOM.queriesPanel;
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
  return query;
}

function getHistoryQueries() {
  return exampleQueries.slice();
}

function getHistoryQueryById(queryId) {
  const normalizedId = String(queryId || '').trim();
  if (!normalizedId) {
    return null;
  }

  return exampleQueries.find(query => query.id === normalizedId) || null;
}

function updateHistoryQuery(queryId, updates = {}, options = {}) {
  const query = getHistoryQueryById(queryId);
  if (!query || !updates || typeof updates !== 'object') {
    return null;
  }

  Object.assign(query, updates);

  if (options.render !== false) {
    renderQueries();
  }

  return query;
}

const classifyQueryStatus = historyViewHelpers.classifyQueryStatus;
const getQueryStatusMeta = historyViewHelpers.getQueryStatusMeta;
const buildHistorySection = historyViewHelpers.buildHistorySection;
const buildHistoryMonitor = historyViewHelpers.buildHistoryMonitor;
let activeHistoryDetailQueryId = null;

function getPreferredHistorySection(counts) {
  return historyViewHelpers.getPreferredHistorySection(counts, activeHistorySection);
}

function captureHistoryViewState() {
  const panelContainer = window.DOM.queriesContainer;
  const monitorShell = panelContainer?.querySelector('.history-monitor .history-table-shell');

  return {
    panelScrollTop: panelContainer?.scrollTop || 0,
    panelScrollLeft: panelContainer?.scrollLeft || 0,
    monitorScrollTop: monitorShell?.scrollTop || 0,
    monitorScrollLeft: monitorShell?.scrollLeft || 0
  };
}

function restoreHistoryViewState(viewState) {
  if (!viewState) return;

  const panelContainer = window.DOM.queriesContainer;
  if (panelContainer) {
    panelContainer.scrollTop = viewState.panelScrollTop;
    panelContainer.scrollLeft = viewState.panelScrollLeft;
  }

  const monitorShell = panelContainer?.querySelector('.history-monitor .history-table-shell');
  if (monitorShell) {
    monitorShell.scrollTop = viewState.monitorScrollTop;
    monitorShell.scrollLeft = viewState.monitorScrollLeft;
  }
}

function updateHistoryPollingMeta({ isPollingActive, refreshedAt }) {
  const pollingValue = window.DOM.queriesList?.querySelector('.history-polling-value');
  const pollingDetail = window.DOM.queriesList?.querySelector('.history-polling-detail');
  if (pollingValue) {
    pollingValue.textContent = isPollingActive ? 'Polling live' : 'Polling paused';
    pollingValue.classList.toggle('active', !!isPollingActive);
    pollingValue.classList.toggle('idle', !isPollingActive);
  }
  if (pollingDetail) {
    pollingDetail.textContent = `Last refresh ${refreshedAt}`;
  }
}

function bindHistoryBookShelf(container) {
  const books = Array.from(container.querySelectorAll('[data-history-book]'));
  books.forEach(book => {
    const summary = book.querySelector('.history-book-summary');
    if (!summary) return;

    summary.addEventListener('click', (event) => {
      event.preventDefault();
      const sectionKey = book.dataset.historyBook || 'running';
      activeHistorySection = activeHistorySection === sectionKey ? 'none' : sectionKey;
      renderQueries();
    });
  });

  container.querySelectorAll('[data-history-monitor-tab]').forEach(tab => {
    tab.addEventListener('click', () => {
      activeHistorySection = tab.dataset.historyMonitorTab || 'running';
      renderQueries();
    });
  });

  container.querySelector('[data-history-monitor-close]')?.addEventListener('click', () => {
    activeHistorySection = 'none';
    renderQueries();
  });
}

function appendUniqueColumn(target, fieldName) {
  const normalizedField = typeof window.resolveFieldName === 'function'
    ? window.resolveFieldName(fieldName)
    : fieldName;
  if (!normalizedField || target.includes(normalizedField)) return;
  target.push(normalizedField);
}

function deriveTemplateBindings(template, actual, bindings) {
  if (typeof template !== 'string' || typeof actual !== 'string') {
    return false;
  }

  const keys = [];
  const pattern = window.escapeRegExp(template).replace(/\\\{([^}]+)\\\}/g, (_, key) => {
    keys.push(key);
    return '(.+?)';
  });

  if (!keys.length) {
    return template === actual;
  }

  const match = new RegExp(`^${pattern}$`).exec(actual);
  if (!match) {
    return false;
  }

  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    const value = match[index + 1];

    if (Object.prototype.hasOwnProperty.call(bindings, key) && bindings[key] !== value) {
      return false;
    }

    bindings[key] = value;
  }

  return true;
}

function resolveFieldNameFromSpecialPayload(payload) {
  if (!payload || typeof payload !== 'object' || !Array.isArray(window.fieldDefsArray)) {
    return '';
  }

  const exactMatch = window.fieldDefsArray.find(fieldDef => {
    if (!fieldDef || !fieldDef.special_payload) return false;
    return JSON.stringify(fieldDef.special_payload) === JSON.stringify(payload);
  });
  if (exactMatch?.name) {
    return exactMatch.name;
  }

  for (const fieldDef of window.fieldDefsArray) {
    if (!fieldDef?.is_buildable || !fieldDef.field_template || !fieldDef.special_payload_template) {
      continue;
    }

    const bindings = {};
    let isMatch = true;

    for (const [key, templateValue] of Object.entries(fieldDef.special_payload_template)) {
      const actualValue = payload[key];

      if (typeof templateValue === 'string' && templateValue.includes('{')) {
        if (!deriveTemplateBindings(templateValue, actualValue, bindings)) {
          isMatch = false;
          break;
        }
        continue;
      }

      if (templateValue !== actualValue) {
        isMatch = false;
        break;
      }
    }

    if (!isMatch) {
      continue;
    }

    const resolvedName = fieldDef.field_template.replace(/\{([^}]+)\}/g, (_, key) => bindings[key] || '');
    if (resolvedName && resolvedName !== fieldDef.name) {
      return resolvedName;
    }
  }

  return '';
}

function resolveSpecialPayloadFieldNames(specialFields) {
  if (!Array.isArray(specialFields) || !Array.isArray(window.fieldDefsArray)) {
    return [];
  }

  return specialFields.reduce((resolved, payload) => {
    const resolvedFieldName = resolveFieldNameFromSpecialPayload(payload);
    if (resolvedFieldName) {
      if (typeof window.registerDynamicField === 'function') {
        window.registerDynamicField(resolvedFieldName, {
          special_payload: payload && typeof payload === 'object' ? { ...payload } : payload
        });
      }
      appendUniqueColumn(resolved, resolvedFieldName);
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

  (request.display_fields || []).forEach(fieldName => appendUniqueColumn(
    desiredColumns,
    typeof window.resolveFieldName === 'function'
      ? window.resolveFieldName(fieldName, { trackAlias: true })
      : fieldName
  ));
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
        FieldName: typeof window.resolveFieldName === 'function'
          ? window.resolveFieldName(f.field, { trackAlias: true })
          : f.field,
        FieldOperator: opName,
        Values: [f.value]
      });
    });
  }

  return uiConfig;
}

function mergeUiConfigWithRequest(uiConfig, request) {
  const baseUiConfig = uiConfig && typeof uiConfig === 'object'
    ? {
        ...uiConfig,
        DesiredColumnOrder: Array.isArray(uiConfig.DesiredColumnOrder) ? [...uiConfig.DesiredColumnOrder] : [],
        Filters: typeof window.normalizeUiConfigFilters === 'function'
          ? window.normalizeUiConfigFilters(uiConfig, { trackAliases: true })
          : (Array.isArray(uiConfig.Filters) ? uiConfig.Filters.map(filter => ({ ...filter })) : []),
        SpecialFields: Array.isArray(uiConfig.SpecialFields)
          ? uiConfig.SpecialFields.map(field => (field && typeof field === 'object' ? { ...field } : field))
          : []
      }
    : {
        DesiredColumnOrder: [],
        Filters: [],
        SpecialFields: []
      };

  const requestUiConfig = buildUiConfigFromRequest(request);
  if (!requestUiConfig) {
    return baseUiConfig;
  }

  requestUiConfig.DesiredColumnOrder.forEach(fieldName => appendUniqueColumn(baseUiConfig.DesiredColumnOrder, fieldName));

  if (!baseUiConfig.Filters.length && requestUiConfig.Filters.length) {
    baseUiConfig.Filters = requestUiConfig.Filters.map(filter => ({ ...filter }));
  }

  if (!baseUiConfig.SpecialFields.length && requestUiConfig.SpecialFields.length) {
    baseUiConfig.SpecialFields = requestUiConfig.SpecialFields.map(field => (field && typeof field === 'object' ? { ...field } : field));
  }

  return baseUiConfig;
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
          jsonConfig = mergeUiConfigWithRequest(sq.request.ui_config, sq.request);
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

    patchQueriesPanelData(newHistory);

    if (isQueriesPanelOpen()) {
      // Keep the interval alive so queries from other users surface automatically.
      // startQueryDurationUpdates is a no-op when the interval is already active.
      startQueryDurationUpdates();
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
    `  <span class="tt-column-name">${window.escapeHtml(column || '')}</span>` +
    '</li>'
  )).join('');

  return '<div class="tt-filter-container tt-columns-container">' +
    '<div class="tt-filter-title">Displayed Columns</div>' +
    `<ol class="tt-filter-list tt-columns-list">${columnItems}</ol>` +
    '</div>';
};

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

function escapeHistoryText(value) {
  return typeof window.escapeHtml === 'function'
    ? window.escapeHtml(String(value ?? ''))
    : String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function buildHistoryColumnsMarkup(columns) {
  const safeColumns = Array.isArray(columns) ? columns : [];
  if (!safeColumns.length) {
    return '<p class="history-details-empty">No displayed columns saved for this query.</p>';
  }

  const items = safeColumns.map((column, index) => (
    '<li class="tt-filter-item tt-column-item">' +
    `  <span class="tt-column-index">${index + 1}</span>` +
    `  <span class="tt-column-name">${escapeHistoryText(column)}</span>` +
    '</li>'
  )).join('');

  return '<div class="tt-filter-container tt-columns-container">' +
    `<ol class="tt-filter-list tt-columns-list">${items}</ol>` +
    '</div>';
}

function buildHistoryFiltersMarkup(filters) {
  if (typeof window.formatStandardFilterTooltipHTML === 'function') {
    return window.formatStandardFilterTooltipHTML(filters, '') || '<p class="history-details-empty">No filters saved for this query.</p>';
  }

  return '<p class="history-details-empty">No filters saved for this query.</p>';
}

function buildHistoryIssueMarkup(reason) {
  if (!reason) {
    return '<p class="history-details-empty">No issue recorded.</p>';
  }

  return `<p class="history-details-issue">${escapeHistoryText(reason)}</p>`;
}

function buildHistoryExpandButton(queryId, isExpanded, columnCount, filterCount) {
  return `
    <button
      type="button"
      class="history-expand-btn"
      data-history-expand="${queryId}"
      aria-expanded="${isExpanded ? 'true' : 'false'}"
      aria-controls="history-details-${queryId}"
    >
      <span>${isExpanded ? 'Hide details' : 'Details'}</span>
      <span class="history-expand-meta">${columnCount} ${columnCount === 1 ? 'field' : 'fields'} • ${filterCount} ${filterCount === 1 ? 'filter' : 'filters'}</span>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4" aria-hidden="true">
        <path d="M6 9l6 6 6-6"></path>
      </svg>
    </button>
  `;
}

function buildHistoryDetailsOverlayHtml(q) {
  if (!q) {
    return '';
  }

  const columns = q.jsonConfig?.DesiredColumnOrder || [];
  const filters = typeof window.normalizeUiConfigFilters === 'function'
    ? window.normalizeUiConfigFilters(q.jsonConfig)
    : [];

  return `
    <div class="history-details-modal-backdrop" data-history-details-close></div>
    <section class="history-details-modal" role="dialog" aria-modal="true" aria-labelledby="history-details-title">
      <button type="button" class="history-details-modal-close" aria-label="Close details" data-history-details-close>
        <span aria-hidden="true">×</span>
      </button>
      <div class="history-details-modal-header">
        <p class="history-details-modal-kicker">Query details</p>
        <h4 id="history-details-title" class="history-details-modal-title">${escapeHistoryText(q.name || q.id)}</h4>
        <div class="history-meta-line">
          <span class="history-inline-pill subtle">${escapeHistoryText(q.id)}</span>
          <span class="history-inline-pill">${columns.length} ${columns.length === 1 ? 'field' : 'fields'}</span>
          <span class="history-inline-pill">${filters.length} ${filters.length === 1 ? 'filter' : 'filters'}</span>
        </div>
      </div>
      <div class="history-details-grid">
        <section class="history-details-panel">
          <h5>Displayed Fields</h5>
          ${buildHistoryColumnsMarkup(columns)}
        </section>
        <section class="history-details-panel">
          <h5>Filters</h5>
          ${buildHistoryFiltersMarkup(filters)}
        </section>
        ${q.failed ? `
          <section class="history-details-panel history-details-panel-full">
            <h5>Issue</h5>
            ${buildHistoryIssueMarkup(q.error || '')}
          </section>
        ` : ''}
      </div>
    </section>
  `;
}

function closeHistoryDetailsOverlay() {
  const shell = document.querySelector('.history-details-modal-shell');
  if (shell) {
    window.VisibilityUtils?.hide?.([shell], {
      ariaHidden: true,
      raisedUiKey: 'history-details-overlay'
    });
  }
  activeHistoryDetailQueryId = null;
  shell?.remove();
  document.body.classList.remove('history-details-open');
}

function renderHistoryDetailsOverlay(queryId = activeHistoryDetailQueryId) {
  closeHistoryDetailsOverlay();

  if (!queryId) {
    return;
  }

  const q = exampleQueries.find(query => query.id === queryId);
  if (!q) {
    return;
  }

  activeHistoryDetailQueryId = queryId;
  const shell = document.createElement('div');
  shell.className = 'history-details-modal-shell';
  shell.hidden = true;
  shell.classList.add('hidden');
  shell.innerHTML = buildHistoryDetailsOverlayHtml(q);
  document.body.appendChild(shell);
  window.VisibilityUtils?.show?.([shell], {
    ariaHidden: false,
    raisedUiKey: 'history-details-overlay'
  });
  document.body.classList.add('history-details-open');

  shell.querySelectorAll('[data-history-details-close]').forEach(node => {
    node.addEventListener('click', event => {
      event.preventDefault();
      closeHistoryDetailsOverlay();
    });
  });
}

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

  const getDisplayedFields = () => window.QueryStateReaders?.getDisplayedFields?.() || [];
  
  // Access global variables from query.js
  if (!window.QueryChangeManager) {
    console.error('Query history module requires QueryChangeManager access');
    return;
  }

  const tableNameInput = window.DOM?.tableNameInput || document.getElementById('table-name-input');

  // Loading a query definition is not itself a partial-results state.
  // That flag belongs to the currently displayed result set and must be
  // recomputed when/if results are loaded afterward.
  window.QueryChangeManager.setLifecycleState({ hasPartialResults: false }, { source: 'QueryHistory.loadQueryConfig', silent: true });
  uiActions.updateTableResultsLip();

  if (tableNameInput) {
    tableNameInput.value = q.name || '';
    tableNameInput.classList.remove('error');
    tableNameInput.dispatchEvent(new Event('input', { bubbles: true }));
  }
  
  // Load fields
  const filters = typeof window.normalizeUiConfigFilters === 'function'
    ? window.normalizeUiConfigFilters(q.jsonConfig, { trackAliases: true })
    : [];
  const desiredColumns = Array.isArray(q.jsonConfig.DesiredColumnOrder)
    ? q.jsonConfig.DesiredColumnOrder.map(fieldName => (
        typeof window.resolveFieldName === 'function'
          ? window.resolveFieldName(fieldName, { trackAlias: true })
          : fieldName
      ))
    : [];
  const resolvedSpecialFields = resolveSpecialPayloadFieldNames(
    q.jsonConfig.SpecialFields || q.jsonConfig.specialFields || []
  );
  resolvedSpecialFields.forEach(fieldName => appendUniqueColumn(desiredColumns, fieldName));

  if (typeof window.registerDynamicField === 'function') {
    resolvedSpecialFields.forEach(fieldName => window.registerDynamicField(fieldName));
    filters.forEach(filter => {
      if (filter?.FieldName) {
        window.registerDynamicField(filter.FieldName);
      }
    });
  }

  const nextActiveFilters = {};

  if (filters.length) {
    filters.forEach(ff => {
      const fieldName = typeof window.resolveFieldName === 'function'
        ? window.resolveFieldName(ff.FieldName)
        : ff.FieldName;
      const uiCond = typeof window.mapFieldOperatorToUiCond === 'function'
        ? window.mapFieldOperatorToUiCond(ff.FieldOperator)
        : String(ff.FieldOperator || '').toLowerCase();
      const valueGlue = uiCond === 'between' ? '|' : ',';

      if (!fieldName) {
        return;
      }

      if (!nextActiveFilters[fieldName]) {
        nextActiveFilters[fieldName] = { filters: [] };
      }

      nextActiveFilters[fieldName].filters.push({
        cond: uiCond,
        val: (ff.Values || []).join(valueGlue)
      });
    });
  }

  window.QueryChangeManager.setQueryState({
    displayedFields: desiredColumns,
    activeFilters: nextActiveFilters
  }, { source: 'QueryHistory.loadQueryConfig' });

  // Register any dynamically-built fields (e.g. Marc590) that may not exist
  // in the current session's fieldDefs registry.
  if (typeof window.registerDynamicField === 'function') {
    getDisplayedFields().forEach(f => window.registerDynamicField(f));
  }
  
  // Clear filters and reapply from query
  if (window.QueryChangeManager) {
    document.querySelectorAll('.bubble-filter').forEach(b => {
      b.classList.remove('bubble-filter');
      b.removeAttribute('data-filtered');
    });
    
    if(filters.length){
      filters.forEach(ff => {
        const bubbleEl = Array.from(document.querySelectorAll('.bubble'))
          .find(b => b.textContent.trim() === ff.FieldName);
        if(bubbleEl){
          bubbleEl.classList.add('bubble-filter');
          bubbleEl.dataset.filtered = 'true';
        }
      });
      // Ensure the filter panel shows up right away if there are filters
      uiActions.updateFilterSidePanel();
    } else {
      // If no filters were loaded but panel was open, it should re-evaluate to close
      uiActions.updateFilterSidePanel();
    }
  }
  
  // Update button state to "Refresh" instead of "Run Query" since it's an existing query
  if (window.QueryStateReaders && typeof window.QueryStateReaders.getSerializableState === 'function') {
    window.QueryChangeManager.setLifecycleState({
      lastExecutedQueryState: window.QueryStateReaders.getSerializableState()
    }, { source: 'QueryHistory.setLastExecutedState', silent: true });
  }
  uiActions.updateButtonStates();

  if (window.QueryFormMode && typeof window.QueryFormMode.isActive === 'function' && window.QueryFormMode.isActive()) {
    window.QueryFormMode.syncFromCurrentQuery().catch(error => {
      console.error('Failed to sync form URL after loading query config:', error);
    });
  }
}

/**
 * Loads query results from backend.
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
        // Successful result downloads come back as plain text; JSON payloads mean the
        // backend is returning an error or "not ready yet" response instead of rows.
        if (contentType.includes('application/json')) {
          const payload = await response.json();
          throw new Error(payload.error || 'Results are not available yet.');
        }

        const text = await response.text();
        
        // Use X-Raw-Columns or fallback to config used
        const rawColsHeader = response.headers.get('X-Raw-Columns');
        // Ensure displayedFields is updated after loadQueryConfig
        const currentDisplayedFields = getDisplayedFields().length
          ? getDisplayedFields()
          : (q.jsonConfig ? q.jsonConfig.DesiredColumnOrder : []);
        
        const rawColumns = rawColsHeader ? rawColsHeader.split('|') : currentDisplayedFields;
        
        const lines = text.split('\n').filter(line => line.trim().length > 0);
        
        const headers = currentDisplayedFields;
        
        const rows = lines.map(line => {
          const obj = typeof window.parsePipeDelimitedRow === 'function'
            ? window.parsePipeDelimitedRow(line, rawColumns)
            : {};
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

        if (services.table) {
            const columnMap = new Map();
            headers.forEach((h, i) => columnMap.set(h, i));
            
            // Map object rows back to array of values in headers order
            const tableRows = rows.map(r => headers.map(h => r[h]));
            
            const newTableData = {
                headers: headers,
                rows: tableRows,
                columnMap: columnMap
            };
            
            services.setVirtualTableData(newTableData);
            
            // Re-render the full table to reset red column headers and redraw the rows with new widths
            if (window.QueryTableView?.showExampleTable) {
                await uiActions.showExampleTable(headers);
            } else {
                services.renderVirtualTable();
                services.calculateOptimalColumnWidths(); 
            }
            
            // Re-render the bubbles to update grouping for new active filters
            services.rerenderBubbles();
            
            // Reset bubble scroll position since we may have new filters/selected fields
            if (services.bubble?.resetBubbleScroll) {
              services.resetBubbleScroll();
            } else {
              window.AppState.scrollRow = 0;
              services.updateBubbleScrollBar();
            }
            uiActions.updateButtonStates();
        }

        // Partial-results mode should reflect the specific result set that was loaded,
        // not whatever previous live query happened to leave behind.
        window.QueryChangeManager.setLifecycleState({ hasPartialResults: Boolean(q.running) }, { source: 'QueryHistory.loadQueryResults', silent: true });
        uiActions.updateTableResultsLip();
        
        if (typeof showToastMessage === 'function') {
            showToastMessage(q.running
              ? `Loaded ${rows.length} partial results from running query.`
              : `Loaded ${rows.length} results.`, 'success');
        }
        
        // Close modal if open
        services.closeAllModals();

    } catch (error) {
        console.error('Failed to load results:', error);
        if (typeof showToastMessage === 'function') {
            showToastMessage('Failed to load results: ' + error.message, 'error');
        }
    }
}

/**
 * Creates HTML for a single query row in the queries table.
 * Handles different display formats for running, completed, and cancelled queries.
 * @function createQueriesTableRowHtml
 * @param {Object} q - The query object
 * @param {string} viewIconSVG - SVG icon for view buttons
 * @returns {string} HTML string for the table row
 */
function createQueriesTableRowHtml(q, viewIconSVG) {
  const statusMeta = getQueryStatusMeta(q.status);
  const columns = q.jsonConfig?.DesiredColumnOrder || [];
  const filters = typeof window.normalizeUiConfigFilters === 'function'
    ? window.normalizeUiConfigFilters(q.jsonConfig)
    : [];
  const isExpanded = activeHistoryDetailQueryId === q.id;

  const reasonSummary = q.error
    ? '<span class="history-reason-icon">Issue</span>'
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
    </div>`;
  const statusCell = `<span class="${statusMeta.badgeClass}">${statusMeta.label}</span>`;
  const detailsCell = buildHistoryExpandButton(q.id, isExpanded, columns.length, filters.length);

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
  if (q.startTime) {
    const start = new Date(q.startTime);
    const end = q.running
      ? new Date()
      : new Date(q.endTime || q.cancelledTime);
    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
      const seconds = Math.max(0, Math.floor((end - start) / 1000));
      duration = typeof formatDuration === 'function' ? formatDuration(seconds) : `${seconds}s`;
    }
  }
  
  // Different row structure for running vs completed vs cancelled queries
  if (q.running) {
    return `
      <tr class="history-row ${statusMeta.rowClass} cursor-pointer" data-query-id="${q.id}">
        <td class="px-4 py-3 text-xs text-left font-mono">${nameCell}</td>
        <td class="px-4 py-2 text-xs text-center">${statusCell}</td>
        <td class="px-4 py-2 text-xs text-center">${detailsCell}</td>
        <td class="px-4 py-2 text-xs text-center">${new Date(q.startTime).toLocaleString()}</td>
        <td class="px-4 py-2 text-xs text-center history-duration-cell" data-query-id="${q.id}">${duration}</td>
        <td class="px-4 py-2 text-center">${previewBtn}</td>
        <td class="px-4 py-2 text-center">${stopBtn}</td>
      </tr>
    `;
  } else if (q.cancelled) {
    return `
      <tr class="history-row ${statusMeta.rowClass} cursor-pointer" data-query-id="${q.id}">
        <td class="px-4 py-3 text-xs text-left font-mono">${nameCell}</td>
        <td class="px-4 py-2 text-xs text-center">${statusCell}</td>
        <td class="px-4 py-2 text-xs text-center">${detailsCell}</td>
        <td class="px-4 py-2 text-xs text-center">${new Date(q.startTime).toLocaleString()}</td>
        <td class="px-4 py-2 text-xs text-center">${duration}</td>
        <td class="px-4 py-2 text-xs text-center">${rerunBtn}</td>
      </tr>
    `;
  } else if (q.failed) {
    return `
      <tr class="history-row ${statusMeta.rowClass} cursor-pointer" data-query-id="${q.id}">
        <td class="px-4 py-3 text-xs text-left font-mono">${nameCell}</td>
        <td class="px-4 py-2 text-xs text-center">${statusCell}</td>
        <td class="px-4 py-2 text-xs text-center">${detailsCell}</td>
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
        <td class="px-4 py-2 text-xs text-center">${statusCell}</td>
        <td class="px-4 py-2 text-xs text-center">${detailsCell}</td>
        <td class="px-4 py-2 text-xs text-center">${new Date(q.startTime).toLocaleString()}</td>
        <td class="px-4 py-2 text-xs text-center">${duration}</td>
        <td class="px-4 py-2 text-xs text-center">${loadBtn}</td>
        <td class="px-4 py-2 text-xs text-center">${rerunBtn}</td>
      </tr>
    `;
  }
}


// Ensure global access
window.fetchQueryStatus = fetchQueryStatus;

/**
 * Binds load/rerun/stop button event handlers on all matching buttons within
 * a given root element. Called after both full re-renders and surgical row
 * insertions so listeners are always wired to the live DOM nodes.
 * @param {Element} scope
 */
function bindHistoryTableButtons(scope) {
  scope.querySelectorAll('.history-expand-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const queryId = btn.getAttribute('data-history-expand');
      if (!queryId) return;
      renderHistoryDetailsOverlay(queryId);
    });
  });

  scope.querySelectorAll('.load-query-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      closeHistoryDetailsOverlay();
      loadQueryResults(btn.getAttribute('data-query-id'));
    });
  });

  scope.querySelectorAll('.rerun-query-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const id = btn.getAttribute('data-query-id');
      const q = exampleQueries.find(q => q.id === id);
      if (!q) return;
      q.running = true;
      q.startTime = new Date().toISOString();
      q.endTime = null;
      q.cancelled = false;
      q.status = 'running';
      loadQueryConfig(q);
      closeHistoryDetailsOverlay();
      window.DOM.runBtn?.click();
      window.modalManager?.closePanel?.('queries-panel');
    });
  });

  scope.querySelectorAll('.stop-query-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const id = btn.getAttribute('data-query-id');
      if (typeof window.showToastMessage === 'function') {
        window.showToastMessage({
          message: 'Cancel this running query?',
          type: 'warning',
          duration: 0,
          action: { label: 'Cancel Query', onClick: () => cancelQuery(id) }
        });
        return;
      }
      cancelQuery(id);
    });
  });
}

/**
 * Returns true when fields that affect a row's rendered HTML have changed
 * between two versions of the same query object.
 * @param {Object} oldQ
 * @param {Object} newQ
 * @returns {boolean}
 */
function hasQueryRowChanged(oldQ, newQ) {
  return oldQ.status      !== newQ.status
      || oldQ.resultCount !== newQ.resultCount
      || oldQ.error       !== newQ.error
      || oldQ.endTime     !== newQ.endTime
      || oldQ.name        !== newQ.name;
}

/**
 * Surgically patches the queries panel to reflect newHistory.
 * Only the exact DOM nodes that changed are touched — no full innerHTML swaps
 * during normal polling.  Falls back to renderQueries() only for structural
 * transitions (container not yet rendered, or empty↔populated table state).
 * @param {Array} newHistory
 */
function patchQueriesPanelData(newHistory) {
  // Snapshot old state BEFORE overwriting exampleQueries
  const oldById = new Map(exampleQueries.map(q => [q.id, q]));
  exampleQueries = newHistory;

  const container = window.DOM.queriesList;
  if (!container || !container.querySelector('.history-editorial-hero')) {
    renderQueries();
    return;
  }

  const searchInput = window.DOM.queriesSearch;
  const searchTerm  = searchInput ? searchInput.value.trim().toLowerCase() : '';
  const matchesSearch = q =>
    !searchTerm ||
    (q.name && q.name.toLowerCase().includes(searchTerm)) ||
    q.id.toLowerCase().includes(searchTerm) ||
    (q.jsonConfig?.DesiredColumnOrder || []).some(col => col.toLowerCase().includes(searchTerm));

  const runningList   = newHistory.filter(q => q.running && matchesSearch(q));
  const doneList      = newHistory.filter(q => !q.running && !q.cancelled && !q.failed && matchesSearch(q));
  const failedList    = newHistory.filter(q => q.failed    && matchesSearch(q));
  const cancelledList = newHistory.filter(q => q.cancelled && matchesSearch(q));

  const counts = {
    running:  runningList.length,
    complete: doneList.length,
    failed:   failedList.length,
    canceled: cancelledList.length
  };
  const visibleCount = Object.values(counts).reduce((a, b) => a + b, 0);
  const totalCount   = newHistory.length;

  // — Editorial hero subtitle
  const heroSubtitle = container.querySelector('.history-editorial-subtitle');
  if (heroSubtitle) {
    const liveSignal  = counts.running > 0
      ? `${counts.running} live ${counts.running === 1 ? 'query is' : 'queries are'} still updating.`
      : 'No active queries are running right now.';
    const searchLabel = searchTerm
      ? `Showing ${visibleCount} of ${totalCount} saved queries matching "${searchTerm}".`
      : `Showing ${visibleCount} recent ${visibleCount === 1 ? 'query' : 'queries'} across your workspace history.`;
    const next = `${searchLabel} ${liveSignal}`;
    if (heroSubtitle.textContent !== next) heroSubtitle.textContent = next;
  }

  // — Visible-count meta card (second .history-meta-card)
  const metaCards = container.querySelectorAll('.history-meta-card');
  if (metaCards[1]) {
    const el = metaCards[1].querySelector('.history-meta-value');
    if (el && el.textContent !== String(visibleCount)) el.textContent = String(visibleCount);
  }

  // — Polling meta (text + CSS class only)
  const refreshedAt = lastQueryStatusPollAt
    ? new Date(lastQueryStatusPollAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : 'Awaiting refresh';
  updateHistoryPollingMeta({
    isPollingActive: !!(queryDurationUpdateInterval && isQueriesPanelOpen()),
    refreshedAt
  });

  // — Bookshelf book counts and state labels
  Object.entries(counts).forEach(([key, count]) => {
    const book = container.querySelector(`[data-history-book="${key}"]`);
    if (!book) return;
    const countEl = book.querySelector('.history-book-count');
    if (countEl && countEl.textContent !== String(count)) countEl.textContent = String(count);
    const stateEl = book.querySelector('.history-book-state');
    if (stateEl) {
      const next = count === 0 ? 'Empty' : key === activeHistorySection ? 'Projected' : 'Standby';
      if (stateEl.textContent !== next) stateEl.textContent = next;
    }
  });

  // — Monitor panel
  const monitor = container.querySelector('[data-history-monitor]');
  if (!monitor) return;

  // Tab counts
  monitor.querySelectorAll('.history-monitor-tab').forEach(tab => {
    const key = tab.dataset.historyMonitorTab;
    if (!key) return;
    const el    = tab.querySelector('.history-monitor-tab-count');
    const count = counts[key] ?? 0;
    const next  = `${count} ${count === 1 ? 'entry' : 'entries'}`;
    if (el && el.textContent !== next) el.textContent = next;
  });

  const activeSectionKey = monitor.querySelector('.history-monitor-tab.is-active')?.dataset.historyMonitorTab;
  if (!activeSectionKey) return;

  const sectionLists = { running: runningList, complete: doneList, failed: failedList, canceled: cancelledList };
  const sectionList  = sectionLists[activeSectionKey] || [];
  const stage        = monitor.querySelector('.history-monitor-stage');
  if (!stage) return;

  const tbody = stage.querySelector('tbody');
  const emptyMessages = {
    running:  'No running queries right now.',
    complete: 'No completed queries yet.',
    failed:   'No failed or interrupted queries.',
    canceled: 'No cancelled queries yet.'
  };

  // Section emptied — swap table for empty-state message
  if (sectionList.length === 0) {
    if (tbody) {
      stage.innerHTML = `<div class="history-empty-state history-monitor-empty">${emptyMessages[activeSectionKey] || ''}</div>`;
    }
    return;
  }

  // Section first populated — table scaffolding not in DOM yet; one-time full render
  if (!tbody) {
    const viewState  = captureHistoryViewState();
    const didRender  = renderQueries();
    if (didRender) restoreHistoryViewState(viewState);
    return;
  }

  // Build a map of rows currently in the tbody
  const existingRowMap = new Map();
  tbody.querySelectorAll('tr[data-query-id]').forEach(tr => existingRowMap.set(tr.dataset.queryId, tr));

  const newIds = new Set(sectionList.map(q => q.id));

  // Remove rows whose query is no longer in this section
  existingRowMap.forEach((tr, id) => { if (!newIds.has(id)) tr.remove(); });

  // Insert new rows / replace changed rows — skip rows that haven't changed
  sectionList.forEach((q, index) => {
    const existing = existingRowMap.get(q.id);
    const old      = oldById.get(q.id);

    if (existing && old && !hasQueryRowChanged(old, q)) return; // Nothing to do

    const temp = document.createElement('tbody');
    temp.innerHTML = createQueriesTableRowHtml(q, VIEW_ICON_SVG);
    const newMainTr = temp.querySelector('tr[data-query-id]');
    if (!newMainTr) return;
    bindHistoryTableButtons(temp);

    if (existing) {
      tbody.replaceChild(newMainTr, existing);
    } else {
      // Insert at the correct ordinal position among already-updated rows
      const sibling = tbody.querySelectorAll('tr[data-query-id]')[index];
      if (sibling) {
        tbody.insertBefore(newMainTr, sibling);
      } else {
        tbody.appendChild(newMainTr);
      }
    }
  });

  if (activeHistoryDetailQueryId) {
    renderHistoryDetailsOverlay(activeHistoryDetailQueryId);
  }
}

/**
 * Updates only the duration cells of currently-running query rows in-place,
 * avoiding a full layout re-render on every tick.
 * @function updateRunningDurationsInPlace
 */
function updateRunningDurationsInPlace() {
  const list = window.DOM.queriesList;
  if (!list) return;
  exampleQueries.filter(q => q.running && q.startTime).forEach(q => {
    const cell = list.querySelector(`.history-duration-cell[data-query-id="${q.id}"]`);
    if (!cell) return;
    const start = new Date(q.startTime);
    if (isNaN(start.getTime())) return;
    const seconds = Math.max(0, Math.floor((Date.now() - start) / 1000));
    cell.textContent = typeof formatDuration === 'function' ? formatDuration(seconds) : `${seconds}s`;
  });
}

/**
 * Starts real-time updates for running query durations.
 * Keeps polling even when no queries are running so that queries started by
 * other users appear without a manual page refresh.
 * @function startQueryDurationUpdates
 */
function startQueryDurationUpdates() {
  if (!isQueriesPanelOpen()) return;
  if (queryDurationUpdateInterval) return; // Already running

  window.fetchQueryStatus();

  queryDurationUpdateInterval = setInterval(() => {
    if (!isQueriesPanelOpen()) {
      stopQueryDurationUpdates();
      return;
    }

    const hasRunningQueries = exampleQueries.some(q => q.running);
    // Tick running durations in-place — no full re-render needed.
    if (hasRunningQueries) {
      updateRunningDurationsInPlace();
    }

    // Poll the backend: faster when queries are running, slower when idle.
    const pollInterval = hasRunningQueries ? QUERY_STATUS_POLL_MS : IDLE_POLL_MS;
    if ((Date.now() - lastQueryStatusPollAt) >= pollInterval) {
      window.fetchQueryStatus();
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
  const container = window.DOM.queriesList;
  if(!container) return false;
  
  // Get search value
  const searchInput = window.DOM.queriesSearch;
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
  
  const runningRows = runningList.map(q => createQueriesTableRowHtml(q, VIEW_ICON_SVG)).join('');
  const doneRows = doneList.map(q => createQueriesTableRowHtml(q, VIEW_ICON_SVG)).join('');
  const failedRows = failedList.map(q => createQueriesTableRowHtml(q, VIEW_ICON_SVG)).join('');
  const cancelledRows = cancelledList.map(q => createQueriesTableRowHtml(q, VIEW_ICON_SVG)).join('');

  // Build table headers for each history state.
  const runningTableHead = `
    <thead class="history-table-head running">
      <tr>
        <th class="px-4 py-2 text-center" data-tooltip="Query name or identifier">Name</th>
        <th class="px-4 py-2 text-center" data-tooltip="Current query status">Status</th>
        <th class="px-4 py-2 text-center" data-tooltip="Open fields and filters for this query">Details</th>
        <th class="px-4 py-2 text-center" data-tooltip="When this query was started">Started</th>
        <th class="px-4 py-2 text-center" data-tooltip="How long this running query has been active">Duration</th>
        <th class="px-4 py-2 text-center" data-tooltip="Open the results accumulated so far for this running query">Results</th>
        <th class="px-4 py-2 text-center" data-tooltip="Stop the currently running query">Stop/Cancel</th>
      </tr>
    </thead>`;

  const completedTableHead = `
    <thead class="history-table-head complete">
      <tr>
        <th class="px-4 py-2 text-center" data-tooltip="Query name or identifier">Name</th>
        <th class="px-4 py-2 text-center" data-tooltip="Current query status">Status</th>
        <th class="px-4 py-2 text-center" data-tooltip="Open fields and filters for this query">Details</th>
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
        <th class="px-4 py-2 text-center" data-tooltip="Current query status">Status</th>
        <th class="px-4 py-2 text-center" data-tooltip="Open fields and filters for this query">Details</th>
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
        <th class="px-4 py-2 text-center" data-tooltip="Current query status">Status</th>
        <th class="px-4 py-2 text-center" data-tooltip="Open fields and filters for this query">Details</th>
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
  let renderKey = '';

  // Show "no results" message if search returns nothing
  if (searchTerm && runningCount === 0 && doneCount === 0 && failedCount === 0 && cancelledCount === 0) {
    content = `<div class="history-empty-state history-empty-search">No queries found matching "${searchTerm}".</div>`;
    renderKey = JSON.stringify({
      searchTerm,
      runningCount,
      doneCount,
      failedCount,
      cancelledCount,
      activeHistorySection,
      empty: true,
      content
    });
  } else {
    const sections = [
      {
        key: 'running',
        count: runningCount,
        rows: runningRows,
        tableHead: runningTableHead,
        emptyMessage: 'No running queries right now.'
      },
      {
        key: 'complete',
        count: doneCount,
        rows: doneRows,
        tableHead: completedTableHead,
        emptyMessage: 'No completed queries yet.'
      },
      {
        key: 'failed',
        count: failedCount,
        rows: failedRows,
        tableHead: failedTableHead,
        emptyMessage: 'No failed or interrupted queries.'
      },
      {
        key: 'canceled',
        count: cancelledCount,
        rows: cancelledRows,
        tableHead: cancelledTableHead,
        emptyMessage: 'No cancelled queries yet.'
      }
    ];
    const historyMonitor = buildHistoryMonitor(openSection, sections);
    const runningSection = buildHistorySection('running', runningCount, openSection === 'running');
    const doneSection = buildHistorySection('complete', doneCount, openSection === 'complete');
    const failedSection = buildHistorySection('failed', failedCount, openSection === 'failed');
    const cancelledSection = buildHistorySection('canceled', cancelledCount, openSection === 'canceled');

    content = `
      <section class="history-editorial-hero">
        <div class="history-editorial-copy">
          <h3 class="history-editorial-title">Query Hub</h3>
          <p class="history-editorial-subtitle">${searchLabel} ${liveSignal}</p>
        </div>
        <div class="history-editorial-meta">
          <div class="history-meta-card">
            <span class="history-meta-label">Polling</span>
            <span class="history-meta-value history-polling-value ${isPollingActive ? 'active' : 'idle'}">${pollingLabel}</span>
            <span class="history-meta-detail history-polling-detail">Last refresh ${refreshedAt}</span>
          </div>
          <div class="history-meta-card">
            <span class="history-meta-label">Visible Queries</span>
            <span class="history-meta-value">${visibleCount}</span>
            <span class="history-meta-detail">${searchTerm ? 'Filtered view' : 'Across all query statuses'}</span>
          </div>
        </div>
      </section>
      <div class="history-bookshelf${openSection ? ' monitor-active' : ''}">
        ${runningSection}
        ${doneSection}
        ${failedSection}
        ${cancelledSection}
        ${historyMonitor}
      </div>
    `;

    renderKey = JSON.stringify({
      searchTerm,
      activeHistorySection,
      runningCount,
      doneCount,
      failedCount,
      cancelledCount,
      visibleCount,
      totalCount,
      openSection,
      // Identity-based keys only — no computed display strings — so the key only
      // changes when the data actually changes, not every elapsed-second tick.
      runningIds: runningList.map(q => q.id),
      doneIds: doneList.map(q => `${q.id}:${q.resultCount ?? ''}`),
      failedIds: failedList.map(q => `${q.id}:${q.error ?? ''}`),
      cancelledIds: cancelledList.map(q => q.id)
    });
  }

  if (renderKey === lastHistoryRenderKey) {
    updateHistoryPollingMeta({ isPollingActive, refreshedAt });
    return false;
  }

  lastHistoryRenderKey = renderKey;

  container.innerHTML = content;
  bindHistoryBookShelf(container);
  bindHistoryTableButtons(container);
  if (activeHistoryDetailQueryId) {
    renderHistoryDetailsOverlay(activeHistoryDetailQueryId);
  }

  return true;
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
  addQuery: addQueryToHistory,
  getQueries: getHistoryQueries,
  getQueryById: getHistoryQueryById,
  updateQuery: updateHistoryQuery,
  applyQueryConfig: loadQueryConfig,
  fetchQueryStatus,
  closeDetailsOverlay: closeHistoryDetailsOverlay,
  startQueryDurationUpdates,
  stopQueryDurationUpdates,
  renderQueries
};

Object.defineProperty(QueryHistorySystem, 'exampleQueries', {
  enumerable: false,
  get() {
    return exampleQueries;
  }
});

// Make QueryHistorySystem globally accessible
window.QueryHistorySystem = QueryHistorySystem;

window.cancelQuery = cancelQuery;
window.addQueryToHistory = addQueryToHistory;

let queryHistoryInitialized = false;

// Initialize query history functionality
window.onDOMReady(() => {
  if (queryHistoryInitialized) {
    return;
  }

  queryHistoryInitialized = true;

  // Initial render of the query history list
  renderQueries();

  // Start duration updates if there are running queries
  if (exampleQueries.some(q => q.running)) {
    // Don't start immediately - only when the panel is opened
    // The openModal function will handle starting updates
  }

  // Attach queries search event listener
  const queriesSearchInput = window.DOM.queriesSearch;
  if (queriesSearchInput) {
    queriesSearchInput.addEventListener('input', renderQueries);
  }

  // Add row click event listener
  document.addEventListener('click', handleQueryRowClick);

  // Initial fetch of query history
  setTimeout(() => { if (window.fetchQueryStatus) window.fetchQueryStatus(); }, 500);
});
