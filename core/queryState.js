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
window.selectedField = '';
window.totalRows = 0;          // total rows in #bubble-list
window.scrollRow = 0;          // current top row (0-based)
window.rowHeight = 0;          // computed once per render
window.hoverScrollArea = false;  // true when cursor over bubbles or scrollbar
window.currentCategory = 'All';

// Query state tracking for run button icon
window.lastExecutedQueryState = null; // Store the state when query was last run
window.currentQueryState = null;       // Current state for comparison

// Global set to track which bubbles are animating back
window.animatingBackBubbles = new Set();
window.isBubbleAnimating = false;
window.isBubbleAnimatingBack = false;
window.pendingRenderBubbles = false;

const displayedFieldsState = [];
const activeFiltersState = {};
const queryStateSubscribers = new Set();

function cloneFilterEntry(filter) {
  if (!filter || typeof filter !== 'object') {
    return { cond: '', val: '' };
  }

  return {
    cond: String(filter.cond || ''),
    val: String(filter.val || '')
  };
}

function cloneActiveFiltersSnapshot() {
  return Object.fromEntries(
    Object.entries(activeFiltersState).map(([field, data]) => [
      field,
      {
        filters: Array.isArray(data && data.filters)
          ? data.filters.map(cloneFilterEntry)
          : []
      }
    ])
  );
}

function assignDisplayedFields(nextFields) {
  displayedFieldsState.length = 0;
  if (!Array.isArray(nextFields)) {
    return;
  }

  nextFields
    .map(field => String(field || '').trim())
    .filter(Boolean)
    .forEach(field => displayedFieldsState.push(field));
}

function assignActiveFilters(nextFilters) {
  Object.keys(activeFiltersState).forEach(key => delete activeFiltersState[key]);

  if (!nextFilters || typeof nextFilters !== 'object') {
    return;
  }

  Object.entries(nextFilters).forEach(([field, data]) => {
    const normalizedField = String(field || '').trim();
    if (!normalizedField) {
      return;
    }

    const filters = Array.isArray(data && data.filters)
      ? data.filters.map(cloneFilterEntry).filter(filter => filter.cond || filter.val)
      : [];

    activeFiltersState[normalizedField] = { filters };
  });
}

function getQueryStateSnapshot() {
  return {
    displayedFields: displayedFieldsState.slice(),
    activeFilters: cloneActiveFiltersSnapshot(),
    groupMethod: window.VirtualTable?.simpleTableInstance?.groupMethod || 'ExpandIntoColumns'
  };
}

function notifyQueryStateSubscribers(changes = {}, meta = {}) {
  const payload = {
    changes: {
      displayedFields: Boolean(changes.displayedFields),
      activeFilters: Boolean(changes.activeFilters)
    },
    meta,
    snapshot: getQueryStateSnapshot()
  };

  queryStateSubscribers.forEach(listener => {
    try {
      listener(payload);
    } catch (error) {
      console.error('Query state subscriber failed:', error);
    }
  });
}

window.QueryStateStore = {
  getSnapshot() {
    return getQueryStateSnapshot();
  },
  subscribe(listener) {
    if (typeof listener !== 'function') {
      return () => {};
    }

    queryStateSubscribers.add(listener);
    return () => {
      queryStateSubscribers.delete(listener);
    };
  },
  notify(changes = {}, meta = {}) {
    notifyQueryStateSubscribers(changes, meta);
  },
  replaceDisplayedFields(nextFields, meta = {}) {
    assignDisplayedFields(nextFields);
    notifyQueryStateSubscribers({ displayedFields: true }, meta);
  },
  mutateDisplayedFields(mutator, meta = {}) {
    if (typeof mutator === 'function') {
      mutator(displayedFieldsState);
    }

    notifyQueryStateSubscribers({ displayedFields: true }, meta);
  },
  replaceActiveFilters(nextFilters, meta = {}) {
    assignActiveFilters(nextFilters);
    notifyQueryStateSubscribers({ activeFilters: true }, meta);
  },
  mutateActiveFilters(mutator, meta = {}) {
    if (typeof mutator === 'function') {
      mutator(activeFiltersState);
    }

    notifyQueryStateSubscribers({ activeFilters: true }, meta);
  },
  batchUpdate(mutator, changes = {}, meta = {}) {
    if (typeof mutator === 'function') {
      mutator({
        displayedFields: displayedFieldsState,
        activeFilters: activeFiltersState
      });
    }

    notifyQueryStateSubscribers(changes, meta);
  },
  reset(meta = {}) {
    assignDisplayedFields([]);
    assignActiveFilters({});
    notifyQueryStateSubscribers({ displayedFields: true, activeFilters: true }, meta);
  }
};

window.notifyQueryStateChange = function(changes = {}, meta = {}) {
  window.QueryStateStore.notify(changes, meta);
};

Object.defineProperty(window, 'displayedFields', {
  configurable: true,
  get() {
    return displayedFieldsState;
  },
  set(nextFields) {
    assignDisplayedFields(nextFields);
    notifyQueryStateSubscribers({ displayedFields: true }, { source: 'window.displayedFields setter' });
  }
});

Object.defineProperty(window, 'activeFilters', {
  configurable: true,
  get() {
    return activeFiltersState;
  },
  set(nextFilters) {
    assignActiveFilters(nextFilters);
    notifyQueryStateSubscribers({ activeFilters: true }, { source: 'window.activeFilters setter' });
  }
});

/**
 * Function to capture current query state
 * @returns {Object} snapshot of current query configuration
 */
window.getCurrentQueryState = function() {
  // Use base field names only (no duplicates like "2nd Marc590")
  const baseFields = [...window.displayedFields]
    .filter(field => {
      const def = window.fieldDefs ? window.fieldDefs.get(field) : null;
      return !(def && def.is_buildable);
    })
    .map(field => {
      return window.getBaseFieldName(field);
    })
    .filter((field, index, array) => {
      // Remove duplicates (keep only first occurrence of each base field name)
      return array.indexOf(field) === index;
    });
  
  return {
    displayedFields: baseFields,
    activeFilters: Object.fromEntries(
      Object.entries(window.activeFilters || {}).map(([field, data]) => [
        field,
        { filters: JSON.parse(JSON.stringify((data && data.filters) || [])) }
      ])
    ),
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
  if (!window.lastExecutedQueryState) return true; // Initial load should show play icon (brand new query)
  
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
