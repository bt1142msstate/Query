/**
 * Query State Management
 * Handles application state variables and query state logic.
 * @module QueryState
 */

// Utility Functions - Available globally
window.getBaseFieldName = function(fieldName) {
  const normalizedFieldName = String(fieldName || '').trim();
  if (!normalizedFieldName) {
    return '';
  }

  // Remove ordinal prefixes like "2nd ", "3rd ", etc.
  const withoutOrdinalPrefix = normalizedFieldName.replace(/^\d+(st|nd|rd|th)\s+/, '');

  // Split-column mode expands headers as "Field Name 1", "Field Name 2", etc.
  // Collapse those presentation-only suffixes back to the raw field name when the
  // underlying unsplit header is present in the current raw result set.
  const splitMatch = withoutOrdinalPrefix.match(/^(.*)\s+(\d+)$/);
  if (!splitMatch) {
    return withoutOrdinalPrefix;
  }

  const baseCandidate = String(splitMatch[1] || '').trim();
  if (!baseCandidate) {
    return withoutOrdinalPrefix;
  }

  const rawColumnMap = window.VirtualTable?.rawTableData?.columnMap;
  if (rawColumnMap instanceof Map && rawColumnMap.has(baseCandidate)) {
    return baseCandidate;
  }

  return withoutOrdinalPrefix;
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
const readOnlyProxyCache = new WeakMap();

function warnReadOnlyQueryStateMutation(path) {
  console.warn(`Direct query state mutation blocked for ${path}. Use window.QueryChangeManager instead.`);
}

function createReadOnlyQueryStateProxy(target, path) {
  if (!target || typeof target !== 'object') {
    return target;
  }

  const cachedProxy = readOnlyProxyCache.get(target);
  if (cachedProxy) {
    return cachedProxy;
  }

  const proxy = new Proxy(target, {
    get(currentTarget, prop, receiver) {
      const value = Reflect.get(currentTarget, prop, receiver);

      if (typeof prop === 'symbol') {
        return value;
      }

      if (typeof value === 'function') {
        if (Array.isArray(currentTarget) && [
          'copyWithin',
          'fill',
          'pop',
          'push',
          'reverse',
          'shift',
          'sort',
          'splice',
          'unshift'
        ].includes(prop)) {
          return function blockedQueryStateMutation() {
            warnReadOnlyQueryStateMutation(`${path}.${prop}()`);
            return Array.isArray(currentTarget) ? currentTarget.length : undefined;
          };
        }

        return value.bind(currentTarget);
      }

      if (value && typeof value === 'object') {
        return createReadOnlyQueryStateProxy(value, `${path}.${String(prop)}`);
      }

      return value;
    },
    set(_currentTarget, prop) {
      warnReadOnlyQueryStateMutation(`${path}.${String(prop)}`);
      return true;
    },
    deleteProperty(_currentTarget, prop) {
      warnReadOnlyQueryStateMutation(`${path}.${String(prop)}`);
      return true;
    },
    defineProperty(_currentTarget, prop) {
      warnReadOnlyQueryStateMutation(`${path}.${String(prop)}`);
      return true;
    }
  });

  readOnlyProxyCache.set(target, proxy);
  return proxy;
}

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
    .map(field => typeof window.resolveFieldName === 'function' ? window.resolveFieldName(field) : field)
    .filter(Boolean)
    .forEach(field => displayedFieldsState.push(field));
}

