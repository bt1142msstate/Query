/**
 * Query UI Management
 * Handles UI updates, DOM elements, and UI logic.
 * @module QueryUI
 */

// Centralized DOM element cache
window.DOM = {
  get overlay() { return this._overlay ||= document.getElementById('overlay'); },
  get conditionPanel() { return this._conditionPanel ||= document.getElementById('condition-panel'); },
  get inputWrapper() { return this._inputWrapper ||= document.getElementById('condition-input-wrapper'); },
  get conditionInput() { return this._conditionInput ||= document.getElementById('condition-input'); },
  get confirmBtn() { return this._confirmBtn ||= document.getElementById('confirm-btn'); },
  get runBtn() { return this._runBtn ||= document.getElementById('run-query-btn'); },
  get runIcon() { return this._runIcon ||= document.getElementById('run-icon'); },
  get refreshIcon() { return this._refreshIcon ||= document.getElementById('refresh-icon'); },
  get stopIcon() { return this._stopIcon ||= document.getElementById('stop-icon'); },
  get downloadBtn() { return this._downloadBtn ||= document.getElementById('download-btn'); },
  get queryBox() { return this._queryBox ||= document.getElementById('query-json'); },
  get queryInput() { return this._queryInput ||= document.getElementById('query-input'); },
  get clearSearchBtn() { return this._clearSearchBtn ||= document.getElementById('clear-search-btn'); },
  get groupMethodSelect() { return this._groupMethodSelect ||= document.getElementById('group-method-select'); }
};

// Legacy DOM Elements - DEPRECATED: Use DOM cache above for all new code
// These are kept temporarily for compatibility until all references are updated
// We assign them to window so they are available globally as before
window.overlay = document.getElementById('overlay'); // Initial fetch, though DOM getter is better
window.conditionPanel = document.getElementById('condition-panel');
window.inputWrapper = document.getElementById('condition-input-wrapper');
window.conditionInput = document.getElementById('condition-input');
window.confirmBtn = document.getElementById('confirm-btn');
window.runBtn = document.getElementById('run-query-btn');
window.runIcon = document.getElementById('run-icon');
window.stopIcon = document.getElementById('stop-icon');
window.downloadBtn = document.getElementById('download-btn');
window.queryBox = document.getElementById('query-json');
window.queryInput = document.getElementById('query-input');
window.clearSearchBtn = document.getElementById('clear-search-btn');
window.groupMethodSelect = document.getElementById('group-method-select');

// Update legacy references when DOM is ready/refreshed if needed, 
// strictly speaking the getters in query.js were cleaner but we need them global.
// The code in query.js used `const overlay = DOM.overlay;` which froze the reference.
// Here we just rely on `document.getElementById` being fast enough or the DOM cache.


/**
 * Updates the run button icon based on query state changes.
 * Shows play icon for new queries, refresh icon for modified queries, stop icon when running.
 * @function updateRunButtonIcon
 */
window.updateRunButtonIcon = function(validationError) {
  const runIcon = document.getElementById('run-icon');
  const refreshIcon = document.getElementById('refresh-icon');
  const stopIcon = document.getElementById('stop-icon');
  const runBtn = document.getElementById('run-query-btn');
  const mobileRunQuery = document.getElementById('mobile-run-query');
  
  // State 1: Query is running - show stop icon
  if (window.queryRunning) {
    runIcon.classList.add('hidden');
    refreshIcon.classList.add('hidden');
    stopIcon.classList.remove('hidden');
    runBtn.disabled = false;
    runBtn.classList.remove('opacity-50', 'cursor-not-allowed');
    runBtn.classList.add('bg-red-500', 'hover:bg-red-600');
    runBtn.classList.remove('bg-green-500', 'hover:bg-green-600');
    runBtn.setAttribute('data-tooltip', 'Stop Query');
    runBtn.setAttribute('aria-label', 'Stop query');
    if (mobileRunQuery) {
      mobileRunQuery.setAttribute('data-tooltip', 'Stop Query');
    }
    return;
  }
  
  // Reset button styling for non-running states
  runBtn.classList.remove('bg-red-500', 'hover:bg-red-600');
  runBtn.classList.add('bg-green-500', 'hover:bg-green-600');
  stopIcon.classList.add('hidden');
  
  // Custom Validation Error (like missing name) - disabled
  if (validationError) {
    runIcon.classList.remove('hidden');
    refreshIcon.classList.add('hidden');
    runBtn.disabled = true;
    runBtn.classList.add('opacity-50', 'cursor-not-allowed');
    runBtn.setAttribute('data-tooltip', validationError);
    runBtn.setAttribute('aria-label', validationError);
    if (mobileRunQuery) {
      mobileRunQuery.setAttribute('data-tooltip', validationError);
    }
    return;
  }
  
  // State 2: No columns - disabled (show run icon but disabled)
  if (!window.displayedFields || window.displayedFields.length === 0) {
    runIcon.classList.remove('hidden');
    refreshIcon.classList.add('hidden');
    runBtn.disabled = true;
    runBtn.classList.add('opacity-50', 'cursor-not-allowed');
    runBtn.setAttribute('data-tooltip', 'Add columns to enable query');
    runBtn.setAttribute('aria-label', 'Add columns to enable query');
    if (mobileRunQuery) {
      mobileRunQuery.setAttribute('data-tooltip', 'Add columns to enable query');
    }
    return;
  }
  
  // Re-enable button for states 3 & 4
  runBtn.disabled = false;
  runBtn.classList.remove('opacity-50', 'cursor-not-allowed');
  
  // State 3: Query has changed - show run icon
  if (window.hasQueryChanged()) {
    runIcon.classList.remove('hidden');
    refreshIcon.classList.add('hidden');
    runBtn.setAttribute('data-tooltip', 'Run Query');
    runBtn.setAttribute('aria-label', 'Run query');
    if (mobileRunQuery) {
      mobileRunQuery.setAttribute('data-tooltip', 'Run Query');
    }
  } else {
    // State 4: No changes - show refresh icon
    runIcon.classList.add('hidden');
    refreshIcon.classList.remove('hidden');
    runBtn.setAttribute('data-tooltip', 'Refresh Data');
    runBtn.setAttribute('aria-label', 'Refresh data');
    if (mobileRunQuery) {
      mobileRunQuery.setAttribute('data-tooltip', 'Refresh Data');
    }
  }
};

