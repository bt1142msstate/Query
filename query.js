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
window.displayedFields = displayedFields; // Make globally accessible for VirtualTable module
let selectedField = '';
let totalRows = 0;          // total rows in #bubble-list
let scrollRow = 0;          // current top row (0-based)
let rowHeight = 0;          // computed once per render
let hoverScrollArea = false;  // true when cursor over bubbles or scrollbar
let currentCategory = 'All';

// Data structures
const activeFilters = {};   // { fieldName: { logical:'And'|'Or', filters:[{cond,val},…] } }

// Global set to track which bubbles are animating back
const animatingBackBubbles = new Set();

// Add at the top with other state variables:
let isBubbleAnimating = false;

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
  const customMarcFields = getAllFieldDefs()
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
  if (window.ModalSystem) {
    // Clear the input lock through the modal system (no direct access to internal state)
    window.ModalSystem.lockInput(0); // This will clear any existing lock immediately
  }
  
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
              const stillExists = fieldDefs.has(fieldName) && shouldFieldHavePurpleStyling(fieldName);
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
          const stillExists = fieldDefs.has(fieldName) && shouldFieldHavePurpleStyling(fieldName);
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
  window.ModalSystem.closeAllModals(); // This will hide overlay and all panels with 'hidden' and remove 'show'
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
  const fieldDef = fieldDefs.get(field);
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
      if (!fieldDefs.has(dynamicMarcField)) {
        const newDef = {
          name: dynamicMarcField,
          type: 'string',
          category: 'Marc',
          desc: `MARC ${marcNumber} field`
        };
        fieldDefs.set(dynamicMarcField, newDef);
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
      const fieldType = (fieldDefs.get(field) || {}).type || 'string';
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
  const fieldDef = fieldDefs.get(field);
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
    const fieldDef = fieldDefs.get(selectedField);
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
      const total = fieldDefs.size;
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

// attach to the initial table container
const initialContainer = document.querySelector('.overflow-x-auto.shadow.rounded-lg.mb-6');
if(initialContainer) {
  window.DragDropSystem.attachBubbleDropTarget(initialContainer);
  // Initial render of empty table placeholder
  showExampleTable(displayedFields);
}

// === Example table builder ===
function showExampleTable(fields){
  if(!Array.isArray(fields) || fields.length === 0){
    // No columns left → clear table area and reset states
    displayedFields = [];
    window.displayedFields = displayedFields;
    VirtualTable.clearVirtualTableData();
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
      window.DragDropSystem.attachBubbleDropTarget(container);
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
  window.displayedFields = displayedFields;

  // Generate sample data if not already generated or if fields changed
  if (VirtualTable.virtualTableData.length === 0 || VirtualTable.virtualTableData.length < 30000) {
    console.log('Generating 30,000 sample rows...');
    VirtualTable.virtualTableData = VirtualTable.generateSampleData(30000);
    console.log('Sample data generated successfully');
  }

  // Calculate optimal column widths based on all data
  console.log('Calculating optimal column widths...');
  VirtualTable.calculatedColumnWidths = VirtualTable.calculateOptimalColumnWidths(displayedFields, VirtualTable.virtualTableData);
  console.log('Column widths calculated:', VirtualTable.calculatedColumnWidths);

  // Build header with fixed widths
  let theadHTML = '<tr>';
  displayedFields.forEach((f,i)=>{
    const width = VirtualTable.calculatedColumnWidths[f] || 150; // fallback width
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
    container.innerHTML = tableHTML;
    VirtualTable.setupVirtualTable(container, displayedFields);
    
    const newTable = container.querySelector('#example-table');
    
    // Calculate actual row height from a rendered row
    VirtualTable.measureRowHeight(newTable, displayedFields);
    
    // Initial render of virtual table
    VirtualTable.renderVirtualTable();
    
    // Set up drag and drop
    window.DragDropSystem.addDragAndDrop(newTable);
    window.DragDropSystem.attachBubbleDropTarget(container);
    
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

// Initialize table name input functionality on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  // Attach queries search event listener
  const queriesSearchInput = document.getElementById('queries-search');
  if (queriesSearchInput) {
    queriesSearchInput.addEventListener('input', renderQueries);
  }
  
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
    window.displayedFields = displayedFields;
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

// Helper to format filters for tooltips (used by bubbles)
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