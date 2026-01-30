/**
 * Filter Management
 * Handles filter UI, inputs, and confirmation logic.
 * @module FilterManager
 */

/**
 * FilterPill UI component class
 * Represents a single active filter condition pill in the UI.
 * (Moved from queryUI.js)
 */
class FilterPill {
    constructor(filter, fieldDef, onRemove) {
        this.filter = filter; // Note: using 'filter' prop consistent with queryUI version logic
        this.filterData = filter; // Keep compatibility if needed
        this.fieldDef = fieldDef;
        this.onRemove = onRemove;
        this.el = document.createElement('span');
        this.el.className = 'cond-pill'; // Changed class to match queryUI style
        this.render();
    }

    render() {
        const { filter, fieldDef } = this;
        // Try to get a user-friendly label for the filter value
        let valueLabel = filter.val;
        
        // Handle "Between" operator special display
        const isBetween = filter.cond.toLowerCase() === 'between';
        
        if (fieldDef && fieldDef.type === 'date') {
             if (isBetween) {
                const parts = filter.val.split('|');
                if (parts.length === 2) {
                    valueLabel = `${parts[0]} - ${parts[1]}`;
                }
            }
        }
        else if (fieldDef && fieldDef.values && fieldDef.values.length > 0) {
           // If the field has defined values (like Library), map raw values to names
           // Prefer using a global map function if available, or build map from values
           const valMap = window.getLiteralToDisplayMap ? window.getLiteralToDisplayMap(fieldDef) : 
                (typeof fieldDef.values[0] === 'object' ? new Map(fieldDef.values.map(v => [v.RawValue, v.Name])) : new Map());
           
           if (valMap.size > 0) {
                if (isBetween) {
                    valueLabel = filter.val.split('|').map(v => valMap.get(v) || v).join(' - ');
                } else {
                    valueLabel = filter.val.split(',').map(v => valMap.get(v) || v).join(', ');
                }
           }
        } else if (isBetween) {
             valueLabel = filter.val.split('|').join(' - ');
        }

        // Operator label (always show full word)
        let opLabel = filter.cond.charAt(0).toUpperCase() + filter.cond.slice(1);
        
        // Trash can SVG
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
    
        this.el.querySelector('.filter-trash').addEventListener('click', (e) => {
            e.stopPropagation();
            if (this.onRemove) this.onRemove();
        });
    }

    getElement() {
        return this.el;
    }
}

// Expose globally
window.FilterPill = FilterPill;

/**
 * Renders the list of active filters for a given field.
 * @param {string} field - The field name
 */
window.renderConditionList = function(field) {
    const container = document.getElementById('bubble-cond-list');
    if (!container) return;
    
    container.innerHTML = '';
    const data = window.activeFilters[field];

    if (!data || !data.filters.length) {
        // Reset specific styling if no filters exist
        document.querySelectorAll('.bubble').forEach(b => {
            if (b.textContent.trim() === field) {
                window.BubbleSystem && window.BubbleSystem.applyCorrectBubbleStyling(b);
            }
        });
        
        // Reset selection container inputs
        const selContainer = document.getElementById('condition-select-container');
        if (selContainer && window.selectedField === field) {
             selContainer.querySelectorAll('input[type="checkbox"], input[type="radio"]').forEach(input => {
                input.checked = false;
             });
        }
        
        window.updateCategoryCounts && window.updateCategoryCounts();
        
        // Only re-render bubbles if the field was in Selected and is now gone
        if (window.currentCategory === 'Selected') {
            const stillSelected = window.shouldFieldHavePurpleStyling(field);
            if (!stillSelected) {
                window.BubbleSystem && window.BubbleSystem.safeRenderBubbles();
            }
        }
        return;
    }

    const list = document.createElement('div');
    list.className = 'cond-list';

    // Logical toggle (AND/OR)
    const toggle = document.createElement('span');
    toggle.className = 'logical-toggle' + (data.logical === 'And' ? ' active' : '');
    toggle.textContent = data.logical.toUpperCase();
    
    toggle.addEventListener('click', () => {
        const newLogical = (data.logical === 'And') ? 'Or' : 'And';
        
        // Validate logic change
        if (newLogical === 'And') {
            const fieldType = (window.fieldDefs.get(field) || {}).type || 'string';
            let conflictMsg = null;
            for (let i = 0; i < data.filters.length; i++) {
                const preceding = { logical: 'And', filters: data.filters.slice(0, i) };
                conflictMsg = window.getContradictionMessage(preceding, data.filters[i], fieldType, field);
                if (conflictMsg) break;
            }
            if (conflictMsg) {
                window.showError(conflictMsg, [
                    document.getElementById('condition-input'), 
                    document.getElementById('condition-input-2')
                ]);
                return;
            }
        }
        
        data.logical = newLogical;
        toggle.textContent = data.logical.toUpperCase();
        toggle.classList.toggle('active', data.logical === 'And');
        window.updateQueryJson();
    });
    
    list.appendChild(toggle);

    // Create pills for each filter
    const fieldDef = window.fieldDefs.get(field);
    data.filters.forEach((f, idx) => {
        const pill = new FilterPill(f, fieldDef, () => {
            data.filters.splice(idx, 1);
            if (data.filters.length === 0) {
                delete window.activeFilters[field];
                document.querySelectorAll('.bubble').forEach(b => {
                    if (b.textContent.trim() === field) {
                        b.removeAttribute('data-filtered');
                        b.classList.remove('bubble-filter');
                    }
                });
            }
            
            // Sync up select container if visible
            const selContainer = document.getElementById('condition-select-container');
            if (selContainer && window.selectedField === field) {
                if (f.cond === 'equals') {
                    // Uncheck options that match the removed filter
                    const removedVals = f.val.split(',');
                    const valueSet = new Set(removedVals);
                    
                    selContainer.querySelectorAll('input[type="checkbox"], input[type="radio"]').forEach(input => {
                        if (input.value === f.val || valueSet.has(input.value) || valueSet.has(input.dataset.value)) {
                            input.checked = false;
                        }
                    });
                    
                    // Update group checkboxes
                    selContainer.querySelectorAll('.group-checkbox').forEach(checkbox => {
                        const groupName = checkbox.dataset.group;
                        const groupOptions = selContainer.querySelectorAll(`.option-item[data-group="${groupName}"] input`);
                        checkbox.checked = Array.from(groupOptions).some(opt => opt.checked);
                    });
                }
            }
            
            window.updateQueryJson();
            window.renderConditionList(field);
            window.updateCategoryCounts();
            
            if (window.currentCategory === 'Selected') {
                window.BubbleSystem && window.BubbleSystem.safeRenderBubbles();
            }
        });
        list.appendChild(pill.getElement());
    });

    container.appendChild(list);
    window.updateCategoryCounts && window.updateCategoryCounts();
};

