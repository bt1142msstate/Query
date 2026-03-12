/**
 * Query UI Management
 * Handles UI updates, DOM elements, and UI logic.
 * @module QueryUI
 */

// Centralized DOM element cache
window.DOM = {
  get overlay() { return this._overlay ||= document.getElementById('overlay'); },
  get conditionPanel() { return this._conditionPanel ||= document.getElementById('condition-panel'); },
  get inputWrapper() { return this._inputWrapper ||= document.getElementById('condition-input-wrapper'); },
  get conditionInput() { return this._conditionInput ||= document.getElementById('condition-input'); },
  get conditionInput2() { return this._conditionInput2 ||= document.getElementById('condition-input-2'); },
  get betweenLabel() { return this._betweenLabel ||= document.getElementById('between-label'); },
  get confirmBtn() { return this._confirmBtn ||= document.getElementById('confirm-btn'); },
  get runBtn() { return this._runBtn ||= document.getElementById('run-query-btn'); },
  get runIcon() { return this._runIcon ||= document.getElementById('run-icon'); },
  get refreshIcon() { return this._refreshIcon ||= document.getElementById('refresh-icon'); },
  get stopIcon() { return this._stopIcon ||= document.getElementById('stop-icon'); },
  get downloadBtn() { return this._downloadBtn ||= document.getElementById('download-btn'); },
  get queryBox() { return this._queryBox ||= document.getElementById('query-json'); },
  get queryInput() { return this._queryInput ||= document.getElementById('query-input'); },
  get tableNameInput() { return this._tableNameInput ||= document.getElementById('table-name-input'); },
  get clearSearchBtn() { return this._clearSearchBtn ||= document.getElementById('clear-search-btn'); },
  get groupMethodSelect() { return this._groupMethodSelect ||= document.getElementById('group-method-select'); },
  get filterError() { return this._filterError ||= document.getElementById('filter-error'); },
  get headerBar() { return this._headerBar ||= document.getElementById('header-bar'); },
  get categoryBar() { return this._categoryBar ||= document.getElementById('category-bar'); },
  get mobileCategorySelector() { return this._mobileCategorySelector ||= document.getElementById('mobile-category-selector'); }
};


/**
 * Updates the run button icon based on query state changes.
 * Shows play icon for new queries, refresh icon for modified queries, stop icon when running.
 * @function updateRunButtonIcon
 */
window.updateRunButtonIcon = function(validationError) {
  const runIcon = window.DOM.runIcon;
  const refreshIcon = window.DOM.refreshIcon;
  const stopIcon = window.DOM.stopIcon;
  const runBtn = window.DOM.runBtn;
  const mobileRunQuery = document.getElementById('mobile-run-query');

  const setRunTooltip = (tooltipText, ariaLabel) => {
    runBtn.setAttribute('data-tooltip', tooltipText);
    runBtn.setAttribute('aria-label', ariaLabel);
    if (mobileRunQuery) {
      mobileRunQuery.setAttribute('data-tooltip', tooltipText);
    }
  };
  
  // State 1: Query is running - show stop icon
  if (window.queryRunning) {
    runIcon.classList.add('hidden');
    refreshIcon.classList.add('hidden');
    stopIcon.classList.remove('hidden');
    runBtn.disabled = false;
    runBtn.classList.remove('opacity-50', 'cursor-not-allowed');
    runBtn.classList.add('bg-red-500', 'hover:bg-red-600');
    runBtn.classList.remove('bg-green-500', 'hover:bg-green-600');
    setRunTooltip('Stop Query', 'Stop query');
    return;
  }
  
  // Reset button styling for non-running states
  runBtn.classList.remove('bg-red-500', 'hover:bg-red-600');
  runBtn.classList.add('bg-green-500', 'hover:bg-green-600');
  stopIcon.classList.add('hidden');
  
  // Custom Validation Error (like missing name) - disabled
  if (validationError) {
    runIcon.classList.remove('hidden');
    refreshIcon.classList.add('hidden');
    runBtn.disabled = true;
    runBtn.classList.add('opacity-50', 'cursor-not-allowed');
    setRunTooltip(validationError, validationError);
    return;
  }
  
  // State 2: No columns - disabled (show run icon but disabled)
  if (!window.displayedFields || window.displayedFields.length === 0) {
    runIcon.classList.remove('hidden');
    refreshIcon.classList.add('hidden');
    runBtn.disabled = true;
    runBtn.classList.add('opacity-50', 'cursor-not-allowed');
    setRunTooltip('Add columns to enable query', 'Add columns to enable query');
    return;
  }
  
  // Re-enable button for states 3 & 4
  runBtn.disabled = false;
  runBtn.classList.remove('opacity-50', 'cursor-not-allowed');
  
  // State 3: Query has changed - show run icon
  if (window.hasQueryChanged()) {
    runIcon.classList.remove('hidden');
    refreshIcon.classList.add('hidden');
    setRunTooltip('Run Query', 'Run query');
  } else {
    // State 4: No changes - show refresh icon
    runIcon.classList.add('hidden');
    refreshIcon.classList.remove('hidden');
    setRunTooltip('Refresh Data', 'Refresh data');
  }
};

