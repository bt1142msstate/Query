/**
 * Query State Management
 * Handles application state variables and query state logic.
 * @module QueryState
 */

// Export the state object as a singleton source of truth
export const queryState = {
  queryRunning: false,
  displayedFields: [], // Will be populated from test data
  selectedField: '',
  totalRows: 0,          // total rows in #bubble-list
  scrollRow: 0,          // current top row (0-based)
  rowHeight: 0,          // computed once per render
  hoverScrollArea: false,  // true when cursor over bubbles or scrollbar
  currentCategory: 'All',
  
  // Query state tracking for run button icon
  lastExecutedQueryState: null, // Store the state when query was last run
  currentQueryState: null,       // Current state for comparison
  
  // Data structures
  activeFilters: {},   // { fieldName: { logical:'And'|'Or', filters:[{cond,val},…] } }
  
  // Animation state
  animatingBackBubbles: new Set(),
  isBubbleAnimating: false,
  isBubbleAnimatingBack: false,
  pendingRenderBubbles: false
};

/**
 * Utility Function: Get base field name
 * Removes ordinal prefixes like "2nd ", "3rd ", etc.
 */
export function getBaseFieldName(fieldName) {
  return fieldName.replace(/^\d+(st|nd|rd|th)\s+/, '');
}

/**
 * Function to capture current query state
 * @returns {Object} snapshot of current query configuration
 */
export function getCurrentQueryState() {
  // Use base field names only (no duplicates like "2nd Marc590")
  const baseFields = [...queryState.displayedFields]
    .filter(field => field !== 'Marc')
    .map(field => {
      return getBaseFieldName(field);
    })
    .filter((field, index, array) => {
      // Remove duplicates (keep only first occurrence of each base field name)
      return array.indexOf(field) === index;
    });
  
  // Note: VirtualTable access will need to be passed in or imported, 
  // but for now we'll access the global if needed or refactor later.
  // Ideally this function shouldn't depend on UI instances.
  // We'll rely on the caller to handle the groupMethod part if it's external.
  
  return {
    displayedFields: baseFields,
    activeFilters: JSON.parse(JSON.stringify(queryState.activeFilters)),
    groupMethod: window.VirtualTable?.simpleTableInstance?.groupMethod || "ExpandIntoColumns"
  };
}

/**
 * Compares current query state with last executed state to detect changes.
 * Used to determine if the query has been modified since last execution.
 * @function hasQueryChanged
 * @returns {boolean} True if query has changed since last execution
 */
export function hasQueryChanged() {
  if (!queryState.lastExecutedQueryState) return false; // Initial load should show refresh (we have testJobData loaded)
  
  const current = getCurrentQueryState();
  
  // Compare displayed fields
  if (JSON.stringify(current.displayedFields.sort()) !== JSON.stringify(queryState.lastExecutedQueryState.displayedFields.sort())) {
    return true;
  }
  
  // Compare filters
  if (JSON.stringify(current.activeFilters) !== JSON.stringify(queryState.lastExecutedQueryState.activeFilters)) {
    return true;
  }
  
  // Compare group method
  if (current.groupMethod !== queryState.lastExecutedQueryState.groupMethod) {
    return true;
  }
  
  return false;
}

// Make accessible globally for debugging if needed, but app should use imports
window.queryState = queryState;

// Backward Compatibility Bridges
// These allow legacy scripts to access state via the old global variables
// while redirecting reads/writes to the centralized queryState object.

Object.defineProperty(window, 'queryRunning', {
  get: () => queryState.queryRunning,
  set: (val) => { queryState.queryRunning = val; }
});

Object.defineProperty(window, 'displayedFields', {
  get: () => queryState.displayedFields,
  set: (val) => { queryState.displayedFields = val; }
});

Object.defineProperty(window, 'activeFilters', {
  get: () => queryState.activeFilters,
  set: (val) => { queryState.activeFilters = val; }
});

Object.defineProperty(window, 'currentCategory', {
  get: () => queryState.currentCategory,
  set: (val) => { queryState.currentCategory = val; }
});

