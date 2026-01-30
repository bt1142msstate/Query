// Field definitions loaded from fieldDefs.js

// Local aliases
const getBaseFieldName = window.getBaseFieldName;
const showToastMessage = window.showToastMessage;
const confirmBtn = document.getElementById('confirm-btn');
const runBtn = document.getElementById('run-query-btn');
const searchInput = document.getElementById('query-input');
const clearSearchBtn = document.getElementById('clear-search-btn');

// DOM elements and State variables are managed globally (queryUI.js, queryState.js)

// Pressing Enter in any condition field = click Confirm
['condition-input','condition-input-2','condition-select'].forEach(id=>{
  const el=document.getElementById(id);
  if(el){
    el.addEventListener('keydown',e=>{
      if(e.key==='Enter'){
        e.preventDefault();
        if(confirmBtn) confirmBtn.click();
      }
    });
  }
});

/* --- Run / Stop query toggle --- */

// Initial check
if(window.updateButtonStates) window.updateButtonStates();

if(runBtn){
  runBtn.addEventListener('click', ()=>{
    if(runBtn.disabled) return;   // ignore when disabled
    
    // If query is running, stop it
    if (window.queryRunning) {
      window.queryRunning = false;
      if(window.updateRunButtonIcon) window.updateRunButtonIcon();
      return;
    }
    
    // Start query execution
    window.queryRunning = true;
    if(window.updateRunButtonIcon) window.updateRunButtonIcon();
    
    // Simulate query execution (since real execution isn't implemented yet)
    setTimeout(() => {
      window.queryRunning = false;
      // Update the last executed query state to current state
      if(window.getCurrentQueryState) window.lastExecutedQueryState = window.getCurrentQueryState();
      if(window.updateRunButtonIcon) window.updateRunButtonIcon();
    }, 2000); // Simulate 2 second execution
    
    if(showToastMessage) showToastMessage('Query execution is not implemented yet', 'info');
  });
}

// Overlay click handler
const overlay = document.getElementById('overlay');
if (overlay) {
  overlay.addEventListener('click',()=>{ 
    if(window.ModalSystem) window.ModalSystem.closeAllModals(); 
    if(window.BubbleSystem) window.BubbleSystem.resetActiveBubbles();

    // Close non-modal UI elements (condition panel, input wrapper)
    const conditionPanel = document.getElementById('condition-panel');
    const inputWrapper = document.getElementById('condition-input-wrapper');
    const conditionInput = document.getElementById('condition-input');

    if(conditionPanel) conditionPanel.classList.remove('show');
    if(inputWrapper) inputWrapper.classList.remove('show');
    
    // Remove all .active from condition buttons
    if(conditionPanel) {
      const btns = conditionPanel.querySelectorAll('.condition-btn');
      btns.forEach(b=>b.classList.remove('active'));
    }
    if(conditionInput) conditionInput.value='';

    // Hide select if present
    const sel = document.getElementById('condition-select');
    if(sel) sel.style.display = 'none';

    // After closing overlay, re-enable bubble interaction
    const safeRenderBubbles = window.safeRenderBubbles || (window.BubbleSystem ? window.BubbleSystem.safeRenderBubbles : null);
    if(safeRenderBubbles) setTimeout(() => safeRenderBubbles(), 0);
    
    overlay.classList.remove('bubble-active');
    const headerBar = document.getElementById('header-bar');
    if (headerBar) headerBar.classList.remove('header-hide');
  });
}

// Add this helper function to show error messages with consistent styling and timeout
// showError is now in queryUI.js - relying on window.showError

if (confirmBtn) confirmBtn.addEventListener('click', window.handleFilterConfirm);

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
    window.BubbleSystem && window.BubbleSystem.safeRenderBubbles();
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
  window.BubbleSystem && window.BubbleSystem.updateScrollBar();
});

/* ---------- Field definitions: name, type, optional values, optional filters ---------- */
// Now imported from fieldDefs.js

