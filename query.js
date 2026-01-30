// Field definitions loaded from fieldDefs.js

// Utility Functions - Available globally
// getBaseFieldName is now in queryState.js

// Local alias for this file
const getBaseFieldName = window.getBaseFieldName;

// showToastMessage is now in toast.js
// Local alias for this file
const showToastMessage = window.showToastMessage;

// DOM elements cache is now in queryUI.js
// Legacy aliases are assigned in queryUI.js to window to maintain compatibility

// State variables are now in queryState.js
// We rely on the global window variables defined there.
// window.displayedFields, window.queryRunning, etc.

// Query state tracking is now in queryState.js

// getCurrentQueryState is now in queryState.js

// hasQueryChanged is now in queryState.js

// updateRunButtonIcon is now in queryUI.js

// Data structures
// activeFilters is in queryState.js - accessing via window.activeFilters

// Global set to track which bubbles are animating back
// animatingBackBubbles is in queryState.js

// isBubbleAnimating is in queryState.js

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


// updateButtonStates is now in queryUI.js - relying on window.updateButtonStates
// Initial check
window.updateButtonStates();

// toggleQueryInterface is now in queryUI.js - relying on window.toggleQueryInterface

if(runBtn){
  runBtn.addEventListener('click', ()=>{
    if(runBtn.disabled) return;   // ignore when disabled
    
    // If query is running, stop it
    if (queryRunning) {
      queryRunning = false;
      updateRunButtonIcon();
      return;
    }
    
    // Start query execution
    queryRunning = true;
    updateRunButtonIcon();
    
    // Simulate query execution (since real execution isn't implemented yet)
    setTimeout(() => {
      queryRunning = false;
      // Update the last executed query state to current state
      lastExecutedQueryState = getCurrentQueryState();
      updateRunButtonIcon();
    }, 2000); // Simulate 2 second execution
    
    // Show "not implemented yet" message
    showToastMessage('Query execution is not implemented yet', 'info');
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
// positionInputWrapper is now in queryUI.js - relying on window.positionInputWrapper

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
// mapOperator is now in queryUI.js - local alias if needed, or just use it where needed via window.
// But wait, updateQueryJson uses it. updateQueryJson is also moved.

/** Rebuild the query JSON and show it */
// updateQueryJson is now in queryUI.js - relying on window.updateQueryJson

// Helper function to check if a field should have purple styling
// shouldFieldHavePurpleStyling is now in queryUI.js - relying on window.shouldFieldHavePurpleStyling


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
      // Use stored original position for accurate return animation
      const originalRect = clone._originalRect;
      if (originalRect) {
        clone.style.top  = originalRect.top + 'px';
        clone.style.left = originalRect.left + 'px';
      } else {
        // Fallback to current position if original position wasn't stored
        const nowRect = origin.getBoundingClientRect();
        clone.style.top  = nowRect.top + 'px';
        clone.style.left = nowRect.left + 'px';
      }
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
              window.BubbleSystem && window.BubbleSystem.applyCorrectBubbleStyling(b);
              }
            }
          });
        });
        // If all animations are done, allow rendering if needed
        if (animatingBackBubbles.size === 0) {
          isBubbleAnimatingBack = false;
          if (pendingRenderBubbles) {
            window.BubbleSystem && window.BubbleSystem.renderBubbles();
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
          window.BubbleSystem && window.BubbleSystem.applyCorrectBubbleStyling(matchingBubble);
          }
        }
      }
      // If all animations are done, allow rendering if needed
      if (animatingBackBubbles.size === 0) {
        isBubbleAnimatingBack = false;
        if (pendingRenderBubbles) {
          window.BubbleSystem && window.BubbleSystem.renderBubbles();
          pendingRenderBubbles = false;
        }
      }
    }
  });
  // After all clones are removed and origin restored, re-enable bubble interaction
  setTimeout(() => {
    if (clones.length === 0) {
      isBubbleAnimatingBack = false;
      window.BubbleSystem && window.BubbleSystem.safeRenderBubbles();
    }
  }, 0);
}