/**
 * Handles condition button clicks (Equal, Contains, etc.)
 */
window.handleConditionBtnClick = function(e) {
    e.stopPropagation();
    const btn = e.currentTarget;
    const conditionPanel = document.getElementById('condition-panel');
    const inputWrapper = document.getElementById('condition-input-wrapper');
    const conditionInput = document.getElementById('condition-input');
    const conditionInput2 = document.getElementById('condition-input-2');
    const betweenLbl = document.getElementById('between-label');
    const sel = document.getElementById('condition-select');

    // Update active class
    const all = conditionPanel.querySelectorAll('.condition-btn');
    all.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    
    const cond = btn.dataset.cond;

    // Handle show/hide/display actions
    if (cond === 'show' || cond === 'hide') {
        if (window.selectedField) {
            let success = false;
            // Assuming addColumn/removeColumnByName are global from columnManager/dragDrop refactor
            if (cond === 'show') {
                success = window.addColumn ? window.addColumn(window.selectedField) : false;
            } else if (cond === 'hide' && window.displayedFields.includes(window.selectedField)) {
                success = window.removeColumnByName ? window.removeColumnByName(window.selectedField) : false;
            }
            
            // Update toggle buttons state
            const toggleButtons = conditionPanel.querySelectorAll('.toggle-half');
            toggleButtons.forEach(toggleBtn => {
                toggleBtn.classList.remove('active');
                const toggleCond = toggleBtn.dataset.cond;
                if (toggleCond === 'show' && window.displayedFields.includes(window.selectedField)) {
                    toggleBtn.classList.add('active');
                } else if (toggleCond === 'hide' && !window.displayedFields.includes(window.selectedField)) {
                    toggleBtn.classList.add('active');
                }
            });
        }
        return;
    }

    // "Between" logic
    if (cond === 'between') {
        conditionInput2.style.display = 'block';
        betweenLbl.style.display = 'inline';
        conditionInput2.type = conditionInput.type;
    } else {
        conditionInput2.style.display = 'none';
        betweenLbl.style.display = 'none';
    }

    inputWrapper.classList.add('show');
    window.positionInputWrapper();
    
    // Focus appropriate input
    if (sel && sel.style.display !== 'none') {
        sel.focus();
    } else {
        (cond === 'between' ? conditionInput2 : conditionInput).focus();
    }
    
    // Reposition again after layout change
    window.positionInputWrapper();
};

/**
 * Handles filter confirmation action
 */
