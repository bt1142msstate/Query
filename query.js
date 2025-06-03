// Field definitions loaded from fieldDefs.js

// DOM Elements
const overlay = document.getElementById('overlay');
const conditionPanel = document.getElementById('condition-panel');
const inputWrapper = document.getElementById('condition-input-wrapper');
const conditionInput = document.getElementById('condition-input');
const confirmBtn = document.getElementById('confirm-btn');
const runBtn = document.getElementById('run-query-btn');
const runIcon = document.getElementById('run-icon');
const stopIcon = document.getElementById('stop-icon');
const downloadBtn = document.getElementById('download-btn');
const queryBox = document.getElementById('query-json');
const queryInput = document.getElementById('query-input');
const clearSearchBtn = document.getElementById('clear-search-btn');

// State variables
let queryRunning = false;
let displayedFields = [];
let selectedField = '';
let totalRows = 0;          // total rows in #bubble-list
let scrollRow = 0;          // current top row (0-based)
let rowHeight = 0;          // computed once per render
let hoverScrollArea = false;  // true when cursor over bubbles or scrollbar
let currentCategory = 'All';

// Virtual scrolling state for table
let virtualTableData = [];
let visibleTableRows = 25;  // number of rows to show at once
let tableRowHeight = 42;    // estimated row height in pixels
let tableScrollTop = 0;
let tableScrollContainer = null;
let calculatedColumnWidths = {}; // Store calculated optimal widths for each column

// Data structures
const activeFilters = {};   // { fieldName: { logical:'And'|'Or', filters:[{cond,val},…] } }

// Global set to track which bubbles are animating back
const animatingBackBubbles = new Set();

// Add at the top with other state variables:
let isBubbleAnimating = false;

// Add at the top with other state variables:
let isInputLocked = false;
let inputLockTimeout = null;

// Add a full-screen overlay for pointer-events blocking
let inputBlockOverlay = document.getElementById('input-block-overlay');
if (!inputBlockOverlay) {
  inputBlockOverlay = document.createElement('div');
  inputBlockOverlay.id = 'input-block-overlay';
  inputBlockOverlay.style.position = 'fixed';
  inputBlockOverlay.style.top = '0';
  inputBlockOverlay.style.left = '0';
  inputBlockOverlay.style.width = '100vw';
  inputBlockOverlay.style.height = '100vh';
  inputBlockOverlay.style.zIndex = '99999';
  inputBlockOverlay.style.pointerEvents = 'none';
  inputBlockOverlay.style.background = 'rgba(0,0,0,0)';
  inputBlockOverlay.style.display = 'none';
  document.body.appendChild(inputBlockOverlay);
}
function lockInput(duration = 600) {
  isInputLocked = true;
  inputBlockOverlay.style.pointerEvents = 'all';
  inputBlockOverlay.style.display = 'block';
  if (inputLockTimeout) clearTimeout(inputLockTimeout);
  inputLockTimeout = setTimeout(() => {
    isInputLocked = false;
    inputBlockOverlay.style.pointerEvents = 'none';
    inputBlockOverlay.style.display = 'none';
  }, duration);
}

/* ===== Modal helpers for JSON / Queries panels ===== */
// Centralized modal panel IDs
const MODAL_PANEL_IDS = ['json-panel', 'queries-panel', 'help-panel', 'templates-panel', 'mobile-menu-dropdown'];


// Focus management helpers
function getFocusableElements(panel) {
  return panel.querySelectorAll(
    'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
  );
}

