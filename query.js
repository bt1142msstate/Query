/**
 * Main Application Logic
 * Orchestrates the interaction between components.
 * Now refactored to use ES Modules.
 */

import { DOM, toggleQueryInterface, updateButtonStates, updateRunButtonIcon, positionInputWrapper, updateQueryJson } from './queryUI.js';
import { queryState, getBaseFieldName, getCurrentQueryState, hasQueryChanged } from './queryState.js';
import { fieldDefsArray, getAllFieldDefs, updateFilteredDefs, calculateCategoryCounts, renderCategorySelectors } from './fieldDefs.js';
import { showToastMessage } from './toast.js';

// Field definitions loaded from fieldDefs.js
// Utility functions and state management are now loaded from external modules
// (queryState.js, toast.js, queryUI.js, etc.)

// Pressing Enter in any condition field = click Confirm
['condition-input','condition-input-2','condition-select'].forEach(id=>{
  const el=document.getElementById(id);
  if(el){
    el.addEventListener('keydown',e=>{
      if(e.key==='Enter'){
        e.preventDefault();
        DOM.confirmBtn.click();
      }
    });
  }
});



/* --- Run / Stop query toggle --- */
// queryState.queryRunning already declared at the top


// updateButtonStates is now in queryUI.js - relying on window.updateButtonStates
// Initial check
window.updateButtonStates();

// toggleQueryInterface is now in queryUI.js - relying on window.toggleQueryInterface

if(DOM.runBtn){
  DOM.runBtn.addEventListener('click', ()=>{
    if(DOM.runBtn.disabled) return;   // ignore when disabled
    
    // If query is running, stop it
    if (queryState.queryRunning) {
      queryState.queryRunning = false;
      updateRunButtonIcon();
      toggleQueryInterface(false);
      return;
    }
    
    // Start query execution
    queryState.queryRunning = true;
    updateRunButtonIcon();
    toggleQueryInterface(true);
    
    // Simulate query execution (since real execution isn't implemented yet)
    setTimeout(() => {
      queryState.queryRunning = false;
      // Update the last executed query state to current state
      queryState.lastExecutedQueryState = getCurrentQueryState();
      updateRunButtonIcon();
      toggleQueryInterface(false);
      
      showToastMessage('Query executed successfully', 'success');
    }, 2000); // Simulate 2 second execution
  });
}

// --- Condition templates by type ---
// typeConditions now in filterManager.js (window.typeConditions)

/* Re-position the input capsule so it keeps a constant gap above the condition buttons */
// positionInputWrapper is now in queryUI.js - relying on window.positionInputWrapper

/* ---------- Input helpers to avoid duplicated numeric-config blocks ---------- */
// Input helpers (setNumericProps, clearNumericProps, configureInputsForType) now in filterManager.js

// queryState.displayedFields, queryState.selectedField, and queryState.activeFilters are already declared at the top

/* ---------- Helper: map UI condition slugs to C# enum names ---------- */



DOM.overlay.addEventListener('click',()=>{ 
  window.ModalSystem && window.ModalSystem.closeAllModals(); 
  window.BubbleSystem && window.BubbleSystem.resetActiveBubbles(); 

  // Close non-modal UI elements (condition panel, input wrapper)
  DOM.conditionPanel.classList.remove('show');
  DOM.inputWrapper.classList.remove('show');
  
  // Remove all .active from condition buttons
  const btns = DOM.conditionPanel.querySelectorAll('.condition-btn');
  btns.forEach(b=>b.classList.remove('active'));
  DOM.conditionInput.value='';

  // Hide select if present
  const sel = document.getElementById('condition-select');
  if(sel) sel.style.display = 'none';

  // After closing overlay, re-enable bubble interaction
  setTimeout(() => window.BubbleSystem && window.BubbleSystem.safeRenderBubbles(), 0);
  DOM.overlay.classList.remove('bubble-active');
  const headerBar = document.getElementById('header-bar');
  if (headerBar) headerBar.classList.remove('header-hide');
});