/**
 * Updates run and download button states together
 */
window.updateButtonStates = function() {
  const runBtn = window.DOM.runBtn;
  const downloadBtn = window.DOM.downloadBtn;
  const queryBox = window.DOM.queryBox;

  const tableNameInput = document.getElementById('table-name-input');
  const tableName = tableNameInput ? tableNameInput.value.trim() : '';
  const hasName = tableName && tableName !== '';

  if(runBtn){
    try{
      const q = JSON.parse(queryBox.value || '{}');
      const hasFields = Array.isArray(q.DesiredColumnOrder) && q.DesiredColumnOrder.length > 0;
      
      let validationError = null;
      if (!hasName) {
        validationError = "Please name your query to run";
        runBtn.disabled = true;
      } else {
        runBtn.disabled = !hasFields || window.queryRunning;
      }
      
      // Use the sophisticated icon/tooltip update function instead of simple tooltip
      window.updateRunButtonIcon(validationError);
    }catch{
      runBtn.disabled = true;
      // Use the sophisticated icon/tooltip update function instead of simple tooltip
      window.updateRunButtonIcon();
    }
  }

  if(downloadBtn){
    const hasData = displayedFields.length > 0 && VirtualTable.virtualTableData && VirtualTable.virtualTableData.rows && VirtualTable.virtualTableData.rows.length > 0;

    // Add/remove error styling based on table name presence
    if (tableNameInput) {
      // Show error styling if they try to run/download without a name, or if they have queries built up but no name
      if (!hasName && (hasData || (displayedFields && displayedFields.length > 0))) {
        tableNameInput.classList.add('error');
      } else {
        tableNameInput.classList.remove('error');
      }
    }

    downloadBtn.disabled = !hasData || !hasName;
    
    // Update tooltip based on what's missing
    if (!hasData && !hasName) {
      downloadBtn.setAttribute('data-tooltip', 'Add columns and name your table to download');
    } else if (!hasData) {
      downloadBtn.setAttribute('data-tooltip', 'Add columns to download');
    } else if (!hasName) {
      downloadBtn.setAttribute('data-tooltip', 'Name your table to download');
    } else {
      downloadBtn.setAttribute('data-tooltip', 'Download Excel file');
    }
  }
};

/**
 * Helper function to manage UI changes when a query starts/stops
 */
window.toggleQueryInterface = function(isQueryRunning) {
  const searchContainer = document.getElementById('query-input')?.parentElement?.parentElement;
  const categoryBar     = document.getElementById('category-bar');
  const bubbleGrid      = document.getElementById('bubble-container');
  const bubbleScrollbar = document.querySelector('.bubble-scrollbar-container');
  const tableWrapper    = document.querySelector('.overflow-x-auto.shadow.rounded-lg.mb-6.relative');

  // Keep a nearly‑full‑screen table during execution
  const adjustTableHeight = () => {
    if (!tableWrapper) return;
    const margin = 24;                         // px gap at the bottom
    const rect   = tableWrapper.getBoundingClientRect();
    const newH   = window.innerHeight - rect.top - margin;
    tableWrapper.style.height    = newH + 'px';
    tableWrapper.style.maxHeight = newH + 'px';
    tableWrapper.style.overflowY = 'auto';
  };

  // Toggle visibility of non‑essential UI pieces
  [searchContainer, categoryBar, bubbleGrid, bubbleScrollbar].forEach(el => {
    if (!el) return;
    if (isQueryRunning) {
      el.dataset.prevDisplay = el.style.display || '';
      el.style.display = 'none';
    } else {
      el.style.display = el.dataset.prevDisplay || '';
    }
  });

  if (isQueryRunning) {
    adjustTableHeight();
    window.addEventListener('resize', adjustTableHeight);
  } else if (tableWrapper) {
    tableWrapper.style.height    = '';
    tableWrapper.style.maxHeight = '';
    tableWrapper.style.overflowY = '';
    window.removeEventListener('resize', adjustTableHeight);
  }
};