window.handleFilterConfirm = function(e) {
    e.stopPropagation();
    
    // Dependencies
    const bubble = document.querySelector('.active-bubble');
    if (!bubble) return;
    
    const conditionPanel = document.getElementById('condition-panel');
    const conditionInput = document.getElementById('condition-input');
    const conditionInput2 = document.getElementById('condition-input-2');
    const sel = document.getElementById('condition-select');
    const selContainer = document.getElementById('condition-select-container');
    const overlay = document.getElementById('overlay');
    
    const field = bubble.dataset.filterFor || bubble.textContent.trim();
    const activeBtn = document.querySelector('.condition-btn.active');
    const cond = activeBtn?.dataset.cond;
    let val = conditionInput.value.trim();
    let val2 = conditionInput2.value.trim();
    
    const fieldDef = window.fieldDefs.get(field);
    const isSpecialMarc = fieldDef && fieldDef.isSpecialMarc;

    // Special handling for MARC fields
    if (isSpecialMarc) {
        handleMarcFieldConfirm(cond, val);
        window.finalizeConfirmAction();
        return;
    }

    const isMultiSelect = fieldDef && fieldDef.multiSelect;

    // Validation
    if (cond && cond !== 'display') {
        const tintInputs = [conditionInput, conditionInput2];
        
        if (cond === 'between' && (val === '' || val2 === '')) {
            window.showError('Please enter both values', tintInputs);
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
                window.showError('Please enter a value', tintInputs);
                return;
            }
        }
    }

    // Between Validation: Value Order
    if (cond === 'between') {
        const type = bubble.dataset.type || 'string';
        let a = val, b = val2;
        if (type === 'number' || type === 'money') {
            a = parseFloat(a); b = parseFloat(b);
        } else if (type === 'date') {
            a = new Date(a).getTime(); b = new Date(b).getTime();
        }
        
        if (a === b) {
            window.showError('Between values must be different', [conditionInput, conditionInput2]);
            return;
        }
        if (a > b) {
            // Swap values
            conditionInput.value = val2;
            conditionInput2.value = val;
            val = conditionInput.value.trim();
            val2 = conditionInput2.value.trim();
        }
    }

    // Applying logic
    if (cond && cond !== 'display') {
        try {
            if (!window.activeFilters[field]) {
                window.activeFilters[field] = { logical: 'And', filters: [] };
            }

            const isContainerVisible = selContainer && selContainer.style.display !== 'none';
            const isSelectVisible = sel && sel.style.display !== 'none';
            
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
            const existingSet = window.activeFilters[field];
            
            // Check for contradictions
            const conflictMsg = window.getContradictionMessage(existingSet, newFilterObj, fieldType, field);
            if (conflictMsg) {
                window.showError(conflictMsg, [conditionInput, conditionInput2]);
                return;
            }

            if (filterValue !== '') {
                console.log(`Applying filter for ${field}: ${cond} ${filterValue}`);
                
                // Merge equal filters for MultiSelect fields
                if (isMultiSelect && cond === 'equals') {
                    const existingEqualsIdx = window.activeFilters[field].filters.findIndex(f => f.cond === 'equals');
                    if (existingEqualsIdx !== -1) {
                        const existingVals = window.activeFilters[field].filters[existingEqualsIdx].val.split(',');
                        const newVals = filterValue.split(',');
                        const uniqueVals = [...new Set([...existingVals, ...newVals])];
                        window.activeFilters[field].filters[existingEqualsIdx].val = uniqueVals.join(',');
                    } else {
                        window.activeFilters[field].filters.push({ cond, val: filterValue });
                    }
                } else {
                    window.activeFilters[field].filters.push({ cond, val: filterValue });
                }

                // Update UI state
                document.querySelectorAll('.bubble').forEach(b => {
                    if (b.textContent.trim() === field) {
                        window.BubbleSystem && window.BubbleSystem.applyCorrectBubbleStyling(b);
                    }
                });
                
                window.renderConditionList(field);
                
                if (window.currentCategory === 'Selected') {
                    window.BubbleSystem && window.BubbleSystem.safeRenderBubbles();
                }
            }
        } catch (error) {
            console.error('Error applying filter:', error);
            window.showError('Error applying filter: ' + error.message, []);
            return;
        }
    }

    // Logic for "display", "show", "hide" buttons
    if (cond === 'display' || cond === 'show' || cond === 'hide') {
        if (cond === 'show') {
            window.DragDropSystem.restoreFieldWithDuplicates(field);
            window.showExampleTable(window.displayedFields).catch(console.error);
        } else if ((cond === 'hide' || cond === 'display') && window.displayedFields.includes(field)) {
            const idx = window.displayedFields.indexOf(field);
            window.displayedFields.splice(idx, 1);
            window.showExampleTable(window.displayedFields).catch(console.error);
        }
    }

    window.finalizeConfirmAction();
};

/**
 * Specific logic for MARC fields creation
 */