DOM.confirmBtn.addEventListener('click', window.handleFilterConfirm);

document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&DOM.overlay.classList.contains('show')){DOM.overlay.click();return;}
  // Bubble-grid scroll: allow ArrowUp/Down and W/S as aliases when hovering grid/scrollbar
  if(!queryState.hoverScrollArea) return;
  // Category navigation: ArrowLeft / ArrowRight or A / D keys when hovering the bubble area
  const rightPressed = e.key === 'ArrowRight' || e.key.toLowerCase() === 'd';
  const leftPressed  = e.key === 'ArrowLeft'  || e.key.toLowerCase() === 'a';
  if (rightPressed || leftPressed) {
    // Prevent navigation if overlay is shown or a bubble is enlarged
    if (DOM.overlay.classList.contains('show') || document.querySelector('.active-bubble')) return;
    
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
    queryState.currentCategory = newCategory;
    
    // Update UI
    visibleCatButtons.forEach(btn => 
      btn.classList.toggle('active', btn.dataset.category === queryState.currentCategory)
    );
    
    // Reset scroll position and re-render bubbles
    queryState.scrollRow = 0;
    window.BubbleSystem && window.BubbleSystem.safeRenderBubbles();
    return; // consume event
  }
  const downPressed = e.key === 'ArrowDown' || e.key.toLowerCase() === 's';
  const upPressed   = e.key === 'ArrowUp'   || e.key.toLowerCase() === 'w';
  const rowsVisible = 2;
  const maxStartRow = Math.max(0, queryState.totalRows - rowsVisible);
  if(downPressed && queryState.scrollRow < maxStartRow){
    queryState.scrollRow++;
  }else if(upPressed && queryState.scrollRow > 0){
    queryState.scrollRow--;
  }else{
    return;   // no change
  }
  document.getElementById('bubble-list').style.transform =
    `translateY(-${queryState.scrollRow * queryState.rowHeight}px)`;
  window.BubbleSystem && window.BubbleSystem.updateScrollBar();
});

/* ---------- Field definitions: name, type, optional values, optional filters ---------- */
// Now imported from fieldDefs.js



// ... existing code ...




// Also reposition the condition input wrapper on window resize
window.addEventListener('resize', positionInputWrapper);

// Build dynamic category bar
const categoryBar = document.getElementById('category-bar');
if (categoryBar) {
  // Use the imported functions for initial setup
  updateCategoryCounts();
}

// Render functions now in filterManager.js

// Special handler for marc condition buttons now in filterManager.js

// Replace search input listener to filter all fieldDefs, not just visible bubbles
if(DOM.queryInput) {
  DOM.queryInput.addEventListener('input', () => {
    // Only switch to "All" category when searching if no bubble is active and no overlay is shown
    if (!document.querySelector('.active-bubble') && !DOM.overlay.classList.contains('show')) {
    queryState.currentCategory = 'All';
    // Update the segmented toggle UI to reflect the change
    document.querySelectorAll('#category-bar .category-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.category === 'All')
    );
    }
    
    const term = DOM.queryInput.value.trim().toLowerCase();
    if(DOM.clearSearchBtn) DOM.clearSearchBtn.classList.toggle('hidden', term==='');
    
    // Use imported updateFilteredDefs function
    const filtered = updateFilteredDefs(term);
    
    // Update label of the "All" segment → "Search (n)" when searching
    const allBtn = document.querySelector('#category-bar .category-btn[data-category="All"]');
    if(allBtn){
      if(term === ''){
        const total = getAllFieldDefs().length;
        allBtn.textContent = `All (${total})`;
      }else{
        allBtn.textContent = `Search (${filtered.length})`;
      }
    }
    queryState.scrollRow = 0;
    window.BubbleSystem && window.BubbleSystem.safeRenderBubbles();
  });
}