/* ---------- Table morph animation ---------- */
function createTableQueryCircuitOverlay() {
  const circuit = document.createElement('div');
  circuit.id = 'table-query-circuit';
  circuit.className = 'table-query-circuit';

  const cols = 10;
  const rows = 10;
  const xMin = 9;
  const yMin = 9;
  const xStep = 82 / (cols - 1);
  const yStep = 82 / (rows - 1);

  const colors = ['#22d3ee', '#38bdf8', '#34d399', '#facc15'];
  const segments = [];
  const segmentKeys = new Set();
  const usedNodes = new Map();

  function point(col, row) {
    return {
      col,
      row,
      x: xMin + col * xStep,
      y: yMin + row * yStep,
      key: `${col},${row}`
    };
  }

  function addNodeUsage(pt) {
    usedNodes.set(pt.key, (usedNodes.get(pt.key) || 0) + 1);
  }

  function addSegment(a, b) {
    if (!a || !b) return;
    if (a.key === b.key) return;

    const key = [a.key, b.key].sort().join('|');
    if (segmentKeys.has(key)) return;
    segmentKeys.add(key);
    segments.push({ a, b });
    addNodeUsage(a);
    addNodeUsage(b);
  }

  function routeManhattan(a, b) {
    let curr = a;
    while (curr.key !== b.key) {
      const dx = b.col - curr.col;
      const dy = b.row - curr.row;
      
      let nextCol = curr.col;
      let nextRow = curr.row;

      if (Math.abs(dx) > 0 && Math.abs(dy) > 0 && Math.random() < 0.6) {
        // Diagonal 45 degree step
        nextCol += Math.sign(dx);
        nextRow += Math.sign(dy);
      } else if (Math.abs(dx) > Math.abs(dy)) {
        // Horizontal step
        nextCol += Math.sign(dx);
      } else {
        // Vertical step
        nextRow += Math.sign(dy);
      }
      
      const next = point(nextCol, nextRow);
      addSegment(curr, next);
      curr = next;
    }
  }

  function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function randomGridPoint() {
    return point(randomInt(0, cols - 1), randomInt(0, rows - 1));
  }

  function nearestHub(p, hubs) {
    let best = hubs[0];
    let bestDist = Infinity;
    hubs.forEach(h => {
      const d = Math.abs(h.col - p.col) + Math.abs(h.row - p.row);
      if (d < bestDist) {
        best = h;
        bestDist = d;
      }
    });
    return best;
  }

  const hubCount = randomInt(6, 8);
  const hubs = [];
  const hubKeys = new Set();
  while (hubs.length < hubCount) {
    const p = point(randomInt(1, cols - 2), randomInt(1, rows - 2));
    if (hubKeys.has(p.key)) continue;
    hubKeys.add(p.key);
    hubs.push(p);
  }

  const backbone = [...hubs].sort((a, b) => a.col - b.col || a.row - b.row);
  for (let i = 0; i < backbone.length - 1; i++) {
    routeManhattan(backbone[i], backbone[i + 1]);
  }

  const branchCount = randomInt(10, 14);
  for (let i = 0; i < branchCount; i++) {
    const side = randomInt(0, 3);
    let start;
    if (side === 0) start = point(0, randomInt(0, rows - 1));
    else if (side === 1) start = point(cols - 1, randomInt(0, rows - 1));
    else if (side === 2) start = point(randomInt(0, cols - 1), 0);
    else start = point(randomInt(0, cols - 1), rows - 1);

    routeManhattan(start, nearestHub(start, hubs));
  }

  segments.forEach(({ a, b }) => {
    const trace = document.createElement('div');
    trace.className = 'table-query-circuit-trace';

    let angle = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    const centerX = (a.x + b.x) / 2;
    const centerY = (a.y + b.y) / 2;
    const colorA = colors[Math.floor(Math.random() * colors.length)];
    const colorB = colors[Math.floor(Math.random() * colors.length)];

    trace.style.setProperty('--trace-angle', `${angle}deg`);
    trace.style.setProperty('--trace-len', `${length.toFixed(2)}%`);
    trace.style.setProperty('--trace-x', `${centerX.toFixed(2)}%`);
    trace.style.setProperty('--trace-y', `${centerY.toFixed(2)}%`);
    trace.style.setProperty('--trace-color-a', colorA);
    trace.style.setProperty('--trace-color-b', colorB);
    trace.style.setProperty('--trace-flicker-delay', `${(-Math.random() * 3).toFixed(2)}s`);

    if (Math.random() < 0.65) {
      const pulse = document.createElement('span');
      pulse.className = 'table-query-circuit-pulse';
      pulse.style.setProperty('--pulse-duration', `${(0.9 + Math.random() * 1.4).toFixed(2)}s`);
      pulse.style.setProperty('--pulse-delay', `${(-Math.random() * 1.6).toFixed(2)}s`);
      pulse.style.setProperty('--pulse-color', colorA);
      trace.appendChild(pulse);
    }

    circuit.appendChild(trace);
  });

  usedNodes.forEach((degree, key) => {
    const [colRaw, rowRaw] = key.split(',');
    const col = Number(colRaw);
    const row = Number(rowRaw);
    const node = document.createElement('div');
    node.className = 'table-query-circuit-node';
    node.style.left = `${(xMin + col * xStep).toFixed(2)}%`;
    node.style.top = `${(yMin + row * yStep).toFixed(2)}%`;
    node.style.setProperty('--node-size', degree >= 3 ? '8px' : '6px');
    node.style.setProperty('--node-delay', `${(-Math.random() * 2).toFixed(2)}s`);
    circuit.appendChild(node);
  });

  return circuit;
}