/**
 * Updates run and download button states together
 */
window.updateButtonStates = function() {
  const runBtn = window.DOM.runBtn;
  const downloadBtn = window.DOM.downloadBtn;

  const tableNameInput = window.DOM.tableNameInput;
  const tableName = tableNameInput ? tableNameInput.value.trim() : '';
  const hasName = tableName && tableName !== '';

  if(runBtn){
    try{
      const payload = window.buildBackendQueryPayload ? window.buildBackendQueryPayload(tableName) : null;
      const hasFields = !!(
        payload && (
          (Array.isArray(payload.display_fields) && payload.display_fields.length > 0) ||
          (Array.isArray(payload.special_fields) && payload.special_fields.length > 0)
        )
      );
      
      let validationError = null;
      if (!hasName) {
        validationError = "Please name your query to run";
        runBtn.disabled = true;
      } else {
        runBtn.disabled = !hasFields || window.queryRunning;
      }
      
      // Use the sophisticated icon/tooltip update function instead of simple tooltip
      window.updateRunButtonIcon(validationError);
    }catch{
      runBtn.disabled = true;
      // Use the sophisticated icon/tooltip update function instead of simple tooltip
      window.updateRunButtonIcon();
    }
  }

  if(downloadBtn){
    const hasData = displayedFields.length > 0 && VirtualTable.virtualTableData && VirtualTable.virtualTableData.rows && VirtualTable.virtualTableData.rows.length > 0;

    // Add/remove error styling based on table name presence
    if (tableNameInput) {
      // Show error styling if they try to run/download without a name, or if they have queries built up but no name
      if (!hasName && (hasData || (displayedFields && displayedFields.length > 0))) {
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
};

/* ---------- Check for contradiction & return human-readable reason ---------- */
// getContradictionMessage moved to filterManager.js

/* Re-position the input capsule so it keeps a constant gap above the condition buttons */
window.positionInputWrapper = function(){
  const inputWrapper = window.DOM.inputWrapper;
  const conditionPanel = window.DOM.conditionPanel;
  
  if(!inputWrapper.classList.contains('show')) return;
  const panelRect   = conditionPanel.getBoundingClientRect();
  const wrapperRect = inputWrapper.getBoundingClientRect();
  const GAP = 12;                        // px gap between capsule and buttons
  
  let top = panelRect.top - wrapperRect.height - GAP;
  
  // Overlap the condition panel instead of going off the top edge of the window
  const headerHeight = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--header-height')) || 64;
  const minTop = headerHeight + 24; // Leave some space below header
  if (top < minTop) {
    top = minTop;
  }
  
  inputWrapper.style.top = `${top}px`;
  // Pass the exact top position to CSS so `.cond-list` knows how much vertical space to use
  inputWrapper.style.setProperty('--wrapper-top', `${top}px`);
  // Pass the panel top position to CSS mostly for limiting dropdown heights above the panel
  inputWrapper.style.setProperty('--panel-top', `${panelRect.top}px`);
};

/** Rebuild the query JSON and show it */
window.updateQueryJson = function(){
  const tableNameInput = window.DOM.tableNameInput;
  const queryName = tableNameInput ? tableNameInput.value.trim() : '';
  const payload = window.buildBackendQueryPayload(queryName);

  window.updateRunButtonIcon();

  const queryBox = window.DOM.queryBox;
  if(queryBox) queryBox.value = JSON.stringify(payload, null, 2);
  window.updateButtonStates();
};

// Helper function to check if a field should have purple styling
window.shouldFieldHavePurpleStyling = function(fieldName) {
  // Check if field or its duplicates are displayed
  // This logic is duplicated in query.js for now, we should consolidated it.
  
  if (window.shouldFieldHavePurpleStylingBase) {
    return window.shouldFieldHavePurpleStylingBase(fieldName, window.displayedFields, window.activeFilters);
  }
  
  // Fallback implementation if base function not available
  const isDisplayed = window.displayedFields && window.displayedFields.some(f => window.getBaseFieldName(f) === window.getBaseFieldName(fieldName));
  const hasFilter = window.activeFilters && window.activeFilters[fieldName] && window.activeFilters[fieldName].filters.length > 0;
  return isDisplayed || hasFilter;
};

/* Create a custom grouped selector for options with the dash delimiter */
window.createGroupedSelector = function(values, isMultiSelect, currentValues = []) {
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
  
  // Build candidate groups by "prefix-..." and keep non-prefixed values ungrouped.
  const candidateGroups = new Map();
  const ungroupedValues = [];

  processedValues.forEach(val => {
    const displayText = (val.display || '').trim();
    const dashIndex = displayText.indexOf('-');
    const hasPrefixGroup = dashIndex > 0;
    if (!hasPrefixGroup) {
      ungroupedValues.push(val);
      return;
    }

    const groupName = displayText.slice(0, dashIndex).trim();
    if (!groupName) {
      ungroupedValues.push(val);
      return;
    }

    if (!candidateGroups.has(groupName)) candidateGroups.set(groupName, []);
    candidateGroups.get(groupName).push(val);
  });

  // Only keep true groups (2+ items). Singletons are flattened.
  const groupedData = new Map();
  candidateGroups.forEach((vals, name) => {
    if (vals.length > 1) {
      groupedData.set(name, vals);
    } else {
      ungroupedValues.push(vals[0]);
    }
  });

  // Group header + selection section
  const groupElements = []; // Store references for search functionality
  const flatOptionItems = [];

  function createOptionItem(val, groupName = '', stripPrefix = false) {
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

    input.addEventListener('change', () => {
      if (isMultiSelect && groupName) {
        const groupOptions = optionsContainer.querySelectorAll(`.option-item[data-group="${groupName}"] input`);
        const allChecked = Array.from(groupOptions).every(opt => opt.checked);
        const groupCheckbox = optionsContainer.querySelector(`.group-checkbox[data-group="${groupName}"]`);
        if (groupCheckbox) groupCheckbox.checked = allChecked;
      }
    });

    const label = document.createElement('label');
    let displayText = val.display;
    if (stripPrefix && typeof displayText === 'string' && displayText.includes('-')) {
      displayText = displayText.split('-').slice(1).join('-').trim();
    }
    label.textContent = displayText;

    optionItem.appendChild(input);
    optionItem.appendChild(label);
    return optionItem;
  }

  for (const [groupName, groupValues] of groupedData) {
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
      const optionItem = createOptionItem(val, groupName, true);
      groupOptions.appendChild(optionItem);
      flatOptionItems.push(optionItem);
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

  // Render ungrouped options as standalone rows (no synthetic "Other" group).
  ungroupedValues.forEach(val => {
    const optionItem = createOptionItem(val);
    optionItem.classList.add('ungrouped-option');
    optionsContainer.appendChild(optionItem);
    flatOptionItems.push(optionItem);
  });
  
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

      flatOptionItems.forEach(item => {
        item.style.display = '';
        const label = item.querySelector('label');
        label.innerHTML = label.textContent;
      });
    } else {
      groupElements.forEach(group => {
        let hasMatch = false;
        
        // Check each option in the group
        Array.from(group.options.querySelectorAll('.option-item')).forEach(item => {
          const value = item.dataset.value.toLowerCase();
          const display = item.dataset.display.toLowerCase();
          const label = item.querySelector('label');
          const displayText = label.textContent.toLowerCase();
          
          if (value.includes(searchTerm) || display.includes(searchTerm) || displayText.includes(searchTerm)) {
            item.style.display = '';
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

      flatOptionItems.forEach(item => {
        const value = item.dataset.value.toLowerCase();
        const display = item.dataset.display.toLowerCase();
        const label = item.querySelector('label');
        const displayText = label.textContent.toLowerCase();

        if (value.includes(searchTerm) || display.includes(searchTerm) || displayText.includes(searchTerm)) {
          item.style.display = '';
          const originalText = label.textContent;
          const regex = new RegExp(`(${searchTerm.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')})`, 'gi');
          label.innerHTML = originalText.replace(regex, '<span class="highlight">$1</span>');
        } else {
          item.style.display = 'none';
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
      groupedData.forEach((_, groupName) => {
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
};

// Add this helper function to show error messages with consistent styling and timeout
window.showError = function(message, inputElements = [], duration = 3000) {
  const errorLabel = window.DOM.filterError;
  
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
};

// Helper function to format duration in a comprehensive way
window.formatDuration = function(seconds) {
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
};

// FilterPill class moved to filterManager.js