if(DOM.clearSearchBtn){
  DOM.clearSearchBtn.addEventListener('click', ()=>{
    DOM.queryInput.value = '';
    DOM.queryInput.dispatchEvent(new Event('input'));
    DOM.queryInput.focus();
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
  // Initial render - load the DesiredColumnOrder from test data
  (async () => {
    try {
      // Load test data to get the processed table with correct column order
      await VirtualTable.loadTestData();
      const simpleTable = VirtualTable.simpleTableInstance;
      if (simpleTable) {
        // Use the actual headers from the processed table (which should be in DesiredColumnOrder)
        const headers = simpleTable.getHeaders();
        console.log('Initial table setup - headers from SimpleTable:', headers);
        console.log('Initial table setup - desiredColumnOrder:', simpleTable.desiredColumnOrder);
        
        if (headers && headers.length > 0) {
          // Use the headers from the processed SimpleTable (already in correct order)
          queryState.displayedFields = [...headers];
          window.displayedFields = queryState.displayedFields;
          console.log('Set queryState.displayedFields to:', queryState.displayedFields);
          // Update the query JSON to reflect the correct columns from the SimpleTable
          updateQueryJson();
          await showExampleTable(queryState.displayedFields);
          // Update button states after fields are loaded
          updateButtonStates();
          // Set initial executed state since we're loading with test data
          queryState.lastExecutedQueryState = getCurrentQueryState();
          // Initialize run button icon
          updateRunButtonIcon();
          // Set the GroupBy method selector to match the SimpleTable instance
          if (DOM.groupMethodSelect) {
            DOM.groupMethodSelect.value = simpleTable.groupMethod;
          }
          // Initialize bubble system now that all variables are ready
          if (window.BubbleSystem) {
            window.BubbleSystem.initializeBubbles();
          }
          updateCategoryCounts();
        } else {
          console.warn('No headers found in SimpleTable, showing empty placeholder');
          queryState.displayedFields = [];
          window.displayedFields = queryState.displayedFields;
          await showExampleTable(queryState.displayedFields);
          updateButtonStates();
          // Initialize bubble system even with empty fields
          // window.BubbleSystem && window.BubbleSystem.initializeBubbles();
        }
      } else {
        console.warn('No SimpleTable instance found, showing empty placeholder');
        queryState.displayedFields = [];
        window.displayedFields = queryState.displayedFields;
        await showExampleTable(queryState.displayedFields);
        updateButtonStates();
        // Initialize bubble system even with empty fields
        // window.BubbleSystem && window.BubbleSystem.initializeBubbles();
      }
    } catch (error) {
      console.error('Error initializing table:', error);
      queryState.displayedFields = [];
      window.displayedFields = queryState.displayedFields;
      await showExampleTable(queryState.displayedFields);
      updateButtonStates();
      // Initialize bubble system even with empty fields
      // window.BubbleSystem && window.BubbleSystem.initializeBubbles();
    }
  })();
}

// GroupBy method change handler
if (DOM.groupMethodSelect) {
  DOM.groupMethodSelect.addEventListener('change', async () => {
    const newGroupMethod = DOM.groupMethodSelect.value;
    console.log('Changing GroupBy method to:', newGroupMethod);
    
    // Get the current SimpleTable instance
    const simpleTable = VirtualTable.simpleTableInstance;
    if (simpleTable) {
      // Change the group method
      simpleTable.changeGroupMethod(newGroupMethod);
      
      // Update the virtual table data
      const rawTable = simpleTable.getRawTable();
      if (rawTable.length > 0) {
        const headers = rawTable[0];
        const dataRows = rawTable.slice(1);
        
        // Update virtualTableData
        VirtualTable.virtualTableData = {
          headers: headers,
          rows: dataRows,
          columnMap: new Map(headers.map((header, index) => [header, index]))
        };
        
        // Update queryState.displayedFields to match new headers
        queryState.displayedFields = [...headers];
        window.displayedFields = queryState.displayedFields;
        
        console.log('Updated table with new GroupBy method:', {
          method: newGroupMethod,
          headers: headers,
          rows: dataRows.length
        });
        
        // Refresh the table display
        await showExampleTable(queryState.displayedFields);
        updateQueryJson();
        updateButtonStates();
      }
    }
  });
}

// === Example table builder ===
async function showExampleTable(fields){
  if(!Array.isArray(fields) || fields.length === 0){
    // No columns left → clear table area and reset states
    queryState.displayedFields = [];
    window.displayedFields = queryState.displayedFields;
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
          if (field) {
            window.DragDropSystem.restoreFieldWithDuplicates(field);
            showExampleTable(queryState.displayedFields).catch(error => {
              console.error('Error updating table:', error);
            });
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
          if (queryState.displayedFields.length === 0) {
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
  queryState.displayedFields = uniqueFields;
  window.displayedFields = queryState.displayedFields;

  // Create initial table structure
  const tableHTML = `
    <table id="example-table" class="min-w-full divide-y divide-gray-200 bg-white">
      <thead class="sticky top-0 z-20 bg-gray-50">
        <tr>
          ${queryState.displayedFields.map((f,i) => {
            // Check if this field exists in the current data
            const virtualTableData = window.VirtualTable?.virtualTableData;
            const fieldExistsInData = virtualTableData && virtualTableData.columnMap && virtualTableData.columnMap.has(f);
            
            if (fieldExistsInData) {
              return `<th draggable="true" data-col-index="${i}" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50"><span class='th-text'>${f}</span></th>`;
            } else {
              return `<th draggable="true" data-col-index="${i}" class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider bg-gray-50" style="color: #ef4444 !important;" data-tooltip="This field is not in the current data. Run a new query to populate it."><span class='th-text' style="color: #ef4444 !important;">${f}</span></th>`;
            }
          }).join('')}
        </tr>
      </thead>
      <tbody class="divide-y divide-gray-200">
        <!-- Virtual rows will be inserted here -->
      </tbody>
    </table>`;

  // Replace the original sample-data table in place
  const container = document.querySelector('.overflow-x-auto.shadow.rounded-lg.mb-6');
  if (container) {
    // Set up container for virtual scrolling
    container.innerHTML = tableHTML;
    
    try {
      await VirtualTable.setupVirtualTable(container, queryState.displayedFields);
    } catch (error) {
      console.error('Error setting up virtual table:', error);
      // Show error message to user
      container.innerHTML = `
        <div class="p-6 text-center">
          <div class="text-red-600 font-semibold mb-2">Error Loading Data</div>
          <div class="text-gray-600">Failed to load test data. Please ensure testJobData.json is available.</div>
          <div class="text-sm text-gray-500 mt-2">${error.message}</div>
        </div>`;
      return;
    }

    // Now that setupVirtualTable has calculated widths, update header widths
    const table = container.querySelector('#example-table');
    const headerRow = table.querySelector('thead tr');
    headerRow.querySelectorAll('th').forEach((th, index) => {
      const field = queryState.displayedFields[index];
      const width = VirtualTable.calculatedColumnWidths[field] || 150;
      th.style.width = `${width}px`;
      th.style.minWidth = `${width}px`;
      th.style.maxWidth = `${width}px`;
    });
    
    // Calculate actual row height from a rendered row
    VirtualTable.measureRowHeight(table, queryState.displayedFields);
    
    // Initial render of virtual table
    VirtualTable.renderVirtualTable();
    
    // Set up drag and drop
    window.DragDropSystem.addDragAndDrop(table);
    window.DragDropSystem.attachBubbleDropTarget(container);
    
    // Update bubble dragging states
    document.querySelectorAll('.bubble').forEach(bubbleEl => {
      const field = bubbleEl.textContent.trim();
      if (field === 'Marc') {
        bubbleEl.setAttribute('draggable', 'false');
      } else if(queryState.displayedFields.includes(field)){
        bubbleEl.removeAttribute('draggable');
        window.BubbleSystem && window.BubbleSystem.applyCorrectBubbleStyling(bubbleEl);
      } else {
        bubbleEl.setAttribute('draggable','true');
        window.BubbleSystem && window.BubbleSystem.applyCorrectBubbleStyling(bubbleEl);
      }
    });
    
    updateQueryJson();
    updateCategoryCounts();
    
    // Update button states after table setup
    updateButtonStates();
    
    // Re-render bubbles if we're in Selected category
    if (queryState.currentCategory === 'Selected') {
      window.BubbleSystem && window.BubbleSystem.safeRenderBubbles();
    }
    
    // Attach header hover handlers for trash can
    const headers = table.querySelectorAll('th[draggable="true"]');
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

// Arrow-key scrolling when focus is on a bubble, the scrollbar thumb, or when hovering over bubble grid/scrollbar
document.addEventListener('keydown', e=>{
  if(e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;

  const focussed = document.activeElement;
  const isBubble = focussed?.classList && focussed.classList.contains('bubble');
  const isThumb  = focussed?.id === 'bubble-scrollbar-thumb';

  if(!isBubble && !isThumb && !queryState.hoverScrollArea) return;   // only act if focus or hover

  const maxStartRow = Math.max(0, queryState.totalRows - 2);
  if(e.key === 'ArrowDown' && queryState.scrollRow < maxStartRow){
    queryState.scrollRow++;
  }else if(e.key === 'ArrowUp' && queryState.scrollRow > 0){
    queryState.scrollRow--;
  }else{
    return;                                  // no movement
  }

  // Apply new scroll position
  document.getElementById('bubble-list').style.transform =
    `translateY(-${queryState.scrollRow * queryState.rowHeight}px)`;
  window.BubbleSystem && window.BubbleSystem.updateScrollBar();
  e.preventDefault();                         // stop page scroll
});



// Consolidated function to render both category bar and mobile selector
function renderCategorySelectorsLocal(categoryCounts) {
  renderCategorySelectors(categoryCounts, queryState.currentCategory, (newCategory) => {
    queryState.currentCategory = newCategory;
          queryState.scrollRow = 0;
          window.BubbleSystem && window.BubbleSystem.safeRenderBubbles();
        });
}

// Replace all category bar/mobile selector update logic with the new function
function updateCategoryCounts() {
  const categoryCounts = calculateCategoryCounts(queryState.displayedFields, queryState.activeFilters);
  renderCategorySelectorsLocal(categoryCounts);

  // If we're in the Selected category and the count is 0, switch to All
  if (queryState.currentCategory === 'Selected' && categoryCounts.Selected === 0) {
    queryState.currentCategory = 'All';
    const allBtn = document.querySelector('#category-bar .category-btn[data-category="All"]');
    if (allBtn) {
      allBtn.classList.add('active');
      // Also update the mobile selector to 'All'
      const mobileSelector = document.getElementById('mobile-category-selector');
      if (mobileSelector) mobileSelector.value = 'All';
    }
    queryState.scrollRow = 0;
    window.BubbleSystem && window.BubbleSystem.safeRenderBubbles();
  }
}
  
// Initial render of category bar and mobile selector
updateCategoryCounts();

// Initialize bubble system early (before any bubble calls)
if (window.BubbleSystem) {
  window.BubbleSystem.initializeBubbles();
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
window.onDOMReady(updateHeaderHeightVar);
window.addEventListener('resize', updateHeaderHeightVar);



// FilterPill UI component class is now in queryUI.js - relying on window.FilterPill

// Initialize table name input functionality on DOM ready
window.onDOMReady(() => {
  // Attach queries search event listener
  const queriesSearchInput = document.getElementById('queries-search');
  if (queriesSearchInput) {
    // Check if QueryHistorySystem is available globally or renderQueries is available
    if (window.QueryHistorySystem && window.QueryHistorySystem.renderQueries) {
        queriesSearchInput.addEventListener('input', window.QueryHistorySystem.renderQueries);
    } else if (typeof renderQueries === 'function') {
        queriesSearchInput.addEventListener('input', renderQueries); 
    }
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
  }    // Remove fallback demo columns: always use loaded test data for queryState.displayedFields
    // (No fallback to ['Title', 'Author', ...])
    // The initial table setup after test data load will set queryState.displayedFields correctly.

});

// Globals for bubble animation are defined in queryState.js (window.isBubbleAnimatingBack, etc.)