window.startTableQueryAnimation = function() {
  const tableContainer = document.getElementById('table-container');
  if (!tableContainer) return;

  // Cleanup old bubble if it exists
  const oldBubble = document.getElementById('table-query-bubble');
  if (oldBubble) oldBubble.remove();
  
  // Create our bubble element
  const bubble = document.createElement('div');
  bubble.id = 'table-query-bubble';
  bubble.className = 'table-query-bubble';
  
  const textNode = document.createElement('span');
  textNode.className = 'table-query-bubble-text';
  textNode.textContent = 'Querying...';
  textNode.style.position = 'relative';
  textNode.style.zIndex = '2';

  const circuit = createTableQueryCircuitOverlay();

  bubble.appendChild(circuit);
  bubble.appendChild(textNode);
  
  // Get initial container dimensions
  const rect = tableContainer.getBoundingClientRect();
  bubble.style.width = rect.width + 'px';
  bubble.style.height = rect.height + 'px';
  bubble.style.top = (rect.top + rect.height/2) + 'px';
  bubble.style.left = (rect.left + rect.width/2) + 'px';
  bubble.style.borderRadius = '1.5rem'; // Keep rounder so the start is immediately visibly morphing a bubble
  
  document.body.appendChild(bubble);
  tableContainer.classList.add('table-container-hidden');
  
  // Fade out filter panel if it's there
  const filterPanel = document.getElementById('filter-side-panel');
  if (filterPanel) {
    filterPanel.classList.add('fade-out');
  }

  // Force reflow
  void bubble.offsetWidth;
  
  // Fade out rest of the scene
  document.body.classList.add('scene-fade-transition', 'scene-fade-out');
  
  // Animate to a circle and move to center
  bubble.style.width = '350px';
  bubble.style.height = '350px';
  bubble.style.top = '50%';
  bubble.style.left = '50%';
  bubble.style.borderRadius = '50%';

  // Fade in the circuit effect during/after it circles
  // Start the fade soon after the shape morph begins 
  setTimeout(() => {
    if (document.getElementById('table-query-circuit')) {
      document.getElementById('table-query-circuit').classList.add('active');
    }
  }, 200);
};

window.endTableQueryAnimation = function() {
  const tableContainer = document.getElementById('table-container');
  const bubble = document.getElementById('table-query-bubble');
  const circuit = document.getElementById('table-query-circuit');
  
  if (!bubble || !tableContainer) {
    if (tableContainer) tableContainer.classList.remove('table-container-hidden');
    document.body.classList.remove('scene-fade-out', 'scene-fade-transition');
    return;
  }

  // Slowly fade out the circuit effect before expanding back to the table
  if (circuit && circuit.classList.contains('active')) {
    circuit.classList.add('fading-out');
    circuit.classList.remove('active');
    setTimeout(() => {
      startExpansionMorph();
    }, 650);
  } else {
    if (circuit) circuit.remove();
    startExpansionMorph();
  }

  function startExpansionMorph() {
    // Fade the rest of the scene back in
    document.body.classList.remove('scene-fade-out');
    // Remove the transition class after it finishes
    setTimeout(() => {
      document.body.classList.remove('scene-fade-transition');
    }, 600);

    // Measure new dimensions
    const rect = tableContainer.getBoundingClientRect();
  
  // Calculate dynamic transition speed (scaling the morph time to the container size)
  const morphDuration = Math.max(0.4, (rect.width + rect.height) / 1800);
  bubble.style.setProperty('--morph-duration', `${morphDuration}s`);
  
  // Morph back to table size
  const targetWidth = rect.width + 'px';
  const targetHeight = rect.height + 'px';
  
  const willChange = (bubble.style.width !== targetWidth) || (bubble.style.height !== targetHeight);

  bubble.style.width = targetWidth;
  bubble.style.height = targetHeight;
  bubble.style.top = (rect.top + rect.height/2) + 'px';
  bubble.style.left = (rect.left + rect.width/2) + 'px';
  bubble.style.borderRadius = '1.5rem'; // Keep it rounder like standard bubbles to look good
  
  const finishAnim = () => {
    // Pop effect!
    bubble.classList.add('popping');
    if (window.createBubblePopParticles) {
      window.createBubblePopParticles(bubble);
    }
    
    tableContainer.classList.remove('table-container-hidden');
    
    // Fade filter panel back in
    const filterPanel = document.getElementById('filter-side-panel');
    if (filterPanel) {
      filterPanel.classList.remove('fade-out');
    }

    setTimeout(() => {
      if (bubble.parentNode) bubble.remove();
    }, 400); // Wait for popping opacity fade
  };

  if (!willChange) {
    finishAnim();
  } else {
    let finished = false;
    bubble.addEventListener('transitionend', function handler(e) {
      if (e.propertyName !== 'width' && e.propertyName !== 'height') return;
      if (finished) return;
      finished = true;
      bubble.removeEventListener('transitionend', handler);
      finishAnim();
    });
    // Safety fallback just in case transitionend drops
    setTimeout(() => {
      if (!finished) {
        finished = true;
        finishAnim();
      }
    }, (morphDuration * 1000) + 100);
  }
  } // End of startExpansionMorph
};

