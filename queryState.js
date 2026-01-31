/**
 * Query State Management
 * Handles application state variables and query state logic.
 * @module QueryState
 */

// Utility Functions - Available globally
window.getBaseFieldName = function(fieldName) {
  // Remove ordinal prefixes like "2nd ", "3rd ", etc.
  return fieldName.replace(/^\d+(st|nd|rd|th)\s+/, '');
};

// State variables
window.queryRunning = false;
window.displayedFields = []; // Will be populated from test data
window.selectedField = '';
window.totalRows = 0;          // total rows in #bubble-list
window.scrollRow = 0;          // current top row (0-based)
window.rowHeight = 0;          // computed once per render
window.hoverScrollArea = false;  // true when cursor over bubbles or scrollbar
window.currentCategory = 'All';

// Query state tracking for run button icon
window.lastExecutedQueryState = null; // Store the state when query was last run
window.currentQueryState = null;       // Current state for comparison

// Data structures
window.activeFilters = {};   // { fieldName: { logical:'And'|'Or', filters:[{cond,val},…] } }

// Global set to track which bubbles are animating back
window.animatingBackBubbles = new Set();
window.isBubbleAnimating = false;
window.isBubbleAnimatingBack = false;
window.pendingRenderBubbles = false;

/**
 * Function to capture current query state
 * @returns {Object} snapshot of current query configuration
 */
window.getCurrentQueryState = function() {
  // Use base field names only (no duplicates like "2nd Marc590")
  const baseFields = [...window.displayedFields]
    .filter(field => field !== 'Marc')
    .map(field => {
      return window.getBaseFieldName(field);
    })
    .filter((field, index, array) => {
      // Remove duplicates (keep only first occurrence of each base field name)
      return array.indexOf(field) === index;
    });
  
  return {
    displayedFields: baseFields,
    activeFilters: JSON.parse(JSON.stringify(window.activeFilters)),
    groupMethod: window.VirtualTable?.simpleTableInstance?.groupMethod || "ExpandIntoColumns"
  };
};

/**
 * Compares current query state with last executed state to detect changes.
 * Used to determine if the query has been modified since last execution.
 * @function hasQueryChanged
 * @returns {boolean} True if query has changed since last execution
 */
window.hasQueryChanged = function() {
  if (!window.lastExecutedQueryState) return false; // Initial load should show refresh (we have testJobData loaded)
  
  const current = window.getCurrentQueryState();
  
  // Compare displayed fields
  if (JSON.stringify(current.displayedFields.sort()) !== JSON.stringify(window.lastExecutedQueryState.displayedFields.sort())) {
    return true;
  }
  
  // Compare filters
  if (JSON.stringify(current.activeFilters) !== JSON.stringify(window.lastExecutedQueryState.activeFilters)) {
    return true;
  }
  
  // Compare group method
  if (current.groupMethod !== window.lastExecutedQueryState.groupMethod) {
    return true;
  }
  
  return false;
};
