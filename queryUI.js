/**
 * Query UI Management
 * Handles UI updates, DOM elements, and UI logic.
 * @module QueryUI
 */

// Import necessary dependencies
// IMPORTANT: We need queryState but it is imported by the module that imports us
// To break circular dependencies, we accept state as arguments or access via window temporarily during transition
import { queryState, getBaseFieldName, hasQueryChanged, getCurrentQueryState } from './queryState.js';

// Centralized DOM element cache as export
export const DOM = {
  get overlay() { return this._overlay ||= document.getElementById('overlay'); },
  get conditionPanel() { return this._conditionPanel ||= document.getElementById('condition-panel'); },
  get inputWrapper() { return this._inputWrapper ||= document.getElementById('condition-input-wrapper'); },
  get conditionInput() { return this._conditionInput ||= document.getElementById('condition-input'); },
  get confirmBtn() { return this._confirmBtn ||= document.getElementById('confirm-btn'); },
  get runBtn() { return this._runBtn ||= document.getElementById('run-query-btn'); },
  get runIcon() { return this._runIcon ||= document.getElementById('run-icon'); },
  get refreshIcon() { return this._refreshIcon ||= document.getElementById('refresh-icon'); },
  get stopIcon() { return this._stopIcon ||= document.getElementById('stop-icon'); },
  get downloadBtn() { return this._downloadBtn ||= document.getElementById('download-btn'); },
  get queryBox() { return this._queryBox ||= document.getElementById('query-json'); },
  get queryInput() { return this._queryInput ||= document.getElementById('query-input'); },
  get clearSearchBtn() { return this._clearSearchBtn ||= document.getElementById('clear-search-btn'); },
  get groupMethodSelect() { return this._groupMethodSelect ||= document.getElementById('group-method-select'); }
};

/**
 * Updates the run button icon based on query state changes.
 * Shows play icon for new queries, refresh icon for modified queries, stop icon when running.
 * @function updateRunButtonIcon
 */
export function updateRunButtonIcon() {
  const runIcon = document.getElementById('run-icon');
  const refreshIcon = document.getElementById('refresh-icon');
  const stopIcon = document.getElementById('stop-icon');
  const runBtn = document.getElementById('run-query-btn');
  const mobileRunQuery = document.getElementById('mobile-run-query');
  
  // State 1: Query is running - show stop icon
  if (queryState.queryRunning) {
    runIcon.classList.add('hidden');
    refreshIcon.classList.add('hidden');
    stopIcon.classList.remove('hidden');
    runBtn.disabled = false;
    runBtn.classList.remove('opacity-50', 'cursor-not-allowed');
    runBtn.classList.add('bg-red-500', 'hover:bg-red-600');
    runBtn.classList.remove('bg-green-500', 'hover:bg-green-600');
    runBtn.setAttribute('data-tooltip', 'Stop Query');
    runBtn.setAttribute('aria-label', 'Stop query');
    if (mobileRunQuery) {
      mobileRunQuery.setAttribute('data-tooltip', 'Stop Query');
    }
    return;
  }
  
  // Reset button styling for non-running states
  runBtn.classList.remove('bg-red-500', 'hover:bg-red-600');
  runBtn.classList.add('bg-green-500', 'hover:bg-green-600');
  stopIcon.classList.add('hidden');
  
  // State 2: No columns - disabled (show run icon but disabled)
  if (!queryState.displayedFields || queryState.displayedFields.length === 0) {
    runIcon.classList.remove('hidden');
    refreshIcon.classList.add('hidden');
    runBtn.disabled = true;
    runBtn.classList.add('opacity-50', 'cursor-not-allowed');
    runBtn.setAttribute('data-tooltip', 'Add columns to enable query');
    runBtn.setAttribute('aria-label', 'Add columns to enable query');
    if (mobileRunQuery) {
      mobileRunQuery.setAttribute('data-tooltip', 'Add columns to enable query');
    }
    return;
  }
  
  // Re-enable button for states 3 & 4
  runBtn.disabled = false;
  runBtn.classList.remove('opacity-50', 'cursor-not-allowed');
  
  // State 3: Query has changed - show run icon
  if (hasQueryChanged()) {
    runIcon.classList.remove('hidden');
    refreshIcon.classList.add('hidden');
    runBtn.setAttribute('data-tooltip', 'Run Query');
    runBtn.setAttribute('aria-label', 'Run query');
    if (mobileRunQuery) {
      mobileRunQuery.setAttribute('data-tooltip', 'Run Query');
    }
  } else {
    // State 4: No changes - show refresh icon
    runIcon.classList.add('hidden');
    refreshIcon.classList.remove('hidden');
    runBtn.setAttribute('data-tooltip', 'Refresh Data');
    runBtn.setAttribute('aria-label', 'Refresh data');
    if (mobileRunQuery) {
      mobileRunQuery.setAttribute('data-tooltip', 'Refresh Data');
    }
  }
}

/**
 * Updates run and download button states together
 */