/* ---------- Check for contradiction & return human-readable reason ---------- */
// getContradictionMessage moved to filterManager.js

/* Re-position the input capsule so it keeps a constant gap above the condition buttons */
window.positionInputWrapper = function(){
  const inputWrapper = window.DOM.inputWrapper;
  const conditionPanel = window.DOM.conditionPanel;
  
  if(!inputWrapper.classList.contains('show')) return;
  const panelRect   = conditionPanel.getBoundingClientRect();
  const wrapperRect = inputWrapper.getBoundingClientRect();
  const GAP = 12;                        // px gap between capsule and buttons
  
  let top = panelRect.top - wrapperRect.height - GAP;
  
  // Overlap the condition panel instead of going off the top edge of the window
  const headerHeight = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--header-height')) || 64;
  const minTop = headerHeight + 24; // Leave some space below header
  if (top < minTop) {
    top = minTop;
  }
  
  inputWrapper.style.top = `${top}px`;
  // Pass the exact top position to CSS so `.cond-list` knows how much vertical space to use
  inputWrapper.style.setProperty('--wrapper-top', `${top}px`);
  // Pass the panel top position to CSS mostly for limiting dropdown heights above the panel
  inputWrapper.style.setProperty('--panel-top', `${panelRect.top}px`);
};

/** Rebuild the query JSON and show it */
window.updateQueryJson = function(){
  // Filter out duplicate field names (2nd, 3rd, etc.) and get only base field names
  const baseFields = [...window.displayedFields]
    .filter(field => {
      const def = window.fieldDefs ? window.fieldDefs.get(field) : null;
      return !(def && def.is_buildable);
    })
    .map(field => {
      return window.getBaseFieldName(field);
    })
    .filter((field, index, array) => {
      // Remove duplicates (keep only first occurrence of each base field name)
      return array.indexOf(field) === index;
    });
  
  const query = {
    DesiredColumnOrder: baseFields,
    FilterGroups: [],
    GroupMethod: "ExpandIntoColumns" // Default value
  };
  
  // Update run button icon based on query changes
  window.updateRunButtonIcon();

  // If we have a loaded SimpleTable instance, extract configuration from it
  if (typeof window.VirtualTable !== 'undefined' && window.VirtualTable.simpleTableInstance) {
    const simpleTable = window.VirtualTable.simpleTableInstance;
    
    // Extract GroupMethod from SimpleTable
    if (simpleTable.groupMethod !== undefined) {
      // Convert JavaScript string enum to C# enum string
      switch (simpleTable.groupMethod) {
        case 'None': // GroupMethod.NONE
          query.GroupMethod = "None";
          break;
        case 'Commas': // GroupMethod.COMMAS
          query.GroupMethod = "Commas";
          break;
        case 'ExpandIntoColumns': // GroupMethod.EXPAND_INTO_COLUMNS
          query.GroupMethod = "ExpandIntoColumns";
          break;
        default:
          query.GroupMethod = "ExpandIntoColumns";
      }
    }
    
    // Extract GroupByField from SimpleTable
    if (simpleTable.groupByField) {
      query.GroupByField = simpleTable.groupByField;
    }
    
    // Extract AllowDuplicateFields from SimpleTable
    if (simpleTable.allowDuplicateFields && simpleTable.allowDuplicateFields.size > 0) {
      query.AllowDuplicateFields = Array.from(simpleTable.allowDuplicateFields);
    }
    
    // Extract FilterGroups from SimpleTable (if any were configured in the JSON)
    if (simpleTable.filterGroups && simpleTable.filterGroups.length > 0) {
      const simpleTableFilterGroups = simpleTable.filterGroups.map(group => ({
        LogicalOperator: group.logicalOperator || "And",
        Filters: group.filters.map(filter => ({
          FieldName: filter.fieldName,
          FieldOperator: filter.fieldOperator,
          Values: filter.values
        }))
      }));
      
      // Merge with any active UI filters
      query.FilterGroups = [...simpleTableFilterGroups];
    }
  }

  // Active filters from UI → logical group per field
  Object.entries(window.activeFilters).forEach(([field,data])=>{
    // Skip the buildable base fields themselves
    const fieldDef = window.fieldDefs ? window.fieldDefs.get(field) : null;
    if (fieldDef && fieldDef.is_buildable) return;
    
    // Filter out any filters with empty values
    const validFilters = data.filters.filter(f => f.val !== '');
    if (validFilters.length === 0) return;
    const group = {
      LogicalOperator: data.logical,
      Filters: validFilters.map(f => {
        const vals = (f.cond === 'between') ? f.val.split('|') : [f.val];
        return {
          FieldName: field,
          FieldOperator: mapOperator(f.cond),
          Values: vals
        };
      })
    };
    query.FilterGroups.push(group);
  });

  // Add CustomFields for fields that have special payloads
  if (window.getAllFieldDefs) {
    const customFields = window.getAllFieldDefs()
      .filter(f => f.special_payload && f.special_payload.type === 'marc')
      .map(f => ({
        FieldName: f.name,
        Tool: "prtentry", // Default, adjust if needed
        OutputFlag: "e",
        FilterFlag: "e",
        RawOutputSegments: 1,
        DataType: "string",
        RequiredEqualFilter: f.special_payload.tag
      }));
    if (customFields.length > 0) {
      query.CustomFields = customFields;
    }
  }

  const queryBox = window.DOM.queryBox;
  if(queryBox) queryBox.value = JSON.stringify(query, null, 2);
  window.updateButtonStates();
};

