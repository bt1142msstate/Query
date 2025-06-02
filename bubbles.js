(function(){

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
})();