// Helper function to check if a field should have purple styling (wrapper for imported function)
function shouldFieldHavePurpleStyling(fieldName) {
  return shouldFieldHavePurpleStylingBase(fieldName, displayedFields, activeFilters);
}

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
if (searchInput) searchInput.addEventListener('input', () => {
  // Only switch to "All" category when searching if no bubble is active and no overlay is shown
  if (!document.querySelector('.active-bubble') && !overlay.classList.contains('show')) {
  currentCategory = 'All';
  // Update the segmented toggle UI to reflect the change
  document.querySelectorAll('#category-bar .category-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.category === 'All')
  );
  }
  
  const term = searchInput.value.trim().toLowerCase();
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
  window.BubbleSystem && window.BubbleSystem.safeRenderBubbles();
});

if(clearSearchBtn){
  clearSearchBtn.addEventListener('click', ()=>{
    if(searchInput) {
      searchInput.value = '';
      searchInput.dispatchEvent(new Event('input'));
      searchInput.focus();
    }
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
          displayedFields = [...headers];
          window.displayedFields = displayedFields;
          console.log('Set displayedFields to:', displayedFields);
          // Update the query JSON to reflect the correct columns from the SimpleTable
          updateQueryJson();
          await showExampleTable(displayedFields);
          // Update button states after fields are loaded
          updateButtonStates();
          // Set initial executed state since we're loading with test data
          lastExecutedQueryState = getCurrentQueryState();
          // Initialize run button icon
          updateRunButtonIcon();
          // Set the GroupBy method selector to match the SimpleTable instance
          if (groupMethodSelect) {
            groupMethodSelect.value = simpleTable.groupMethod;
          }
          // Initialize bubble system now that all variables are ready
          if (window.BubbleSystem) {
            window.BubbleSystem.initializeBubbles();
          }
          updateCategoryCounts();
        } else {
          console.warn('No headers found in SimpleTable, showing empty placeholder');
          displayedFields = [];
          window.displayedFields = displayedFields;
          await showExampleTable(displayedFields);
          updateButtonStates();
          // Initialize bubble system even with empty fields
          // window.BubbleSystem && window.BubbleSystem.initializeBubbles();
        }
      } else {
        console.warn('No SimpleTable instance found, showing empty placeholder');
        displayedFields = [];
        window.displayedFields = displayedFields;
        await showExampleTable(displayedFields);
        updateButtonStates();
        // Initialize bubble system even with empty fields
        // window.BubbleSystem && window.BubbleSystem.initializeBubbles();
      }
    } catch (error) {
      console.error('Error initializing table:', error);
      displayedFields = [];
      window.displayedFields = displayedFields;
      await showExampleTable(displayedFields);
      updateButtonStates();
      // Initialize bubble system even with empty fields
      // window.BubbleSystem && window.BubbleSystem.initializeBubbles();
    }
  })();
}

// GroupBy method change handler
if (groupMethodSelect) {
  groupMethodSelect.addEventListener('change', async () => {
    const newGroupMethod = groupMethodSelect.value;
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
        
        // Update displayedFields to match new headers
        displayedFields = [...headers];
        window.displayedFields = displayedFields;
        
        console.log('Updated table with new GroupBy method:', {
          method: newGroupMethod,
          headers: headers,
          rows: dataRows.length
        });
        
        // Refresh the table display
        await showExampleTable(displayedFields);
        updateQueryJson();
        updateButtonStates();
      }
    }
  });
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
  window.BubbleSystem && window.BubbleSystem.updateScrollBar();
  e.preventDefault();                         // stop page scroll
});



// Consolidated function to render both category bar and mobile selector
function renderCategorySelectorsLocal(categoryCounts) {
  renderCategorySelectors(categoryCounts, currentCategory, (newCategory) => {
    currentCategory = newCategory;
          scrollRow = 0;
          window.BubbleSystem && window.BubbleSystem.safeRenderBubbles();
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
    window.BubbleSystem && window.BubbleSystem.safeRenderBubbles();
  }
}

window.updateCategoryCounts = updateCategoryCounts;
  
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
  }    // Remove fallback demo columns: always use loaded test data for displayedFields
    // (No fallback to ['Title', 'Author', ...])
    // The initial table setup after test data load will set displayedFields correctly.

});

// Add a global flag to block bubble rendering during animation
let isBubbleAnimatingBack = false;
let pendingRenderBubbles = false;

// Replace all direct calls to renderBubbles() with a helper:

// formatDuration is now in queryUI.js - relying on window.formatDuration