/* ---------- Helper: map UI condition slugs to C# enum names ---------- */
function mapOperator(cond){
  switch(cond){
    case 'greater': return 'GreaterThan';
    case 'less':    return 'LessThan';
    case 'equals':  return 'Equals';
    case 'between': return 'Between';
    case 'contains':return 'Contains';
    case 'starts':  return 'Contains';         // "Starts With" → "Contains"
    case 'doesnotcontain': return 'DoesNotContain';
    default: return cond.charAt(0).toUpperCase() + cond.slice(1);
  }
}

// Helper function to check if a field should have purple styling
window.shouldFieldHavePurpleStyling = function(fieldName) {
  // Check if field or its duplicates are displayed
  // This logic is duplicated in query.js for now, we should consolidated it.
  
  if (window.shouldFieldHavePurpleStylingBase) {
    return window.shouldFieldHavePurpleStylingBase(fieldName, window.displayedFields, window.activeFilters);
  }
  
  // Fallback implementation if base function not available
  const isDisplayed = window.displayedFields && window.displayedFields.some(f => window.getBaseFieldName(f) === window.getBaseFieldName(fieldName));
  const hasFilter = window.activeFilters && window.activeFilters[fieldName] && window.activeFilters[fieldName].filters.length > 0;
  return isDisplayed || hasFilter;
};

