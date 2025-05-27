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
let isBubbleDrag = false;
let hoverTh = null;           // keeps track of which header we're over
let currentCategory = 'All';

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
const MODAL_PANEL_IDS = ['json-panel', 'queries-panel', 'help-panel', 'templates-panel'];


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
  // If no other modal is open, hide overlay
  const anyOpen = MODAL_PANEL_IDS.some(id => {
    const p = document.getElementById(id);
    return p && !p.classList.contains('hidden');
  });
  if (!document.querySelector('.active-bubble') && !anyOpen) {
    overlay.classList.remove('show');
  }
}

// Escape key closes modals
window.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    // Only close if a modal is open
    if (overlay.classList.contains('show')) {
      closeAllModals();
    }
  }
});

document.getElementById('toggle-json')?.addEventListener('click', () => openModal('json-panel'));
document.getElementById('toggle-queries')?.addEventListener('click', () => openModal('queries-panel'));
document.getElementById('toggle-help')?.addEventListener('click', () => openModal('help-panel'));
document.getElementById('toggle-templates')?.addEventListener('click', () => openModal('templates-panel'));
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

// Download button reference
if (downloadBtn) {
  downloadBtn.disabled = false; // Always enabled
  downloadBtn.addEventListener('click', () => {
    if (!queryBox) return;
    const blob = new Blob([queryBox.value], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'query.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 0);
  });
}

/* Enable Run button only when query JSON has something to run */
function updateRunBtnState(){
  if(!runBtn) return;
  try{
    const q = JSON.parse(queryBox.value || '{}');
    const hasFields = Array.isArray(q.DesiredColumnOrder) && q.DesiredColumnOrder.length > 0;
    runBtn.disabled = !hasFields || queryRunning;
    // Set tooltip based on running state
    runBtn.setAttribute('data-tooltip', queryRunning ? 'Stop Query' : 'Run Query');
  }catch{
    runBtn.disabled = true;
    runBtn.setAttribute('data-tooltip', 'Run Query');
  }
}
// Initial check
updateRunBtnState();

if(runBtn){
  runBtn.addEventListener('click', ()=>{
    if(runBtn.disabled) return;   // ignore when inactive
    queryRunning = !queryRunning;
    runBtn.classList.toggle('running', queryRunning);
    runIcon.classList.toggle('hidden', queryRunning);
    stopIcon.classList.toggle('hidden', !queryRunning);
    // Update tooltip
    runBtn.setAttribute('data-tooltip', queryRunning ? 'Stop Query' : 'Run Query');

    // --- Hide/show ancillary UI and resize the table while the query runs ---
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
      if (queryRunning) {
        el.dataset.prevDisplay = el.style.display || '';
        el.style.display = 'none';
      } else {
        el.style.display = el.dataset.prevDisplay || '';
      }
    });

    if (queryRunning) {
      adjustTableHeight();
      window.addEventListener('resize', adjustTableHeight);
    } else if (tableWrapper) {
      tableWrapper.style.height    = '';
      tableWrapper.style.maxHeight = '';
      tableWrapper.style.overflowY = '';
      window.removeEventListener('resize', adjustTableHeight);
    }

    if(queryRunning){
      console.log('Query started…');   // TODO: start real query here
    }else{
      console.log('Query stopped.');   // TODO: stop/abort query here
      updateRunBtnState();
    }
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
function positionDropAnchor(isBubble, rect, table, clientX){
  if(isBubble){
    dropAnchor.classList.add('vertical');
    const insertLeft = (clientX - rect.left) < rect.width/2;
    // Add extra 16px to the height to ensure it reaches the bottom
    dropAnchor.style.width  = '4px';
    dropAnchor.style.height = (table.offsetHeight + 16) + 'px';
    dropAnchor.style.left   = (insertLeft ? rect.left : rect.right) + window.scrollX - 2 + 'px';
    dropAnchor.style.top    = table.getBoundingClientRect().top + window.scrollY + 'px';
  }else{
    dropAnchor.classList.remove('vertical');
    dropAnchor.style.width  = rect.width + 'px';
    dropAnchor.style.height = '4px';
    dropAnchor.style.left   = rect.left + window.scrollX + 'px';
    dropAnchor.style.top    = rect.bottom + window.scrollY - 2 + 'px';
  }
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
// hoverTh already declared at the top
headerTrash.addEventListener('click', e=>{
  e.stopPropagation();
  if(hoverTh){
    const idx = parseInt(hoverTh.dataset.colIndex, 10);
    const table = hoverTh.closest('table');
    removeColumn(table, idx);
  }
});

// isBubbleDrag already declared at the top

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
  updateRunBtnState();
}

// Helper function to check if a field should have purple styling
function shouldFieldHavePurpleStyling(fieldName) {
  // Check if the field has active filters
  const hasFilters = activeFilters[fieldName] && 
                    activeFilters[fieldName].filters && 
                    activeFilters[fieldName].filters.length > 0;
  
  // Check if the field is displayed as a column
  const isDisplayed = displayedFields.includes(fieldName);
  
  return hasFilters || isDisplayed;
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

overlay.addEventListener('click',()=>{
  overlay.classList.remove('show');
  resetActive();
  conditionPanel.classList.remove('show');
  inputWrapper.classList.remove('show');
  
  // Always ensure input lock is cleared when overlay is clicked
  isInputLocked = false;
  inputBlockOverlay.style.pointerEvents = 'none';
  inputBlockOverlay.style.display = 'none';
  if (inputLockTimeout) clearTimeout(inputLockTimeout);
  
  // Remove all .active from condition buttons
  const btns = conditionPanel.querySelectorAll('.condition-btn');
  btns.forEach(b=>b.classList.remove('active'));
  conditionInput.value='';
  // Hide select if present
  const sel = document.getElementById('condition-select');
  if(sel) sel.style.display = 'none';
  // Also hide JSON / Queries modals if they are open
  ['json-panel','queries-panel','help-panel'].forEach(id=>{
    const p = document.getElementById(id);
    if(p && !p.classList.contains('hidden')){
      p.classList.add('hidden');
    }
  });
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
    }
    overlay.click();
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
  
  // Process values to handle both old format (string) and new format (objects with display/literal)
  const processedValues = values.map(val => {
    if (typeof val === 'string') {
      // Old format - use the same value for both display and literal
      return { display: val, literal: val, raw: val };
    } else {
      // New format with display and literal properties
      return { ...val, raw: val.display };
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

  // Special handling for Marc creator bubble
  const fieldDef = fieldDefs.find(f => f.name === field);
  const isSpecialMarc = fieldDef && fieldDef.isSpecialMarc;
  if (isSpecialMarc) {
    const marcInput = document.getElementById('marc-field-input');
    const marcNumbersRaw = marcInput?.value?.trim();
    if (!marcNumbersRaw) {
      return showError('Please enter at least one Marc field number', [marcInput]);
    }
    // Split on comma, trim, and filter valid 1-3 digit numbers
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
      // Ensure the new Marc field is shown as a column in the table
      if (!displayedFields.includes(dynamicMarcField)) {
        displayedFields.push(dynamicMarcField);
        showExampleTable(displayedFields);
      }
      // Only add a filter to the first Marc field if both a condition and value are supplied
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
    // Manual bubble creation - create bubble if it doesn't exist
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
    updateQueryJson();
    resetActive();
    overlay.click();
    // Make sure to reset lock state when done
    isInputLocked = false;
    inputBlockOverlay.style.pointerEvents = 'none';
    inputBlockOverlay.style.display = 'none';
    if (inputLockTimeout) clearTimeout(inputLockTimeout);
    return;
  }

  // --- Normal (non-Marc) field logic below ---
  // Check if this is a multiSelect field
  const isMultiSelect = fieldDef && fieldDef.multiSelect;
  
  // Validate condition input
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
  
  // Validate between values - ensure start is before end
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
    // If start > end, swap them
    if (a > b) {
      conditionInput.value = val2;
      document.getElementById('condition-input-2').value = val;
      val = conditionInput.value.trim();
      val2 = document.getElementById('condition-input-2').value.trim();
    }
  }
  
  // Filter application
  if (cond && cond !== 'display') {
    try {
      if (!activeFilters[field]) {
        activeFilters[field] = { logical: 'And', filters: [] };
      }
      
      // Determine which type of input is visible
  const isTextInputVisible = conditionInput.style.display !== 'none';
  const isSelectVisible = sel && sel.style.display !== 'none';
  const isContainerVisible = selContainer && selContainer.style.display !== 'none';
  
      // Get the value to apply
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
      
      // Check for logical contradictions
      const fieldType = bubble.dataset.type || 'string';
      const newFilterObj = { cond, val: filterValue };
      const existingSet = activeFilters[field];
      const conflictMsg = getContradictionMessage(existingSet, newFilterObj, fieldType, field);
      if (conflictMsg) {
        showError(conflictMsg, [conditionInput, document.getElementById('condition-input-2')]);
        return;
      }
      
      // Add the filter if it's not empty
      if (filterValue !== '') {
        console.log(`Applying filter for ${field}: ${cond} ${filterValue}`);
        
        // For multi-select equals, merge with existing values
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
        
        // Update the field styling in all bubbles for this field
    document.querySelectorAll('.bubble').forEach(b => {
      if (b.textContent.trim() === field) {
        applyCorrectBubbleStyling(b);
      }
    });
    
        // Update the conditions list display
    renderConditionList(field);
    updateQueryJson();
        
        // If the category is 'Selected', refresh the display
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
  
  // Handle display option (Show/Hide column)
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
  
  // Clear inputs for next use
  conditionInput.value = '';
  document.getElementById('condition-input-2').value = '';
  
  // Cleanup and reset UI state
  isInputLocked = false;
  inputBlockOverlay.style.pointerEvents = 'none';
  inputBlockOverlay.style.display = 'none';
  if (inputLockTimeout) clearTimeout(inputLockTimeout);
  
  // Close the overlay
  overlay.click();
  
  // Force a bubbles re-render to ensure display is updated
  safeRenderBubbles();
  updateCategoryCounts();
  overlay.classList.remove('bubble-active');
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
const fieldDefs = [
  { "name": "Library", "type": "string", "values": [
    { "display": "TRLS-A", "literal": "1" },
    { "display": "TRLS-B", "literal": "2" },
    { "display": "TRLS-C", "literal": "3" },
    { "display": "MLTN-A", "literal": "4" },
    { "display": "MLTN-B", "literal": "5" },
    { "display": "WSPR-X", "literal": "6" }
  ], "filters": ["equals"], "category": "Item", "multiSelect": true, "desc": "Owning library for the item" },
  { "name": "Author", "type": "string", "filters": ["contains", "starts", "equals"], "category": "Catalog", "desc": "The author or creator of the item" },
  { "name": "Title", "type": "string", "filters": ["contains", "starts", "equals"], "category": "Catalog", "desc": "The title of the item" },
  { "name": "Price", "type": "money", "category": "Catalog", "desc": "The price of the item" },
  { "name": "Call Number", "type": "string", "filters": ["contains", "equals", "between"], "category": "Call #", "desc": "The call number assigned to the item" },
  { "name": "Catalog Key", "type": "string", "filters": ["equals"], "category": "Catalog", "desc": "Unique catalog key for the item" },
  { "name": "Barcode", "type": "string", "category": "Item", "desc": "Barcode identifier for the item" },
  { "name": "Item Type", "type": "string", "category": "Item", "desc": "Type or format of the item (e.g., book, DVD)" },
  { "name": "Home Location", "type": "string", "category": "Item", "desc": "Home location or shelving location of the item" },
  { "name": "Marc", "type": "string", "category": "Marc", "isSpecialMarc": true, "desc": "Create custom MARC field filters by specifying a MARC field number" },
  { "name": "Item Creation Date", "type": "date", "category": ["Item", "Dates"], "desc": "Date the item record was created" },
  { "name": "Item Total Charges", "type": "number", "category": "Item", "desc": "Total number of times the item has been charged (checked out)" },
  { "name": "Item Last Used", "type": "date", "category": ["Item", "Dates"], "desc": "Date the item was last used or checked out" },
  { "name": "Number of Bills", "type": "number", "category": "Item", "desc": "Number of bills associated with the item" },
  { "name": "Number of Current Charges", "type": "number", "category": "Item", "desc": "Number of current charges on the item" },
  { "name": "Category1", "type": "string", "category": "Item", "desc": "Custom category 1 for the item" },
  { "name": "Category2", "type": "string", "category": "Item", "desc": "Custom category 2 for the item" },
  { "name": "Copy Hold Count", "type": "number", "category": "Item", "desc": "Number of holds on this copy" },
  { "name": "In-House Charges", "type": "number", "category": "Item", "desc": "Number of in-house uses (not checked out)" },
  { "name": "Extended Info Offset", "type": "number", "category": "Item", "desc": "Offset for extended information in the item record" },
  { "name": "Current Location", "type": "string", "category": "Item", "desc": "Current location of the item (may differ from home location)" },
  { "name": "Last Charged Date", "type": "date", "category": ["Item", "Dates"], "desc": "Date the item was last checked out" },
  { "name": "Permanent/Temporary", "type": "string", "values": [
    { "display": "Yes", "literal": "Y" },
    { "display": "No", "literal": "N" }
  ], "filters": ["equals"], "category": "Item", "desc": "Indicates if the item is permanent or temporary" },
  { "name": "Reserve Control Key", "type": "number", "category": "Item", "desc": "Key for reserve control on the item" },
  { "name": "Last User Key", "type": "string", "category": "Item", "desc": "Key of the last user who checked out the item" },
  { "name": "Recirculation Flag", "type": "string", "values": [
    { "display": "Yes", "literal": "Y" },
    { "display": "No", "literal": "N" },
    { "display": "Maybe", "literal": "M" }
  ], "filters": ["equals"], "category": "Item", "desc": "Indicates if the item can be recirculated" },
  { "name": "Inventory Date", "type": "date", "category": ["Item", "Dates"], "desc": "Date the item was last inventoried" },
  { "name": "Inventory Count", "type": "number", "category": "Item", "desc": "Number of times the item has been inventoried" },
  { "name": "Available Hold Key", "type": "number", "category": "Item", "desc": "Key for available holds on the item" },
  { "name": "Publication Date", "type": "date", "category": ["Item", "Dates"], "desc": "Publication date of the item" },
  { "name": "Catalog Accountability", "type": "number", "category": "Catalog", "desc": "Accountability code for the catalog record" },
  { "name": "Catalog Last Callnum", "type": "number", "category": "Catalog", "desc": "Last call number used in the catalog record" },
  { "name": "Catalog MARClist Offset", "type": "number", "category": "Catalog", "desc": "Offset for MARC list in the catalog record" },
  { "name": "Catalog Format", "type": "string", "category": "Catalog", "desc": "Format of the catalog record (e.g., MARC, Dublin Core)" },
  { "name": "Catalog # of Libraries", "type": "number", "category": "Catalog", "desc": "Number of libraries associated with the catalog record" },
  { "name": "Catalog # of Title Holds", "type": "number", "category": "Catalog", "desc": "Number of title-level holds in the catalog" },
  { "name": "Catalog IMMS Material Type", "type": "string", "category": "Catalog", "desc": "IMMS material type code for the catalog record" },
  { "name": "Catalog # of Total Holds", "type": "number", "category": "Catalog", "desc": "Total number of holds in the catalog" },
  { "name": "Catalog MARC Offset/Link", "type": "number", "category": "Catalog", "desc": "Offset or link to MARC data in the catalog record" },
  { "name": "Catalog # of Callnums", "type": "number", "category": "Catalog", "desc": "Number of call numbers in the catalog record" },
  { "name": "Catalog Creation Date", "type": "date", "category": ["Catalog", "Dates"], "desc": "Date the catalog record was created" },
  { "name": "Catalog Cataloged Date", "type": "date", "category": ["Catalog", "Dates"], "desc": "Date the item was cataloged" },
  { "name": "Catalog Last Modified Date", "type": "date", "category": ["Catalog", "Dates"], "desc": "Date the catalog record was last modified" },
  { "name": "Catalog Created Login", "type": "string", "category": "Catalog", "desc": "Login of the user who created the catalog record" },
  { "name": "Catalog BRS Status", "type": "number", "category": "Catalog", "desc": "BRS status code for the catalog record" },
  { "name": "Catalog Last Modified By", "type": "string", "category": "Catalog", "desc": "User who last modified the catalog record" },
  { "name": "Catalog Material Type", "type": "string", "category": "Catalog", "desc": "Material type of the catalog record" },
  { "name": "Catalog Collection Category", "type": "string", "category": "Catalog", "desc": "Collection category for the catalog record" },
  { "name": "Catalog New Material Date", "type": "date", "category": ["Catalog", "Dates"], "desc": "Date new material was added to the catalog" },
  { "name": "Catalog Non-Return Period", "type": "string", "category": "Catalog", "desc": "Non-return period for the catalog record" },
  { "name": "Catalog Period Until Rotatable", "type": "string", "category": "Catalog", "desc": "Period until the item can be rotated" },
  { "name": "Catalog Minimum Performance", "type": "number", "category": "Catalog", "desc": "Minimum performance value for the catalog record" },
  { "name": "Catalog Maximum Performance", "type": "number", "category": "Catalog", "desc": "Maximum performance value for the catalog record" },
  { "name": "Catalog Period Performance", "type": "string", "category": "Catalog", "desc": "Performance period for the catalog record" },
  { "name": "Catalog # of Visible Callnums", "type": "number", "category": "Catalog", "desc": "Number of visible call numbers in the catalog record" },
  { "name": "Catalog # of Shadow Callnums", "type": "number", "category": "Catalog", "desc": "Number of shadowed call numbers in the catalog record" },
  { "name": "Catalog # of Copies on Open Order", "type": "number", "category": "Catalog", "desc": "Number of copies on open order in the catalog record" },
  { "name": "Catalog Review Record Flag", "type": "number", "category": "Catalog", "desc": "Review record flag for the catalog record" },
  { "name": "Catalog Heading Offset", "type": "number", "category": "Catalog", "desc": "Heading offset in the catalog record" },
  { "name": "Catalog MARC File Number", "type": "number", "category": "Catalog", "desc": "MARC file number for the catalog record" },
  { "name": "Catalog Shadowed Flag", "type": "number", "category": "Catalog", "desc": "Shadowed flag for the catalog record" },
  { "name": "Catalog Hold Exempt Date", "type": "date", "category": ["Catalog", "Dates"], "desc": "Date the catalog record was exempted from holds" },
  { "name": "Catalog System Date Modified", "type": "date", "category": ["Catalog", "Dates"], "desc": "System date the catalog record was last modified" },
  { "name": "Call Number Key", "type": "string", "category": "Call #", "desc": "Key for the call number" },
  { "name": "Analytic Position", "type": "number", "category": "Item", "desc": "Analytic position for the item" },
  { "name": "Bound-with Level", "type": "string", "values": [
    { "display": "None", "literal": "NONE" },
    { "display": "Child", "literal": "CHILD" },
    { "display": "Parent", "literal": "PARENT" }
  ], "filters": ["equals"], "category": "Item", "desc": "Bound-with level for the item" },
  { "name": "Number of Copies", "type": "number", "category": ["Item"], "desc": "Number of copies of the item" },
  { "name": "System Date Modified", "type": "date", "category": ["Item", "Dates"], "desc": "System date the item was last modified" },
  { "name": "Call-level Holds", "type": "number", "category": "Item", "desc": "Number of call-level holds on the item" },
  { "name": "Number of Reserve Controls", "type": "number", "category": "Item", "desc": "Number of reserve controls for the item" },
  { "name": "Number of Copies on Reserve", "type": "number", "category": "Item", "desc": "Number of copies of the item on reserve" },
  { "name": "Number of Visible Copies", "type": "number", "category": "Item", "desc": "Number of visible copies of the item" },
  { "name": "Shadowed Flag", "type": "string", "values": [
    { "display": "Yes", "literal": "Y" },
    { "display": "No", "literal": "N" }
  ], "filters": ["equals"], "category": "Item", "desc": "Indicates if the item is shadowed" },
  { "name": "Shelving Key", "type": "string", "category": "Item", "desc": "Shelving key for the item" },
  { "name": "Base Call Number", "type": "string", "category": "Item", "desc": "Base call number for the item" },
  { "name": "Item Number", "type": "string", "category": "Item", "desc": "Unique item number" }
];


let filteredDefs = [...fieldDefs];              // starts as full set
// Derive categories from every field definition, supporting either
// a single string or an array of strings for the `category` property.
const derivedCatSet = new Set();
fieldDefs.forEach(d => {
  const cat = d.category;
  if (Array.isArray(cat)) {
    cat.forEach(c => derivedCatSet.add(c));
  } else {
    derivedCatSet.add(cat);
  }
});
const derivedCats = Array.from(derivedCatSet);


// Prepend the universal "All" filter, preserving first-seen order
const categories = ['All', 'Selected', ...derivedCats];
// currentCategory, totalRows, scrollRow, rowHeight, and hoverScrollArea already declared at the top

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
  // Calculate selected count first
  const selectedCount = fieldDefs.filter(d => {
    const fieldName = d.name;
    return shouldFieldHavePurpleStyling(fieldName);
  }).length;

  categoryBar.innerHTML = categories.map(cat => {
    // Skip Selected category if count is 0
    if (cat === 'Selected' && selectedCount === 0) return '';
    
    let count;
    if (cat === 'All') {
      count = fieldDefs.length;
    } else if (cat === 'Selected') {
      count = selectedCount;
    } else {
      count = fieldDefs.filter(d => {
          const c = d.category;
          return Array.isArray(c) ? c.includes(cat) : c === cat;
        }).length;
    }
    return `<button data-category="${cat}" class="category-btn ${cat==='All' ? 'active' : ''}">${cat} (${count})</button>`;
  }).join('');

  // Attach listeners to segmented buttons
  document.querySelectorAll('#category-bar .category-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      // Prevent navigation if overlay is shown or a bubble is enlarged
      if (overlay.classList.contains('show') || document.querySelector('.active-bubble')) return;
      currentCategory = btn.dataset.category;
      document.querySelectorAll('#category-bar .category-btn').forEach(b =>
        b.classList.toggle('active', b === btn)
      );
      scrollRow = 0;
      safeRenderBubbles();
    });
  });
  
  // Also populate the mobile selector
  const mobileSelector = document.getElementById('mobile-category-selector');
  if (mobileSelector) {
    // Clear existing options
    mobileSelector.innerHTML = '';
    
    // Add options for each category
    categories.forEach(cat => {
      // Skip Selected category if count is 0
      if (cat === 'Selected' && selectedCount === 0) return;
      
      let count;
      if (cat === 'All') {
        count = fieldDefs.length;
      } else if (cat === 'Selected') {
        count = selectedCount;
      } else {
        count = fieldDefs.filter(d => {
          const c = d.category;
          return Array.isArray(c) ? c.includes(cat) : c === cat;
        }).length;
      }
      
      const option = document.createElement('option');
      option.value = cat;
      option.textContent = `${cat} (${count})`;
      option.selected = cat === 'All'; // Default to 'All'
      mobileSelector.appendChild(option);
    });
    
    // Add change event listener
    mobileSelector.addEventListener('change', () => {
      // Prevent navigation if overlay is shown or a bubble is enlarged
      if (overlay.classList.contains('show') || document.querySelector('.active-bubble')) return;
      
      currentCategory = mobileSelector.value;
      
      // Sync the desktop category buttons
      document.querySelectorAll('#category-bar .category-btn').forEach(btn =>
        btn.classList.toggle('active', btn.dataset.category === currentCategory)
      );
      
      scrollRow = 0;
      safeRenderBubbles();
    });
  }
  
  // (Bubble scrollbar navigation handled below)
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

document.addEventListener('dragstart', e=>{
  const bubble = e.target.closest('.bubble');
  if(!bubble) return;
  
  // Check if this bubble is already displayed in the table
  const fieldName = bubble.textContent.trim();
  if(displayedFields.includes(fieldName)) {
    // Prevent dragging of already displayed bubbles
    e.preventDefault();
    return;
  }
  
  e.dataTransfer.setData('bubble-field', fieldName);
  e.dataTransfer.effectAllowed='copy';
  isBubbleDrag = true;
  // Clone bubble and wrap it in a padded container so box-shadow glow isn't clipped
  const wrapper = document.createElement('div');
  const pad = 16;                               // 8 px padding on all sides
  wrapper.style.position = 'absolute';
  wrapper.style.top = '-9999px';
  wrapper.style.left = '-9999px';
  wrapper.style.padding = pad / 2 + 'px';       // half pad each side
  wrapper.style.pointerEvents = 'none';
  wrapper.style.boxSizing = 'content-box';      // pad expands bounding box
  const ghost = bubble.cloneNode(true);
  ghost.style.overflow = 'visible';
  wrapper.appendChild(ghost);
  document.body.appendChild(wrapper);
  const gw = wrapper.offsetWidth;
  const gh = wrapper.offsetHeight;
  e.dataTransfer.setDragImage(wrapper, gw / 2, gh / 2);
  // Remove wrapper after dragstart to clean up
  setTimeout(() => wrapper.remove(), 0);
});

document.addEventListener('dragend', e=>{
  if(e.target.closest('.bubble')) isBubbleDrag = false;
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
        if (typeof parsedValues[0] === 'object' && parsedValues[0].display && parsedValues[0].literal) {
          // New format with display/literal pairs
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
      ? listValues.some(val => val.display.includes('-'))
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
          // New format with display/literal pairs
          const selected = currentLiteralValues.includes(v.literal) ? 'selected' : '';
          return `<option value="${v.literal}" data-display="${v.display}" ${selected}>${v.display}</option>`;
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

// Original confirm button handler to handle Marc fields
const originalConfirmBtnClick = confirmBtn.onclick;
confirmBtn.onclick = function(e) {
  e.stopPropagation();
  const bubble = document.querySelector('.active-bubble');
  if (!bubble) return;
  
  const field = bubble.dataset.filterFor || bubble.textContent.trim();
  const fieldDef = fieldDefs.find(f => f.name === field);
  const isSpecialMarc = fieldDef && fieldDef.isSpecialMarc;
  
  if (isSpecialMarc) {
    // Special handling for Marc fields
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
    
    const cond = document.querySelector('.condition-btn.active')?.dataset.cond;
    if (!cond) return;
    
    const val = conditionInput.value.trim();
    if (!val) {
      // Show error if no filter value
      const errorLabel = document.getElementById('filter-error');
      if (errorLabel) {
        errorLabel.textContent = 'Please enter a filter value';
        errorLabel.style.display = 'block';
        setTimeout(() => { errorLabel.style.display = 'none'; }, 3000);
      }
      return;
    }
    
    // Create a dynamic Marc field
    const dynamicMarcField = `Marc${marcNumber}`;
    
    // Add field definition if it doesn't exist
    let fieldExists = fieldDefs.some(f => f.name === dynamicMarcField);
    if (!fieldExists) {
      fieldDefs.push({
        name: dynamicMarcField,
        type: "string",
        category: "Marc",
        desc: `MARC ${marcNumber} field`
      });
      
      // Make sure it's in filtered definitions too
      filteredDefs.push({
        name: dynamicMarcField,
        type: "string",
        category: "Marc",
        desc: `MARC ${marcNumber} field`
      });
      
      // Automatically add the new field as a column in the table
      if (!displayedFields.includes(dynamicMarcField)) {
        displayedFields.push(dynamicMarcField);
        // Update the table to show the new column
        showExampleTable(displayedFields);
      }
    }
    
    // Add the filter to the new field (not the base Marc)
    if (!activeFilters[dynamicMarcField]) {
      activeFilters[dynamicMarcField] = { logical: 'And', filters: [] };
    }
    const alreadyExists = activeFilters[dynamicMarcField].filters.some(f => f.cond === cond && f.val === val);
    if (!alreadyExists) {
      activeFilters[dynamicMarcField].filters.push({ cond, val });
    }
    
    // Ensure the field is displayed in the table (even if it already existed)
    if (!displayedFields.includes(dynamicMarcField)) {
      displayedFields.push(dynamicMarcField);
      showExampleTable(displayedFields);
    }
    
    // Only switch to Marc category if we're not in a category that already shows Marc fields
    // or if this is the first Marc field being created
    const marcFieldsExist = fieldDefs.some(f => f.name.startsWith('Marc') && f.name !== 'Marc');
    const isInMarcVisibleCategory = currentCategory === 'Marc' || currentCategory === 'All' || currentCategory === 'Selected';
    if (!isInMarcVisibleCategory || !marcFieldsExist) {
      currentCategory = 'Marc';
      document.querySelectorAll('#category-bar .category-btn').forEach(btn =>
        btn.classList.toggle('active', btn.dataset.category === currentCategory)
      );
    }
    
    // Manual bubble creation - create bubble if it doesn't exist
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
    
    // Update JSON
    updateQueryJson();
    resetActive();
    overlay.click();
    // Make sure to reset lock state when done
    isInputLocked = false;
    inputBlockOverlay.style.pointerEvents = 'none';
    inputBlockOverlay.style.display = 'none';
    if (inputLockTimeout) clearTimeout(inputLockTimeout);
    return;
  } else {
    // Normal field handling
    originalConfirmBtnClick.call(this, e);
  }
};

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
  if(term === ''){
    filteredDefs = [...fieldDefs];
  }else{
    filteredDefs = fieldDefs.filter(d=> d.name.toLowerCase().includes(term));
  }
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
(function createFireflies(){
  /* Weighted color palette: common → rare */
  const glowPalette = [
    { color: '#fff9ae', weight: 0.55 },  // yellow-green (common)
    { color: '#b8ffab', weight: 0.25 },  // greenish
    { color: '#ffd36e', weight: 0.15 },  // warm amber
    { color: '#ff946e', weight: 0.04 },  // reddish-orange (rare)
    { color: '#8afcff', weight: 0.01 }   // bluish-green (very rare)
  ];
  function pickGlow(){
    const r = Math.random();
    let sum = 0;
    for(const g of glowPalette){
      sum += g.weight;
      if(r < sum) return g.color;
    }
    return glowPalette[0].color; // fallback
  }

  const COUNT = 30;

  function createOneFirefly(){
    const f = document.createElement('div');
    f.className = 'firefly';
    // start transparent, let CSS fadeIn handle the appearance
    f.classList.add('new');
    // --- position & movement vector ---
    const dx = (Math.random()*120 - 60).toFixed(0) + 'px';
    const dy = (Math.random()*120 - 60).toFixed(0) + 'px';
    f.style.setProperty('--dx', dx);
    f.style.setProperty('--dy', dy);
    // --- size & glow ---
    const size = 2 + Math.random()*2;
    f.style.width  = f.style.height = size + 'px';
    const glow = pickGlow();
    const blur = 4 + size*3;
    f.style.background = glow;
    f.style.boxShadow  = `0 0 ${blur}px ${size}px ${glow}`;
    // --- timing vars ---
    // drift duration inversely related to size (closer = faster)
    const dur = 30 - size * 5;                 // 20-25 s approx
    const blinkDur   = 2 + Math.random()*3;    // 2-5 s
    const blinkDelay = Math.random()*3;        // 0-3 s
    const flashDelay = 4 + Math.random()*8;    // 4-12 s
    // --- fadeIn duration (randomized) ---
    const fadeInDur  = 1.5 + Math.random()*1.5;   // 1.5 – 3 s
    f.style.setProperty('--fadeInDur', fadeInDur + 's');

    f.style.animationDuration = `${fadeInDur}s, ${dur}s, ${blinkDur}s, .25s`;
    f.style.animationDelay    = `0s, 0s, ${blinkDelay}s, ${flashDelay}s`;
    f.style.setProperty('--dur',  dur + 's');
    f.style.setProperty('--blinkDur',  blinkDur + 's');
    f.style.setProperty('--blinkDelay', blinkDelay + 's');
    f.style.setProperty('--flashDelay', flashDelay + 's');

    // recycle after a few drift cycles
    let cycles = 0;
    f.addEventListener('animationiteration', (evt)=>{
      if(evt.animationName === 'drift'){
        cycles++;
        if(cycles > 4){
          // Let the firefly keep drifting; once it is fully out of view, recycle it
          const exitCheck = setInterval(()=>{
            const r = f.getBoundingClientRect();
            if(r.bottom < 0 || r.top > window.innerHeight || r.right < 0 || r.left > window.innerWidth){
              clearInterval(exitCheck);
              f.remove();
              setTimeout(createOneFirefly, 500);   // 0.5 s gap before new spawn
            }
          }, 800);          // check roughly each second
        }
      }
      if(evt.animationName === 'blink'){
        /* 40 % chance of a subtle size pulse */
        if(Math.random() < 0.4){
          f.classList.add('flash-scale');
          setTimeout(() => f.classList.remove('flash-scale'), 250);
        }
        /* On every blink, vary halo intensity slightly (±5 % blur) */
        const intensity = 4 + size*3;
        const blurVariation = intensity * (0.95 + Math.random()*0.1); // 95-105 %
        f.style.boxShadow = `0 0 ${blurVariation}px ${size}px ${glow}`;
      }
    });
    // initial random viewport position
    f.style.top  = Math.random()*100 + 'vh';
    f.style.left = Math.random()*100 + 'vw';
    document.body.appendChild(f);
    // allow fadeIn animation to run on the next frame
    requestAnimationFrame(()=> f.classList.remove('new'));
  }

  for(let i=0;i<COUNT;i++){
    createOneFirefly();
  }
})();

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

  // 1️⃣  Move the cells in every row
  const rows = table.querySelectorAll('tr');
  rows.forEach(row=>{
    const cells = row.children;
    if(fromIndex < cells.length && toIndex < cells.length){
      const moving = cells[fromIndex];
      if(fromIndex < toIndex){
        row.insertBefore(moving, cells[toIndex].nextSibling);
      }else{
        row.insertBefore(moving, cells[toIndex]);
      }
    }
  });

  // 2️⃣  Keep displayedFields order in sync
  if(fromIndex < displayedFields.length && toIndex < displayedFields.length){
    const [movedField] = displayedFields.splice(fromIndex,1);
    displayedFields.splice(toIndex,0,movedField);
  }

  // 3️⃣  Refresh index metadata
  refreshColIndices(table);
  updateQueryJson();
  // 4️⃣  If in Selected category, re-render bubbles to match new order
  if (currentCategory === 'Selected') {
    safeRenderBubbles();
  }
}

function removeColumn(table, colIndex){
  // Capture the header text *before* removing, to sync displayedFields
  const headerCell = table.querySelector(`thead th[data-col-index="${colIndex}"]`);
  const fieldName  = headerCell ? headerCell.textContent.trim() : null;

  // Remove the column cells from every row
  const rows = table.querySelectorAll('tr');
  rows.forEach(row=>{
    const cells = row.children;
    if(colIndex < cells.length){
      cells[colIndex].remove();
    }
  });

  // Update the displayedFields list so re-building the table doesn't resurrect removed columns
  if(fieldName){
    const idx = displayedFields.indexOf(fieldName);
    if(idx !== -1) displayedFields.splice(idx,1);
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
    const container = document.querySelector('.overflow-x-auto.shadow.rounded-lg.mb-6');
    /* Ensure placeholder table has the same height as a fully populated table (≈220 px) */
    let placeholderH = 220;                         // fallback
    const bubbleSample = document.querySelector('#bubble-list .bubble');
    if(bubbleSample){
      const listDiv = document.getElementById('bubble-list');
      const gapVal  = getComputedStyle(listDiv).getPropertyValue('gap') || '0px';
      const gap     = parseFloat(gapVal) || 0;
      const rowH    = bubbleSample.getBoundingClientRect().height + gap;
      const twoRows = rowH*2 - gap;
      placeholderH  = twoRows + 12;                 // match populated table height
    }
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

  // Build header
  let theadHTML = '<tr>';
  displayedFields.forEach((f,i)=>{
    theadHTML += `<th draggable="true" data-col-index="${i}" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"><span class='th-text'>${f}</span></th>`;
  });
  theadHTML += '</tr>';

  // Build three placeholder rows
  let tbodyHTML = '';
  for(let r = 0; r < 3; r++){
    tbodyHTML += '<tr>';
    displayedFields.forEach(()=>{ tbodyHTML += '<td class="px-6 py-4 whitespace-nowrap">...</td>'; });
    tbodyHTML += '</tr>';
  }

  const tableHTML = `
    <table id="example-table" class="min-w-full divide-y divide-gray-200 bg-white">
      <thead class="bg-gray-50">${theadHTML}</thead>
      <tbody class="divide-y divide-gray-200">${tbodyHTML}</tbody>
    </table>`;

  // Replace the original sample-data table in place
  const container = document.querySelector('.overflow-x-auto.shadow.rounded-lg.mb-6');
  if (container) {
    container.innerHTML = tableHTML;
    const newTable = container.querySelector('#example-table');
    addDragAndDrop(newTable);
    attachBubbleDropTarget(container);
    // Disable dragging for bubbles already displayed; enable for others
    document.querySelectorAll('.bubble').forEach(bubbleEl => {
      const field = bubbleEl.textContent.trim();
      if (field === 'Marc') {
        bubbleEl.setAttribute('draggable', 'false');
      } else if(displayedFields.includes(field)){
        bubbleEl.removeAttribute('draggable');
        // Apply styling consistently using our helper
        applyCorrectBubbleStyling(bubbleEl);
      } else {
        bubbleEl.setAttribute('draggable','true');
        // Apply styling consistently using our helper
        applyCorrectBubbleStyling(bubbleEl);
      }
    });
    updateQueryJson();
    updateCategoryCounts();
    // Re-render bubbles to ensure consistent styling
    if (currentCategory === 'Selected') {
      safeRenderBubbles();
    }
    // --- Ensure trashcan is always attached and clickable ---
    // Attach mouseenter/mouseleave to all headers to show trashcan
    const headers = newTable.querySelectorAll('th[draggable="true"]');
    headers.forEach(h => {
      h.addEventListener('mouseenter', () => {
        h.classList.add('th-hover');
        hoverTh = h;
        h.appendChild(headerTrash);
        headerTrash.style.display = 'block';
      });
      h.addEventListener('mouseleave', () => {
        h.classList.remove('th-hover');
        hoverTh = null;
        if (headerTrash.parentNode) headerTrash.parentNode.removeChild(headerTrash);
      });
    });
    // If only one column, attach trashcan immediately (simulate hover)
    if (headers.length === 1) {
      const h = headers[0];
      h.classList.add('th-hover');
      hoverTh = h;
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
    running: false,
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
    running: true,
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
    running: false,
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
    running: false,
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

function renderQueries(){
  const container = document.getElementById('queries-container');
  if(!container) return;
  // Use an eye icon SVG for both columns and filters
  const viewIconSVG = `<svg class="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M1.5 12s4-7 10.5-7 10.5 7 10.5 7-4 7-10.5 7S1.5 12 1.5 12z"/><circle cx="12" cy="12" r="3.5"/></svg>`;
  const rows = exampleQueries.map(q=>{
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
    // Reuse button for all queries (refresh/circular arrow icon)
    const reuseBtn = `<button class="reuse-query-btn inline-flex items-center justify-center p-1 rounded-full bg-gray-100 hover:bg-gray-200 text-blue-600" tabindex="-1" data-query-id="${q.id}" style="margin-left:4px;" data-tooltip="Reuse Query"><svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"w-4 h-4\"><path d=\"M23 4v6h-6M1 20v-6h6\"/><path d=\"M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15\"/></svg></button>`;
    // Duration calculation
    let duration = '—';
    if (q.startTime && q.endTime) {
      const start = new Date(q.startTime);
      const end = new Date(q.endTime);
      let seconds = Math.floor((end - start) / 1000);
      if (seconds >= 60) {
        const min = Math.floor(seconds / 60);
        const sec = seconds % 60;
        duration = `${min}m ${sec}s`;
      } else {
        duration = `${seconds}s`;
      }
    }
    return `
      <tr class="border-b hover:bg-blue-50 cursor-pointer">
        <td class="px-4 py-2 text-xs">${columnsSummary}</td>
        <td class="px-4 py-2 text-xs">${filtersSummary}</td>
        <td class="px-4 py-2 font-mono text-xs text-gray-700">${q.id}</td>
        <td class="px-4 py-2 text-center">
          ${q.running ? stopBtn : '<span class="text-gray-500">Finished</span>'}
        </td>
        <td class="px-4 py-2 text-xs">${new Date(q.startTime).toLocaleString()}</td>
        <td class="px-4 py-2 text-xs">${q.endTime ? new Date(q.endTime).toLocaleString() : '—'}</td>
        <td class="px-4 py-2 text-xs text-center">${duration}</td>
        <td class="px-4 py-2 text-xs text-center">${reuseBtn}</td>
      </tr>
    `;
  }).join('');
  container.innerHTML = `
    <table class="min-w-full text-sm">
      <thead class="bg-blue-50">
        <tr>
          <th class="px-4 py-2 text-left">Displaying</th>
          <th class="px-4 py-2 text-left">Filters</th>
          <th class="px-4 py-2 text-left">ID</th>
          <th class="px-4 py-2 text-center">Status</th>
          <th class="px-4 py-2 text-left">Start</th>
          <th class="px-4 py-2 text-left">End</th>
          <th class="px-4 py-2 text-center">Duration</th>
          <th class="px-4 py-2 text-center">Reuse</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  // Attach click handlers to reuse buttons
  container.querySelectorAll('.reuse-query-btn').forEach(btn => {
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
  const row = e.target.closest('#queries-container tbody tr');
  if(!row) return;
  const idx = Array.from(row.parentNode.children).indexOf(row);
  const q   = exampleQueries[idx];
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
let currentPanel = 'json';          // JSON shown by default
queriesPanel.style.display = 'none';// hide Queries initially

function showPanel(id){
  jsonPanel.style.display    = id === 'json'    ? '' : 'none';
  queriesPanel.style.display = id === 'queries' ? '' : 'none';
  currentPanel = id;
}

/* ------------------------------------------------------------------
   Top-right panel toggle & collapse buttons
   ------------------------------------------------------------------*/

// Click the JSON / Queries toggle buttons
if (toggleJsonBtn && toggleQueriesBtn) {
  toggleJsonBtn.addEventListener('click', () => showPanel('json'));
  toggleQueriesBtn.addEventListener('click', () => showPanel('queries'));
}

// Collapse buttons (little "-" in the panel headers)
document.querySelectorAll('.collapse-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const targetId = btn.dataset.target;
    const panel = document.getElementById(targetId);
    if (!panel) return;
    // For modal close buttons, just close the modal (add 'hidden')
    panel.classList.add('hidden');
    overlay.classList.remove('show');
  });
});

// Mobile hamburger menu functionality
const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
const mobileMenuDropdown = document.getElementById('mobile-menu-dropdown');

if (mobileMenuToggle && mobileMenuDropdown) {
  // Toggle dropdown visibility when hamburger is clicked
  mobileMenuToggle.addEventListener('click', () => {
    mobileMenuDropdown.classList.toggle('show');
  });
  
  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (!mobileMenuToggle.contains(e.target) && !mobileMenuDropdown.contains(e.target)) {
      mobileMenuDropdown.classList.remove('show');
    }
  });
  
  // Mobile menu item click handlers
  document.getElementById('mobile-run-query')?.addEventListener('click', () => {
    mobileMenuDropdown.classList.remove('show');
    // Trigger the same action as the run query button
    document.getElementById('run-query-btn')?.click();
  });
  
  document.getElementById('mobile-download')?.addEventListener('click', () => {
    mobileMenuDropdown.classList.remove('show');
    // Trigger the same action as the download button
    document.getElementById('download-btn')?.click();
  });
  
  document.getElementById('mobile-toggle-json')?.addEventListener('click', () => {
    mobileMenuDropdown.classList.remove('show');
    // Trigger the same action as the JSON toggle button
    document.getElementById('toggle-json')?.click();
  });
  
  document.getElementById('mobile-toggle-queries')?.addEventListener('click', () => {
    mobileMenuDropdown.classList.remove('show');
    // Trigger the same action as the queries toggle button
    document.getElementById('toggle-queries')?.click();
  });
  
  document.getElementById('mobile-toggle-help')?.addEventListener('click', () => {
    mobileMenuDropdown.classList.remove('show');
    // Trigger the same action as the help toggle button
    document.getElementById('toggle-help')?.click();
  });
  
  document.getElementById('mobile-toggle-templates')?.addEventListener('click', () => {
    mobileMenuDropdown.classList.remove('show');
    // Trigger the same action as the templates toggle button
    document.getElementById('toggle-templates')?.click();
  });
}

// Consolidated function to render both category bar and mobile selector
function renderCategorySelectors(selectedCount, marcCount) {
  const categoryBar = document.getElementById('category-bar');
  const mobileSelector = document.getElementById('mobile-category-selector');
  
  // Helper to get count for a category
  function getCount(cat) {
    if (cat === 'All') return fieldDefs.length;
    if (cat === 'Selected') return selectedCount;
    if (cat === 'Marc') return marcCount;
    return fieldDefs.filter(d => {
    const c = d.category;
      return Array.isArray(c) ? c.includes(cat) : c === cat;
  }).length;
  }

  // Render desktop category bar
  if (categoryBar) {
      categoryBar.innerHTML = categories.map(cat => {
      if (cat === 'Selected' && selectedCount === 0) return '';
      // Tooltip descriptions for each category
      let tooltip = '';
      switch (cat) {
        case 'All': tooltip = 'Show all available fields'; break;
        case 'Selected': tooltip = 'Show fields currently in use (displayed or filtered)'; break;
        case 'Marc': tooltip = 'MARC-specific fields and custom MARC field filters'; break;
        case 'Call #': tooltip = 'Fields related to call numbers'; break;
        case 'Catalog': tooltip = 'Fields from the catalog record'; break;
        case 'Item': tooltip = 'Fields specific to the item record'; break;
        case 'Dates': tooltip = 'Fields representing dates'; break;
        default: tooltip = `Show fields in the ${cat} category`;
      }
      return `<button data-category="${cat}" class="category-btn ${cat === currentCategory ? 'active' : ''}" data-tooltip="${tooltip}">${cat} (${getCount(cat)})</button>`;
      }).join('');
    // Attach click handlers
    categoryBar.querySelectorAll('.category-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          currentCategory = btn.dataset.category;
        categoryBar.querySelectorAll('.category-btn').forEach(b =>
            b.classList.toggle('active', b === btn)
          );
          scrollRow = 0;
          safeRenderBubbles();
        });
      });
  }

  // Render mobile selector
  if (mobileSelector) {
    const currentValue = mobileSelector.value;
    mobileSelector.innerHTML = '';
    categories.forEach(cat => {
      if (cat === 'Selected' && selectedCount === 0) return;
      // Tooltip descriptions for each category
      let tooltip = '';
      switch (cat) {
        case 'All': tooltip = 'Show all available fields'; break;
        case 'Selected': tooltip = 'Show fields currently in use (displayed or filtered)'; break;
        case 'Marc': tooltip = 'MARC-specific fields and custom MARC field filters'; break;
        case 'Call #': tooltip = 'Fields related to call numbers'; break;
        case 'Catalog': tooltip = 'Fields from the catalog record'; break;
        case 'Item': tooltip = 'Fields specific to the item record'; break;
        case 'Dates': tooltip = 'Fields representing dates'; break;
        default: tooltip = `Show fields in the ${cat} category`;
      }
      const option = document.createElement('option');
      option.value = cat;
      option.textContent = `${cat} (${getCount(cat)})`;
      option.setAttribute('data-tooltip', tooltip);
      if (cat === currentValue) option.selected = true;
      mobileSelector.appendChild(option);
    });
    // If the current category doesn't exist or is Selected with count 0, select All
    if (!Array.from(mobileSelector.options).some(opt => opt.value === currentValue) ||
        (currentValue === 'Selected' && selectedCount === 0)) {
      mobileSelector.value = 'All';
    }
  }
}

// Replace all category bar/mobile selector update logic with the new function
function updateCategoryCounts() {
  const selectedCount = fieldDefs.filter(d => {
    const fieldName = d.name;
    return shouldFieldHavePurpleStyling(fieldName);
  }).length;
  const marcCount = fieldDefs.filter(d => {
    const c = d.category;
    return Array.isArray(c) ? c.includes('Marc') : c === 'Marc';
  }).length;
  renderCategorySelectors(selectedCount, marcCount);
  // If we're in the Selected category and the count is 0, switch to All
  if (currentCategory === 'Selected' && selectedCount === 0) {
    currentCategory = 'All';
    const allBtn = document.querySelector('#category-bar .category-btn[data-category="All"]');
    if (allBtn) {
      allBtn.classList.add('active');
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
  
  // Initialize drag-and-drop for a table
  initTableDragDrop(table) {
    if (!table) return;
    
    // Ensure every header/cell has an up-to-date col index
    refreshColIndices(table);
    const scrollContainer = document.querySelector('.overflow-x-auto.shadow.rounded-lg.mb-6');
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
    positionDropAnchor(this.isBubbleDrag, rect, table, e.clientX);
  },
  
  handleDragLeave() {
    clearDropAnchor();
  },
  
  handleDragOver(e, element, table) {
    e.preventDefault();
    const rect = element.getBoundingClientRect();
    positionDropAnchor(this.isBubbleDrag, rect, table, e.clientX);
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
    positionDropAnchor(this.isBubbleDrag, rect, table, e.clientX);
  },
  
  handleCellDragOver(e, td, table) {
    e.preventDefault();
    const colIndex = parseInt(td.dataset.colIndex, 10);
    const targetHeader = table.querySelector(`thead th[data-col-index="${colIndex}"]`);
    const rect = targetHeader.getBoundingClientRect();
    positionDropAnchor(this.isBubbleDrag, rect, table, e.clientX);
  },
  
  // Drop handlers
  handleDrop(e, th, table) {
    e.preventDefault();
    e.stopPropagation();
    const toIndex = parseInt(th.dataset.colIndex, 10);
  
    // Column reorder drop
    const fromIndexStr = e.dataTransfer.getData('text/plain').trim();
    if (/^\d+$/.test(fromIndexStr)) {
      const fromIndex = parseInt(fromIndexStr, 10);
      if (fromIndex !== toIndex) {
        moveColumn(table, fromIndex, toIndex);
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
      moveColumn(table, fromIndex, toIndex);
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

// Use the helper in buildConditionPanel, conditionBtnHandler, marcConditionBtnHandler, and after confirming a filter
// In buildConditionPanel, after configuring inputs for type:
//   resetConditionInputs(type, false);
// In conditionBtnHandler and marcConditionBtnHandler, when toggling between/other:
//   resetConditionInputs(type, cond === 'between');
// After confirming a filter (in confirmBtn click handler):
//   resetConditionInputs(type, false);

// Helper to create a literal-to-display map for a field definition
function getLiteralToDisplayMap(fieldDef) {
  const map = new Map();
  if (fieldDef && fieldDef.values && fieldDef.values.length > 0 && typeof fieldDef.values[0] === 'object' && fieldDef.values[0].display) {
    fieldDef.values.forEach(val => {
      map.set(val.literal, val.display);
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
  const MODAL_PANEL_IDS = ['json-panel', 'queries-panel', 'help-panel', 'templates-panel'];
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
    if (p) p.classList.add('hidden');
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

/* =========================
   Custom Tooltip Component
   ========================= */
const TooltipManager = (() => {
  let tooltipEl = null;
  let arrowEl = null;
  let currentTarget = null;
  let hideTimeout = null;
  let isDragging = false; // Track drag state

  function createTooltip() {
    tooltipEl = document.createElement('div');
    tooltipEl.className = 'custom-tooltip';
    arrowEl = document.createElement('div');
    arrowEl.className = 'custom-tooltip-arrow';
    arrowEl.innerHTML = '<svg width="14" height="7"><polygon points="0,0 7,7 14,0" fill="#222"/></svg>';
    tooltipEl.appendChild(arrowEl);
    document.body.appendChild(tooltipEl);
  }

  function showTooltip(target, text, event) {
    if (isDragging) return; // Do not show tooltip while dragging
    if (!tooltipEl) createTooltip();
    tooltipEl.textContent = '';
    tooltipEl.appendChild(arrowEl); // keep arrow at end
    tooltipEl.setAttribute('role', 'tooltip');
    tooltipEl.setAttribute('aria-live', 'polite');
    tooltipEl.style.display = 'block';
    tooltipEl.classList.add('show');
    tooltipEl.style.opacity = '0';
    // Set text
    tooltipEl.insertBefore(document.createTextNode(text), arrowEl);
    // Position
    positionTooltip(target, event);
    setTimeout(() => { tooltipEl.classList.add('show'); tooltipEl.style.opacity = '1'; }, 10);
    currentTarget = target;
  }

  function hideTooltip() {
    if (!tooltipEl) return;
    tooltipEl.classList.remove('show');
    tooltipEl.style.opacity = '0';
    hideTimeout = setTimeout(() => {
      tooltipEl.style.display = 'none';
      tooltipEl.textContent = '';
      tooltipEl.appendChild(arrowEl);
      currentTarget = null;
    }, 120);
  }

  function positionTooltip(target, event) {
    if (!tooltipEl) return;
    const rect = target.getBoundingClientRect();
    const scrollY = window.scrollY || window.pageYOffset;
    const scrollX = window.scrollX || window.pageXOffset;
    let top = rect.top + scrollY - tooltipEl.offsetHeight - 10;
    let left = rect.left + scrollX + rect.width / 2 - tooltipEl.offsetWidth / 2;
    let arrowDirection = 'arrow-up';
    let arrowOffset = tooltipEl.offsetWidth / 2; // default: center
    let anchorX = rect.left + rect.width / 2 + scrollX;
    // If mouse event, follow mouse
    if (event && event.type && event.type.startsWith('mouse')) {
      anchorX = event.clientX + scrollX;
      left = anchorX - tooltipEl.offsetWidth / 2;
      top = rect.top + scrollY - tooltipEl.offsetHeight - 14;
    }
    // Clamp to viewport
    const minLeft = 8;
    const maxLeft = window.innerWidth - tooltipEl.offsetWidth - 8;
    let clampedLeft = Math.max(minLeft, Math.min(left, maxLeft));
    // If tooltip would go above viewport, show below element
    if (top < scrollY + 4) {
      top = rect.bottom + scrollY + 14;
      arrowDirection = 'arrow-down';
    }
    tooltipEl.style.left = clampedLeft + 'px';
    tooltipEl.style.top = top + 'px';
    // Arrow direction class
    tooltipEl.classList.remove('arrow-up', 'arrow-down');
    tooltipEl.classList.add(arrowDirection);
    // Arrow horizontal position: anchorX relative to tooltip left
    let arrowLeft = anchorX - clampedLeft;
    // Clamp arrow within tooltip
    const arrowMargin = 12;
    arrowLeft = Math.max(arrowMargin, Math.min(arrowLeft, tooltipEl.offsetWidth - arrowMargin));
    arrowEl.style.left = arrowLeft + 'px';
    arrowEl.style.right = '';
    arrowEl.style.transform = 'translateX(-50%)' + (arrowDirection === 'arrow-down' ? ' rotate(180deg)' : '');
  }

  // Attach listeners globally
  function attach() {
    document.addEventListener('mouseover', e => {
      if (isDragging) return;
      const el = e.target.closest('[data-tooltip]');
      if (!el) return;
      if (hideTimeout) clearTimeout(hideTimeout);
      const text = el.getAttribute('data-tooltip');
      if (text) showTooltip(el, text, e);
    });
    document.addEventListener('mousemove', e => {
      if (isDragging) return;
      if (currentTarget && tooltipEl && tooltipEl.style.display === 'block') {
        positionTooltip(currentTarget, e);
      }
    });
    document.addEventListener('mouseout', e => {
      if (e.target.closest('[data-tooltip]')) hideTooltip();
    });
    document.addEventListener('focusin', e => {
      if (isDragging) return;
      const el = e.target.closest('[data-tooltip]');
      if (!el) return;
      if (hideTimeout) clearTimeout(hideTimeout);
      const text = el.getAttribute('data-tooltip');
      if (text) showTooltip(el, text);
    });
    document.addEventListener('focusout', e => {
      if (e.target.closest('[data-tooltip]')) hideTooltip();
    });
    window.addEventListener('scroll', () => { if (tooltipEl) hideTooltip(); });
    // Hide tooltip on dragstart, show again on dragend
    document.addEventListener('dragstart', () => {
      isDragging = true;
      hideTooltip();
    });
    document.addEventListener('dragend', () => {
      isDragging = false;
    });

    // On click, update tooltip if data-tooltip changed
    document.addEventListener('click', e => {
      const el = e.target.closest('[data-tooltip]');
      if (!el) return;
      const text = el.getAttribute('data-tooltip');
      if (currentTarget === el && tooltipEl && tooltipEl.style.display === 'block') {
        // If tooltip is already showing for this element, update text if changed
        if (tooltipEl.textContent !== text) {
          showTooltip(el, text, e);
        }
      } else if (text) {
        showTooltip(el, text, e);
      }
    });
  }
  attach();
  return { show: showTooltip, hide: hideTooltip };
})();

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
      // Map literal to display if possible
      const map = new Map(fieldDef.values.map(v => [v.literal, v.display]));
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
    renderTemplates();
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
          renderTemplates(); // Show empty state
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

// Initialize templates functionality
document.addEventListener('DOMContentLoaded', () => {
  // Render templates list on page load
  renderTemplates();
  
  // Add event listener to the Save Template button
  const saveTemplateBtn = document.getElementById('save-template-btn');
  if (saveTemplateBtn) {
    saveTemplateBtn.addEventListener('click', saveCurrentAsTemplate);
  }
  // Attach search event listener on DOMContentLoaded
  const searchInput = document.getElementById('templates-search');
  if (searchInput) {
    searchInput.addEventListener('input', renderTemplates);
  }
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