function handleMarcFieldConfirm(cond, val) {
    const marcInput = document.getElementById('marc-field-input');
    const marcNumbersRaw = marcInput?.value?.trim();
    
    if (!marcNumbersRaw) {
        return window.showError('Please enter at least one Marc field number', [marcInput]);
    }
    
    const marcNumbers = marcNumbersRaw.split(',').map(s => s.trim()).filter(s => /^\d{1,3}$/.test(s));
    
    if (marcNumbers.length === 0) {
        return window.showError('Please enter valid Marc field numbers (1-3 digits, comma separated)', [marcInput]);
    }

    marcNumbers.forEach((marcNumber, idx) => {
        const dynamicMarcField = `Marc${marcNumber}`;
        if (dynamicMarcField === 'Marc') return; 
        
        // Dynamically add field definition if missing
        if (!window.fieldDefs.has(dynamicMarcField)) {
            const newDef = {
                name: dynamicMarcField,
                type: 'string',
                category: 'Marc',
                desc: `MARC ${marcNumber} field`
            };
            window.fieldDefs.set(dynamicMarcField, newDef);
            
            // Ensure the field is in filteredDefs immediately
            if (!window.filteredDefs.find(d => d.name === dynamicMarcField)) {
                window.filteredDefs.push({ ...newDef });
            }
        }
        
        window.DragDropSystem.restoreFieldWithDuplicates(dynamicMarcField);

        // Apply filter if one was selected
        if (idx === 0 && cond && val) {
            if (!window.activeFilters[dynamicMarcField]) {
                window.activeFilters[dynamicMarcField] = { logical: 'And', filters: [] };
            }
            const alreadyExists = window.activeFilters[dynamicMarcField].filters.some(f => f.cond === cond && f.val === val);
            if (!alreadyExists) {
                window.activeFilters[dynamicMarcField].filters.push({ cond, val });
            }
        }
    });

    // Update table once
    if (marcNumbers.length > 0) {
        window.showExampleTable(window.displayedFields).catch(console.error);
    
        // Clear search
        const queryInput = document.getElementById('query-input');
        if (queryInput && queryInput.value.trim()) {
            queryInput.value = '';
            window.updateFilteredDefs(''); 
        }

        setTimeout(() => {
            // Switch to Selected category
            window.currentCategory = 'Selected';
            document.querySelectorAll('#category-bar .category-btn').forEach(btn =>
                btn.classList.toggle('active', btn.dataset.category === 'Selected')
            );
            
            window.updateCategoryCounts();
            window.BubbleSystem && window.BubbleSystem.safeRenderBubbles();
        }, 200);
    }
    
    if (window.activeFilters['Marc']) delete window.activeFilters['Marc'];
}

// Global confirm action finalizer
window.finalizeConfirmAction = function() {
    window.updateQueryJson();
    
    const condInput2 = document.getElementById('condition-input-2');
    if (condInput2) condInput2.value = '';

    const marcInput = document.getElementById('marc-field-input');
    if (marcInput) marcInput.value = '';

    // Click overlay to close panel and reset
    const overlay = document.getElementById('overlay');
    if (overlay) overlay.click();
    
    window.updateCategoryCounts && window.updateCategoryCounts();
};

/**
 * Special handler for condition buttons when in Marc mode
 */
window.marcConditionBtnHandler = function(e) {
    e.stopPropagation();
    const btn = e.currentTarget;
    const conditionPanel = document.getElementById('condition-panel');
    const conditionInput = document.getElementById('condition-input');
    const inputWrapper = document.getElementById('condition-input-wrapper');
    const conditionInput2 = document.getElementById('condition-input-2');
    const betweenLbl = document.getElementById('between-label');
    
    // Update active state
    const all = conditionPanel.querySelectorAll('.condition-btn');
    all.forEach(b => b.classList.remove('active'));
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
    if (cond === 'between') {
        conditionInput2.style.display = 'block';
        betweenLbl.style.display = 'inline';
        conditionInput2.type = conditionInput.type;     // match type (date, number, text)
    } else {
        conditionInput2.style.display = 'none';
        betweenLbl.style.display = 'none';
    }
    
    if (inputWrapper) {
        inputWrapper.classList.add('show');
        if (window.positionInputWrapper) window.positionInputWrapper();
    }
    
    if (conditionInput) conditionInput.focus();
    
    // Re-position after toggling second input visibility
    if (window.positionInputWrapper) window.positionInputWrapper();
};

// --- Condition templates by type ---
window.typeConditions = {
  string: ['contains','starts','equals'],     // no "between" for plain strings
  number: ['greater','less','equals','between'],
  money : ['greater','less','equals','between'],
  date  : ['before','after','equals','between']
};

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

window.configureInputsForType = function(type){
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
};

/* ---------- Check for contradiction & return human-readable reason ---------- */
window.getContradictionMessage = function(existing, newF, fieldType, fieldLabel){
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
};