/* Create a custom grouped selector for options with the dash delimiter */
window.createGroupedSelector = function(values, isMultiSelect, currentValues = []) {
  // Create container
  const container = document.createElement('div');
  container.className = 'grouped-selector';
  container.id = 'condition-select-container';
  
  // Add search input (outside the scrollable area)
  const searchWrapper = document.createElement('div');
  searchWrapper.className = 'search-wrapper';
  
  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.className = 'search-input';
  searchInput.placeholder = 'Search options...';
  searchWrapper.appendChild(searchInput);
  
  container.appendChild(searchWrapper);
  
  // Create scrollable container for the grouped options
  const optionsContainer = document.createElement('div');
  optionsContainer.className = 'grouped-options-container';
  container.appendChild(optionsContainer);
  
  // Process values to handle both old format (string) and new format (objects with Name/RawValue)
  const processedValues = values.map(val => {
    if (typeof val === 'string') {
      // Old format - use the same value for both display and literal
      return { display: val, literal: val, raw: val };
    } else {
      // New format with Name, RawValue, and Description properties
      return { 
        ...val, 
        raw: val.Name, 
        display: val.Name, 
        literal: val.RawValue,
        description: val.Description || ''
      };
    }
  });
  
  // Build candidate groups by "prefix-..." and keep non-prefixed values ungrouped.
  const candidateGroups = new Map();
  const ungroupedValues = [];

  processedValues.forEach(val => {
    const displayText = (val.display || '').trim();
    const dashIndex = displayText.indexOf('-');
    const hasPrefixGroup = dashIndex > 0;
    if (!hasPrefixGroup) {
      ungroupedValues.push(val);
      return;
    }

    const groupName = displayText.slice(0, dashIndex).trim();
    if (!groupName) {
      ungroupedValues.push(val);
      return;
    }

    if (!candidateGroups.has(groupName)) candidateGroups.set(groupName, []);
    candidateGroups.get(groupName).push(val);
  });

  // Only keep true groups (2+ items). Singletons are flattened.
  const groupedData = new Map();
  candidateGroups.forEach((vals, name) => {
    if (vals.length > 1) {
      groupedData.set(name, vals);
    } else {
      ungroupedValues.push(vals[0]);
    }
  });

  // Group header + selection section
  const groupElements = []; // Store references for search functionality
  const flatOptionItems = [];

  function createOptionItem(val, groupName = '', stripPrefix = false) {
    const optionItem = document.createElement('div');
    optionItem.className = 'option-item';
    optionItem.dataset.group = groupName;
    optionItem.dataset.value = val.literal;
    optionItem.dataset.display = val.display;

    const input = document.createElement('input');
    input.type = isMultiSelect ? 'checkbox' : 'radio';
    input.name = 'condition-value';
    input.value = val.literal;
    input.dataset.value = val.literal;
    input.dataset.display = val.display;
    input.checked = currentValues.includes(val.literal);

    input.addEventListener('change', () => {
      if (isMultiSelect && groupName) {
        const groupOptions = optionsContainer.querySelectorAll(`.option-item[data-group="${groupName}"] input`);
        const allChecked = Array.from(groupOptions).every(opt => opt.checked);
        const groupCheckbox = optionsContainer.querySelector(`.group-checkbox[data-group="${groupName}"]`);
        if (groupCheckbox) groupCheckbox.checked = allChecked;
      }
    });

    const label = document.createElement('label');
    let displayText = val.display;
    if (stripPrefix && typeof displayText === 'string' && displayText.includes('-')) {
      displayText = displayText.split('-').slice(1).join('-').trim();
    }
    label.textContent = displayText;

    optionItem.appendChild(input);
    optionItem.appendChild(label);
    return optionItem;
  }

  for (const [groupName, groupValues] of groupedData) {
    const groupSection = document.createElement('div');
    groupSection.className = 'group-section';
    groupSection.dataset.group = groupName;
    
    const groupHeader = document.createElement('div');
    groupHeader.className = 'group-header';
    
    // Expand/collapse icon
    const toggleIcon = document.createElement('span');
    toggleIcon.className = 'toggle-icon';
    toggleIcon.innerHTML = '&#9656;'; // Right-pointing triangle
    groupHeader.appendChild(toggleIcon);
    
    // Group checkbox for selecting all items in a group
    if (isMultiSelect) {
      const groupCheckbox = document.createElement('input');
      groupCheckbox.type = 'checkbox';
      groupCheckbox.className = 'group-checkbox';
      groupCheckbox.dataset.group = groupName;
      
      // Check if all group items are selected by comparing literals
      const allSelected = groupValues.every(val => 
        currentValues.includes(val.literal)
      );
      groupCheckbox.checked = allSelected && groupValues.length > 0;
      
      // Handle group selection
      groupCheckbox.addEventListener('change', e => {
        const isChecked = e.target.checked;
        const options = groupSection.querySelectorAll(`.option-item[data-group="${groupName}"] input`);
        options.forEach(opt => {
          opt.checked = isChecked;
          // Trigger change to update internal state
          opt.dispatchEvent(new Event('change', { bubbles: true }));
        });
      });
      
      groupHeader.appendChild(groupCheckbox);
    }
    
    // Group label and count
    const groupLabel = document.createElement('span');
    groupLabel.className = 'group-label';
    groupLabel.textContent = `${groupName} (${groupValues.length})`;
    groupHeader.appendChild(groupLabel);
    
    groupSection.appendChild(groupHeader);
    
    // Group options
    const groupOptions = document.createElement('div');
    groupOptions.className = 'group-options collapsed';
    
    groupValues.forEach(val => {
      const optionItem = createOptionItem(val, groupName, true);
      groupOptions.appendChild(optionItem);
      flatOptionItems.push(optionItem);
    });
    
    groupSection.appendChild(groupOptions);
    optionsContainer.appendChild(groupSection);
    groupElements.push({ 
      section: groupSection, 
      header: groupHeader, 
      options: groupOptions, 
      values: groupValues 
    });
    
    // Toggle group expansion on header click
    groupHeader.addEventListener('click', e => {
      // Don't toggle if clicking the checkbox
      if (e.target.type === 'checkbox') return;
      
      groupOptions.classList.toggle('collapsed');
      toggleIcon.innerHTML = groupOptions.classList.contains('collapsed') ? '&#9656;' : '&#9662;';
    });
  }

  // Render ungrouped options as standalone rows (no synthetic "Other" group).
  ungroupedValues.forEach(val => {
    const optionItem = createOptionItem(val);
    optionItem.classList.add('ungrouped-option');
    optionsContainer.appendChild(optionItem);
    flatOptionItems.push(optionItem);
  });
  
  // Search functionality
  searchInput.addEventListener('input', e => {
    const searchTerm = e.target.value.toLowerCase().trim();
    
    if (searchTerm === '') {
      // Reset view when search is cleared
      groupElements.forEach(group => {
        group.section.style.display = '';
        group.options.classList.add('collapsed');
        group.header.querySelector('.toggle-icon').innerHTML = '&#9656;';
        
        // Reset all option items visibility
        Array.from(group.options.querySelectorAll('.option-item')).forEach(item => {
          item.style.display = '';
          // Remove any highlighting
          const label = item.querySelector('label');
          label.innerHTML = label.textContent;
        });
      });

      flatOptionItems.forEach(item => {
        item.style.display = '';
        const label = item.querySelector('label');
        label.innerHTML = label.textContent;
      });
    } else {
      groupElements.forEach(group => {
        let hasMatch = false;
        
        // Check each option in the group
        Array.from(group.options.querySelectorAll('.option-item')).forEach(item => {
          const value = item.dataset.value.toLowerCase();
          const display = item.dataset.display.toLowerCase();
          const label = item.querySelector('label');
          const displayText = label.textContent.toLowerCase();
          
          if (value.includes(searchTerm) || display.includes(searchTerm) || displayText.includes(searchTerm)) {
            item.style.display = '';
            hasMatch = true;
            
            // Highlight matching text
            const originalText = label.textContent;
            const regex = new RegExp(`(${searchTerm.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')})`, 'gi');
            label.innerHTML = originalText.replace(regex, '<span class="highlight">$1</span>');
          } else {
            item.style.display = 'none';
          }
        });
        
        // Show/hide the group based on matches
        group.section.style.display = hasMatch ? '' : 'none';
        
        // Expand group if it has matches
        if (hasMatch) {
          group.options.classList.remove('collapsed');
          group.header.querySelector('.toggle-icon').innerHTML = '&#9662;';
        }
      });

      flatOptionItems.forEach(item => {
        const value = item.dataset.value.toLowerCase();
        const display = item.dataset.display.toLowerCase();
        const label = item.querySelector('label');
        const displayText = label.textContent.toLowerCase();

        if (value.includes(searchTerm) || display.includes(searchTerm) || displayText.includes(searchTerm)) {
          item.style.display = '';
          const originalText = label.textContent;
          const regex = new RegExp(`(${searchTerm.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')})`, 'gi');
          label.innerHTML = originalText.replace(regex, '<span class="highlight">$1</span>');
        } else {
          item.style.display = 'none';
        }
      });
    }
  });
  
  // Helper method to get selected values (return literal values for JSON)
  container.getSelectedValues = function() {
    const selected = [];
    this.querySelectorAll('input[type="checkbox"]:checked, input[type="radio"]:checked').forEach(input => {
      if (input.dataset.value && !input.classList.contains('group-checkbox')) {
        selected.push(input.dataset.value);
      }
    });
    return selected;
  };
  
  // Helper method to get display values for UI
  container.getSelectedDisplayValues = function() {
    const selected = [];
    this.querySelectorAll('input[type="checkbox"]:checked, input[type="radio"]:checked').forEach(input => {
      if (input.dataset.display && !input.classList.contains('group-checkbox')) {
        selected.push(input.dataset.display);
      }
    });
    return selected;
  };
  
  // Expose method to set values (using literal values)
  container.setSelectedValues = function(values) {
    const valueSet = new Set(values);
    this.querySelectorAll('input[type="checkbox"], input[type="radio"]').forEach(input => {
      if (input.dataset.value) {
        input.checked = valueSet.has(input.dataset.value);
      }
    });
    
    // Update group checkboxes
    if (isMultiSelect) {
      groupedData.forEach((_, groupName) => {
        const groupOptions = this.querySelectorAll(`.option-item[data-group="${groupName}"] input`);
        const allChecked = Array.from(groupOptions).every(opt => opt.checked);
        const groupCheckbox = this.querySelector(`.group-checkbox[data-group="${groupName}"]`);
        if (groupCheckbox) {
          groupCheckbox.checked = allChecked && groupOptions.length > 0;
        }
      });
    }
  };
  
  return container;
};