export function updateButtonStates() {
  const runBtn = DOM.runBtn;
  const downloadBtn = DOM.downloadBtn;
  const queryBox = DOM.queryBox;

  if(runBtn){
    try{
      const q = JSON.parse(queryBox.value || '{}');
      const hasFields = Array.isArray(q.DesiredColumnOrder) && q.DesiredColumnOrder.length > 0;
      runBtn.disabled = !hasFields || queryState.queryRunning;
      // Use the sophisticated icon/tooltip update function instead of simple tooltip
      updateRunButtonIcon();
    }catch{
      runBtn.disabled = true;
      // Use the sophisticated icon/tooltip update function instead of simple tooltip
      updateRunButtonIcon();
    }
  }

  if(downloadBtn){
    const tableNameInput = document.getElementById('table-name-input');
    const tableName = tableNameInput ? tableNameInput.value.trim() : '';
    // Note: VirtualTable access via window until we import it
    const hasData = queryState.displayedFields.length > 0 && window.VirtualTable?.virtualTableData?.rows?.length > 0;
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

/**
 * Helper function to manage UI changes when a query starts/stops
 */
export function toggleQueryInterface(isQueryRunning) {
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

/* ---------- Check for contradiction & return human-readable reason ---------- */
// getContradictionMessage moved to filterManager.js

/* Re-position the input capsule so it keeps a constant gap above the condition buttons */
export function positionInputWrapper(){
  const inputWrapper = DOM.inputWrapper;
  const conditionPanel = DOM.conditionPanel;
  
  if(!inputWrapper.classList.contains('show')) return;
  const panelRect   = conditionPanel.getBoundingClientRect();
  const wrapperRect = inputWrapper.getBoundingClientRect();
  const GAP = 12;                        // px gap between capsule and buttons
  const top = panelRect.top - wrapperRect.height - GAP;
  inputWrapper.style.top = `${top}px`;
}

/** Rebuild the query JSON and show it */
export function updateQueryJson(){
  // Filter out duplicate field names (2nd, 3rd, etc.) and get only base field names
  const baseFields = [...queryState.displayedFields]
    .filter(field => field !== 'Marc')
    .map(field => {
      return getBaseFieldName(field);
    })
    .filter((field, index, array) => {
      // Remove duplicates (keep only first occurrence of each base field name)
      return array.indexOf(field) === index;
    });
  
  const query = {
    DesiredColumnOrder: baseFields,
    FilterGroups: [],
    GroupMethod: "ExpandIntoColumns" // Default value
  };
  
  // Update run button icon based on query changes
  updateRunButtonIcon();

  // If we have a loaded SimpleTable instance, extract configuration from it
  if (typeof window.VirtualTable !== 'undefined' && window.VirtualTable.simpleTableInstance) {
    const simpleTable = window.VirtualTable.simpleTableInstance;
    
    // Extract GroupMethod from SimpleTable
    if (simpleTable.groupMethod !== undefined) {
      // Convert JavaScript string enum to C# enum string
      switch (simpleTable.groupMethod) {
        case 'None': // GroupMethod.NONE
          query.GroupMethod = "None";
          break;
        case 'Commas': // GroupMethod.COMMAS
          query.GroupMethod = "Commas";
          break;
        case 'ExpandIntoColumns': // GroupMethod.EXPAND_INTO_COLUMNS
          query.GroupMethod = "ExpandIntoColumns";
          break;
        default:
          query.GroupMethod = "ExpandIntoColumns";
      }
    }
    
    // Extract GroupByField from SimpleTable
    if (simpleTable.groupByField) {
      query.GroupByField = simpleTable.groupByField;
    }
    
    // Extract AllowDuplicateFields from SimpleTable
    if (simpleTable.allowDuplicateFields && simpleTable.allowDuplicateFields.size > 0) {
      query.AllowDuplicateFields = Array.from(simpleTable.allowDuplicateFields);
    }
    
    // Extract FilterGroups from SimpleTable (if any were configured in the JSON)
    if (simpleTable.filterGroups && simpleTable.filterGroups.length > 0) {
      const simpleTableFilterGroups = simpleTable.filterGroups.map(group => ({
        LogicalOperator: group.logicalOperator || "And",
        Filters: group.filters.map(filter => ({
          FieldName: filter.fieldName,
          FieldOperator: filter.fieldOperator,
          Values: filter.values
        }))
      }));
      
      // Merge with any active UI filters
      query.FilterGroups = [...simpleTableFilterGroups];
    }
  }

  // Add UI active filters
  Object.entries(queryState.activeFilters).forEach(([field, data]) => {
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
  if (typeof window.getAllFieldDefs === 'function') {
    const customMarcFields = window.getAllFieldDefs()
      .filter(f => /^Marc\d+$/.test(f.name))
      .map(f => ({
        FieldName: f.name,
        Tool: "prtentry",
        OutputFlag: "e",
        FilterFlag: "e",
        RawOutputSegments: 1,
        DataType: "string",
        RequiredEqualFilter: f.name.replace(/^Marc/, "")
      }));
    if (customMarcFields.length > 0) {
      query.CustomFields = customMarcFields;
    }
  }
  
  // Update the textarea
  DOM.queryBox.value = JSON.stringify(query, null, 2);
  updateButtonStates();
}

// Global exposure for transition
window.DOM = DOM;
window.updateRunButtonIcon = updateRunButtonIcon;
window.updateButtonStates = updateButtonStates;
window.toggleQueryInterface = toggleQueryInterface;
window.positionInputWrapper = positionInputWrapper;
window.updateQueryJson = updateQueryJson;

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
};

// Add this helper function to show error messages with consistent styling and timeout
window.showError = function(message, inputElements = [], duration = 3000) {
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
