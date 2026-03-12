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

  const tableNameInput = document.getElementById('table-name-input');
  const tableName = tableNameInput ? tableNameInput.value.trim() : '';
  const hasName = tableName && tableName !== '';

  if(runBtn){
    try{
      const payload = window.buildBackendQueryPayload ? window.buildBackendQueryPayload(tableName) : null;
      const hasFields = !!(
        payload && (
          (Array.isArray(payload.display_fields) && payload.display_fields.length > 0) ||
          (Array.isArray(payload.special_fields) && payload.special_fields.length > 0)
        )
      );
      
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

  const cols = 12;
  const rows = 10;
  const xMin = 8;
  const yMin = 9;
  const xStep = 84 / (cols - 1);
  const yStep = 80 / (rows - 1);

  const colors = ['#22d3ee', '#38bdf8', '#34d399', '#facc15'];
  const segments = [];
  const segmentIndex = new Map();
  const usedNodes = new Map();
  const busRows = [randomInt(2, 3), randomInt(rows - 4, rows - 3)].sort((a, b) => a - b);
  const busCols = [randomInt(2, 3), randomInt(cols - 4, cols - 3)].sort((a, b) => a - b);
  const serviceRows = [1, rows - 2];

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

  function addSegment(a, b, options = {}) {
    if (!a || !b) return;
    if (a.key === b.key) return;
    if (a.col !== b.col && a.row !== b.row) return;

    const key = [a.key, b.key].sort().join('|');
    if (segmentIndex.has(key)) {
      const existing = segments[segmentIndex.get(key)];
      existing.width = Math.max(existing.width, options.width || 3);
      existing.pulseChance = Math.max(existing.pulseChance, options.pulseChance || 0);
      return;
    }

    segmentIndex.set(key, segments.length);
    segments.push({
      a,
      b,
      width: options.width || 3,
      pulseChance: options.pulseChance ?? 0.35
    });
    addNodeUsage(a);
    addNodeUsage(b);
  }

  function addPath(points, options = {}) {
    for (let i = 0; i < points.length - 1; i++) {
      addSegment(points[i], points[i + 1], options);
    }
  }

  function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function nearestValue(value, candidates) {
    return candidates.reduce((best, candidate) => {
      return Math.abs(candidate - value) < Math.abs(best - value) ? candidate : best;
    }, candidates[0]);
  }

  function routePadToNetwork(pad) {
    const padPoint = pad.point;

    if (pad.side === 'left' || pad.side === 'right') {
      const targetCol = pad.side === 'left' ? busCols[0] : busCols[busCols.length - 1];
      const targetRow = nearestValue(padPoint.row, busRows);
      addPath([
        padPoint,
        point(targetCol, padPoint.row),
        point(targetCol, targetRow)
      ], { width: 2, pulseChance: 0.22 });
      return;
    }

    const targetRow = pad.side === 'top' ? busRows[0] : busRows[busRows.length - 1];
    const targetCol = nearestValue(padPoint.col, busCols);
    addPath([
      padPoint,
      point(padPoint.col, targetRow),
      point(targetCol, targetRow)
    ], { width: 2, pulseChance: 0.2 });
  }

  function createChip(col, row, width, height) {
    const pads = [];

    const padRows = Array.from({ length: height }, (_, index) => row + index);
    const padCols = Array.from({ length: width }, (_, index) => col + index);

    if (col - 1 >= 1) {
      addSegment(point(col - 1, row), point(col - 1, row + height - 1), { width: 2, pulseChance: 0.12 });
      padRows.forEach(padRow => {
        const pad = { point: point(col - 1, padRow), side: 'left' };
        pads.push(pad);
        addNodeUsage(pad.point);
      });
    }

    if (col + width <= cols - 2) {
      addSegment(point(col + width, row), point(col + width, row + height - 1), { width: 2, pulseChance: 0.12 });
      padRows.forEach(padRow => {
        const pad = { point: point(col + width, padRow), side: 'right' };
        pads.push(pad);
        addNodeUsage(pad.point);
      });
    }

    if (Math.random() < 0.7 && row - 1 >= 1) {
      padCols.forEach((padCol, index) => {
        if (index !== 0 && index !== padCols.length - 1 && Math.random() < 0.45) return;
        const pad = { point: point(padCol, row - 1), side: 'top' };
        pads.push(pad);
        addNodeUsage(pad.point);
      });
    }

    if (Math.random() < 0.8 && row + height <= rows - 2) {
      padCols.forEach((padCol, index) => {
        if (index !== 0 && index !== padCols.length - 1 && Math.random() < 0.45) return;
        const pad = { point: point(padCol, row + height), side: 'bottom' };
        pads.push(pad);
        addNodeUsage(pad.point);
      });
    }

    pads
      .filter((_, index) => index % 2 === 0 || Math.random() < 0.28)
      .forEach(routePadToNetwork);
  }

  function createBottomConnectorBank() {
    const count = randomInt(5, 7);
    const startCol = randomInt(3, cols - count - 2);

    for (let index = 0; index < count; index++) {
      const col = startCol + index;

      const feedPoint = point(col, rows - 2);
      addNodeUsage(feedPoint);

      if (index % 2 === 0 || Math.random() < 0.4) {
        addPath([
          feedPoint,
          point(col, busRows[busRows.length - 1]),
          point(nearestValue(col, busCols), busRows[busRows.length - 1])
        ], { width: 2, pulseChance: 0.16 });
      }
    }
  }

  busRows.forEach(row => addSegment(point(1, row), point(cols - 2, row), { width: 4, pulseChance: 0.72 }));
  busCols.forEach(col => addSegment(point(col, 1), point(col, rows - 2), { width: 4, pulseChance: 0.64 }));
  serviceRows.forEach(row => addSegment(point(2, row), point(cols - 3, row), { width: 2, pulseChance: 0.14 }));

  const chipCandidates = [
    { col: randomInt(3, 4), row: randomInt(2, 3), width: randomInt(2, 3), height: randomInt(2, 3) },
    { col: randomInt(6, 7), row: randomInt(2, 4), width: randomInt(2, 3), height: randomInt(2, 3) },
    { col: randomInt(4, 6), row: randomInt(5, 6), width: 2, height: randomInt(2, 3), optional: true }
  ];

  chipCandidates.forEach(candidate => {
    if (candidate.optional && Math.random() < 0.45) return;
    createChip(candidate.col, candidate.row, candidate.width, candidate.height);
  });

  createBottomConnectorBank();

  for (let i = 0; i < randomInt(2, 4); i++) {
    const trunkCol = busCols[randomInt(0, busCols.length - 1)];
    const stubRow = nearestValue(randomInt(2, rows - 3), busRows);
    const direction = Math.random() < 0.5 ? -1 : 1;
    const endRow = Math.max(1, Math.min(rows - 2, stubRow + direction * randomInt(1, 2)));
    addSegment(point(trunkCol, stubRow), point(trunkCol, endRow), { width: 2, pulseChance: 0.14 });
  }

  for (let i = 0; i < randomInt(2, 3); i++) {
    const serviceRow = serviceRows[randomInt(0, serviceRows.length - 1)];
    const startCol = randomInt(2, cols - 4);
    const endCol = Math.min(cols - 3, startCol + randomInt(1, 2));
    addSegment(point(startCol, serviceRow), point(endCol, serviceRow), { width: 2, pulseChance: 0.12 });
  }

  segments.forEach(({ a, b, width, pulseChance }) => {
    const trace = document.createElement('div');
    trace.className = 'table-query-circuit-trace';

    const angle = a.row === b.row ? 0 : 90;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    const pulseDuration = Math.max(0.52, length / 26);
    const centerX = (a.x + b.x) / 2;
    const centerY = (a.y + b.y) / 2;
    const colorA = colors[Math.floor(Math.random() * colors.length)];
    const colorB = colors[Math.floor(Math.random() * colors.length)];

    trace.style.setProperty('--trace-angle', `${angle}deg`);
    trace.style.setProperty('--trace-len', `${length.toFixed(2)}%`);
    trace.style.setProperty('--trace-x', `${centerX.toFixed(2)}%`);
    trace.style.setProperty('--trace-y', `${centerY.toFixed(2)}%`);
    trace.style.setProperty('--trace-thickness', `${width}px`);
    trace.style.setProperty('--trace-color-a', colorA);
    trace.style.setProperty('--trace-color-b', colorB);
    trace.style.setProperty('--trace-flicker-delay', `${(-Math.random() * 3).toFixed(2)}s`);

    if (Math.random() < pulseChance) {
      const pulse = document.createElement('span');
      pulse.className = 'table-query-circuit-pulse';
      pulse.style.setProperty('--pulse-duration', `${pulseDuration.toFixed(2)}s`);
      pulse.style.setProperty('--pulse-delay', `${(-Math.random() * 1.6).toFixed(2)}s`);
      pulse.style.setProperty('--pulse-color', colorA);
      pulse.style.setProperty('--pulse-size', `${Math.max(7, width + 5)}px`);
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

  // Fade in the circuit effect shortly after the shape morph begins.
  setTimeout(() => {
    if (document.getElementById('table-query-circuit')) {
      document.getElementById('table-query-circuit').classList.add('active');
    }
  }, 120);
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

  const circuitFadeDuration = 220;
  const circuitFadeLead = 240;

  // Fade out the circuit effect fully, then leave a short beat before the table starts morphing back.
  if (circuit && circuit.classList.contains('active')) {
    circuit.classList.add('fading-out');
    circuit.classList.remove('active');
    setTimeout(() => {
      startExpansionMorph();
    }, circuitFadeDuration + circuitFadeLead);
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

function normalizeLogicalOperator(operator) {
  if (!operator) return 'And';
  const normalized = String(operator).trim().toLowerCase();
  return normalized === 'or' ? 'Or' : 'And';
}

window.mapFieldOperatorToUiCond = function(operator) {
  const normalized = String(operator || '').trim();
  switch (normalized) {
    case 'Equals':
    case 'equals':
    case '=':
      return 'equals';
    case 'DoesNotEqual':
    case 'does_not_equal':
    case 'doesnotequal':
    case '!=':
      return 'does_not_equal';
    case 'GreaterThan':
    case 'greater':
    case '>':
      return 'greater';
    case 'LessThan':
    case 'less':
    case '<':
      return 'less';
    case 'GreaterThanOrEqual':
    case 'greater_or_equal':
    case '>=':
      return 'greater_or_equal';
    case 'LessThanOrEqual':
    case 'less_or_equal':
    case '<=':
      return 'less_or_equal';
    case 'Contains':
    case 'contains':
      return 'contains';
    case 'DoesNotContain':
    case 'does_not_contain':
    case 'doesnotcontain':
      return 'doesnotcontain';
    case 'Between':
    case 'between':
      return 'between';
    case 'Before':
    case 'before':
      return 'before';
    case 'After':
    case 'after':
      return 'after';
    case 'OnOrBefore':
    case 'on_or_before':
      return 'on_or_before';
    case 'OnOrAfter':
    case 'on_or_after':
      return 'on_or_after';
    default:
      return normalized.toLowerCase();
  }
};

window.formatFieldOperatorForDisplay = function(operator) {
  const uiCond = window.mapFieldOperatorToUiCond(operator);
  switch (uiCond) {
    case 'equals':
      return '=';
    case 'does_not_equal':
      return '!=';
    case 'greater':
      return '>';
    case 'less':
      return '<';
    case 'greater_or_equal':
      return '>=';
    case 'less_or_equal':
      return '<=';
    case 'contains':
      return 'contains';
    case 'doesnotcontain':
      return 'does not contain';
    case 'between':
      return 'between';
    case 'before':
      return 'before';
    case 'after':
      return 'after';
    case 'on_or_before':
      return 'on or before';
    case 'on_or_after':
      return 'on or after';
    default:
      return String(operator || '');
  }
};

window.mapUiCondToFieldOperator = function(cond) {
  switch(cond){
    case 'greater':
    case 'after':
      return 'GreaterThan';
    case 'less':
    case 'before':
      return 'LessThan';
    case 'equals':
      return 'Equals';
    case 'does_not_equal':
    case 'doesnotequal':
      return 'DoesNotEqual';
    case 'greater_or_equal':
    case 'on_or_after':
      return 'GreaterThanOrEqual';
    case 'less_or_equal':
    case 'on_or_before':
      return 'LessThanOrEqual';
    case 'between':
      return 'Between';
    case 'contains':
    case 'starts':
    case 'starts_with':
      return 'Contains';
    case 'does_not_contain':
    case 'doesnotcontain':
      return 'DoesNotContain';
    default:
      return cond.charAt(0).toUpperCase() + cond.slice(1);
  }
};

function mapActiveFilterToBackend(condition, rawValue) {
  switch (condition) {
    case 'equals':
      return [{ operator: '=', value: rawValue }];
    case 'does_not_equal':
      return [{ operator: '!=', value: rawValue }];
    case 'greater':
    case 'after':
      return [{ operator: '>', value: rawValue }];
    case 'less':
    case 'before':
      return [{ operator: '<', value: rawValue }];
    case 'greater_or_equal':
    case 'on_or_after':
      return [{ operator: '>=', value: rawValue }];
    case 'less_or_equal':
    case 'on_or_before':
      return [{ operator: '<=', value: rawValue }];
    case 'starts':
    case 'starts_with':
      return [{ operator: '=', value: `${rawValue}*` }];
    case 'contains':
      return [{ operator: '=', value: `*${rawValue}*` }];
    case 'does_not_contain':
      return [{ operator: '!=', value: `*${rawValue}*` }];
    case 'between': {
      const parts = String(rawValue).split('|');
      if (parts.length >= 2) {
        return [
          { operator: '>=', value: parts[0] },
          { operator: '<=', value: parts[1] }
        ];
      }
      return [{ operator: '=', value: rawValue }];
    }
    default:
      return [{ operator: '=', value: rawValue }];
  }
}

window.getNormalizedDisplayedFields = function(fields = window.displayedFields) {
  return [...fields]
    .filter(field => {
      const def = window.fieldDefs ? window.fieldDefs.get(field) : null;
      return !(def && def.is_buildable);
    })
    .map(field => window.getBaseFieldName(field))
    .filter((field, index, array) => array.indexOf(field) === index);
};

window.buildQueryUiConfig = function() {
  const query = {
    DesiredColumnOrder: window.getNormalizedDisplayedFields(),
    FilterGroups: []
  };

  Object.entries(window.activeFilters).forEach(([field, data]) => {
    const fieldDef = window.fieldDefs ? window.fieldDefs.get(field) : null;
    if (fieldDef && fieldDef.is_buildable) return;

    const validFilters = (data.filters || []).filter(filter => filter.val !== '');
    if (validFilters.length === 0) return;

    query.FilterGroups.push({
      LogicalOperator: normalizeLogicalOperator(data.logical),
      Filters: validFilters.map(filter => ({
        FieldName: field,
        FieldOperator: window.mapUiCondToFieldOperator(filter.cond),
        Values: filter.cond === 'between' ? filter.val.split('|') : [filter.val]
      }))
    });
  });

  return query;
};

window.buildBackendQueryPayload = function(queryName = '') {
  const uiConfig = window.buildQueryUiConfig();
  const standardDisplayFields = [];
  const specialFields = [];

  window.displayedFields.forEach(field => {
    const fieldDef = window.fieldDefs ? window.fieldDefs.get(field) : null;
    if (fieldDef && fieldDef.special_payload) {
      const isDuplicate = specialFields.some(existing => JSON.stringify(existing) === JSON.stringify(fieldDef.special_payload));
      if (!isDuplicate) {
        specialFields.push(fieldDef.special_payload);
      }
      return;
    }

    const baseField = window.getBaseFieldName(field);
    if (!standardDisplayFields.includes(baseField)) {
      standardDisplayFields.push(baseField);
    }
  });

  const payload = {
    action: 'run',
    name: queryName || undefined,
    filters: [],
    display_fields: standardDisplayFields,
    special_fields: specialFields,
    ui_config: uiConfig
  };

  Object.entries(window.activeFilters).forEach(([fieldName, filterGroup]) => {
    (filterGroup?.filters || []).forEach(filter => {
      if (filter.val === '') return;

      mapActiveFilterToBackend(filter.cond, filter.val).forEach(({ operator, value }) => {
        payload.filters.push({
          field: fieldName,
          operator,
          value
        });
      });
    });
  });

  return payload;
};

/** Rebuild the query JSON and show it */
window.updateQueryJson = function(){
  const tableNameInput = document.getElementById('table-name-input');
  const queryName = tableNameInput ? tableNameInput.value.trim() : '';
  const payload = window.buildBackendQueryPayload(queryName);

  window.updateRunButtonIcon();

  const queryBox = window.DOM.queryBox;
  if(queryBox) queryBox.value = JSON.stringify(payload, null, 2);
  window.updateButtonStates();
};

/* ---------- Helper: map UI condition slugs to C# enum names ---------- */
const mapOperator = window.mapUiCondToFieldOperator;

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