// Add this helper function to show error messages with consistent styling and timeout
window.showError = function(message, inputElements = [], duration = 3000) {
  const errorLabel = document.getElementById('filter-error');
  
  // Add error styling to all provided input elements
  inputElements.forEach(inp => {
    if (inp) inp.classList.add('error');
  });
  
  // Display the error message
  if (errorLabel) {
    errorLabel.textContent = message;
    errorLabel.style.display = 'block';
  }
  
  // Clear the error after timeout
  setTimeout(() => {
    if (errorLabel) errorLabel.style.display = 'none';
    inputElements.forEach(inp => {
      if (inp) inp.classList.remove('error');
    });
  }, duration);
  
  return false; // Return false for easy return in validation functions
};

// Helper function to format duration in a comprehensive way
window.formatDuration = function(seconds) {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  
  const days = Math.floor(seconds / (24 * 60 * 60));
  const hours = Math.floor((seconds % (24 * 60 * 60)) / (60 * 60));
  const minutes = Math.floor((seconds % (60 * 60)) / 60);
  const remainingSeconds = seconds % 60;
  
  const parts = [];
  if (days > 0) parts.push(`${days} day${days !== 1 ? 's' : ''}`);
  if (hours > 0) parts.push(`${hours} hr${hours !== 1 ? 's' : ''}`);
  if (minutes > 0) parts.push(`${minutes} min`);
  if (remainingSeconds > 0 || parts.length === 0) parts.push(`${remainingSeconds} sec`);
  
  return parts.join(' ');
};

// FilterPill class moved to filterManager.js
