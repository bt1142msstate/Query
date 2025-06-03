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