function trapFocus(panel) {
  const focusable = getFocusableElements(panel);
  if (!focusable.length) return;
  let first = focusable[0];
  let last = focusable[focusable.length - 1];
  panel.addEventListener('keydown', function(e) {
    if (e.key === 'Tab') {
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
  });
}

// Close a specific modal panel
function closeModal(panelId) {
  const panel = document.getElementById(panelId);
  if (!panel) return;
  panel.classList.add('hidden');
  panel.classList.remove('show'); // Ensure 'show' class is removed
  // If no other modal is open, hide overlay
  const anyOpen = MODAL_PANEL_IDS.some(id => {
    // Don't count the panel we just closed
    if (id === panelId) return false;
    const p = document.getElementById(id);
    // A panel is open if it's not hidden AND has the 'show' class
    return p && !p.classList.contains('hidden') && p.classList.contains('show');
  });
  if (!document.querySelector('.active-bubble') && !anyOpen) {
    overlay.classList.remove('show');
  }
}

// Consolidated desktop modal toggles
const panelToggles = {
  'toggle-json': 'json-panel',
  'toggle-queries': 'queries-panel',
  'toggle-help': 'help-panel',
  'toggle-templates': 'templates-panel'
};
Object.entries(panelToggles).forEach(([btnId, panelId]) => {
  document.getElementById(btnId)?.addEventListener('click', () => openModal(panelId));
});
document.querySelectorAll('.collapse-btn').forEach(btn=>{
  btn.addEventListener('click', () => closeModal(btn.dataset.target));
});
// Pressing Enter in any condition field = click Confirm
['condition-input','condition-input-2','condition-select'].forEach(id=>{
  const el=document.getElementById(id);
  if(el){
    el.addEventListener('keydown',e=>{
      if(e.key==='Enter'){
        e.preventDefault();
        confirmBtn.click();
      }
    });
  }
});

/* --- Run / Stop query toggle --- */
// queryRunning already declared at the top


// Update run and download button states together
function updateButtonStates(){
  if(runBtn){
    try{
      const q = JSON.parse(queryBox.value || '{}');
      const hasFields = Array.isArray(q.DesiredColumnOrder) && q.DesiredColumnOrder.length > 0;
      runBtn.disabled = !hasFields || queryRunning;
      runBtn.setAttribute('data-tooltip', queryRunning ? 'Stop Query' : 'Run Query');
    }catch{
      runBtn.disabled = true;
      runBtn.setAttribute('data-tooltip', 'Run Query');
    }
  }

  if(downloadBtn){
    const tableNameInput = document.getElementById('table-name-input');
    const tableName = tableNameInput ? tableNameInput.value.trim() : '';
    const hasData = displayedFields.length > 0 && virtualTableData.length > 0;
    const hasName = tableName && tableName !== '';

    // Add/remove error styling based on table name presence
    if (tableNameInput) {
      if (!hasName && hasData) {
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
}
// Initial check
updateButtonStates();

// Helper function to manage UI changes when a query starts/stops
function toggleQueryInterface(isQueryRunning) {
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
}

if(runBtn){
  runBtn.addEventListener('click', ()=>{
    if(runBtn.disabled) return;   // ignore when inactive
    
    // Show "not implemented yet" message
    const message = document.createElement('div');
    message.className = 'fixed bottom-4 right-4 bg-blue-100 border border-blue-500 text-blue-700 px-4 py-3 rounded-md shadow-lg z-50';
    message.innerHTML = `
      <div class="flex items-center gap-2">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
        </svg>
        <span>Query execution is not implemented yet</span>
      </div>
    `;
    document.body.appendChild(message);
    
    // Remove message after 3 seconds
    setTimeout(() => {
      message.style.opacity = '0';
      message.style.transition = 'opacity 0.5s ease';
      setTimeout(() => {
        if (document.body.contains(message)) {
          document.body.removeChild(message);
        }
      }, 500);
    }, 3000);
  });
}

// --- Condition templates by type ---
const typeConditions = {
  string: ['contains','starts','equals'],     // no "between" for plain strings
  number: ['greater','less','equals','between'],
  money : ['greater','less','equals','between'],
  date  : ['before','after','equals','between']
};

/* Re-position the input capsule so it keeps a constant gap above the condition buttons */
function positionInputWrapper(){
  if(!inputWrapper.classList.contains('show')) return;
  const panelRect   = conditionPanel.getBoundingClientRect();
  const wrapperRect = inputWrapper.getBoundingClientRect();
  const GAP = 12;                        // px gap between capsule and buttons
  const top = panelRect.top - wrapperRect.height - GAP;
  inputWrapper.style.top = `${top}px`;
}

/* ---------- Input helpers to avoid duplicated numeric-config blocks ---------- */
function setNumericProps(inputs, allowDecimal){
  inputs.forEach(inp=>{
    inp.setAttribute('inputmode', allowDecimal ? 'decimal' : 'numeric');
    inp.setAttribute('step', allowDecimal ? '0.01' : '1');
    inp.onkeypress = e=>{
      const regex = allowDecimal ? /[0-9.]/ : /[0-9]/;
      if(!regex.test(e.key)) e.preventDefault();
    };
  });
}
function clearNumericProps(inputs){
  inputs.forEach(inp=>{
    inp.removeAttribute('inputmode');
    inp.removeAttribute('step');
    inp.onkeypress = null;
  });
}
function configureInputsForType(type){
  const inp1 = document.getElementById('condition-input');
  const inp2 = document.getElementById('condition-input-2');
  const inputs=[inp1,inp2];
  const isMoney  = type==='money';
  const isNumber = type==='number';
  const htmlType = (type==='date') ? 'date' : (isMoney||isNumber) ? 'number':'text';
  inputs.forEach(inp=> inp.type = htmlType);

  if(isMoney){
    setNumericProps(inputs,true);
  }else if(isNumber){
    setNumericProps(inputs,false);
  }else{
    clearNumericProps(inputs);
  }
}
// --- visual anchor shown while dragging columns ---
const dropAnchor = document.createElement('div');
dropAnchor.className = 'drop-anchor';
document.body.appendChild(dropAnchor);

/* Unified helper to position the drop-anchor */
function positionDropAnchor(rect, table, clientX){
  // Both bubble insertion and column reordering use vertical anchors for consistency
  dropAnchor.classList.add('vertical');
  const insertLeft = (clientX - rect.left) < rect.width/2;
  
  // For virtual scrolling tables, use the container height instead of table height
  const tableContainer = table.closest('.overflow-x-auto.shadow.rounded-lg.mb-6.relative');
  const anchorHeight = tableContainer ? tableContainer.offsetHeight : table.offsetHeight;
  
  dropAnchor.style.width  = '4px';
  dropAnchor.style.height = anchorHeight + 'px';
  dropAnchor.style.left   = (insertLeft ? rect.left : rect.right) + window.scrollX - 2 + 'px';
  dropAnchor.style.top    = (tableContainer ? tableContainer.getBoundingClientRect().top : table.getBoundingClientRect().top) + window.scrollY + 'px';
  dropAnchor.style.display = 'block';
}

/* Hide drop-anchor helper to remove duplicate code */
function clearDropAnchor(){
  dropAnchor.classList.remove('vertical');
  dropAnchor.style.display = 'none';
}

// --- single trash icon that attaches to the hovered header ---
const headerTrash = document.createElement('span');
headerTrash.className = 'th-trash';
headerTrash.innerHTML = `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M9 3h6a1 1 0 0 1 1 1v1h4v2H4V5h4V4a1 1 0 0 1 1-1Zm-3 6h12l-.8 11.2A2 2 0 0 1 15.2 22H8.8a2 2 0 0 1-1.99-1.8L6 9Z"/>
  </svg>
`;
headerTrash.addEventListener('click', e => {
  e.stopPropagation();
  const th = dragDropManager.hoverTh;
  if (th) {
    const idx = parseInt(th.dataset.colIndex, 10);
    const table = th.closest('table');
    removeColumn(table, idx);
  }
});

// displayedFields, selectedField, and activeFilters are already declared at the top

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

/** Rebuild the query JSON and show it */
function updateQueryJson(){
  const query = {
    DesiredColumnOrder: [...displayedFields].filter(field => field !== 'Marc'),
    FilterGroups: [],
    GroupMethod: "ExpandIntoColumns" // Always include this
  };

  // Active filters → logical group per field
  Object.entries(activeFilters).forEach(([field,data])=>{
    // Skip the special Marc field itself
    if (field === 'Marc') return;
    
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

  // Add CustomFields for custom MARC fields (Marc###, but not 'Marc')
  const customMarcFields = fieldDefs
    .filter(f => /^Marc\d+$/.test(f.name))
    .map(f => ({
      FieldName: f.name,
      Tool: "prtentry", // Default, adjust if needed
      OutputFlag: "e",
      FilterFlag: "e",
      RawOutputSegments: 1,
      DataType: "string",
      RequiredEqualFilter: f.name.replace(/^Marc/, "")
    }));
  if (customMarcFields.length > 0) {
    query.CustomFields = customMarcFields;
  }

  if(queryBox) queryBox.value = JSON.stringify(query, null, 2);
  updateButtonStates();
}

// Helper function to check if a field should have purple styling
function shouldFieldHavePurpleStyling(fieldName) {
  return shouldFieldHavePurpleStylingBase(fieldName, displayedFields, activeFilters);
}

// Helper function to apply correct styling to a bubble element
function applyCorrectBubbleStyling(bubbleElement) {
  if (!bubbleElement) return;
  
  const fieldName = bubbleElement.textContent.trim();
  
  if (shouldFieldHavePurpleStyling(fieldName)) {
    bubbleElement.classList.add('bubble-filter');
    bubbleElement.setAttribute('data-filtered', 'true');
  } else {
    bubbleElement.classList.remove('bubble-filter');
    bubbleElement.removeAttribute('data-filtered');
  }
}

// Apply the helper to the resetActive function
function resetActive(){
  // Ensure input lock is always cleared
  isInputLocked = false;
  inputBlockOverlay.style.pointerEvents = 'none';
  inputBlockOverlay.style.display = 'none';
  if (inputLockTimeout) clearTimeout(inputLockTimeout);
  
  // For every floating clone, animate it back to its origin,
  // then restore the origin bubble's appearance when the animation ends.
  const clones = document.querySelectorAll('.active-bubble');
  if (clones.length > 0) isBubbleAnimatingBack = true;
  let bubblesToRemove = [];
  clones.forEach(clone=>{
    const origin = clone._origin;
    // Check if origin is still in the DOM
    const originInDOM = origin && document.body.contains(origin);
    if (originInDOM) {
      // Original bubble still exists - animate clone back to it
      const nowRect = origin.getBoundingClientRect();
      clone.style.top  = nowRect.top + 'px';
      clone.style.left = nowRect.left + 'px';
      // Hide the origin bubble so the clone can fully overlap it
      origin.style.opacity = '0';
      origin.style.visibility = 'hidden';
      // Track this field as animating back
      const fieldName = origin.textContent.trim();
      animatingBackBubbles.add(fieldName);
      // Start the reverse animation
      clone.classList.remove('enlarge-bubble');  // shrink first
      clone.classList.remove('active-bubble');   // then fly back
      clone.addEventListener('transitionend', ()=>{
        clone.remove();                          // remove clone after it snaps back
        // Remove from animating set
        animatingBackBubbles.delete(fieldName);
        // After animation, only update or remove the affected bubble
        requestAnimationFrame(() => {
          const bubbles = Array.from(document.querySelectorAll('.bubble'));
          bubbles.forEach(b => {
            if (b.textContent.trim() === fieldName) {
              // If the field is no longer present (e.g., filter removed), remove the bubble
              const stillExists = fieldDefs.some(d => d.name === fieldName) && shouldFieldHavePurpleStyling(fieldName);
              if (!stillExists && currentCategory === 'Selected') {
                b.remove();
              } else {
              b.style.visibility = '';
              b.style.opacity = '1';
              b.classList.remove('bubble-disabled');
              applyCorrectBubbleStyling(b);
              }
            }
          });
        });
        // If all animations are done, allow rendering if needed
        if (animatingBackBubbles.size === 0) {
          isBubbleAnimatingBack = false;
          if (pendingRenderBubbles) {
            renderBubbles();
            pendingRenderBubbles = false;
          }
        }
      }, { once:true });
    } else {
      // Origin bubble is gone - just remove the clone immediately without animating
      clone.remove();
      // Try to find a bubble with matching text to enable if needed
      if (origin) {
        const fieldName = origin.textContent.trim();
        animatingBackBubbles.delete(fieldName);
        const matchingBubble = Array.from(document.querySelectorAll('.bubble'))
          .find(b => b.textContent.trim() === fieldName);
        if (matchingBubble) {
          // If the field is no longer present, remove the bubble
          const stillExists = fieldDefs.some(d => d.name === fieldName) && shouldFieldHavePurpleStyling(fieldName);
          if (!stillExists && currentCategory === 'Selected') {
            matchingBubble.remove();
          } else {
          matchingBubble.style.opacity = '';
          matchingBubble.classList.remove('bubble-disabled');
          applyCorrectBubbleStyling(matchingBubble);
          }
        }
      }
      // If all animations are done, allow rendering if needed
      if (animatingBackBubbles.size === 0) {
        isBubbleAnimatingBack = false;
        if (pendingRenderBubbles) {
          renderBubbles();
          pendingRenderBubbles = false;
        }
      }
    }
  });
  // After all clones are removed and origin restored, re-enable bubble interaction
  setTimeout(() => {
    if (clones.length === 0) {
      isBubbleAnimatingBack = false;
      safeRenderBubbles();
    }
  }, 0);
}

overlay.addEventListener('click',()=>{ // Keep this, but simplify its body
  closeAllModals(); // This will hide overlay and all panels with 'hidden' and remove 'show'
  resetActive(); // Handles bubble animations and state

  // Close non-modal UI elements (condition panel, input wrapper)
  conditionPanel.classList.remove('show');
  inputWrapper.classList.remove('show');
  
  // Remove all .active from condition buttons
  const btns = conditionPanel.querySelectorAll('.condition-btn');
  btns.forEach(b=>b.classList.remove('active'));
  conditionInput.value='';

  // Hide select if present
  const sel = document.getElementById('condition-select');
  if(sel) sel.style.display = 'none';

  // After closing overlay, re-enable bubble interaction
  setTimeout(() => safeRenderBubbles(), 0);
  overlay.classList.remove('bubble-active');
  const headerBar = document.getElementById('header-bar');
  if (headerBar) headerBar.classList.remove('header-hide');
});

// Handler for dynamic/static condition buttons
function conditionBtnHandler(e){
  e.stopPropagation();
  const btn = e.currentTarget;
  const all = conditionPanel.querySelectorAll('.condition-btn');
  all.forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  const cond = btn.dataset.cond;

  if(cond === 'show' || cond === 'hide'){
    if(selectedField){
      if(cond === 'show' && !displayedFields.includes(selectedField)){
        displayedFields.push(selectedField);
      }else if(cond === 'hide' && displayedFields.includes(selectedField)){
        const idx = displayedFields.indexOf(selectedField);
        displayedFields.splice(idx,1);
      }
      showExampleTable(displayedFields);
      
      // Update the show/hide button states after the operation
      const toggleButtons = conditionPanel.querySelectorAll('.toggle-half');
      toggleButtons.forEach(toggleBtn => {
        toggleBtn.classList.remove('active');
        const toggleCond = toggleBtn.dataset.cond;
        if(toggleCond === 'show' && displayedFields.includes(selectedField)){
          toggleBtn.classList.add('active');
        } else if(toggleCond === 'hide' && !displayedFields.includes(selectedField)){
          toggleBtn.classList.add('active');
        }
      });
    }
    // Don't close the enlarged bubble for show/hide operations
    // Allow user to continue interacting with the bubble
    return;
  }
  // Show second input and "and" label only for "between"
  const second = document.getElementById('condition-input-2');
  const betweenLbl = document.getElementById('between-label');
  if(cond === 'between'){
    second.style.display = 'block';
    betweenLbl.style.display = 'inline';
    second.type = conditionInput.type;     // match type (date, number, text)
  }else{
    second.style.display = 'none';
    betweenLbl.style.display = 'none';
  }
  inputWrapper.classList.add('show');
  positionInputWrapper();
  // Show input or select depending on which is visible
  const sel = document.getElementById('condition-select');
  if(sel && sel.style.display !== 'none'){
    sel.focus();
  }else{
    (cond === 'between' ? second : conditionInput).focus();
  }
  // Re-position after toggling second input visibility
  positionInputWrapper();
}

// Remove static conditionBtns handler and attach to dynamic buttons only
// (No static .condition-btn in markup anymore)

/* ---------- Check for contradiction & return human-readable reason ---------- */
function getContradictionMessage(existing, newF, fieldType, fieldLabel){
  if(!existing || existing.logical !== 'And') return null;

  const toNum = v=>{
    if(fieldType === 'date'){
      return new Date(v).getTime();
    }
    return parseFloat(v);
  };
  const parseVals = f => (f.cond === 'between')
    ? f.val.split('|').map(v=>v.trim())
    : [f.val.trim()];

  const numericVals = f => parseVals(f).map(toNum);

  /* build a human-readable phrase like "equal 5", "be greater than 10", etc. */
  const phrase = f=>{
    const vals = parseVals(f);
    switch(f.cond){
      case 'equals':  return `equal ${vals[0]}`;
      case 'contains':return `contain ${vals[0]}`;
      case 'starts':  return `start with ${vals[0]}`;
      case 'doesnotcontain': return `not contain ${vals[0]}`;
      case 'greater': return `be greater than ${vals[0]}`;
      case 'less':    return `be less than ${vals[0]}`;
      case 'between': return `be between ${vals[0]} and ${vals[1]}`;
      case 'before':  return `be before ${vals[0]}`;
      case 'after':   return `be after ${vals[0]}`;
      default:        return `${f.cond} ${vals.join(' and ')}`;
    }
  };

  const nLabel = phrase(newF);
  const nVals  = numericVals(newF);
  const nLow   = Math.min(...nVals);
  const nHigh  = Math.max(...nVals);

  for(const f of existing.filters){
    const fLabel = phrase(f);
    const fVals  = numericVals(f);
    const low    = Math.min(...fVals);
    const high   = Math.max(...fVals);

    /* Helper to produce final message */
    const msg = `${fieldLabel} cannot ${nLabel} and ${fLabel}`;

    // Equals conflicts
    if(newF.cond === 'equals'){
      if(f.cond === 'equals'     && nVals[0] !== fVals[0]) return msg;
      if(f.cond === 'greater'    && nVals[0] <= fVals[0])  return msg;
      if(f.cond === 'less'       && nVals[0] >= fVals[0])  return msg;
      if(f.cond === 'between'    && (nVals[0] < low || nVals[0] > high)) return msg;
    }
    if(f.cond === 'equals'){
      if(newF.cond === 'greater' && fVals[0] <= nVals[0])  return msg;
      if(newF.cond === 'less'    && fVals[0] >= nVals[0])  return msg;
      if(newF.cond === 'between' && (fVals[0] < nLow || fVals[0] > nHigh)) return msg;
    }

    // Greater / Less conflicts
    if(newF.cond === 'greater'){
      if(f.cond === 'less'   && nVals[0] >= fVals[0]) return msg;
      if(f.cond === 'between'&& nVals[0] >= high)     return msg;
    }
    if(newF.cond === 'less'){
      if(f.cond === 'greater'&& nVals[0] <= fVals[0]) return msg;
      if(f.cond === 'between'&& nVals[0] <= low)      return msg;
    }
    if(newF.cond === 'between'){
      if(f.cond === 'greater'&& nHigh <= fVals[0]) return msg;
      if(f.cond === 'less'   && nLow  >= fVals[0]) return msg;
      if(f.cond === 'between'&& (high < nLow || low > nHigh)) return msg;
    }
  }
  return null;
}

/* Create a custom grouped selector for options with the dash delimiter */
function createGroupedSelector(values, isMultiSelect, currentValues = []) {
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
  
  // Extract groups (prefixes before dash)
  const groups = new Map();
  processedValues.forEach(val => {
    const displayText = val.display;
    const parts = displayText.split('-');
    if (parts.length > 1) {
      const groupName = parts[0];
      if (!groups.has(groupName)) {
        groups.set(groupName, []);
      }
      groups.get(groupName).push(val);
    } else {
      // Handle values without dash
      if (!groups.has('Other')) {
        groups.set('Other', []);
      }
      groups.get('Other').push(val);
    }
  });
  
  // Group header + selection section
  const groupElements = []; // Store references to groups for search functionality
  
  for (const [groupName, groupValues] of groups) {
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
      
      // For radio buttons and checkboxes, handle the change event
      input.addEventListener('change', () => {
        // Update group checkbox if all items in group are checked
        if (isMultiSelect) {
          const groupOptions = groupSection.querySelectorAll(`.option-item[data-group="${groupName}"] input`);
          const allChecked = Array.from(groupOptions).every(opt => opt.checked);
          groupSection.querySelector(`.group-checkbox[data-group="${groupName}"]`).checked = allChecked;
        }
      });
      
      const label = document.createElement('label');
      // Show only the part after the dash or the full display text if no dash
      const displayText = val.display.includes('-') ? val.display.split('-')[1] : val.display;
      label.textContent = displayText;
      
      optionItem.appendChild(input);
      optionItem.appendChild(label);
      groupOptions.appendChild(optionItem);
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
    } else {
      groupElements.forEach(group => {
        let hasMatch = false;
        const matchingItems = [];
        
        // Check each option in the group
        Array.from(group.options.querySelectorAll('.option-item')).forEach(item => {
          const value = item.dataset.value.toLowerCase();
          const display = item.dataset.display.toLowerCase();
          const label = item.querySelector('label');
          const displayText = label.textContent.toLowerCase();
          
          if (value.includes(searchTerm) || display.includes(searchTerm) || displayText.includes(searchTerm)) {
            item.style.display = '';
            matchingItems.push(item);
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
      groups.forEach((_, groupName) => {
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
}

// Add this helper function to show error messages with consistent styling and timeout
function showError(message, inputElements = [], duration = 3000) {
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
}

// Helper function to finalize actions after confirm button is clicked
function finalizeConfirmAction() {
  updateQueryJson();
  // Clear specific inputs if they exist and were used
  const condInput2 = document.getElementById('condition-input-2');
  if (condInput2) condInput2.value = '';

  const marcInput = document.getElementById('marc-field-input');
  if (marcInput) marcInput.value = '';

  overlay.click(); // This handles most UI reset including generic inputs, and calls safeRenderBubbles via resetActive
  updateCategoryCounts(); // This is data-dependent and needs to be explicit
}

confirmBtn.addEventListener('click', e => {
  e.stopPropagation();
  const bubble = document.querySelector('.active-bubble');
  if (!bubble) return;

  const field = bubble.dataset.filterFor || bubble.textContent.trim();
  const cond = document.querySelector('.condition-btn.active')?.dataset.cond;
  const val = conditionInput.value.trim();
  const val2 = document.getElementById('condition-input-2').value.trim();
  const sel = document.getElementById('condition-select');
  const selContainer = document.getElementById('condition-select-container');
  const fieldDef = fieldDefs.find(f => f.name === field);
  const isSpecialMarc = fieldDef && fieldDef.isSpecialMarc;

  if (isSpecialMarc) {
    const marcInput = document.getElementById('marc-field-input');
    const marcNumbersRaw = marcInput?.value?.trim();
    if (!marcNumbersRaw) {
      return showError('Please enter at least one Marc field number', [marcInput]);
    }
    const marcNumbers = marcNumbersRaw.split(',').map(s => s.trim()).filter(s => /^\d{1,3}$/.test(s));
    if (marcNumbers.length === 0) {
      return showError('Please enter valid Marc field numbers (1-3 digits, comma separated)', [marcInput]);
    }
    let firstMarcField = null;
    marcNumbers.forEach((marcNumber, idx) => {
      const dynamicMarcField = `Marc${marcNumber}`;
      if (dynamicMarcField === 'Marc') return; 
      if (!fieldDefs.some(f => f.name === dynamicMarcField)) {
        const newDef = {
          name: dynamicMarcField,
          type: 'string',
          category: 'Marc',
          desc: `MARC ${marcNumber} field`
        };
        fieldDefs.push(newDef);
        filteredDefs.push({ ...newDef });
      }
      if (!displayedFields.includes(dynamicMarcField)) {
        displayedFields.push(dynamicMarcField);
        showExampleTable(displayedFields);
      }
      if (idx === 0 && cond && val) {
        if (!activeFilters[dynamicMarcField]) {
          activeFilters[dynamicMarcField] = { logical: 'And', filters: [] };
        }
        const alreadyExists = activeFilters[dynamicMarcField].filters.some(f => f.cond === cond && f.val === val);
        if (!alreadyExists) {
          activeFilters[dynamicMarcField].filters.push({ cond, val });
        }
      }
      if (!firstMarcField) firstMarcField = dynamicMarcField;
      const bubblesList = document.getElementById('bubble-list');
      if (bubblesList) {
        const existingBubble = Array.from(bubblesList.children).find(b => b.textContent.trim() === dynamicMarcField);
        if (!existingBubble) {
          const div = document.createElement('div');
          div.className = 'bubble';
          div.setAttribute('draggable', dynamicMarcField === 'Marc' ? 'false' : 'true');
          div.tabIndex = 0;
          div.textContent = dynamicMarcField;
          div.dataset.type = 'string';
          bubblesList.appendChild(div);
        }
      }
    });
    if (activeFilters['Marc']) delete activeFilters['Marc'];
    currentCategory = 'Marc';
    document.querySelectorAll('#category-bar .category-btn').forEach(btn =>
      btn.classList.toggle('active', btn.dataset.category === 'Marc')
    );
  } else {
    const isMultiSelect = fieldDef && fieldDef.multiSelect;
    if (cond && cond !== 'display') {
      const tintInputs = [conditionInput, document.getElementById('condition-input-2')];
      if (cond === 'between' && (val === '' || val2 === '')) {
        showError('Please enter both values', tintInputs);
        return;
      }
      if (cond !== 'between') {
        const isTextInputVisible = conditionInput.style.display !== 'none';
        const isTextInputEmpty = val === '';
        const isSelectVisible = sel && sel.style.display !== 'none';
        const isSelectEmpty = isSelectVisible && sel.value === '';
        const isContainerVisible = selContainer && selContainer.style.display !== 'none';
        const isContainerEmpty = isContainerVisible && selContainer.getSelectedValues().length === 0;
        if ((isTextInputVisible && isTextInputEmpty) ||
          (isSelectVisible && isSelectEmpty) ||
          (isContainerVisible && isContainerEmpty)) {
          showError('Please enter a value', tintInputs);
          return;
        }
      }
    }
    if (cond === 'between') {
      const type = bubble.dataset.type || 'string';
      let a = val, b = val2;
      if (type === 'number' || type === 'money') {
        a = parseFloat(a); b = parseFloat(b);
      } else if (type === 'date') {
        a = new Date(a).getTime(); b = new Date(b).getTime();
      }
      if (a === b) {
        showError('Between values must be different', [conditionInput, document.getElementById('condition-input-2')]);
        return;
      }
      if (a > b) {
        conditionInput.value = val2;
        document.getElementById('condition-input-2').value = val;
        val = conditionInput.value.trim();
        val2 = document.getElementById('condition-input-2').value.trim();
      }
    }
    if (cond && cond !== 'display') {
      try {
        if (!activeFilters[field]) {
          activeFilters[field] = { logical: 'And', filters: [] };
        }
        const isTextInputVisible = conditionInput.style.display !== 'none';
        const isSelectVisible = sel && sel.style.display !== 'none';
        const isContainerVisible = selContainer && selContainer.style.display !== 'none';
        let filterValue = val;
        if (cond === 'between') {
          filterValue = `${val}|${val2}`;
        } else if (isContainerVisible && selContainer) {
          filterValue = selContainer.getSelectedValues().join(',');
        } else if (isSelectVisible && sel) {
          if (sel.multiple) {
            filterValue = Array.from(sel.selectedOptions).map(o => o.value).join(',');
          } else {
            filterValue = sel.value;
          }
        }
        const fieldType = bubble.dataset.type || 'string';
        const newFilterObj = { cond, val: filterValue };
        const existingSet = activeFilters[field];
        const conflictMsg = getContradictionMessage(existingSet, newFilterObj, fieldType, field);
        if (conflictMsg) {
          showError(conflictMsg, [conditionInput, document.getElementById('condition-input-2')]);
          return;
        }
        if (filterValue !== '') {
          console.log(`Applying filter for ${field}: ${cond} ${filterValue}`);
          if (isMultiSelect && cond === 'equals') {
            const existingEqualsIdx = activeFilters[field].filters.findIndex(f => f.cond === 'equals');
            if (existingEqualsIdx !== -1) {
              const existingVals = activeFilters[field].filters[existingEqualsIdx].val.split(',');
              const newVals = filterValue.split(',');
              const uniqueVals = [...new Set([...existingVals, ...newVals])];
              activeFilters[field].filters[existingEqualsIdx].val = uniqueVals.join(',');
              console.log(`Updated multiselect filter for ${field} with values: ${uniqueVals.join(',')}`);
            } else {
              activeFilters[field].filters.push({ cond, val: filterValue });
            }
          } else {
            activeFilters[field].filters.push({ cond, val: filterValue });
          }
          document.querySelectorAll('.bubble').forEach(b => {
            if (b.textContent.trim() === field) {
              applyCorrectBubbleStyling(b);
            }
          });
          renderConditionList(field);
          if (currentCategory === 'Selected') {
            safeRenderBubbles();
          }
        }
      } catch (error) {
        console.error('Error applying filter:', error);
        showError('Error applying filter: ' + error.message, []);
        return;
      }
    }
    if (cond === 'display' || cond === 'show' || cond === 'hide') {
      if (cond === 'show' && !displayedFields.includes(field)) {
        displayedFields.push(field);
        showExampleTable(displayedFields);
      } else if ((cond === 'hide' || cond === 'display') && displayedFields.includes(field)) {
        const idx = displayedFields.indexOf(field);
        displayedFields.splice(idx, 1);
        showExampleTable(displayedFields);
      }
    }
  }
  finalizeConfirmAction();
});

document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&overlay.classList.contains('show')){overlay.click();return;}
  // Bubble-grid scroll: allow ArrowUp/Down and W/S as aliases when hovering grid/scrollbar
  if(!hoverScrollArea) return;
  // Category navigation: ArrowLeft / ArrowRight or A / D keys when hovering the bubble area
  const rightPressed = e.key === 'ArrowRight' || e.key.toLowerCase() === 'd';
  const leftPressed  = e.key === 'ArrowLeft'  || e.key.toLowerCase() === 'a';
  if (rightPressed || leftPressed) {
    // Prevent navigation if overlay is shown or a bubble is enlarged
    if (overlay.classList.contains('show') || document.querySelector('.active-bubble')) return;
    
    // Get visible category buttons from the DOM
    const visibleCatButtons = Array.from(document.querySelectorAll('#category-bar .category-btn'));
    if (visibleCatButtons.length === 0) return;
    
    // Find the currently active button
    const activeButtonIndex = visibleCatButtons.findIndex(btn => 
      btn.classList.contains('active')
    );
    
    // Calculate the new button index
    let newButtonIndex;
    if (activeButtonIndex === -1) {
      // No active button, start from beginning or end
      newButtonIndex = rightPressed ? 0 : visibleCatButtons.length - 1;
    } else {
      // Move from current position
      newButtonIndex = activeButtonIndex + (rightPressed ? 1 : -1);
      // Wrap around if needed
      if (newButtonIndex < 0) newButtonIndex = visibleCatButtons.length - 1;
      if (newButtonIndex >= visibleCatButtons.length) newButtonIndex = 0;
    }
    
    // Get the category from the new button
    const newCategory = visibleCatButtons[newButtonIndex].dataset.category;
    
    // Update current category
    currentCategory = newCategory;
    
    // Update UI
    visibleCatButtons.forEach(btn => 
      btn.classList.toggle('active', btn.dataset.category === currentCategory)
    );
    
    // Reset scroll position and re-render bubbles
    scrollRow = 0;
    safeRenderBubbles();
    return; // consume event
  }
  const downPressed = e.key === 'ArrowDown' || e.key.toLowerCase() === 's';
  const upPressed   = e.key === 'ArrowUp'   || e.key.toLowerCase() === 'w';
  const rowsVisible = 2;
  const maxStartRow = Math.max(0, totalRows - rowsVisible);
  if(downPressed && scrollRow < maxStartRow){
    scrollRow++;
  }else if(upPressed && scrollRow > 0){
    scrollRow--;
  }else{
    return;   // no change
  }
  document.getElementById('bubble-list').style.transform =
    `translateY(-${scrollRow * rowHeight}px)`;
  updateScrollBar();
});

/* ---------- Field definitions: name, type, optional values, optional filters ---------- */
// Now imported from fieldDefs.js

// Helper function to check if a field should have purple styling (wrapper for imported function)
function shouldFieldHavePurpleStyling(fieldName) {
  return shouldFieldHavePurpleStylingBase(fieldName, displayedFields, activeFilters);
}

// ... existing code ...

// Bubble UI component class
class Bubble {
  constructor(def, state = {}) {
    this.def = def;
    this.state = state;
    this.el = document.createElement('div');
    this.el.className = 'bubble';
    this.el.tabIndex = 0;
    this.update();
  }

  update(state = {}) {
    Object.assign(this.state, state);
    const { def } = this;
    const fieldName = def.name;
    this.el.textContent = fieldName;
    this.el.dataset.type = def.type;
    if (def.values) this.el.dataset.values = JSON.stringify(def.values);
    if (def.filters) this.el.dataset.filters = JSON.stringify(def.filters);
    // Tooltip: description + filters (if any)
    let tooltip = def.desc || '';
    // Build a fake FilterGroups array for this field from activeFilters
    const af = activeFilters[fieldName];
    let filterTooltip = '';
    if (af && af.filters && af.filters.length > 0) {
      const fakeGroup = [{
        Filters: af.filters.map(f => ({
          FieldName: fieldName,
          FieldOperator: mapOperator(f.cond),
          Values: f.cond === 'between' ? f.val.split('|') : f.val.split(',')
        }))
      }];
      filterTooltip = formatFiltersTooltip(fieldName, fakeGroup);
    }
    if (filterTooltip) {
      tooltip += (tooltip ? '\n\u2014\n' : '');
      tooltip += filterTooltip;
    }
    if (tooltip) {
      this.el.setAttribute('data-tooltip', tooltip);
    } else {
      this.el.removeAttribute('data-tooltip');
    }
    if (def.isSpecialMarc || displayedFields.includes(fieldName)) {
      this.el.setAttribute('draggable', 'false');
    } else {
      this.el.setAttribute('draggable', 'true');
    }
    if (animatingBackBubbles.has(fieldName)) {
      this.el.dataset.animatingBack = 'true';
      this.el.style.visibility = 'hidden';
      this.el.style.opacity = '0';
    } else {
      this.el.style.visibility = '';
      this.el.style.opacity = '';
      this.el.removeAttribute('data-animating-back');
    }
    applyCorrectBubbleStyling(this.el);
  }

  getElement() {
    return this.el;
  }
}

// Refactor createOrUpdateBubble to use Bubble class
function createOrUpdateBubble(def, existingBubble = null) {
  let bubbleInstance;
  if (existingBubble && existingBubble._bubbleInstance) {
    bubbleInstance = existingBubble._bubbleInstance;
    bubbleInstance.update();
    return bubbleInstance.getElement();
  } else {
    bubbleInstance = new Bubble(def);
    const el = bubbleInstance.getElement();
    el._bubbleInstance = bubbleInstance;
    return el;
  }
}

// Refactor renderBubbles to use Bubble class (via createOrUpdateBubble)
function renderBubbles(){
  const container = document.getElementById('bubble-container');
  const listDiv   = document.getElementById('bubble-list');
  if(!container || !listDiv) return;

  // Apply category + search filter
  let list;
  if (currentCategory === 'All') {
    list = filteredDefs;
  } else if (currentCategory === 'Selected') {
    const displayedSet = new Set(displayedFields);
    const filteredSelected = filteredDefs.filter(d => shouldFieldHavePurpleStyling(d.name));
    let orderedList = displayedFields
      .map(name => filteredSelected.find(d => d.name === name))
      .filter(Boolean);
    filteredSelected.forEach(d => {
      if (!displayedSet.has(d.name) && !orderedList.includes(d)) {
        orderedList.push(d);
      }
    });
    list = orderedList;
  } else {
    list = filteredDefs.filter(d => {
      const cat = d.category;
      return Array.isArray(cat) ? cat.includes(currentCategory) : cat === currentCategory;
    });
  }

  // If we're in Selected category, preserve existing bubbles
  if (currentCategory === 'Selected') {
    const existingBubbles = Array.from(listDiv.children);
    const existingBubbleMap = new Map(existingBubbles.map(b => [b.textContent.trim(), b]));
    listDiv.innerHTML = '';
    list.forEach(def => {
      const existingBubble = existingBubbleMap.get(def.name);
      const bubbleEl = createOrUpdateBubble(def, existingBubble);
      listDiv.appendChild(bubbleEl);
    });
  } else {
    listDiv.innerHTML = '';
    list.forEach(def => {
      const bubbleEl = createOrUpdateBubble(def);
      listDiv.appendChild(bubbleEl);
    });
  }

  // --- Dimension calc on first bubble ---
  const firstBubble = listDiv.querySelector('.bubble');
  if(firstBubble){
    const gapVal = getComputedStyle(listDiv).getPropertyValue('gap') || '0px';
    const gap = parseFloat(gapVal) || 0;
    rowHeight  = firstBubble.getBoundingClientRect().height + gap;
    const bubbleW = firstBubble.offsetWidth;
    const rowsVisible = 2;
    const twoRowsH = rowHeight * rowsVisible - gap;
    const sixColsW = bubbleW * 6 + gap * 5;
    const fudge   = 8;
    const paddedH = twoRowsH + 12 - fudge;
    const paddedW = sixColsW + 8;
    container.style.height = paddedH + 'px';
    container.style.width  = paddedW + 'px';
    const scrollCont = document.querySelector('.bubble-scrollbar-container');
    if (scrollCont) scrollCont.style.height = paddedH + 'px';
    totalRows  = Math.ceil(list.length / 6);
    if(scrollRow > totalRows - rowsVisible) scrollRow = Math.max(0, totalRows - rowsVisible);
    listDiv.style.transform = `translateY(-${scrollRow * rowHeight}px)`;
    updateScrollBar();
  }
  Array.from(listDiv.children).forEach(bubble => {
    const fieldName = bubble.textContent.trim();
    if (animatingBackBubbles.has(fieldName)) {
      bubble.style.visibility = 'hidden';
      bubble.style.opacity = '0';
    } else {
      bubble.style.visibility = '';
      bubble.style.opacity = '';
    }
  });
}

// --- Keep bubble scrollbar height in sync on window resize ---
window.addEventListener('resize', () => {
  const container = document.getElementById('bubble-container');
  const listDiv   = document.getElementById('bubble-list');
  const scrollCont= document.querySelector('.bubble-scrollbar-container');
  if (!container || !listDiv || !scrollCont) return;
  const firstBubble = listDiv.querySelector('.bubble');
  if (!firstBubble) return;
  const gapVal = getComputedStyle(listDiv).getPropertyValue('gap') || '0px';
  const gap    = parseFloat(gapVal) || 0;
  const fudge = 8;
  const twoRowsH = (firstBubble.getBoundingClientRect().height + gap) * 2 - gap;
  const paddedH  = twoRowsH + 12 - fudge;     // match render logic
  const sixColsW = firstBubble.offsetWidth * 6 + gap * 5;
  container.style.height = paddedH + 'px';
  container.style.width  = sixColsW  + 'px';
  scrollCont.style.height = paddedH + 'px';
  updateScrollBar();
});

// Also reposition the condition input wrapper on window resize
window.addEventListener('resize', positionInputWrapper);


function updateScrollBar(){
  /* Hide scrollbar container entirely when no scrolling is needed */
  const scrollbarContainer = document.querySelector('.bubble-scrollbar-container');
  if(scrollbarContainer){
    const needScroll = totalRows > 2;   // rowsVisible = 2
    scrollbarContainer.style.display = needScroll ? 'block' : 'none';
  }

  const track = document.getElementById('bubble-scrollbar-track');
  const thumb = document.getElementById('bubble-scrollbar-thumb');
  if(!track || !thumb) return;

  const maxStartRow = Math.max(0, totalRows - 2);   // rowsVisible =2
  const trackH = track.clientHeight;

  // Build segments (one per start row)
  track.querySelectorAll('.bubble-scrollbar-segment').forEach(s=>s.remove());
  const colors = ['#fde68a','#fca5a5','#6ee7b7','#93c5fd','#d8b4fe'];
  const segmentH = trackH / (maxStartRow + 1);   // exact pixel height for segments and thumb
  for(let r = 0; r <= maxStartRow; r++){
    const seg = document.createElement('div');
    seg.className = 'bubble-scrollbar-segment';
    seg.style.top = `${r * segmentH}px`;
    seg.style.height = `${segmentH}px`;
    seg.style.background = colors[r % colors.length];
    track.appendChild(seg);
  }

  // Thumb size = half a segment
  const thumbH   = segmentH/2;
  thumb.style.height = `${thumbH}px`;
  const topPos = segmentH*scrollRow + (segmentH-thumbH)/2;
  thumb.style.top = `${topPos}px`;
}




/* Initial render */
renderBubbles();

// Attach mouseenter / mouseleave on bubble grid & scrollbar (for arrow-key scroll)
const bubbleContainer   = document.getElementById('bubble-container');
const scrollContainer   = document.querySelector('.bubble-scrollbar-container');
[bubbleContainer, scrollContainer].forEach(el=>{
  if(!el) return;
  el.addEventListener('mouseenter', ()=> hoverScrollArea = true);
  el.addEventListener('mouseleave', ()=> hoverScrollArea = false);
});

// ----- Wheel scroll support for bubble grid / scrollbar -----
function handleWheelScroll(e){
  e.preventDefault();          // keep page from scrolling
  const rowsVisible = 2;
  const maxStartRow = Math.max(0, totalRows - rowsVisible);
  if(maxStartRow === 0) return;     // nothing to scroll

  // deltaY positive -> scroll down (next row); negative -> scroll up
  if(e.deltaY > 0 && scrollRow < maxStartRow){
    scrollRow++;
  }else if(e.deltaY < 0 && scrollRow > 0){
    scrollRow--;
  }else{
    return;   // no change
  }
  document.getElementById('bubble-list').style.transform =
    `translateY(-${scrollRow * rowHeight}px)`;
  updateScrollBar();
}

// Listen for wheel events when hovering over grid or custom scrollbar
[bubbleContainer, scrollContainer].forEach(el=>{
  if(!el) return;
  el.addEventListener('wheel', handleWheelScroll, { passive:false });
});

// Build dynamic category bar
const categoryBar = document.getElementById('category-bar');
if (categoryBar) {
  // Use the imported functions for initial setup
  updateCategoryCounts();
}
    
// Bubble scrollbar navigation
  const track = document.getElementById('bubble-scrollbar-track');
  const thumb = document.getElementById('bubble-scrollbar-thumb');
  let isThumbDragging = false;
  if (thumb && track) {
    thumb.tabIndex = 0;                     // allow arrow-key control
    thumb.addEventListener('pointerdown', e => {
      isThumbDragging = true;
      thumb.setPointerCapture(e.pointerId);
    });
    thumb.addEventListener('pointerup', e => {
      if (!isThumbDragging) return;
      isThumbDragging = false;
      thumb.releasePointerCapture(e.pointerId);
      // Snap to the segment that the *thumb center* currently overlaps
      const rect = track.getBoundingClientRect();
      let y = parseFloat(thumb.style.top) || 0;           // current thumb top
      const thumbH = thumb.offsetHeight;
      const centerY = y + thumbH / 2;                     // center of thumb
      const maxStartRow = Math.max(0, totalRows - 2);
      const segmentH = rect.height / (maxStartRow + 1);
      scrollRow = Math.min(
        maxStartRow,
        Math.max(0, Math.floor(centerY / segmentH))
      );
      document.getElementById('bubble-list').style.transform = `translateY(-${scrollRow * rowHeight}px)`;
      updateScrollBar();
    });
    thumb.addEventListener('pointermove', e => {
      if (!isThumbDragging) return;
      const rect = track.getBoundingClientRect();
      const maxY = rect.height - thumb.offsetHeight;   // keep pill fully inside
      let y = e.clientY - rect.top;
      y = Math.max(0, Math.min(y, maxY));              // clamp 0 … maxY
      // Free thumb move
      thumb.style.top = y + 'px';
      const ratio = y / maxY;      /* use draggable range to map rows */
      const maxStartRow = Math.max(0, totalRows - 2);
      const virtualRow = ratio * maxStartRow;
      document.getElementById('bubble-list').style.transform = `translateY(-${virtualRow * rowHeight}px)`;
    });

    track.addEventListener('click', e=>{
      const rect = track.getBoundingClientRect();
      let y = e.clientY - rect.top;
      const maxY = rect.height - thumb.offsetHeight;   // ensure click maps within bounds
      y = Math.max(0, Math.min(y, maxY));
      const maxStartRow = Math.max(0, totalRows - 2);
      const segmentH = rect.height / (maxStartRow + 1);
      scrollRow = Math.min(
        maxStartRow,
        Math.floor(y / segmentH)
      );
      document.getElementById('bubble-list').style.transform = `translateY(-${scrollRow * rowHeight}px)`;
      updateScrollBar();
    });
}

/* ------------------------------------------------------------------
   Delegated bubble events  (click / dragstart / dragend)
   ------------------------------------------------------------------*/
document.addEventListener('click', e=>{
  if (isInputLocked) {
    e.stopPropagation();
    e.preventDefault();
    return;
  }
  const bubble = e.target.closest('.bubble');
  if(!bubble) return;
  // Prevent duplicate active bubble
  if(document.querySelector('.active-bubble')) return;
  // Prevent clicking bubbles while animation is running
  if (isBubbleAnimating) return;
  isBubbleAnimating = true;
  lockInput(600); // Lock input for animation duration + buffer (adjust as needed)

  // Store current category so it doesn't get reset
  const savedCategory = currentCategory; 

  // Animate clone to centre + build panel
  const rect = bubble.getBoundingClientRect();
  // Look up description for this field (no longer used for index card)
  const fieldName = bubble.textContent.trim();
  // const descText = (fieldDefs.find(d => d.name === fieldName) || {}).desc || '';
  const clone = bubble.cloneNode(true);
  clone.dataset.filterFor = fieldName;
  // Remove all index card/descEl logic here
  clone._origin = bubble;
  clone.style.position='fixed';
  clone.style.top = rect.top+'px';
  clone.style.left=rect.left+'px';
  clone.style.color = getComputedStyle(bubble).color;
  document.body.appendChild(clone);
  bubble.classList.add('bubble-disabled');
  bubble.style.opacity = '0';          // hide origin immediately
  bubble.dataset.filterFor = bubble.textContent.trim();          // add attribute

  overlay.classList.add('show');
  buildConditionPanel(bubble);
  
  // Restore the saved category
  currentCategory = savedCategory;
  // Re-sync category bar UI to match the preserved category
  document.querySelectorAll('#category-bar .category-btn').forEach(btn =>
    btn.classList.toggle('active', btn.dataset.category === currentCategory)
  );

  clone.addEventListener('transitionend',function t(){
    if(!clone.classList.contains('enlarge-bubble')){
      clone.classList.add('enlarge-bubble');
      return;
    }
    conditionPanel.classList.add('show');
    // After the panel is visible, auto-activate Equals (or first option)
    const defaultBtn =
          conditionPanel.querySelector('.condition-btn[data-cond="equals"]') ||
          conditionPanel.querySelector('.condition-btn');
    if (defaultBtn) {
      defaultBtn.classList.add('active');
      conditionBtnHandler({ currentTarget: defaultBtn, stopPropagation(){}, preventDefault(){} });
    }
    // Show input wrapper right away if there are existing filters
    if (activeFilters[selectedField]) {
      inputWrapper.classList.add('show');
    }
    clone.removeEventListener('transitionend',t);
    // Animation is done, allow bubble clicks again
    isBubbleAnimating = false;
    // (input lock will be released by timer)
  });
  requestAnimationFrame(()=> clone.classList.add('active-bubble'));

  // After: clone._origin = bubble;
  setTimeout(() => {
    if (!document.body.contains(clone._origin)) {
      // Try to find the Marc creator bubble again
      const marcBubble = Array.from(document.querySelectorAll('.bubble')).find(b => b.textContent.trim() === 'Marc');
      if (marcBubble) clone._origin = marcBubble;
    }
  }, 60);
  if (clone) overlay.classList.add('bubble-active');
  const headerBar = document.getElementById('header-bar');
  if (clone && headerBar) headerBar.classList.add('header-hide');
});




/* Render/update the filter pill list for a given field */
function renderConditionList(field){
  const container = document.getElementById('bubble-cond-list');
  container.innerHTML = '';
  const data = activeFilters[field];
  if(!data || !data.filters.length) {
    document.querySelectorAll('.bubble').forEach(b=>{
      if(b.textContent.trim()===field) {
        applyCorrectBubbleStyling(b);
      }
    });
    const selContainer = document.getElementById('condition-select-container');
    if (selContainer) {
      if (selectedField === field) {
        selContainer.querySelectorAll('input[type="checkbox"], input[type="radio"]').forEach(input => {
          input.checked = false;
        });
      }
    }
    updateCategoryCounts();
    // Only re-render bubbles if the field was in Selected and is now gone
    if (currentCategory === 'Selected') {
      // If this was the last filter for the field, and the field is no longer displayed, re-render
      const stillSelected = shouldFieldHavePurpleStyling(field);
      if (!stillSelected) {
      safeRenderBubbles();
      }
    }
    return;
  }

  const list = document.createElement('div');
  list.className = 'cond-list';

  // Logical toggle with validation (unchanged)
  const toggle = document.createElement('span');
  toggle.className = 'logical-toggle' + (data.logical==='And' ? ' active':'');
  toggle.textContent = data.logical.toUpperCase();
  toggle.addEventListener('click', ()=>{
    const newLogical = (data.logical === 'And') ? 'Or' : 'And';
    if(newLogical === 'And'){
      const fieldType = (fieldDefs.find(d => d.name === field) || {}).type || 'string';
      let conflictMsg = null;
      for(let i=0;i<data.filters.length;i++){
        const preceding = { logical:'And', filters:data.filters.slice(0,i) };
        conflictMsg = getContradictionMessage(preceding, data.filters[i], fieldType, field);
        if(conflictMsg) break;
      }
      if(conflictMsg){
        showError(conflictMsg, [conditionInput, document.getElementById('condition-input-2')]);
        return;
      }
    }
    data.logical = newLogical;
    toggle.textContent = data.logical.toUpperCase();
    toggle.classList.toggle('active', data.logical==='And');
    updateQueryJson();
  });
  list.appendChild(toggle);

  // Use FilterPill for each filter
  const fieldDef = fieldDefs.find(f => f.name === field);
  data.filters.forEach((f, idx) => {
    const pill = new FilterPill(f, fieldDef, () => {
      data.filters.splice(idx,1);
      if(data.filters.length===0){
        delete activeFilters[field];
        document.querySelectorAll('.bubble').forEach(b=>{
          if(b.textContent.trim()===field) {
            b.removeAttribute('data-filtered');
            b.classList.remove('bubble-filter');
          }
        });
      }
      const selContainer = document.getElementById('condition-select-container');
      if (selContainer && selectedField === field) {
        if (f.cond === 'equals') {
          selContainer.querySelectorAll('input[type="checkbox"], input[type="radio"]').forEach(input => {
            if (input.value === f.val || input.dataset.value === f.val) {
              input.checked = false;
            } 
            if (f.val.includes(',')) {
              const valueSet = new Set(f.val.split(','));
              if (valueSet.has(input.value) || valueSet.has(input.dataset.value)) {
                input.checked = false;
              }
            }
          });
          selContainer.querySelectorAll('.group-checkbox').forEach(checkbox => {
            const groupName = checkbox.dataset.group;
            const groupOptions = selContainer.querySelectorAll(`.option-item[data-group="${groupName}"] input`);
            checkbox.checked = Array.from(groupOptions).some(opt => opt.checked);
          });
        }
      }
      updateQueryJson();
      renderConditionList(field);
      updateCategoryCounts();
      if (currentCategory === 'Selected') {
        safeRenderBubbles();
      }
    });
    list.appendChild(pill.getElement());
  });

  container.appendChild(list);
  updateCategoryCounts();
}

// Helper function to build condition panel for a bubble (was inside attachBubbleHandlers before)
function buildConditionPanel(bubble){
  selectedField = bubble.textContent.trim();
  const type = bubble.dataset.type || 'string';
  let listValues = null;
  let hasValuePairs = false;
  
  // Handle both old and new values format
  try {
    if (bubble.dataset.values) {
      const parsedValues = JSON.parse(bubble.dataset.values);
      if (parsedValues.length > 0) {
        if (typeof parsedValues[0] === 'object' && parsedValues[0].Name && parsedValues[0].RawValue) {
          // New format with Name/RawValue pairs
          hasValuePairs = true;
          listValues = parsedValues;
        } else {
          // Old string format
          listValues = parsedValues;
        }
      }
    }
  } catch (e) {
    console.error("Error parsing values:", e);
  }
  
  const perBubble = bubble.dataset.filters ? JSON.parse(bubble.dataset.filters) : null;
  const isSpecialMarc = selectedField === 'Marc';
  conditionPanel.innerHTML = '';

  // Always remove any existing marcInputGroup from the inputWrapper
  const inputWrapper = document.getElementById('condition-input-wrapper');
  const oldMarcInput = document.getElementById('marc-field-input');
  if (oldMarcInput && oldMarcInput.parentNode) oldMarcInput.parentNode.remove();

  if (isSpecialMarc) {
    // For the special Marc field, create a Marc number input
    const marcInputGroup = document.createElement('div');
    marcInputGroup.className = 'marc-input-group';
    const marcLabel = document.createElement('label');
    marcLabel.textContent = 'Marc Field Number:';
    marcLabel.className = 'marc-label';
    marcInputGroup.appendChild(marcLabel);
    const marcInput = document.createElement('input');
    marcInput.type = 'text';
    marcInput.pattern = '[0-9]+';
    marcInput.placeholder = 'Enter 3-digit Marc field';
    marcInput.className = 'marc-field-input condition-field';
    marcInput.id = 'marc-field-input';
    marcInputGroup.appendChild(marcInput);
    // Insert after conditionInput in inputWrapper
    const refNode = document.getElementById('condition-input');
    if (refNode && inputWrapper) {
      inputWrapper.insertBefore(marcInputGroup, refNode.nextSibling);
    }
    // Add filter buttons
    const standardConds = ['contains', 'starts', 'equals'];
    standardConds.forEach(label => {
      const btn = document.createElement('button');
      btn.className = 'condition-btn';
      btn.dataset.cond = label.split(' ')[0];
      btn.textContent = label[0].toUpperCase() + label.slice(1);
      conditionPanel.appendChild(btn);
    });
  } else {
    // Normal field - add condition buttons as usual
    const conds = perBubble ? perBubble
                : (listValues && listValues.length) ? ['equals']
                : (typeConditions[type] || typeConditions.string);
    conds.forEach(label => {
      const slug = label.split(' ')[0];
      const btnEl = document.createElement('button');
      btnEl.className = 'condition-btn';
      btnEl.dataset.cond = slug;
      btnEl.textContent = label[0].toUpperCase()+label.slice(1);
      conditionPanel.appendChild(btnEl);
    });
  }

  // --- Dual toggle (Show / Hide) ---
  if (!isSpecialMarc) {
    const toggleGroup = document.createElement('div');
    toggleGroup.className = 'inline-flex';
    ['Show','Hide'].forEach(label=>{
      const btn = document.createElement('button');
      btn.className = 'toggle-half';
      btn.dataset.cond = label.toLowerCase();
      btn.textContent = label;
      if(label === 'Show' ? displayedFields.includes(selectedField) : !displayedFields.includes(selectedField)){
        btn.classList.add('active');
      }
      toggleGroup.appendChild(btn);
    });
    conditionPanel.appendChild(toggleGroup);
  }

  const dynamicBtns = conditionPanel.querySelectorAll('.condition-btn, .toggle-half');
  dynamicBtns.forEach(btn=>btn.addEventListener('click', isSpecialMarc ? marcConditionBtnHandler : conditionBtnHandler));

  // Swap text input for select if bubble has list values
  if(listValues && listValues.length){
    const fieldDef = fieldDefs.find(f => f.name === selectedField);
    const isMultiSelect = fieldDef && fieldDef.multiSelect;
    // Clean up any existing selectors
    let existingSelect = document.getElementById('condition-select');
    let existingContainer = document.getElementById('condition-select-container');
    if (existingSelect) existingSelect.parentNode.removeChild(existingSelect);
    if (existingContainer) existingContainer.parentNode.removeChild(existingContainer);
    
    // Get current values if it's a filter update
    let currentLiteralValues = [];
    if (activeFilters[selectedField]) {
      const filter = activeFilters[selectedField].filters.find(f => f.cond === 'equals');
      if (filter) {
        currentLiteralValues = filter.val.split(',').map(v => v.trim());
      }
    }
    
    // Check if any values have dashes for grouped selector
    const hasDashes = hasValuePairs 
      ? listValues.some(val => val.Name.includes('-'))
      : listValues.some(val => val.includes('-'));
    
    if (hasDashes) {
      // Use grouped selector for values with dash
      const selector = createGroupedSelector(listValues, isMultiSelect, currentLiteralValues);
      inputWrapper.insertBefore(selector, confirmBtn);
      conditionInput.style.display = 'none';
    } else {
      // Use standard select for simple values
      let select = document.createElement('select');
      select.id = 'condition-select';
      select.className = 'px-3 py-2 rounded border';
      if (isMultiSelect) {
        select.setAttribute('multiple', 'multiple');
      }
      
      // Create options with proper display/literal handling
      select.innerHTML = listValues.map(v => {
        if (hasValuePairs) {
          // New format with Name/RawValue pairs
          const selected = currentLiteralValues.includes(v.RawValue) ? 'selected' : '';
          return `<option value="${v.RawValue}" data-display="${v.Name}" ${selected}>${v.Name}</option>`;
        } else {
          // Old string format
          const selected = currentLiteralValues.includes(v) ? 'selected' : '';
          return `<option value="${v}" ${selected}>${v}</option>`;
        }
      }).join('');
      
      inputWrapper.insertBefore(select, confirmBtn);
      select.style.display = 'block';
      conditionInput.style.display = 'none';
    }
  } else {
    if(document.getElementById('condition-select')){
      document.getElementById('condition-select').style.display='none';
    }
    if(document.getElementById('condition-select-container')){
      document.getElementById('condition-select-container').style.display='none';
    }
    configureInputsForType(type);
    conditionInput.style.display = 'block';
  }

  // Show existing filters, if any
  renderConditionList(selectedField);

  // Focus the Marc field input if this is the Marc bubble
  if (isSpecialMarc) {
    setTimeout(() => {
      document.getElementById('marc-field-input')?.focus();
    }, 300);
  }
}

// Special handler for condition buttons when in Marc mode
function marcConditionBtnHandler(e) {
  e.stopPropagation();
  const btn = e.currentTarget;
  const all = conditionPanel.querySelectorAll('.condition-btn');
  all.forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  const cond = btn.dataset.cond;
  
  // Get the Marc field number
  const marcInput = document.getElementById('marc-field-input');
  const marcNumber = marcInput?.value?.trim();
  
  if (!marcNumber || !/^\d{1,3}$/.test(marcNumber)) {
    // Show error if Marc number is invalid
    const errorLabel = document.getElementById('filter-error');
    if (errorLabel) {
      errorLabel.textContent = 'Please enter a valid Marc field number';
      errorLabel.style.display = 'block';
      setTimeout(() => { errorLabel.style.display = 'none'; }, 3000);
    }
    return;
  }
  
  // Normal condition button behavior (show input field)
  // Show second input and "and" label only for "between"
  const second = document.getElementById('condition-input-2');
  const betweenLbl = document.getElementById('between-label');
  if (cond === 'between') {
    second.style.display = 'block';
    betweenLbl.style.display = 'inline';
    second.type = conditionInput.type;     // match type (date, number, text)
  } else {
    second.style.display = 'none';
    betweenLbl.style.display = 'none';
  }
  
  inputWrapper.classList.add('show');
  positionInputWrapper();
  conditionInput.focus();
  
  // Re-position after toggling second input visibility
  positionInputWrapper();
}

// Replace search input listener to filter all fieldDefs, not just visible bubbles
queryInput.addEventListener('input', () => {
  // Only switch to "All" category when searching if no bubble is active and no overlay is shown
  if (!document.querySelector('.active-bubble') && !overlay.classList.contains('show')) {
  currentCategory = 'All';
  // Update the segmented toggle UI to reflect the change
  document.querySelectorAll('#category-bar .category-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.category === 'All')
  );
  }
  
  const term = queryInput.value.trim().toLowerCase();
  if(clearSearchBtn) clearSearchBtn.classList.toggle('hidden', term==='');
  
  // Use imported updateFilteredDefs function
  updateFilteredDefs(term);
  
  // Update label of the "All" segment → "Search (n)" when searching
  const allBtn = document.querySelector('#category-bar .category-btn[data-category="All"]');
  if(allBtn){
    if(term === ''){
      const total = fieldDefs.length;
      allBtn.textContent = `All (${total})`;
    }else{
      allBtn.textContent = `Search (${filteredDefs.length})`;
    }
  }
  scrollRow = 0;
  safeRenderBubbles();
});

if(clearSearchBtn){
  clearSearchBtn.addEventListener('click', ()=>{
    queryInput.value = '';
    queryInput.dispatchEvent(new Event('input'));
    queryInput.focus();
  });
}


const body=document.getElementById('page-body');
body.classList.add('night');         // use night-sky background
// === Spawn moving fireflies ===
// (now loaded via <script src="fireflies.js"></script> in index.html)
// ... existing code ...

// === Allow dropping a bubble onto the table to display that field ===
function attachBubbleDropTarget(container){
  if(container._bubbleDropSetup) return;   // guard against double-bind
  container.addEventListener('dragover', e=>e.preventDefault());
  container.addEventListener('drop', e=>{
    e.preventDefault();
    if(e.target.closest('th')) return;   // header drop already handled
    const field = e.dataTransfer.getData('bubble-field');   // will be '' if not a bubble
    if(field && !displayedFields.includes(field)){
      displayedFields.push(field);
      showExampleTable(displayedFields);
    }
  });
  container._bubbleDropSetup = true;
}

// attach to the initial table container
const initialContainer = document.querySelector('.overflow-x-auto.shadow.rounded-lg.mb-6');
if(initialContainer) {
  attachBubbleDropTarget(initialContainer);
  // Initial render of empty table placeholder
  showExampleTable(displayedFields);
}

// === Drag-and-drop helpers ===
// Sync data-col-index attributes for every header and body cell
function refreshColIndices(table){
  const ths = table.querySelectorAll('thead th');
  ths.forEach((th, i)=>{
    th.dataset.colIndex = i;
    if(!th.hasAttribute('draggable')) th.setAttribute('draggable','true');
    if(!th.classList.contains('th-wrapper')){
      th.classList.add('th-wrapper');
    }
  });
  const rows = table.querySelectorAll('tbody tr');
  rows.forEach(row=>{
    Array.from(row.children).forEach((cell,i)=>{
      cell.dataset.colIndex = i;
    });
  });
}
function moveColumn(table, fromIndex, toIndex){
  if(fromIndex === toIndex) return;

  // 1️⃣  Keep displayedFields order in sync first
  if(fromIndex < displayedFields.length && toIndex < displayedFields.length){
    const [movedField] = displayedFields.splice(fromIndex,1);
    displayedFields.splice(toIndex,0,movedField);
  }

  // 2️⃣  Update the table header
  const headerRow = table.querySelector('thead tr');
  if (headerRow) {
    const headers = Array.from(headerRow.children);
    if (fromIndex < headers.length && toIndex < headers.length) {
      const moving = headers[fromIndex];
      if (fromIndex < toIndex) {
        headerRow.insertBefore(moving, headers[toIndex].nextSibling);
      } else {
        headerRow.insertBefore(moving, headers[toIndex]);
      }
    }
  }

  // 3️⃣  Recalculate column widths for new order
  if (virtualTableData.length > 0) {
    calculatedColumnWidths = calculateOptimalColumnWidths(displayedFields, virtualTableData);
    
    // Update header widths
    headerRow.querySelectorAll('th').forEach((th, index) => {
      const field = displayedFields[index];
      const width = calculatedColumnWidths[field] || 150;
      th.style.width = `${width}px`;
      th.style.minWidth = `${width}px`;
      th.style.maxWidth = `${width}px`;
    });
  }

  // 4️⃣  Re-render virtual table with new column order
  renderVirtualTable();

  // 5️⃣  Refresh index metadata
  refreshColIndices(table);
  updateQueryJson();
  
  // 6️⃣  If in Selected category, re-render bubbles to match new order
  if (currentCategory === 'Selected') {
    safeRenderBubbles();
  }
}

function removeColumn(table, colIndex){
  // Capture the header text *before* removing, to sync displayedFields
  const headerCell = table.querySelector(`thead th[data-col-index="${colIndex}"]`);
  const fieldName  = headerCell ? headerCell.textContent.trim() : null;

  // Update the displayedFields list first
  if(fieldName){
    const idx = displayedFields.indexOf(fieldName);
    if(idx !== -1) displayedFields.splice(idx,1);
  }

  // Remove the header cell
  if (headerCell) {
    headerCell.remove();
  }

  // Re-render virtual table with new column structure
  if (displayedFields.length > 0) {
    // Recalculate column widths for remaining fields
    if (virtualTableData.length > 0) {
      calculatedColumnWidths = calculateOptimalColumnWidths(displayedFields, virtualTableData);
      
      // Update remaining header widths
      const headerRow = table.querySelector('thead tr');
      if (headerRow) {
        headerRow.querySelectorAll('th').forEach((th, index) => {
          const field = displayedFields[index];
          const width = calculatedColumnWidths[field] || 150;
          th.style.width = `${width}px`;
          th.style.minWidth = `${width}px`;
          th.style.maxWidth = `${width}px`;
        });
      }
    }
    
    renderVirtualTable();
  }

  refreshColIndices(table);

  // Update styling for the bubble for this field
  if (fieldName) {
    document.querySelectorAll('.bubble').forEach(bubbleEl => {
      if (bubbleEl.textContent.trim() === fieldName) {
        if (fieldName === 'Marc') {
          bubbleEl.setAttribute('draggable', 'false');
        } else {
          bubbleEl.setAttribute('draggable', 'true');
        }
        applyCorrectBubbleStyling(bubbleEl);
      }
    });
  }

  // Update JSON to reflect removed column
  updateQueryJson();
  // If no columns left, reset to placeholder view
  if (displayedFields.length === 0) {
    showExampleTable(displayedFields);
  }
  // Update category counts after removing column
  updateCategoryCounts();
  // Re-render bubbles if we're in Selected category
  if (currentCategory === 'Selected') {
    safeRenderBubbles();
  }
}




// === Example table builder ===
function showExampleTable(fields){
  if(!Array.isArray(fields) || fields.length === 0){
    // No columns left → clear table area and reset states
    displayedFields = [];
    virtualTableData = [];
    const container = document.querySelector('.overflow-x-auto.shadow.rounded-lg.mb-6');
    /* Ensure placeholder table has the same height as the table container */
    const placeholderH = 400;                       // Fixed height to match container
    if(container){
      container.style.minHeight = placeholderH + 'px';
      container.style.height    = placeholderH + 'px';
      container.innerHTML = `
        <table id="example-table" class="min-w-full divide-y divide-gray-200 bg-white">
          <thead>
            <tr><th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" colspan="1">
              Drag a bubble here to add your first column
            </th></tr>
          </thead>
          <tbody class="divide-y divide-gray-200">
            <tr><td class="px-6 py-4 whitespace-nowrap">...</td></tr>
            <tr><td class="px-6 py-4 whitespace-nowrap">...</td></tr>
            <tr><td class="px-6 py-4 whitespace-nowrap">...</td></tr>
          </tbody>
        </table>`;
      // Ensure placeholder header accepts drops
      attachBubbleDropTarget(container);
      const placeholderTh = container.querySelector('thead th');
      if (placeholderTh) {
        placeholderTh.addEventListener('dragover', e => e.preventDefault());
        placeholderTh.addEventListener('drop', e => {
          e.preventDefault();
          const field = e.dataTransfer.getData('bubble-field');
          if (field && !displayedFields.includes(field)) {
            displayedFields.push(field);
            showExampleTable(displayedFields);
          }
        });
        placeholderTh.addEventListener('dragenter', e => {
          placeholderTh.classList.add('th-drag-over');
        });
        placeholderTh.addEventListener('dragleave', e => {
          placeholderTh.classList.remove('th-drag-over');
        });
        // Also highlight placeholder when dragging anywhere over the empty table container
        container.addEventListener('dragover', e => {
          if (displayedFields.length === 0) {
            placeholderTh.classList.add('th-drag-over');
          }
        });
        container.addEventListener('dragleave', e => {
          placeholderTh.classList.remove('th-drag-over');
        });
      }
    }
    // Re-enable dragging on every bubble
    document.querySelectorAll('.bubble').forEach(b => {
      if (b.textContent.trim() === 'Marc') {
        b.setAttribute('draggable', 'false');
      } else {
        b.setAttribute('draggable', 'true');
      }
    });
    updateQueryJson();
    updateCategoryCounts();
    return;
  }

  // Remove duplicates, preserve order
  const uniqueFields = [];
  fields.forEach(f => {
    if (!uniqueFields.includes(f)) uniqueFields.push(f);
  });
  displayedFields = uniqueFields;

  // Generate sample data if not already generated or if fields changed
  if (virtualTableData.length === 0 || virtualTableData.length < 30000) {
    console.log('Generating 30,000 sample rows...');
    virtualTableData = generateSampleData(30000);
    console.log('Sample data generated successfully');
  }

  // Calculate optimal column widths based on all data
  console.log('Calculating optimal column widths...');
  calculatedColumnWidths = calculateOptimalColumnWidths(displayedFields, virtualTableData);
  console.log('Column widths calculated:', calculatedColumnWidths);

  // Build header with fixed widths
  let theadHTML = '<tr>';
  displayedFields.forEach((f,i)=>{
    const width = calculatedColumnWidths[f] || 150; // fallback width
    theadHTML += `<th draggable="true" data-col-index="${i}" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50" style="width: ${width}px; min-width: ${width}px; max-width: ${width}px;"><span class='th-text'>${f}</span></th>`;
  });
  theadHTML += '</tr>';

  // Create virtual table structure
  const tableHTML = `
    <table id="example-table" class="min-w-full divide-y divide-gray-200 bg-white">
      <thead class="sticky top-0 z-20 bg-gray-50">${theadHTML}</thead>
      <tbody class="divide-y divide-gray-200">
        <!-- Virtual rows will be inserted here -->
      </tbody>
    </table>`;

  // Replace the original sample-data table in place
  const container = document.querySelector('.overflow-x-auto.shadow.rounded-lg.mb-6');
  if (container) {
    // Set up container for virtual scrolling
    container.style.height = '400px'; // Fixed height for virtual scrolling
    container.style.overflowY = 'auto';
    container.innerHTML = tableHTML;
    
    // Set up scroll container reference
    tableScrollContainer = container;
    tableScrollTop = 0;
    
    // Add scroll event listener
    container.addEventListener('scroll', handleTableScroll);
    
    const newTable = container.querySelector('#example-table');
    
    // Calculate actual row height from a rendered row
    if (virtualTableData.length > 0) {
      // Temporarily render one row to measure height
      const tbody = newTable.querySelector('tbody');
      const tempRow = document.createElement('tr');
      tempRow.className = 'hover:bg-gray-50';
      displayedFields.forEach((field, colIndex) => {
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
    
    // Initial render of virtual table
    renderVirtualTable();
    
    // Set up drag and drop
    addDragAndDrop(newTable);
    attachBubbleDropTarget(container);
    
    // Update bubble dragging states
    document.querySelectorAll('.bubble').forEach(bubbleEl => {
      const field = bubbleEl.textContent.trim();
      if (field === 'Marc') {
        bubbleEl.setAttribute('draggable', 'false');
      } else if(displayedFields.includes(field)){
        bubbleEl.removeAttribute('draggable');
        applyCorrectBubbleStyling(bubbleEl);
      } else {
        bubbleEl.setAttribute('draggable','true');
        applyCorrectBubbleStyling(bubbleEl);
      }
    });
    
    updateQueryJson();
    updateCategoryCounts();
    
    // Re-render bubbles if we're in Selected category
    if (currentCategory === 'Selected') {
      safeRenderBubbles();
    }
    
    // Attach header hover handlers for trash can
    const headers = newTable.querySelectorAll('th[draggable="true"]');
    headers.forEach(h => {
      h.addEventListener('mouseenter', () => {
        h.classList.add('th-hover');
        dragDropManager.hoverTh = h;
        h.appendChild(headerTrash);
        headerTrash.style.display = 'block';
      });
      h.addEventListener('mouseleave', () => {
        h.classList.remove('th-hover');
        dragDropManager.hoverTh = null;
        if (headerTrash.parentNode) headerTrash.parentNode.removeChild(headerTrash);
      });
    });
    
    // If only one column, attach trashcan immediately
    if (headers.length === 1) {
      const h = headers[0];
      h.classList.add('th-hover');
      dragDropManager.hoverTh = h;
      h.appendChild(headerTrash);
      headerTrash.style.display = 'block';
    }
  }
}

updateQueryJson();

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
  // Load fields
  displayedFields = [...q.jsonConfig.DesiredColumnOrder];
  showExampleTable(displayedFields);
  // Clear filters and reapply from query
  Object.keys(activeFilters).forEach(k=>delete activeFilters[k]);
  document.querySelectorAll('.bubble-filter').forEach(b=>{
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
          .find(b=>b.textContent.trim() === ff.FieldName);
        if(bubbleEl){
          bubbleEl.classList.add('bubble-filter');
          bubbleEl.dataset.filtered = 'true';
        }
      });
    });
  }
  // Update JSON display
  updateQueryJson();
}

// Helper function to create HTML for a single query row
function createQueriesTableRowHtml(q, viewIconSVG) {
  // Use tooltip for columns
  const columns = q.jsonConfig?.DesiredColumnOrder || [];
  const columnsTooltip = formatColumnsTooltip(columns);
  const columnsSummary = columns.length && columnsTooltip
    ? `<span class="inline-flex items-center gap-1" data-tooltip="${columnsTooltip.replace(/"/g, '&quot;')}">
          ${viewIconSVG}
       </span>`
    : '<span class="text-gray-400">None</span>';
  // Use tooltip for filters
  const filterGroups = q.jsonConfig?.FilterGroups || [];
  const filterTooltip = formatFiltersTooltip(null, filterGroups);
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
  const loadBtn = !q.running && !q.cancelled ? `<button class="load-query-btn inline-flex items-center justify-center p-1 rounded-full bg-gray-100 hover:bg-gray-200 text-blue-600" tabindex="-1" data-query-id="${q.id}" style="margin-left:4px;" data-tooltip="Load Query"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10,9 9,9 8,9"/></svg></button>` : '';
  // Rerun button for both completed and cancelled queries (refresh/replay icon)
  const rerunBtn = (!q.running) ? `<button class="rerun-query-btn inline-flex items-center justify-center p-1 rounded-full bg-gray-100 hover:bg-gray-200 text-green-600" tabindex="-1" data-query-id="${q.id}" style="margin-left:4px;" data-tooltip="Rerun Query"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg></button>` : '';
  // Duration calculation
  let duration = '—';
  if (q.startTime && (q.endTime || q.cancelledTime)) {
    const start = new Date(q.startTime);
    const end = new Date(q.endTime || q.cancelledTime);
    let seconds = Math.floor((end - start) / 1000);
    duration = formatDuration(seconds);
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
document.addEventListener('click', e=>{
  const row = e.target.closest('#queries-container tbody tr[data-query-id]');
  if(!row) return;
  const id = row.getAttribute('data-query-id');
  const q   = exampleQueries.find(q => q.id === id);
  if(!q || !q.jsonConfig) return;

  // Load fields
  displayedFields = [...q.jsonConfig.desiredFieldOrder];
  showExampleTable(displayedFields);

  // Clear filters and reapply from query
  Object.keys(activeFilters).forEach(k=>delete activeFilters[k]);
  document.querySelectorAll('.bubble-filter').forEach(b=>{
    b.classList.remove('bubble-filter');
    b.removeAttribute('data-filtered');
  });
  if(q.jsonConfig.filters && q.jsonConfig.filters.length){
    const fieldFilters = q.jsonConfig.filters[0].filters || [];
    fieldFilters.forEach(ff=>{
      activeFilters[ff.fieldName] = {cond: ff.fieldOperator.toLowerCase(), val: ff.values[0]};
      const bubbleEl = Array.from(document.querySelectorAll('.bubble'))
        .find(b=>b.textContent.trim() === ff.fieldName);
      if(bubbleEl){
        bubbleEl.classList.add('bubble-filter');
        bubbleEl.dataset.filtered = 'true';
      }
    });
  }

  // Update JSON display
  updateQueryJson();
});

// === Copy JSON to clipboard ===
document.getElementById('copy-json-btn').addEventListener('click', () => {
  if (queryBox) {
    navigator.clipboard.writeText(queryBox.value)
      .then(()=> {
        const btn = document.getElementById('copy-json-btn');
        btn.classList.add('copied');
        setTimeout(()=> btn.classList.remove('copied'), 1500);
      })
      .catch(console.error);
  }
});

// Initial render of example Queries list
renderQueries();

// Start duration updates if there are running queries
if (exampleQueries.some(q => q.running)) {
  // Don't start immediately - only when the panel is opened
  // The openModal function will handle starting updates
}

// Arrow-key scrolling when focus is on a bubble, the scrollbar thumb, or when hovering over bubble grid/scrollbar
document.addEventListener('keydown', e=>{
  if(e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;

  const focussed = document.activeElement;
  const isBubble = focussed?.classList && focussed.classList.contains('bubble');
  const isThumb  = focussed?.id === 'bubble-scrollbar-thumb';

  if(!isBubble && !isThumb && !hoverScrollArea) return;   // only act if focus or hover

  const maxStartRow = Math.max(0, totalRows - 2);
  if(e.key === 'ArrowDown' && scrollRow < maxStartRow){
    scrollRow++;
  }else if(e.key === 'ArrowUp' && scrollRow > 0){
    scrollRow--;
  }else{
    return;                                  // no movement
  }

  // Apply new scroll position
  document.getElementById('bubble-list').style.transform =
    `translateY(-${scrollRow * rowHeight}px)`;
  updateScrollBar();
  e.preventDefault();                         // stop page scroll
});

/* ---------- Panel toggle + collapse ---------- */
const jsonPanel = document.getElementById('json-panel');
const queriesPanel = document.getElementById('queries-panel');
const toggleJsonBtn = document.getElementById('toggle-json');
const toggleQueriesBtn = document.getElementById('toggle-queries');

// Collapse buttons (little "-" in the panel headers)
document.querySelectorAll('.collapse-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const targetId = btn.dataset.target;
    const panel = document.getElementById(targetId);
    if (!panel) return;
    // For modal close buttons, just close the modal (add 'hidden')
    panel.classList.add('hidden');
    panel.classList.remove('show'); // for mobile menu dropdown
    overlay.classList.remove('show');
  });
});

// Mobile hamburger menu functionality
const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
const mobileMenuDropdown = document.getElementById('mobile-menu-dropdown');

if (mobileMenuToggle && mobileMenuDropdown) {
  // Open the menu using the standard modal helper
  mobileMenuToggle.addEventListener('click', () => openModal('mobile-menu-dropdown'));

  // Mobile menu item click handlers
  document.getElementById('mobile-run-query')?.addEventListener('click', () => {
    closeModal('mobile-menu-dropdown');
    document.getElementById('run-query-btn')?.click();
  });

  document.getElementById('mobile-download')?.addEventListener('click', () => {
    closeModal('mobile-menu-dropdown');
    document.getElementById('download-btn')?.click();
  });

  const mobilePanelToggles = {
    'mobile-toggle-json': 'json-panel',
    'mobile-toggle-queries': 'queries-panel',
    'mobile-toggle-help': 'help-panel',
    'mobile-toggle-templates': 'templates-panel'
  };
  Object.entries(mobilePanelToggles).forEach(([btnId, panelId]) => {
    document.getElementById(btnId)?.addEventListener('click', () => {
      closeModal('mobile-menu-dropdown');
      openModal(panelId);
    });
  });
}

// Consolidated function to render both category bar and mobile selector
function renderCategorySelectorsLocal(categoryCounts) {
  renderCategorySelectors(categoryCounts, currentCategory, (newCategory) => {
    currentCategory = newCategory;
          scrollRow = 0;
          safeRenderBubbles();
        });
}

// Replace all category bar/mobile selector update logic with the new function
function updateCategoryCounts() {
  const categoryCounts = calculateCategoryCounts(displayedFields, activeFilters);
  renderCategorySelectorsLocal(categoryCounts);

  // If we're in the Selected category and the count is 0, switch to All
  if (currentCategory === 'Selected' && categoryCounts.Selected === 0) {
    currentCategory = 'All';
    const allBtn = document.querySelector('#category-bar .category-btn[data-category="All"]');
    if (allBtn) {
      allBtn.classList.add('active');
      // Also update the mobile selector to 'All'
      const mobileSelector = document.getElementById('mobile-category-selector');
      if (mobileSelector) mobileSelector.value = 'All';
    }
    scrollRow = 0;
    safeRenderBubbles();
  }
}
  
// Initial render of category bar and mobile selector
updateCategoryCounts();

/* ------------------------------------------------------------------
   Unified drag and drop handlers to reduce duplicate code
   ------------------------------------------------------------------*/
const dragDropManager = {
  // Track state
  isBubbleDrag: false,
  hoverTh: null,
  autoScrollInterval: null,
  scrollContainer: null,
  
  // Initialize drag-and-drop for a table
  initTableDragDrop(table) {
    if (!table) return;
    
    // Ensure every header/cell has an up-to-date col index
    refreshColIndices(table);
    const scrollContainer = document.querySelector('.overflow-x-auto.shadow.rounded-lg.mb-6');
    this.scrollContainer = scrollContainer;
    const headers = table.querySelectorAll('th[draggable="true"]');
    
    // Add header hover tracking
    headers.forEach(th => {
      th.addEventListener('mouseenter', () => this.handleHeaderEnter(th));
      th.addEventListener('mouseleave', () => this.handleHeaderLeave(th));
      th.addEventListener('dragstart', (e) => this.handleHeaderDragStart(e, th, scrollContainer));
      th.addEventListener('dragend', () => this.handleHeaderDragEnd(th, scrollContainer));
      th.addEventListener('dragenter', (e) => this.handleDragEnter(e, th, table));
      th.addEventListener('dragleave', () => this.handleDragLeave());
      th.addEventListener('dragover', (e) => this.handleDragOver(e, th, table));
      th.addEventListener('drop', (e) => this.handleDrop(e, th, table));
    });
    
    // Handle body cell events
    const bodyCells = table.querySelectorAll('tbody td');
    bodyCells.forEach(td => {
      td.addEventListener('dragenter', (e) => this.handleCellDragEnter(e, td, table));
      td.addEventListener('dragover', (e) => this.handleCellDragOver(e, td, table));
      td.addEventListener('dragleave', () => this.handleDragLeave());
      td.addEventListener('drop', (e) => this.handleCellDrop(e, td, table));
    });
  },

  // Auto-scroll functionality
  startAutoScroll(direction, container) {
    if (this.autoScrollInterval) return; // Already scrolling
    
    this.autoScrollInterval = setInterval(() => {
      const scrollAmount = 15; // pixels per scroll step
      if (direction === 'left') {
        container.scrollLeft = Math.max(0, container.scrollLeft - scrollAmount);
      } else if (direction === 'right') {
        container.scrollLeft += scrollAmount;
      }
    }, 50); // scroll every 50ms for smooth scrolling
  },

  stopAutoScroll() {
    if (this.autoScrollInterval) {
      clearInterval(this.autoScrollInterval);
      this.autoScrollInterval = null;
    }
  },

  checkAutoScroll(e, container) {
    if (!container) return;
    
    const rect = container.getBoundingClientRect();
    const scrollThreshold = 300; // Increased from 50px to 100px for earlier triggering
    const mouseX = e.clientX;
    
    // Check if near left edge
    if (mouseX < rect.left + scrollThreshold && container.scrollLeft > 0) {
      this.startAutoScroll('left', container);
    }
    // Check if near right edge
    else if (mouseX > rect.right - scrollThreshold && 
             container.scrollLeft < container.scrollWidth - container.clientWidth) {
      this.startAutoScroll('right', container);
    }
    // Stop auto-scroll if not near edges
    else {
      this.stopAutoScroll();
    }
  },
  
  // Header hover handlers
  handleHeaderEnter(th) {
    th.classList.add('th-hover');
    this.hoverTh = th;
    th.appendChild(headerTrash);
    headerTrash.style.display = 'block';
  },
  
  handleHeaderLeave(th) {
    th.classList.remove('th-hover');
    this.hoverTh = null;
    if (headerTrash.parentNode) headerTrash.parentNode.removeChild(headerTrash);
  },
  
  // Header drag start/end
  handleHeaderDragStart(e, th, scrollContainer) {
    this.isBubbleDrag = false; // this is a column drag
    th.classList.add('th-dragging');
    th.classList.remove('th-hover');
    if (scrollContainer) scrollContainer.classList.add('dragging-scroll-lock');
    document.body.classList.add('dragging-cursor');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', th.dataset.colIndex);
    
    // Create drag ghost
    const ghost = document.createElement('div');
    ghost.textContent = th.textContent.trim();
    const thStyle = window.getComputedStyle(th);
    ghost.style.color = thStyle.color;
    ghost.classList.add('ghost-drag');
    ghost.style.width = 'auto';
    ghost.style.fontSize = '0.8rem';
    ghost.style.padding = '2px 8px';
    ghost.style.background = '#fff';
    ghost.style.borderRadius = '6px';
    ghost.style.boxShadow = '0 2px 8px rgba(0,0,0,0.12)';
    ghost.style.opacity = '0.95';
    ghost.style.pointerEvents = 'none';
    ghost.style.position = 'absolute';
    ghost.style.top = '-9999px';
    ghost.style.left = '-9999px';
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, ghost.offsetWidth / 2, ghost.offsetHeight / 2);
    th._ghost = ghost;
    setTimeout(() => { if (ghost.parentNode) ghost.parentNode.removeChild(ghost); }, 0);
  },
  
  handleHeaderDragEnd(th, scrollContainer) {
    th.classList.remove('th-dragging');
    if (scrollContainer) scrollContainer.classList.remove('dragging-scroll-lock');
    document.body.classList.remove('dragging-cursor');
    document.querySelectorAll('th').forEach(h => h.classList.remove('th-hover'));
    document.querySelectorAll('.th-drag-over').forEach(el => el.classList.remove('th-drag-over'));
    clearDropAnchor();
    this.stopAutoScroll(); // Stop auto-scroll when drag ends
    if (th._ghost) {
      th._ghost.remove();
      delete th._ghost;
    }
  },
  
  // Common drag event handlers
  handleDragEnter(e, element, table) {
    e.preventDefault();
    // Clear any existing highlight
    table.querySelectorAll('.th-drag-over').forEach(el => el.classList.remove('th-drag-over'));
    if (!element.classList.contains('th-dragging')) {
      element.classList.add('th-drag-over');
    }
    const rect = element.getBoundingClientRect();
    positionDropAnchor(rect, table, e.clientX);
    
    // Check for auto-scroll when dragging columns
    if (!this.isBubbleDrag && this.scrollContainer) {
      this.checkAutoScroll(e, this.scrollContainer);
    }
  },
  
  handleDragLeave() {
    clearDropAnchor();
    // Note: Don't stop auto-scroll here as dragLeave fires frequently during drag
  },
  
  handleDragOver(e, element, table) {
    e.preventDefault();
    const rect = element.getBoundingClientRect();
    positionDropAnchor(rect, table, e.clientX);
    
    // Check for auto-scroll when dragging columns
    if (!this.isBubbleDrag && this.scrollContainer) {
      this.checkAutoScroll(e, this.scrollContainer);
    }
  },
  
  // Cell-specific handlers
  handleCellDragEnter(e, td, table) {
    e.preventDefault();
    table.querySelectorAll('.th-drag-over').forEach(el => el.classList.remove('th-drag-over'));
    const colIndex = parseInt(td.dataset.colIndex, 10);
    const targetHeader = table.querySelector(`thead th[data-col-index="${colIndex}"]`);
    if (targetHeader && !targetHeader.classList.contains('th-dragging')) {
      targetHeader.classList.add('th-drag-over');
    }
    const rect = targetHeader.getBoundingClientRect();
    positionDropAnchor(rect, table, e.clientX);
    
    // Check for auto-scroll when dragging columns
    if (!this.isBubbleDrag && this.scrollContainer) {
      this.checkAutoScroll(e, this.scrollContainer);
    }
  },
  
  handleCellDragOver(e, td, table) {
    e.preventDefault();
    const colIndex = parseInt(td.dataset.colIndex, 10);
    const targetHeader = table.querySelector(`thead th[data-col-index="${colIndex}"]`);
    const rect = targetHeader.getBoundingClientRect();
    positionDropAnchor(rect, table, e.clientX);
    
    // Check for auto-scroll when dragging columns
    if (!this.isBubbleDrag && this.scrollContainer) {
      this.checkAutoScroll(e, this.scrollContainer);
    }
  },
  
  // Drop handlers
  handleDrop(e, th, table) {
    e.preventDefault();
    e.stopPropagation();
    const toIndex = parseInt(th.dataset.colIndex, 10);
    
    // Stop auto-scroll when dropping
    this.stopAutoScroll();
  
    // Column reorder drop
    const fromIndexStr = e.dataTransfer.getData('text/plain').trim();
    if (/^\d+$/.test(fromIndexStr)) {
      const fromIndex = parseInt(fromIndexStr, 10);
      if (fromIndex !== toIndex) {
        // Calculate insertion position based on mouse position relative to drop target
        const rect = th.getBoundingClientRect();
        const insertAt = (e.clientX - rect.left) < rect.width/2 ? toIndex : toIndex + 1;
        
        // Adjust insertion index when moving from left to right
        const finalInsertAt = fromIndex < insertAt ? insertAt - 1 : insertAt;
        
        moveColumn(table, fromIndex, finalInsertAt);
        refreshColIndices(table);
      }
      th.classList.remove('th-drag-over');
      clearDropAnchor();
      return;
    }
    
    // Bubble drop - insert new field
    const bubbleField = e.dataTransfer.getData('bubble-field');
    if (bubbleField && !displayedFields.includes(bubbleField)) {
      const rect = th.getBoundingClientRect();
      const insertAt = (e.clientX - rect.left) < rect.width/2 ? toIndex : toIndex + 1;
      displayedFields.splice(insertAt, 0, bubbleField);
      showExampleTable(displayedFields);
    }
    
    th.classList.remove('th-drag-over');
    clearDropAnchor();
  },
  
  handleCellDrop(e, td, table) {
    e.preventDefault();
    e.stopPropagation();
    
    const toIndex = parseInt(td.dataset.colIndex, 10);
    
    // Stop auto-scroll when dropping
    this.stopAutoScroll();
  
    // Bubble drop
    const bubbleField = e.dataTransfer.getData('bubble-field');
    if (bubbleField) {
      if (!displayedFields.includes(bubbleField)) {
        const rect = td.getBoundingClientRect();
        const insertAt = (e.clientX - rect.left) < rect.width/2 ? toIndex : toIndex + 1;
        displayedFields.splice(insertAt, 0, bubbleField);
        showExampleTable(displayedFields);
      }
      clearDropAnchor();
      return;
    }
    
    // Header reorder drop
    const fromIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);
    if (!isNaN(fromIndex) && fromIndex !== toIndex) {
      // Calculate insertion position based on mouse position relative to drop target
      const targetHeader = table.querySelector(`thead th[data-col-index="${toIndex}"]`);
      const rect = targetHeader.getBoundingClientRect();
      const insertAt = (e.clientX - rect.left) < rect.width/2 ? toIndex : toIndex + 1;
      
      // Adjust insertion index when moving from left to right
      const finalInsertAt = fromIndex < insertAt ? insertAt - 1 : insertAt;
      
      moveColumn(table, fromIndex, finalInsertAt);
      refreshColIndices(table);
    }
    
    // Clear visual states
    table.querySelectorAll('.th-drag-over').forEach(el => el.classList.remove('th-drag-over'));
    clearDropAnchor();
  },
  
  // Set bubble drag state for tracking
  setBubbleDrag(state) {
    this.isBubbleDrag = state;
  }
};

// Update existing document-level event listeners
document.addEventListener('dragstart', e => {
  const bubble = e.target.closest('.bubble');
  if (!bubble) return;
  
  // Check if this bubble is already displayed in the table
  const fieldName = bubble.textContent.trim();
  if (displayedFields.includes(fieldName)) {
    // Prevent dragging of already displayed bubbles
    e.preventDefault();
    return;
  }
  
  e.dataTransfer.setData('bubble-field', fieldName);
  e.dataTransfer.effectAllowed = 'copy';
  dragDropManager.setBubbleDrag(true);
  
  // Clone bubble and wrap it in a padded container
  const wrapper = document.createElement('div');
  const pad = 16;
  wrapper.style.position = 'absolute';
  wrapper.style.top = '-9999px';
  wrapper.style.left = '-9999px';
  wrapper.style.padding = pad / 2 + 'px';
  wrapper.style.pointerEvents = 'none';
  wrapper.style.boxSizing = 'content-box';
  const ghost = bubble.cloneNode(true);
  ghost.style.overflow = 'visible';
  wrapper.appendChild(ghost);
  document.body.appendChild(wrapper);
  const gw = wrapper.offsetWidth;
  const gh = wrapper.offsetHeight;
  e.dataTransfer.setDragImage(wrapper, gw / 2, gh / 2);
  setTimeout(() => wrapper.remove(), 0);
});

document.addEventListener('dragend', e => {
  if (e.target.closest('.bubble')) dragDropManager.setBubbleDrag(false);
});

// Replace the old addDragAndDrop function with the new manager
function addDragAndDrop(table) {
  dragDropManager.initTableDragDrop(table);
}

// Helper to reset and configure condition input fields
function resetConditionInputs(type = 'string', showSecondInput = false) {
  const inp1 = document.getElementById('condition-input');
  const inp2 = document.getElementById('condition-input-2');
  const betweenLbl = document.getElementById('between-label');
  // Set input types
  const htmlType = (type === 'date') ? 'date' : (type === 'money' || type === 'number') ? 'number' : 'text';
  if (inp1) inp1.type = htmlType;
  if (inp2) inp2.type = htmlType;
  // Show/hide second input and label
  if (inp2 && betweenLbl) {
    inp2.style.display = showSecondInput ? 'block' : 'none';
    betweenLbl.style.display = showSecondInput ? 'inline' : 'none';
  }
  // Clear values and error states
  if (inp1) {
    inp1.value = '';
    inp1.classList.remove('error');
  }
  if (inp2) {
    inp2.value = '';
    inp2.classList.remove('error');
  }
  // Remove error label
  const errorLabel = document.getElementById('filter-error');
  if (errorLabel) errorLabel.style.display = 'none';
}

// Helper to create a RawValue-to-Name map for a field definition
function getLiteralToDisplayMap(fieldDef) {
  const map = new Map();
  if (fieldDef && fieldDef.values && fieldDef.values.length > 0 && typeof fieldDef.values[0] === 'object' && fieldDef.values[0].Name) {
    fieldDef.values.forEach(val => {
      map.set(val.RawValue, val.Name);
    });
  }
  return map;
}

// Dynamically set --header-height CSS variable based on actual header height
function updateHeaderHeightVar() {
  const header = document.getElementById('header-bar');
  if (header) {
    const height = header.offsetHeight;
    document.documentElement.style.setProperty('--header-height', height + 'px');
  }
}

// Update on page load and window resize
window.addEventListener('DOMContentLoaded', updateHeaderHeightVar);
window.addEventListener('resize', updateHeaderHeightVar);

// Accessibility: Add ARIA attributes to modal panels on page load
window.addEventListener('DOMContentLoaded', () => {
  const MODAL_PANEL_IDS = ['json-panel', 'queries-panel', 'help-panel', 'templates-panel', 'mobile-menu-dropdown'];
  MODAL_PANEL_IDS.forEach(id => {
    const panel = document.getElementById(id);
    if (panel) {
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-modal', 'true');
      // Prefer aria-labelledby if a heading exists, else fallback to aria-label
      const heading = panel.querySelector('h2, h1, .modal-title');
      if (heading && heading.id) {
        panel.setAttribute('aria-labelledby', heading.id);
      } else if (heading) {
        // Generate a unique id if needed
        const uniqueId = id + '-label';
        heading.id = uniqueId;
        panel.setAttribute('aria-labelledby', uniqueId);
    } else {
        // Fallback: use aria-label
        panel.setAttribute('aria-label', id.replace(/-panel$/, '').replace(/\b\w/g, c => c.toUpperCase()));
      }
    }
  });
});

// Helper to set aria-hidden on main content except header and open modal
function setMainContentAriaHidden(hidden, openPanelId = null) {
  const pageBody = document.getElementById('page-body');
  if (pageBody) pageBody.setAttribute('aria-hidden', hidden ? 'true' : 'false');
  // Optionally, hide other main containers if present
  // e.g., document.getElementById('main-content')?.setAttribute('aria-hidden', hidden ? 'true' : 'false');
  // Unhide the open modal and header
  if (openPanelId) {
    const panel = document.getElementById(openPanelId);
    if (panel) panel.setAttribute('aria-hidden', 'false');
    }
  const header = document.getElementById('header-bar');
  if (header) header.setAttribute('aria-hidden', 'false');
}

// Update openModal/closeAllModals to manage aria-hidden
function openModal(panelId) {
  closeAllModals();
  const panel = document.getElementById(panelId);
  if (!panel) return;
  panel.classList.remove('hidden');
  panel.classList.add('show'); // Ensure 'show' class is added
  overlay.classList.add('show');
  
  // Focus first focusable element
  const focusable = getFocusableElements(panel);
  if (focusable.length) {
    setTimeout(() => focusable[0].focus(), 0);
  }
  // Trap focus
  trapFocus(panel);
  // Accessibility: hide main content from screen readers
  setMainContentAriaHidden(true, panelId);
    }
    
function closeAllModals() {
  MODAL_PANEL_IDS.forEach(id => {
    const p = document.getElementById(id);
    if (p) {
      p.classList.add('hidden');
      p.classList.remove('show'); // Ensure 'show' class is removed
    }
  });
  overlay.classList.remove('show');
  
  // Accessibility: unhide main content
  setMainContentAriaHidden(false);
}

// Utility to get the mobile breakpoint from CSS variable
function getMobileBreakpoint() {
  return parseInt(getComputedStyle(document.documentElement).getPropertyValue('--mobile-breakpoint').trim(), 10);
}

// Example usage: log if in mobile mode on load and resize
function checkMobileMode() {
  const bp = getMobileBreakpoint();
  const isMobile = window.innerWidth <= bp;
  // You can use isMobile for conditional UI logic
  // For demonstration, log to console
  // console.log('Mobile mode:', isMobile);
  // (Replace with real responsive logic as needed)
}
window.addEventListener('DOMContentLoaded', checkMobileMode);
window.addEventListener('resize', checkMobileMode);

// FilterPill UI component class
class FilterPill {
  constructor(filter, fieldDef, onRemove) {
    this.filter = filter;
    this.fieldDef = fieldDef;
    this.onRemove = onRemove;
    this.el = document.createElement('span');
    this.el.className = 'cond-pill';
    this.render();
  }

  render() {
    const { filter, fieldDef } = this;
    // Try to get a user-friendly label for the filter value
    let valueLabel = filter.val;
    if (fieldDef && fieldDef.values && typeof fieldDef.values[0] === 'object') {
      // Map RawValue to Name if possible
      const map = new Map(fieldDef.values.map(v => [v.RawValue, v.Name]));
      if (filter.cond.toLowerCase() === 'between') {
        valueLabel = filter.val.split('|').map(v => map.get(v) || v).join(' - ');
      } else {
        valueLabel = filter.val.split(',').map(v => map.get(v) || v).join(', ');
      }
    } else if (filter.cond.toLowerCase() === 'between') {
      valueLabel = filter.val.split('|').join(' - ');
    }
    // Operator label (always show full word)
    let opLabel = filter.cond.charAt(0).toUpperCase() + filter.cond.slice(1);
    // Trash can SVG (exactly as headerTrash)
    const trashSVG = `<button type="button" class="filter-trash" aria-label="Remove filter" tabindex="0" style="background:none;border:none;padding:0;margin-left:0.7em;display:flex;align-items:center;cursor:pointer;color:#888;">
      <svg viewBox="0 0 24 24" aria-hidden="true" width="20" height="20">
        <path d="M9 3h6a1 1 0 0 1 1 1v1h4v2H4V5h4V4a1 1 0 0 1 1-1Zm-3 6h12l-.8 11.2A2 2 0 0 1 15.2 22H8.8a2 2 0 0 1-1.99-1.8L6 9Z"/>
      </svg>
    </button>`;
    // Render pill content with trash can at the end using flex
    this.el.style.display = 'flex';
    this.el.style.alignItems = 'center';
    this.el.style.justifyContent = 'space-between';
    this.el.innerHTML = `<span>${opLabel} <b>${valueLabel}</b></span>${trashSVG}`;
    // Remove handler
    this.el.querySelector('.filter-trash').onclick = (e) => {
      e.stopPropagation();
      if (this.onRemove) this.onRemove();
    };
  }

  getElement() {
    return this.el;
  }
}

/* ------------------------------------------------------------------
   Query Templates functionality
   ------------------------------------------------------------------*/

// Helper to get templates from local storage
function getTemplates() {
  try {
    const templates = JSON.parse(localStorage.getItem('queryTemplates') || '[]');
    return Array.isArray(templates) ? templates : [];
  } catch (e) {
    console.error('Error loading templates:', e);
    return [];
  }
}

// Helper to save templates to local storage
function saveTemplates(templates) {
  try {
    localStorage.setItem('queryTemplates', JSON.stringify(templates));
  } catch (e) {
    console.error('Error saving templates:', e);
  }
}

// Save current query as a template
function saveCurrentAsTemplate() {
  try {
    const currentQuery = JSON.parse(queryBox.value || '{}');
    // Don't save empty queries
    if (!currentQuery.DesiredColumnOrder || !currentQuery.DesiredColumnOrder.length) {
      showError('Cannot save an empty query as a template. Please add at least one column.');
      return;
    }
    // Prompt for template name
    const templateName = window.prompt('Enter a name for this template:', '');
    if (!templateName) return; // User cancelled
    const templates = getTemplates();
    // Check for duplicates
    const existingIndex = templates.findIndex(t => t.name === templateName);
    if (existingIndex >= 0) {
      const overwrite = window.confirm(`A template named "${templateName}" already exists. Do you want to replace it?`);
      if (!overwrite) return;
      templates[existingIndex] = { name: templateName, query: currentQuery, date: new Date().toISOString() };
    } else {
      // Add new template
      templates.push({
        name: templateName,
        query: currentQuery,
        date: new Date().toISOString()
      });
    }
    saveTemplates(templates);
    TemplateManager.renderTemplates();
    // Show success message
    const message = document.createElement('div');
    message.className = 'fixed bottom-4 right-4 bg-green-100 border border-green-500 text-green-700 px-4 py-3 rounded-md shadow-lg z-50';
    message.innerHTML = `
      <div class="flex items-center gap-2">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
        </svg>
        <span>Template "${templateName}" saved successfully!</span>
      </div>
    `;
    document.body.appendChild(message);
    setTimeout(() => {
      message.style.opacity = '0';
      message.style.transition = 'opacity 0.5s ease';
      setTimeout(() => document.body.removeChild(message), 500);
    }, 3000);
  } catch (e) {
    console.error('Error saving template:', e);
    showError('Failed to save template. Please try again.');
  }
}

// Apply a template
function applyTemplate(template) {
  try {
    if (confirm(`Load the template "${template.name}"? This will replace your current query.`)) {
      // --- Ensure all Marc fields in the template exist in fieldDefs/filteredDefs ---
      const allFields = new Set([...(template.query.DesiredColumnOrder || [])]);
      if (template.query.FilterGroups && Array.isArray(template.query.FilterGroups)) {
        template.query.FilterGroups.forEach(group => {
          (group.Filters || []).forEach(ff => {
            allFields.add(ff.FieldName);
          });
        });
      }
      allFields.forEach(field => {
        if (typeof field === 'string' && field.startsWith('Marc')) {
          if (!fieldDefs.some(d => d.name === field)) {
            // Add to fieldDefs and filteredDefs
            const def = {
              name: field,
              label: field,
              desc: 'Custom MARC field',
              category: 'Marc',
              type: 'string',
              // Add any other default properties as needed
            };
            fieldDefs.push(def);
            filteredDefs.push(def);
          }
        }
      });
      // --- Apply the query columns ---
      displayedFields = [...(template.query.DesiredColumnOrder || [])];
      // Clear and reapply filters from FilterGroups
      Object.keys(activeFilters).forEach(k => delete activeFilters[k]);
      if (template.query.FilterGroups && Array.isArray(template.query.FilterGroups)) {
        template.query.FilterGroups.forEach(group => {
          const logical = group.LogicalOperator || 'And';
          (group.Filters || []).forEach(ff => {
            const field = ff.FieldName;
            if (!activeFilters[field]) {
              activeFilters[field] = { logical, filters: [] };
            }
            activeFilters[field].logical = logical;
            activeFilters[field].filters.push({
              cond: ff.FieldOperator.toLowerCase(),
              val: ff.Values.join(ff.FieldOperator.toLowerCase() === 'between' ? '|' : ',')
            });
          });
        });
      }
      // Rebuild the table and refresh UI
      showExampleTable(displayedFields);
      updateQueryJson();
      updateCategoryCounts();
      safeRenderBubbles();
      // Show success notification
      const message = document.createElement('div');
      message.className = 'fixed bottom-4 right-4 bg-blue-100 border border-blue-500 text-blue-700 px-4 py-3 rounded-md shadow-lg z-50';
      message.innerHTML = `
        <div class="flex items-center gap-2">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
          </svg>
          <span>Template "${template.name}" loaded!</span>
        </div>
      `;
      document.body.appendChild(message);
      setTimeout(() => {
        message.style.opacity = '0';
        message.style.transition = 'opacity 0.5s ease';
        setTimeout(() => document.body.removeChild(message), 500);
      }, 3000);
      // Close the templates panel
      closeModal('templates-panel');
    }
  } catch (e) {
    console.error('Error applying template:', e);
    showError('Failed to apply template. It may be corrupted.');
  }
}

// Delete a template
function deleteTemplate(template, element) {
  if (confirm(`Are you sure you want to delete the template "${template.name}"?`)) {
    const templates = getTemplates();
    const newTemplates = templates.filter(t => t.name !== template.name);
    saveTemplates(newTemplates);
    
    // Remove from UI with animation
    element.style.maxHeight = element.scrollHeight + 'px';
    element.style.opacity = '1';
    
    setTimeout(() => {
      element.style.maxHeight = '0';
      element.style.opacity = '0';
      element.style.paddingTop = '0';
      element.style.paddingBottom = '0';
      element.style.marginBottom = '0';
      
      setTimeout(() => {
        if (element.parentNode) {
          element.parentNode.removeChild(element);
        }
        // Check if list is empty
        if (newTemplates.length === 0) {
          TemplateManager.renderTemplates(); // Show empty state
        }
      }, 300);
    }, 0);
  }
}

// Render the templates list
function renderTemplates() {
  const templatesContainer = document.getElementById('templates-list');
  if (!templatesContainer) return;
  const templates = getTemplates();
  // Get search value
  const searchInput = document.getElementById('templates-search');
  const searchTerm = searchInput ? searchInput.value.trim().toLowerCase() : '';
  let filteredTemplates = templates;
  if (searchTerm) {
    filteredTemplates = templates.filter(t =>
      t.name.toLowerCase().includes(searchTerm)
    );
  }
  if (!filteredTemplates.length) {
    templatesContainer.innerHTML = `
      <p class="text-center text-gray-500 italic py-4">No templates found.</p>
    `;
    return;
  }
  templatesContainer.innerHTML = '';
  // Sort by newest first
  filteredTemplates.sort((a, b) => new Date(b.date) - new Date(a.date));
  filteredTemplates.forEach(template => {
    const item = document.createElement('div');
    item.className = 'py-4 first:pt-0 last:pb-0 transition-all duration-300';
    item.style.overflow = 'hidden';
    // Format date nicely
    let dateDisplay = 'Unknown date';
    try {
      const date = new Date(template.date);
      dateDisplay = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (e) {}
    // Calculate stats
    const columnCount = template.query.DesiredColumnOrder?.length || 0;
    let filterCount = 0;
    if (template.query.FilterGroups) {
      template.query.FilterGroups.forEach(group => {
        filterCount += (group.Filters?.length || 0);
      });
    }
    item.innerHTML = `
      <div class="flex justify-between items-start">
        <div>
          <h4 class="font-semibold text-teal-800">${template.name}</h4>
          <div class="text-sm text-gray-500 mt-1">Created: ${dateDisplay}</div>
          <div class="text-sm text-gray-600 mt-2 flex items-center gap-4">
            <span class="flex items-center gap-1" data-tooltip="${formatColumnsTooltip(template.query.DesiredColumnOrder || [])}">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M3 14h18M3 18h18M3 6h18"></path>
              </svg>
              ${columnCount} Column${columnCount !== 1 ? 's' : ''}
            </span>
            <span class="flex items-center gap-1" data-tooltip="${formatFiltersTooltip(null, template.query.FilterGroups)}">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4h13M3 8h9M3 12h9M3 16h9M3 20h9M17 8l2 2 4-4"></path>
              </svg>
              ${filterCount} Filter${filterCount !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
        <div class="flex gap-2">
          <button class="load-template-btn p-1.5 rounded-full bg-black text-white hover:bg-gray-800 flex items-center justify-center transition-colors" data-template-name="${template.name}" aria-label="Load Template" data-tooltip="Load Template">
            <svg fill="none" viewBox="0 0 24 24" class="w-5 h-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M5.36,13.65,3.15,17.38A1.08,1.08,0,0,0,4.09,19H11"/>
              <path d="M16,19l3.93.05a1.07,1.07,0,0,0,.92-1.62l-3.38-5.87"/>
              <path d="M15.09,7.33,13,3.54a1.08,1.08,0,0,0-1.87,0l-3.46,6"/>
              <polyline points="9.3 17 11 19 9 21"/>
              <polyline points="16.52 13.92 17.4 11.45 20.13 12.18"/>
              <polyline points="10.22 9.06 7.64 9.53 6.91 6.8"/>
            </svg>
          </button>
          <button class="delete-template-btn p-1.5 rounded-full bg-black text-white hover:bg-red-600 focus:outline-none transition-colors" data-template-name="${template.name}" aria-label="Delete Template">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5">
              <path d="M3 6h18"></path>
              <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"></path>
              <line x1="10" y1="11" x2="10" y2="17"></line>
              <line x1="14" y1="11" x2="14" y2="17"></line>
            </svg>
          </button>
        </div>
      </div>
    `;
    templatesContainer.appendChild(item);
    // Add event listeners to buttons
    const loadBtn = item.querySelector('.load-template-btn');
    loadBtn.addEventListener('click', () => {
      const templateToLoad = templates.find(t => t.name === template.name);
      if (templateToLoad) {
        applyTemplate(templateToLoad);
      }
    });
    const deleteBtn = item.querySelector('.delete-template-btn');
    deleteBtn.addEventListener('click', () => {
      deleteTemplate(template, item);
    });
  });
}
const TemplateManager = {
  getTemplates,
  saveTemplates,
  saveCurrentAsTemplate,
  applyTemplate,
  deleteTemplate,
  renderTemplates
};


// Initialize templates functionality
document.addEventListener('DOMContentLoaded', () => {
  // Render templates list on page load
  TemplateManager.renderTemplates();
  
  // Add event listener to the Save Template button
  const saveTemplateBtn = document.getElementById('save-template-btn');
  if (saveTemplateBtn) {
    saveTemplateBtn.addEventListener('click', TemplateManager.saveCurrentAsTemplate);
  }
  // Attach search event listener on DOMContentLoaded
  const searchInput = document.getElementById('templates-search');
  if (searchInput) {
    searchInput.addEventListener('input', TemplateManager.renderTemplates);
  }
  
  // Attach queries search event listener
  const queriesSearchInput = document.getElementById('queries-search');
  if (queriesSearchInput) {
    queriesSearchInput.addEventListener('input', renderQueries);
  }
  
  // Initialize table name input functionality
  const tableNameInput = document.getElementById('table-name-input');
  if (tableNameInput) {
    // Auto-resize input based on content
    function autoResizeInput() {
      const minWidth = 200;
      // Get the table container width as max width
      const tableContainer = document.querySelector('.overflow-x-auto.shadow.rounded-lg.mb-6.relative');
      const maxWidth = tableContainer ? tableContainer.offsetWidth - 32 : 400; // 32px for margins
      
      // Create a temporary span to measure text width
      const temp = document.createElement('span');
      temp.style.visibility = 'hidden';
      temp.style.position = 'absolute';
      temp.style.fontSize = getComputedStyle(tableNameInput).fontSize;
      temp.style.fontFamily = getComputedStyle(tableNameInput).fontFamily;
      temp.style.fontWeight = getComputedStyle(tableNameInput).fontWeight;
      temp.style.padding = getComputedStyle(tableNameInput).padding;
      temp.textContent = tableNameInput.value || tableNameInput.placeholder;
      document.body.appendChild(temp);
      
      const textWidth = temp.offsetWidth + 20; // Add padding
      document.body.removeChild(temp);
      
      const newWidth = Math.max(minWidth, Math.min(maxWidth, textWidth));
      tableNameInput.style.width = newWidth + 'px';
      
      // If text width exceeds the input width, the overflow-x: auto will handle scrolling
    }
    
    // Initial resize
    autoResizeInput();
    
    // Resize on input
    tableNameInput.addEventListener('input', () => {
      autoResizeInput();
      updateButtonStates(); // Update download button state when table name changes
    });
    
    // Add immediate visual feedback for empty table name
    tableNameInput.addEventListener('blur', () => {
      updateButtonStates(); // Trigger validation when user leaves the input
    });
    
    // Remove error styling when user starts typing
    tableNameInput.addEventListener('focus', () => {
      if (tableNameInput.value === 'Query Results') {
        tableNameInput.select();
      }
      // Remove error styling when user focuses on input to start typing
      tableNameInput.classList.remove('error');
    });
    
    // Resize when window resizes (to update max width based on table)
    window.addEventListener('resize', autoResizeInput);
  }
  
  // Initialize with some sample columns to demonstrate virtual scrolling
  setTimeout(() => {
    console.log('Initializing with sample columns for virtual scrolling demo...');
    displayedFields = ['Title', 'Author', 'Call Number', 'Library', 'Item Type'];
    showExampleTable(displayedFields);
  }, 500);
});

// Add a global flag to block bubble rendering during animation
let isBubbleAnimatingBack = false;
let pendingRenderBubbles = false;

// Replace all direct calls to renderBubbles() with a helper:
function safeRenderBubbles() {
  if (isBubbleAnimatingBack) {
    pendingRenderBubbles = true;
    return;
  }
  renderBubbles();
  pendingRenderBubbles = false;
}

// Helper to format filters for tooltips (used by both bubbles and templates)
function formatFiltersTooltip(fieldName, filterGroups) {
  if (!filterGroups || !Array.isArray(filterGroups)) return '';
  let lines = [];
  filterGroups.forEach(group => {
    (group.Filters || []).forEach(f => {
      if (!fieldName || f.FieldName === fieldName) {
        let op = f.FieldOperator.replace(/([A-Z])/g, ' $1').trim().toLowerCase();
        let vals = (f.Values || []).join(', ');
        lines.push(`${f.FieldName}: ${op} ${vals}`);
      }
    });
  });
  return lines.join('\n');
}

// Helper to format columns for tooltips (used by templates, can be reused elsewhere)
function formatColumnsTooltip(columns) {
  if (!Array.isArray(columns) || columns.length === 0) return '';
  return columns.join('\n');
}

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
  if (!tableScrollContainer || !virtualTableData.length || !displayedFields.length) return;
  
  const table = tableScrollContainer.querySelector('#example-table');
  if (!table) return;
  
  const tbody = table.querySelector('tbody');
  const { start, end } = calculateVisibleRows();
  
  // Clear existing body rows
  tbody.innerHTML = '';
  
  // Create spacer for rows above visible area
  if (start > 0) {
    const topSpacer = document.createElement('tr');
    const spacerCell = document.createElement('td');
    spacerCell.setAttribute('colspan', displayedFields.length.toString());
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
    
    displayedFields.forEach((field, colIndex) => {
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
    spacerCell.setAttribute('colspan', displayedFields.length.toString());
    spacerCell.style.height = `${remainingRows * tableRowHeight}px`;
    spacerCell.style.padding = '0';
    spacerCell.style.border = 'none';
    bottomSpacer.appendChild(spacerCell);
    tbody.appendChild(bottomSpacer);
  }
  
  // Re-apply drag and drop to the new rows
  addDragAndDrop(table);
}

function handleTableScroll(e) {
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

// Helper function to format duration in a comprehensive way
function formatDuration(seconds) {
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
}

// Helper to get templates from local storage
function getTemplates() {
  try {
    const templates = JSON.parse(localStorage.getItem('queryTemplates') || '[]');
    return Array.isArray(templates) ? templates : [];
  } catch (e) {
    console.error('Error loading templates:', e);
    return [];
  }
}