function assignActiveFilters(nextFilters) {
  Object.keys(activeFiltersState).forEach(key => delete activeFiltersState[key]);

  if (!nextFilters || typeof nextFilters !== 'object') {
    return;
  }

  Object.entries(nextFilters).forEach(([field, data]) => {
    const normalizedField = typeof window.resolveFieldName === 'function'
      ? window.resolveFieldName(String(field || '').trim())
      : String(field || '').trim();
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
  return values
    .map(field => String(field || '').trim())
    .map(field => typeof window.resolveFieldName === 'function' ? window.resolveFieldName(field) : field)
    .filter(Boolean);
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

function getComparableDisplayedFields(fieldNames) {
  return (Array.isArray(fieldNames) ? fieldNames : [])
    .map(field => String(field || '').trim())
    .filter(Boolean)
    .slice()
    .sort();
}

function shouldSkipQueryChangeToast(meta = {}) {
  if (!meta || meta.toast === false) {
    return true;
  }

  const source = String(meta.source || '');
  if (!source) {
    return false;
  }

  return [
    'Query.initialization',
    'Query.showExampleTable',
    'Query.showExampleTable.empty',
    'Query.clearCurrentQuery',
    'QueryHistory.loadQueryConfig',
    'VirtualTable.setSplitMode',
    'Query.groupMethodChange',
    'window.displayedFields setter',
    'window.activeFilters setter'
  ].includes(source);
}

function getQueryChangeToastMessage(event) {
  const displayedFieldsChanged = Boolean(event?.changes?.displayedFields);
  const activeFiltersChanged = Boolean(event?.changes?.activeFilters);

  if (displayedFieldsChanged && activeFiltersChanged) {
    return 'Query updated.';
  }

  if (displayedFieldsChanged) {
    return 'Columns updated.';
  }

  if (activeFiltersChanged) {
    return 'Filters updated.';
  }

  return 'Query updated.';
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

  window.currentQueryState = payload.snapshot;

  queryStateSubscribers.forEach(listener => {
    try {
      listener(payload);
    } catch (error) {
      console.error('Query state subscriber failed:', error);
    }
  });
}

const queryStateStore = {
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

function normalizeManagerMeta(meta = {}, fallbackSource) {
  return {
    ...meta,
    source: meta && meta.source ? meta.source : fallbackSource
  };
}

const queryChangeManager = {
  getSnapshot() {
    return queryStateStore.getSnapshot();
  },
  subscribe(listener) {
    return queryStateStore.subscribe(listener);
  },
  replaceDisplayedFields(nextFields, meta = {}) {
    return queryStateStore.replaceDisplayedFields(nextFields, normalizeManagerMeta(meta, 'QueryChangeManager.replaceDisplayedFields'));
  },
  addDisplayedField(fieldNames, options = {}) {
    return queryStateStore.addDisplayedField(fieldNames, normalizeManagerMeta(options, 'QueryChangeManager.addDisplayedField'));
  },
  removeDisplayedField(fieldNames, options = {}) {
    return queryStateStore.removeDisplayedField(fieldNames, normalizeManagerMeta(options, 'QueryChangeManager.removeDisplayedField'));
  },
  moveDisplayedField(fromIndex, toIndex, options = {}) {
    return queryStateStore.moveDisplayedField(fromIndex, toIndex, normalizeManagerMeta(options, 'QueryChangeManager.moveDisplayedField'));
  },
  replaceActiveFilters(nextFilters, meta = {}) {
    return queryStateStore.replaceActiveFilters(nextFilters, normalizeManagerMeta(meta, 'QueryChangeManager.replaceActiveFilters'));
  },
  upsertFilter(fieldName, filter, options = {}) {
    return queryStateStore.upsertFilter(fieldName, filter, normalizeManagerMeta(options, 'QueryChangeManager.upsertFilter'));
  },
  removeFilter(fieldName, options = {}) {
    return queryStateStore.removeFilter(fieldName, normalizeManagerMeta(options, 'QueryChangeManager.removeFilter'));
  },
  reorderFilterGroups(fieldOrder, options = {}) {
    return queryStateStore.reorderFilterGroups(fieldOrder, normalizeManagerMeta(options, 'QueryChangeManager.reorderFilterGroups'));
  },
  setQueryState(nextState = {}, meta = {}) {
    return queryStateStore.setQueryState(nextState, normalizeManagerMeta(meta, 'QueryChangeManager.setQueryState'));
  },
  resetQuery(meta = {}) {
    return queryStateStore.resetQuery(normalizeManagerMeta(meta, 'QueryChangeManager.resetQuery'));
  }
};

Object.freeze(queryChangeManager);
Object.defineProperty(window, 'QueryChangeManager', {
  configurable: false,
  enumerable: false,
  writable: false,
  value: queryChangeManager
});

Object.defineProperty(window, 'QueryStateStore', {
  configurable: false,
  enumerable: false,
  get() {
    console.warn('window.QueryStateStore is private. Use window.QueryChangeManager instead.');
    return undefined;
  },
  set() {
    console.warn('window.QueryStateStore is private. Use window.QueryChangeManager instead.');
  }
});

Object.defineProperty(window, 'displayedFields', {
  configurable: true,
  get() {
    return createReadOnlyQueryStateProxy(displayedFieldsState, 'window.displayedFields');
  },
  set() {
    warnReadOnlyQueryStateMutation('window.displayedFields');
  }
});

Object.defineProperty(window, 'activeFilters', {
  configurable: true,
  get() {
    return createReadOnlyQueryStateProxy(activeFiltersState, 'window.activeFilters');
  },
  set() {
    warnReadOnlyQueryStateMutation('window.activeFilters');
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

window.QueryChangeManager.subscribe(event => {
  if (!event) {
    return;
  }

  if (typeof window.updateQueryJson === 'function') {
    window.updateQueryJson();
  } else if (typeof window.updateButtonStates === 'function') {
    window.updateButtonStates();
  }

  if (shouldSkipQueryChangeToast(event.meta)) {
    return;
  }

  if (typeof window.showToastMessage === 'function') {
    window.showToastMessage(getQueryChangeToastMessage(event), 'info', 1400);
  }
});

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
  if (JSON.stringify(getComparableDisplayedFields(current.displayedFields)) !== JSON.stringify(getComparableDisplayedFields(window.lastExecutedQueryState.displayedFields))) {
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