overlay.addEventListener('click',()=>{ 
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
      let success = false;
      if(cond === 'show'){
        // Use centralized addColumn function (same logic as drag/drop)
        success = window.addColumn ? window.addColumn(selectedField) : false;
      }else if(cond === 'hide' && displayedFields.includes(selectedField)){
        // Use centralized removeColumnByName function (same logic as trash)
        success = window.removeColumnByName ? window.removeColumnByName(selectedField) : false;
      }
      
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
// getContradictionMessage is now in queryUI.js - relying on window.getContradictionMessage

/* Create a custom grouped selector for options with the dash delimiter */
// createGroupedSelector is now in queryUI.js - relying on window.createGroupedSelector

// Add this helper function to show error messages with consistent styling and timeout
// showError is now in queryUI.js - relying on window.showError

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
        
        // Ensure the field is in filteredDefs immediately
        if (!filteredDefs.find(d => d.name === dynamicMarcField)) {
          filteredDefs.push({ ...newDef });
        }
      }
      window.DragDropSystem.restoreFieldWithDuplicates(dynamicMarcField);
      // Don't call showExampleTable here - we'll do it once after all fields are added
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
    });
    
    // Update the table with all new fields at once
    if (marcNumbers.length > 0) {
      showExampleTable(displayedFields).catch(error => {
        console.error('Error updating table:', error);
      });
    }
    
    // After creating all new Marc fields, re-render bubbles to show them properly
    if (marcNumbers.length > 0) {
      // Clear any active search to ensure new MARC fields are visible
      const queryInput = document.getElementById('query-input');
      if (queryInput && queryInput.value.trim()) {
        queryInput.value = '';
        updateFilteredDefs(''); // Reset filteredDefs to show all fields
      }
      
      // Wait for table operations to complete and ensure fields are fully set up
      setTimeout(() => {
        // Verify the fields are in the right places
        console.log('MARC fields created:', marcNumbers.map(n => `Marc${n}`));
        console.log('displayedFields:', displayedFields);
        console.log('filteredDefs contains MARC fields:', marcNumbers.map(n => `Marc${n}`).map(field => 
          filteredDefs.find(d => d.name === field) ? 'YES' : 'NO'
        ));
        
        // Switch to Selected category first to show the newly added fields
        currentCategory = 'Selected';
        document.querySelectorAll('#category-bar .category-btn').forEach(btn =>
          btn.classList.toggle('active', btn.dataset.category === 'Selected')
        );
        
        // Update category counts to include new fields
        updateCategoryCounts();
        
        // Re-render bubbles to show the newly created Marc fields
        window.BubbleSystem && window.BubbleSystem.safeRenderBubbles();
      }, 200);
    }
    
    if (activeFilters['Marc']) delete activeFilters['Marc'];
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
              window.BubbleSystem && window.BubbleSystem.applyCorrectBubbleStyling(b);
            }
          });
          renderConditionList(field);
          if (currentCategory === 'Selected') {
            window.BubbleSystem && window.BubbleSystem.safeRenderBubbles();
          }
        }
      } catch (error) {
        console.error('Error applying filter:', error);
        showError('Error applying filter: ' + error.message, []);
        return;
      }
    }
    if (cond === 'display' || cond === 'show' || cond === 'hide') {
      if (cond === 'show') {
        window.DragDropSystem.restoreFieldWithDuplicates(field);
        showExampleTable(displayedFields).catch(error => {
          console.error('Error updating table:', error);
        });
      } else if ((cond === 'hide' || cond === 'display') && displayedFields.includes(field)) {
        const idx = displayedFields.indexOf(field);
        displayedFields.splice(idx, 1);
        showExampleTable(displayedFields).catch(error => {
          console.error('Error updating table:', error);
        });
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

/* Render/update the filter pill list for a given field */
function renderConditionList(field){
  const container = document.getElementById('bubble-cond-list');
  container.innerHTML = '';
  const data = activeFilters[field];
  if(!data || !data.filters.length) {
    document.querySelectorAll('.bubble').forEach(b=>{
      if(b.textContent.trim()===field) {
        window.BubbleSystem && window.BubbleSystem.applyCorrectBubbleStyling(b);
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
      window.BubbleSystem && window.BubbleSystem.safeRenderBubbles();
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
        window.BubbleSystem && window.BubbleSystem.safeRenderBubbles();
      }
    });
    list.appendChild(pill.getElement());
  });

  container.appendChild(list);
  updateCategoryCounts();
}

// Helper function to build condition panel for a bubble (was inside attachBubbleHandlers before)

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

  // Create initial table structure
  const tableHTML = `
    <table id="example-table" class="min-w-full divide-y divide-gray-200 bg-white">
      <thead class="sticky top-0 z-20 bg-gray-50">
        <tr>
          ${displayedFields.map((f,i) => {
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
      await VirtualTable.setupVirtualTable(container, displayedFields);
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
    
    // Set up drag and drop
    window.DragDropSystem.addDragAndDrop(table);
    window.DragDropSystem.attachBubbleDropTarget(container);
    
    // Update bubble dragging states
    document.querySelectorAll('.bubble').forEach(bubbleEl => {
      const field = bubbleEl.textContent.trim();
      if (field === 'Marc') {
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

