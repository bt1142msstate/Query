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

function normalizeFieldList(fieldNames) {
  const values = Array.isArray(fieldNames) ? fieldNames : [fieldNames];
  return values.map(field => String(field || '').trim()).filter(Boolean);
}

function normalizeFilterInput(filter) {
  const normalized = cloneFilterEntry(filter);
  if (!normalized.cond && !normalized.val) {
    return null;
  }
  return normalized;
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
  replaceDisplayedFields(nextFields, meta = {}) {
    assignDisplayedFields(nextFields);
    notifyQueryStateSubscribers({ displayedFields: true }, meta);
  },
  addDisplayedField(fieldNames, options = {}) {
    const normalizedFields = normalizeFieldList(fieldNames);
    if (normalizedFields.length === 0) return false;

    const insertAt = Number.isInteger(options.insertAt) ? options.insertAt : -1;
    normalizedFields.forEach((fieldName, index) => {
      if (insertAt >= 0 && insertAt <= displayedFieldsState.length) {
        displayedFieldsState.splice(insertAt + index, 0, fieldName);
      } else {
        displayedFieldsState.push(fieldName);
      }
    });

    notifyQueryStateSubscribers({ displayedFields: true }, { source: options.source || 'QueryStateStore.addDisplayedField' });
    return true;
  },
  removeDisplayedField(fieldNames, options = {}) {
    const normalizedFields = new Set(normalizeFieldList(fieldNames));
    if (normalizedFields.size === 0) return false;

    const removeAll = options.all !== false;
    let removed = false;

    if (removeAll) {
      for (let index = displayedFieldsState.length - 1; index >= 0; index -= 1) {
        if (normalizedFields.has(displayedFieldsState[index])) {
          displayedFieldsState.splice(index, 1);
          removed = true;
        }
      }
    } else {
      for (let index = 0; index < displayedFieldsState.length; index += 1) {
        if (normalizedFields.has(displayedFieldsState[index])) {
          displayedFieldsState.splice(index, 1);
          removed = true;
          break;
        }
      }
    }

    if (removed) {
      notifyQueryStateSubscribers({ displayedFields: true }, { source: options.source || 'QueryStateStore.removeDisplayedField' });
    }

    return removed;
  },
  moveDisplayedField(fromIndex, toIndex, options = {}) {
    if (!Number.isInteger(fromIndex) || !Number.isInteger(toIndex) || fromIndex === toIndex) {
      return false;
    }

    const count = Math.max(1, Number.isInteger(options.count) ? options.count : 1);
    if (fromIndex < 0 || fromIndex >= displayedFieldsState.length) {
      return false;
    }

    const safeCount = Math.min(count, displayedFieldsState.length - fromIndex);
    const movedFields = displayedFieldsState.splice(fromIndex, safeCount);
    if (movedFields.length === 0) {
      return false;
    }

    let insertAt = toIndex;
    if (options.behavior === 'group') {
      for (let offset = 0; offset < safeCount; offset += 1) {
        if (fromIndex + offset < toIndex) {
          insertAt -= 1;
        }
      }
    }

    insertAt = Math.max(0, Math.min(insertAt, displayedFieldsState.length));
    displayedFieldsState.splice(insertAt, 0, ...movedFields);

    notifyQueryStateSubscribers({ displayedFields: true }, { source: options.source || 'QueryStateStore.moveDisplayedField' });
    return true;
  },
  replaceActiveFilters(nextFilters, meta = {}) {
    assignActiveFilters(nextFilters);
    notifyQueryStateSubscribers({ activeFilters: true }, meta);
  },
  upsertFilter(fieldName, filter, options = {}) {
    const normalizedField = String(fieldName || '').trim();
    const normalizedFilter = normalizeFilterInput(filter);
    if (!normalizedField || !normalizedFilter) {
      return false;
    }

    if (!activeFiltersState[normalizedField]) {
      activeFiltersState[normalizedField] = { filters: [] };
    }

    const filters = activeFiltersState[normalizedField].filters;
    const existingIndex = filters.findIndex(existingFilter => existingFilter.cond === normalizedFilter.cond && existingFilter.val === normalizedFilter.val);
    if (options.dedupe && existingIndex !== -1) {
      return false;
    }

    if (options.replaceByCond) {
      const replaceIndex = filters.findIndex(existingFilter => existingFilter.cond === normalizedFilter.cond);
      if (replaceIndex !== -1) {
        filters[replaceIndex] = normalizedFilter;
      } else {
        filters.push(normalizedFilter);
      }
    } else {
      filters.push(normalizedFilter);
    }

    notifyQueryStateSubscribers({ activeFilters: true }, { source: options.source || 'QueryStateStore.upsertFilter' });
    return true;
  },
  removeFilter(fieldName, options = {}) {
    const normalizedField = String(fieldName || '').trim();
    if (!normalizedField || !activeFiltersState[normalizedField]) {
      return false;
    }

    if (options.removeAll) {
      delete activeFiltersState[normalizedField];
      notifyQueryStateSubscribers({ activeFilters: true }, { source: options.source || 'QueryStateStore.removeFilter' });
      return true;
    }

    const filters = activeFiltersState[normalizedField].filters;
    let removed = false;

    if (Number.isInteger(options.index) && options.index >= 0 && options.index < filters.length) {
      filters.splice(options.index, 1);
      removed = true;
    } else {
      const targetCond = options.cond === undefined ? null : String(options.cond || '');
      const targetVal = options.val === undefined ? null : String(options.val || '');
      const removeIndex = filters.findIndex(filter => {
        if (targetCond !== null && filter.cond !== targetCond) return false;
        if (targetVal !== null && filter.val !== targetVal) return false;
        return true;
      });
      if (removeIndex !== -1) {
        filters.splice(removeIndex, 1);
        removed = true;
      }
    }

    if (!removed) {
      return false;
    }

    if (filters.length === 0) {
      delete activeFiltersState[normalizedField];
    }

    notifyQueryStateSubscribers({ activeFilters: true }, { source: options.source || 'QueryStateStore.removeFilter' });
    return true;
  },
  reorderFilterGroups(fieldOrder, options = {}) {
    const normalizedOrder = normalizeFieldList(fieldOrder);
    if (normalizedOrder.length === 0) {
      return false;
    }

    const nextFilters = {};
    normalizedOrder.forEach(fieldName => {
      if (activeFiltersState[fieldName]) {
        nextFilters[fieldName] = activeFiltersState[fieldName];
      }
    });

    Object.keys(activeFiltersState).forEach(fieldName => {
      if (!nextFilters[fieldName]) {
        nextFilters[fieldName] = activeFiltersState[fieldName];
      }
    });

    assignActiveFilters(nextFilters);
    notifyQueryStateSubscribers({ activeFilters: true }, { source: options.source || 'QueryStateStore.reorderFilterGroups' });
    return true;
  },
  setQueryState(nextState = {}, meta = {}) {
    if (nextState.displayedFields !== undefined) {
      assignDisplayedFields(nextState.displayedFields);
    }
    if (nextState.activeFilters !== undefined) {
      assignActiveFilters(nextState.activeFilters);
    }

    notifyQueryStateSubscribers({
      displayedFields: nextState.displayedFields !== undefined,
      activeFilters: nextState.activeFilters !== undefined
    }, meta);
  },
  resetQuery(meta = {}) {
    assignDisplayedFields([]);
    assignActiveFilters({});
    notifyQueryStateSubscribers({ displayedFields: true, activeFilters: true }, meta);
  }
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
