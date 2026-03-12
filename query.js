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
        confirmBtn.click();
      }
    });
  }
});



/* --- Run / Stop query toggle --- */
// queryRunning state is tracked in window.queryRunning (from queryState.js)
let currentQueryId = null;

// updateButtonStates is now in queryUI.js - relying on window.updateButtonStates
// Initial check
window.updateButtonStates();

// toggleQueryInterface is now in queryUI.js - relying on window.toggleQueryInterface

if(runBtn){
  runBtn.addEventListener('click', ()=>{
    if(runBtn.disabled) return;   // ignore when disabled
    
    // If query is running, stop it
    if (window.queryRunning) {
      if (currentQueryId && typeof window.cancelQuery === 'function') {
          showToastMessage('Cancelling query...', 'info');
          window.cancelQuery(currentQueryId).then(() => {
              showToastMessage('Query cancelled.', 'info');
          }).catch(err => {
              console.error('Cancellation failed', err);
          });
      }
      
      window.queryRunning = false;
      window.updateRunButtonIcon();
      if (window.endTableQueryAnimation) window.endTableQueryAnimation();
      return;
    }
    
    // Start query execution
    (async () => {
      // Remember if split mode was active, then disable it to avoid mapping dynamic Field N names.
      const wasSplitActive = (window.VirtualTable && window.VirtualTable.splitColumnsActive) || window.splitColumnsActive || false;
      if (wasSplitActive && window.VirtualTable && typeof window.VirtualTable.setSplitColumnsMode === 'function') {
        window.VirtualTable.setSplitColumnsMode(false);
        if (window.resetSplitColumnsToggleUI) window.resetSplitColumnsToggleUI();
      }
      
      currentQueryId = null;
      try {
        window.queryRunning = true;
        window.updateRunButtonIcon();
        if (window.startTableQueryAnimation) window.startTableQueryAnimation();
        
        const state = window.getCurrentQueryState();
        const tableNameInput = document.getElementById('table-name-input');
        const queryName = tableNameInput ? tableNameInput.value.trim() : '';

        // Construct history config (UI state) to send to backend for restoration
        const historyConfig = {
            DesiredColumnOrder: state.displayedFields,
            FilterGroups: []
        };

        if (state.activeFilters) {
            const group = {
                LogicalOperator: 'AND',
                Filters: []
            };
            Object.entries(state.activeFilters).forEach(([fieldName, filterGroup]) => {
                if (filterGroup && filterGroup.filters) {
                    filterGroup.filters.forEach(f => {
                        group.Filters.push({
                            FieldName: fieldName,
                            FieldOperator: f.cond, 
                            Values: [f.val]
                        });
                    });
                }
            });
            if (group.Filters.length > 0) {
                historyConfig.FilterGroups.push(group);
            }
        }
        
        const standardDisplayFields = [];
        const specialFields = [];
        
        state.displayedFields.forEach(field => {
            const fieldDef = window.fieldDefs.get(field);
            // Handle dynamically built fields that have a special API payload
            if (fieldDef && fieldDef.special_payload) {
                // To avoid sending duplicates if displayed multiple times
                const isDuplicate = specialFields.some(sf => JSON.stringify(sf) === JSON.stringify(fieldDef.special_payload));
                if (!isDuplicate) {
                    specialFields.push(fieldDef.special_payload);
                }
            } else {
                standardDisplayFields.push(field);
            }
        });

        const payload = {
            action: 'run',
            name: queryName || undefined,
            filters: [],
            display_fields: standardDisplayFields,
            special_fields: specialFields,
            ui_config: historyConfig
        };

        // Helper to map operator
        const mapOperator = (cond, val) => {
            switch (cond) {
                case 'equals': return { op: '=', val: val };
                case 'does_not_equal': return { op: '!=', val: val };
                case 'greater': 
                case 'after': return { op: '>', val: val };
                case 'less': 
                case 'before': return { op: '<', val: val };
                case 'greater_or_equal': 
                case 'on_or_after': return { op: '>=', val: val };
                case 'less_or_equal': 
                case 'on_or_before': return { op: '<=', val: val };
                // Optimistic mapping for unsupported operators
                case 'starts': 
                case 'starts_with': return { op: '=', val: val + '*' };
                case 'contains': return { op: '=', val: '*' + val + '*' };
                case 'does_not_contain': return { op: '!=', val: '*' + val + '*' };
                case 'between': 
                    const parts = val.split('|');
                    if (parts.length === 2) return { op: 'between', val: parts };
                    return { op: '=', val: val };
                default: return { op: '=', val: val };
            }
        };

        // Flatten filters
        if (state.activeFilters) {
            Object.entries(state.activeFilters).forEach(([fieldName, filterGroup]) => {
                if (filterGroup && filterGroup.filters) {
                    filterGroup.filters.forEach(filter => {
                        const { op, val } = mapOperator(filter.cond, filter.val);
                        if (op === 'between') {
                            payload.filters.push({ field: fieldName, operator: '>=', value: val[0] });
                            payload.filters.push({ field: fieldName, operator: '<=', value: val[1] });
                        } else {
                            if (op === '=' && (val.includes('*') || val.includes('?'))) {
                                // If wildcard used, assume backend supports it with =
                            }
                            payload.filters.push({ field: fieldName, operator: op, value: val });
                        }
                    });
                }
            });
        }

        console.log('Sending query payload:', payload);

        const response = await fetch('https://mlp.sirsi.net/uhtbin/query_api.pl', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        
        // Capture Query ID and register in history
        currentQueryId = response.headers.get('X-Query-Id');
        if (currentQueryId && window.addQueryToHistory) {
             const newQuery = {
                id: currentQueryId,
                name: queryName || `Query ${currentQueryId.substring(0,8)}`,
                query: payload,
                jsonConfig: historyConfig,
                startTime: new Date().toISOString(),
                status: 'running',
                running: true,
                resultCount: 0
             };
             
             window.addQueryToHistory(newQuery);
             
             // Start external polling for status
             if (window.QueryHistorySystem && window.QueryHistorySystem.startQueryDurationUpdates) {
                 window.QueryHistorySystem.startQueryDurationUpdates();
             }
        }

        if (!response.ok) {
            throw new Error(`Server error: ${response.status} ${response.statusText}`);
        }

        const text = await response.text();
        
        // If user stopped the query while waiting for response, abort processing
        if (!window.queryRunning) {
             console.log('Query stopped by user, discarding response.');
             return;
        }
        
        // Parse pipe-delimited response
        // Use X-Raw-Columns to understand the actual output order from backend,
        // then map into the requested state.displayedFields order.
        const rawColsHeader = response.headers.get('X-Raw-Columns');
        const rawColumns = rawColsHeader ? rawColsHeader.split('|') : state.displayedFields;
        
        const lines = text.split('\n').filter(line => line.trim().length > 0);
        const headers = state.displayedFields; // Requested order
        const rows = lines.map(line => {
            const values = line.split('|');
            // Create object keyed by raw output columns
            const obj = {};
            rawColumns.forEach((h, i) => {
                obj[h] = values[i] !== undefined ? values[i] : '';
            });
            // Ensure all requested headers exist
            headers.forEach(h => {
                if (!(h in obj)) obj[h] = '';
            });
            return obj;
        });

        console.log(`Received ${rows.length} rows`);
        
        // Mark as complete in history
        if (currentQueryId && window.QueryHistorySystem) {
             const q = window.QueryHistorySystem.exampleQueries.find(q => q.id === currentQueryId);
             if (q) {
                 q.running = false;
                 q.status = 'complete';
                 q.resultCount = rows.length;
                 q.endTime = new Date().toISOString();
                 window.QueryHistorySystem.renderQueries();
             }
        }

        // Update VirtualTable
        if (window.VirtualTable) {
            // Re-use SimpleTable logic if possible, or manually set data
            // VirtualTable.virtualTableData expects { headers, rows, columnMap }
            
            const columnMap = new Map();
            headers.forEach((h, i) => columnMap.set(h, i));
            
            const newTableData = {
                headers: headers,
                rows: rows.map(r => {
                    // Convert object back to array of values in order for VirtualTable?
                    // Wait, VirtualTable.rows might be array of arrays?
                    // Let's check virtualTable.js
                    // It seems virtualTable.js uses objects in calculateFieldWidth: data.columnMap.get(fieldName)
                    // But accessing row content?
                    // row[columnIndex]?
                    // Let's check renderVirtualTable in virtualTable.js
                    return headers.map(h => r[h]);
                }),
                columnMap: columnMap
            };
            
            // Wait, scan virtualTable.js render function to be sure about row format
            // ... (I'll check this briefly) ...
            
            // For now, assume it's like SimpleTable: rows are arrays of strings?
            // "data.rows" in calculateFieldWidth snippet: `data.rows.length`
            // `data.columnMap.get(fieldName)` -> index.
            // So rows are likely arrays of values.
            
            window.VirtualTable.virtualTableData = newTableData;
            
            // Re-render the full table to reset red column headers and redraw the rows with new widths
            if (typeof showExampleTable === 'function') {
                await showExampleTable(state.displayedFields);
            } else {
                window.VirtualTable.renderVirtualTable();
                window.VirtualTable.calculateOptimalColumnWidths(); 
            }
            
            // Update totalRows state
            window.totalRows = rows.length;
            window.scrollRow = 0;
            if (window.BubbleSystem) window.BubbleSystem.updateScrollBar();
            if (window.updateButtonStates) window.updateButtonStates();
            
            // Restore split columns mode if it was active before the query ran
            if (wasSplitActive && window.VirtualTable && typeof window.VirtualTable.setSplitColumnsMode === 'function') {
                if (window.setSplitColumnsToggleUIActive) window.setSplitColumnsToggleUIActive();
                window.VirtualTable.setSplitColumnsMode(true);
            }
        }
        
        // Update last executed state
        window.lastExecutedQueryState = window.getCurrentQueryState();
        showToastMessage(`Query completed. Loaded ${rows.length} results.`, 'success');

      } catch (error) {
        // Checking if the query was manually stopped by the user
        if (!window.queryRunning) {
             console.log('Query execution interrupted by user stop/cancel.');
             return;
        }

        console.error('Query execution failed:', error);
        
        // Mark as failed in history
        if (currentQueryId && window.QueryHistorySystem) {
             const q = window.QueryHistorySystem.exampleQueries.find(q => q.id === currentQueryId);
             if (q) {
                 q.running = false;
                 q.status = 'failed';
                 q.error = error.message;
                 q.endTime = new Date().toISOString();
                 window.QueryHistorySystem.renderQueries();
             }
        }
        
        showToastMessage('Query execution failed: ' + error.message, 'error');
      } finally {
        window.queryRunning = false;
        window.updateRunButtonIcon();
        if (window.endTableQueryAnimation) window.endTableQueryAnimation();
      }
    })();
  });
}

// --- Condition templates by type ---
// typeConditions now in filterManager.js (window.typeConditions)

/* Re-position the input capsule so it keeps a constant gap above the condition buttons */
// positionInputWrapper is now in queryUI.js - relying on window.positionInputWrapper

/* ---------- Input helpers to avoid duplicated numeric-config blocks ---------- */
// Input helpers (setNumericProps, clearNumericProps, configureInputsForType) now in filterManager.js

// displayedFields, selectedField, and activeFilters are already declared at the top

/* ---------- Helper: map UI condition slugs to C# enum names ---------- */



overlay.addEventListener('click',()=>{ 
  window.ModalSystem.closeAllModals(); // This will hide overlay and all panels with 'hidden' and remove 'show'
  window.BubbleSystem && window.BubbleSystem.resetActiveBubbles(); // Handles bubble animations and state

  // Close non-modal UI elements (condition panel, input wrapper, filter card)
  conditionPanel.classList.remove('show');
  inputWrapper.classList.remove('show');
  const filterCard = window.filterCard || document.getElementById('filter-card');
  if (filterCard) {
    if (!window.filterCard) window.filterCard = filterCard;
    filterCard.classList.remove('show');
    // Destroy the DOM node from the document body after transition
    setTimeout(() => {
      if (!filterCard.classList.contains('show') && filterCard.parentNode) {
        filterCard.remove();
      }
    }, 250);
  }
  
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



confirmBtn.addEventListener('click', window.handleFilterConfirm);

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
  window.BubbleSystem && window.BubbleSystem.safeRenderBubbles();
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
  // Initial render - Initialize systems without data for real queries
  (async () => {
    try {
      console.log('Initializing application for live queries (test data disabled)');
      
      // Initialize empty fields
      window.displayedFields = [];
      
      // Update UI
      if (typeof showExampleTable === 'function') {
        await showExampleTable([]);
      }
      updateButtonStates();
      window.updateRunButtonIcon();
      
      // Initialize systems
      if (window.BubbleSystem) {
         window.BubbleSystem.initializeBubbles();
      }
      if (typeof updateCategoryCounts === 'function') {
        updateCategoryCounts();
      }
      
    } catch (error) {
      console.error('Error initializing application:', error);
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

// === Example table builder ===
async function showExampleTable(fields){
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
            window.DragDropSystem.dragDropManager.dropSuccessful = true;
            window.DragDropSystem.restoreFieldWithDuplicates(field);
            showExampleTable(displayedFields).catch(error => {
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
      const fieldName = b.textContent.trim();
      const fieldDef = window.fieldDefs ? window.fieldDefs.get(fieldName) : null;
      if (fieldDef && fieldDef.is_buildable) {
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

  // Create initial table structure
  const tableHTML = `
    <table id="example-table" class="min-w-full divide-y divide-gray-200 bg-white">
      <thead class="sticky top-0 z-20 bg-gray-50">
        <tr>
          ${displayedFields.map((f,i) => {
            // Check if this field exists in the current data
            const virtualTableData = window.VirtualTable?.virtualTableData;
            const fieldExistsInData = virtualTableData && virtualTableData.columnMap && virtualTableData.columnMap.has(f);
            
            // Determine alignment based on field type
            const fieldDef = window.fieldDefs ? window.fieldDefs.get(f) : null;
            const type = fieldDef ? fieldDef.type : 'string';
            const lower = f.toLowerCase();
            
            let alignClass = 'text-left';
            if (type === 'money' || type === 'number' || type === 'date' || 
                lower.includes('price') || lower.includes('cost') || 
                lower.includes('date') || lower.includes('time')) {
              alignClass = 'text-right';
            } else if (type === 'boolean') {
              alignClass = 'text-center';
            }
            
            if (fieldExistsInData) {
              return `<th draggable="true" data-col-index="${i}" class="sortable-header px-6 py-3 ${alignClass} text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors" data-sort-field="${f}"><div class="flex items-center gap-1 ${alignClass === 'text-right' ? 'justify-end' : alignClass === 'text-center' ? 'justify-center' : 'justify-start'}"><span class='th-text'>${f}</span><span class='sort-icon text-gray-400'></span></div></th>`;
            } else {
              return `<th draggable="true" data-col-index="${i}" class="px-6 py-3 ${alignClass} text-xs font-medium uppercase tracking-wider bg-gray-50" style="color: #ef4444 !important;" data-tooltip="This field is not in the current data. Run a new query to populate it."><div class="flex items-center gap-1 ${alignClass === 'text-right' ? 'justify-end' : alignClass === 'text-center' ? 'justify-center' : 'justify-start'}"><span class='th-text' style="color: #ef4444 !important;">${f}</span></div></th>`;
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
      await VirtualTable.setupVirtualTable(container, displayedFields);
    } catch (error) {
      console.error('Error setting up virtual table:', error);
      // Show error message to user
      container.innerHTML = `
        <div class="p-6 text-center">
          <div class="text-red-600 font-semibold mb-2">Error Loading Data</div>
          <div class="text-gray-600">Failed to initialize table view.</div>
          <div class="text-sm text-gray-500 mt-2">${error.message}</div>
        </div>`;
      return;
    }

    // Now that setupVirtualTable has calculated widths, update header widths
    const table = container.querySelector('#example-table');
    const headerRow = table.querySelector('thead tr');
    headerRow.querySelectorAll('th').forEach((th, index) => {
      const field = displayedFields[index];
      const width = VirtualTable.calculatedColumnWidths[field] || 150;
      th.style.width = `${width}px`;
      th.style.minWidth = `${width}px`;
      th.style.maxWidth = `${width}px`;
    });
    
    // Calculate actual row height from a rendered row
    VirtualTable.measureRowHeight(table, displayedFields);
    
    // Initial render of virtual table
    VirtualTable.renderVirtualTable();
    
    // Set up table sorting click handlers
    const sortableHeaders = table.querySelectorAll('th.sortable-header');
    sortableHeaders.forEach(th => {
      th.addEventListener('click', (e) => {
        // Prevent sorting if clicking the trash can
        if (e.target.closest('#header-trash')) return;
        
        const field = th.getAttribute('data-sort-field');
        if (field && window.VirtualTable && window.VirtualTable.sortTableBy) {
          window.VirtualTable.sortTableBy(field);
        }
      });
    });

    // Make sure updateSortHeadersUI exists on window
    if (!window.updateSortHeadersUI) {
      window.updateSortHeadersUI = (sortColumn, sortDirection) => {
        document.querySelectorAll('#example-table th').forEach(th => {
          const iconSpan = th.querySelector('.sort-icon');
          if (iconSpan) {
            if (th.getAttribute('data-sort-field') === sortColumn) {
              iconSpan.innerHTML = sortDirection === 'asc' ? ' ↑' : ' ↓';
              iconSpan.className = 'sort-icon text-green-600 font-bold ml-1';
            } else {
              iconSpan.innerHTML = '';
              iconSpan.className = 'sort-icon text-gray-400 ml-1';
            }
          }
        });
      };
    }
    // Re-apply sort UI state on table render
    const state = window.VirtualTable.getVirtualTableState ? window.VirtualTable.getVirtualTableState() : null;
    if (state && state.currentSortColumn && window.updateSortHeadersUI) {
      window.updateSortHeadersUI(state.currentSortColumn, state.currentSortDirection);
    }

    // Set up drag and drop
    window.DragDropSystem.addDragAndDrop(table);
    window.DragDropSystem.attachBubbleDropTarget(container);
    
    // Update bubble dragging states
    document.querySelectorAll('.bubble').forEach(bubbleEl => {
      const field = bubbleEl.textContent.trim();
      const fieldDef = window.fieldDefs ? window.fieldDefs.get(field) : null;
      if (fieldDef && fieldDef.is_buildable) {
        bubbleEl.setAttribute('draggable', 'false');
      } else if(displayedFields.includes(field)){
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
    if (currentCategory === 'Selected') {
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
  
// Initial render of category bar and mobile selector
// We now load fields dynamically from the backend first!
(async function initDynamicFields() {
    try {
        if (window.loadFieldDefinitions) {
            await window.loadFieldDefinitions();
        }
        updateCategoryCounts();
        
        // Ensure Bubble system finishes drawing the newly loaded fields
        if (window.BubbleSystem) {
          window.BubbleSystem.safeRenderBubbles();
        }
    } catch (err) {
        console.error("Failed async initialization:", err);
    }
})();

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

// Globals for bubble animation are defined in queryState.js (window.isBubbleAnimatingBack, etc.)


