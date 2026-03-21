/**
 * Query State Management
 * Handles application state variables and query state logic.
 * @module QueryState
 */

function getServices() {
  return window.AppServices || null;
}

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

  const rawColumnMap = getServices()?.table?.rawTableData?.columnMap;
  if (rawColumnMap instanceof Map && rawColumnMap.has(baseCandidate)) {
    return baseCandidate;
  }

  return withoutOrdinalPrefix;
};

const appRuntimeState = {
  selectedField: '',
  totalRows: 0,
  scrollRow: 0,
  rowHeight: 0,
  hoverScrollArea: false,
  currentCategory: 'All',
  queryPageIsUnloading: false
};

const appStateNormalizers = {
  selectedField: value => String(value || ''),
  totalRows: value => Number.isFinite(Number(value)) ? Number(value) : 0,
  scrollRow: value => Number.isFinite(Number(value)) ? Number(value) : 0,
  rowHeight: value => Number.isFinite(Number(value)) ? Number(value) : 0,
  hoverScrollArea: value => Boolean(value),
  currentCategory: value => String(value || 'All') || 'All',
  queryPageIsUnloading: value => Boolean(value)
};

const queryLifecycleState = {
  queryRunning: false,
  lastExecutedQueryState: null,
  currentQueryState: null,
  hasPartialResults: false,
  currentQueryId: null
};

const queryLifecycleNormalizers = {
  queryRunning: value => Boolean(value),
  lastExecutedQueryState: value => value ?? null,
  currentQueryState: value => value ?? null,
  hasPartialResults: value => Boolean(value),
  currentQueryId: value => value ? String(value) : null
};

const blockedGlobalAppStateKeys = new Set([
  'currentQueryState',
  'lastExecutedQueryState'
]);

function defineAppStateProperty(target, key) {
  Object.defineProperty(target, key, {
    configurable: false,
    enumerable: true,
    get() {
      return appRuntimeState[key];
    },
    set(value) {
      const normalize = appStateNormalizers[key];
      appRuntimeState[key] = typeof normalize === 'function' ? normalize(value) : value;
    }
  });
}

function defineBlockedGlobalAppStateProperty(key) {
  Object.defineProperty(window, key, {
    configurable: false,
    enumerable: false,
    get() {
      throw new Error(`Direct access to window.${key} is blocked. Use window.AppState.${key} instead.`);
    },
    set() {
      throw new Error(`Direct mutation of window.${key} is blocked. Use window.AppState.${key} instead.`);
    }
  });
}

function defineQueryLifecycleProperty(target, key) {
  Object.defineProperty(target, key, {
    configurable: false,
    enumerable: true,
    get() {
      return queryLifecycleState[key];
    },
    set(value) {
      const normalize = queryLifecycleNormalizers[key];
      queryLifecycleState[key] = typeof normalize === 'function' ? normalize(value) : value;
    }
  });
}

const appStateStore = {};
Object.keys({ ...appRuntimeState, ...queryLifecycleState }).forEach(key => {
  if (Object.prototype.hasOwnProperty.call(appRuntimeState, key)) {
    defineAppStateProperty(appStateStore, key);
  } else {
    defineQueryLifecycleProperty(appStateStore, key);
  }

  if (blockedGlobalAppStateKeys.has(key)) {
    defineBlockedGlobalAppStateProperty(key);
  } else {
    if (Object.prototype.hasOwnProperty.call(appRuntimeState, key)) {
      defineAppStateProperty(window, key);
    } else {
      defineQueryLifecycleProperty(window, key);
    }
  }
});
Object.freeze(appStateStore);
Object.defineProperty(window, 'AppState', {
  configurable: false,
  enumerable: false,
  writable: false,
  value: appStateStore
});

// Bubble animation state is owned by BubbleSystem (bubble.js).
// Access via window.BubbleSystem.isBubbleAnimating etc.

const displayedFieldsState = [];
const activeFiltersState = {};
const queryStateSubscribers = new Set();
const legacyReadWarnings = new Set();

function warnReadOnlyQueryStateMutation(path) {
  console.warn(`Direct query state mutation blocked for ${path}. Use window.QueryChangeManager instead.`);
}

function warnLegacyQueryStateRead(path) {
  if (legacyReadWarnings.has(path)) {
    return;
  }

  legacyReadWarnings.add(path);
  console.warn(`Direct query state read via ${path} is deprecated. Use window.QueryChangeManager read methods instead.`);
}

function throwLegacyQueryStateRead(path) {
  warnLegacyQueryStateRead(path);
  throw new Error(`Direct query state read via ${path} is blocked. Use window.QueryChangeManager read methods instead.`);
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

function cloneDisplayedFieldsSnapshot() {
  return displayedFieldsState.slice();
}

function cloneFieldFiltersSnapshot(fieldName) {
  const normalizedField = String(fieldName || '').trim();
  if (!normalizedField || !activeFiltersState[normalizedField]) {
    return { filters: [] };
  }

  return {
    filters: Array.isArray(activeFiltersState[normalizedField].filters)
      ? activeFiltersState[normalizedField].filters.map(cloneFilterEntry)
      : []
  };
}

function normalizeFieldFilters(filters) {
  if (!Array.isArray(filters)) {
    return [];
  }

  const normalizedFilters = filters
    .map(cloneFilterEntry)
    .filter(filter => filter.cond || filter.val);

  if (normalizedFilters.length === 0) {
    return [];
  }

  return [normalizedFilters[normalizedFilters.length - 1]];
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

    const filters = normalizeFieldFilters(data && data.filters);

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
    displayedFields: cloneDisplayedFieldsSnapshot(),
    activeFilters: cloneActiveFiltersSnapshot(),
    groupMethod: getServices()?.getSimpleTable?.()?.groupMethod || 'ExpandIntoColumns'
  };
}

function getQueryLifecycleSnapshot() {
  return {
    queryRunning: queryLifecycleState.queryRunning,
    hasPartialResults: queryLifecycleState.hasPartialResults,
    currentQueryId: queryLifecycleState.currentQueryId,
    currentQueryState: queryLifecycleState.currentQueryState,
    lastExecutedQueryState: queryLifecycleState.lastExecutedQueryState
  };
}

function setQueryLifecycleState(nextState = {}) {
  if (!nextState || typeof nextState !== 'object') {
    return getQueryLifecycleSnapshot();
  }

  Object.entries(nextState).forEach(([key, value]) => {
    if (!Object.prototype.hasOwnProperty.call(queryLifecycleState, key)) {
      return;
    }

    const normalize = queryLifecycleNormalizers[key];
    queryLifecycleState[key] = typeof normalize === 'function' ? normalize(value) : value;
  });

  return getQueryLifecycleSnapshot();
}

function getQueryStatus(snapshot = getQueryStateSnapshot()) {
  if (queryLifecycleState.queryRunning) {
    return 'running';
  }

  const tableRows = getServices()?.getVirtualTableData?.()?.rows;
  const rowCount = Array.isArray(tableRows) ? tableRows.length : 0;
  const hasFilters = Object.values(snapshot?.activeFilters || {}).some(data => Array.isArray(data?.filters) && data.filters.length > 0);
  const hasConfiguredQuery = (snapshot?.displayedFields?.length || 0) > 0 || hasFilters;

  if (queryLifecycleState.hasPartialResults && rowCount > 0) {
    return 'partial';
  }

  if (rowCount > 0) {
    return 'results';
  }

  if (hasConfiguredQuery) {
    return 'planning';
  }

  return 'idle';
}

function getSerializableQueryState(snapshot = getQueryStateSnapshot()) {
  const displayedFields = Array.isArray(snapshot?.displayedFields) ? snapshot.displayedFields : [];
  const activeFilters = snapshot?.activeFilters && typeof snapshot.activeFilters === 'object'
    ? snapshot.activeFilters
    : {};

  const baseFields = [...displayedFields]
    .filter(field => {
      const def = window.fieldDefs ? window.fieldDefs.get(field) : null;
      return !(def && def.is_buildable);
    })
    .map(field => window.getBaseFieldName(field))
    .filter((field, index, array) => array.indexOf(field) === index);

  return {
    displayedFields: baseFields,
    activeFilters: Object.fromEntries(
      Object.entries(activeFilters).map(([field, data]) => [
        field,
        { filters: JSON.parse(JSON.stringify((data && data.filters) || [])) }
      ])
    ),
    groupMethod: snapshot?.groupMethod || 'ExpandIntoColumns'
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
    'QueryChangeManager.clearQuery',
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

  setQueryLifecycleState({ currentQueryState: payload.snapshot });

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
  getLifecycleState() {
    return getQueryLifecycleSnapshot();
  },
  getQueryStatus() {
    return getQueryStatus();
  },
  getSerializableState() {
    return getSerializableQueryState();
  },
  getDisplayedFields() {
    return cloneDisplayedFieldsSnapshot();
  },
  getActiveFilters() {
    return cloneActiveFiltersSnapshot();
  },
  getFilterGroupForField(fieldName) {
    return cloneFieldFiltersSnapshot(fieldName);
  },
  hasDisplayedField(fieldName) {
    const normalizedField = String(fieldName || '').trim();
    return Boolean(normalizedField) && displayedFieldsState.includes(normalizedField);
  },
  hasFiltersForField(fieldName) {
    const normalizedField = String(fieldName || '').trim();
    return Boolean(normalizedField && activeFiltersState[normalizedField] && Array.isArray(activeFiltersState[normalizedField].filters) && activeFiltersState[normalizedField].filters.length > 0);
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
    const existingFilter = filters[filters.length - 1] || null;
    const matchesExisting = Boolean(
      existingFilter &&
      existingFilter.cond === normalizedFilter.cond &&
      existingFilter.val === normalizedFilter.val
    );

    if (options.dedupe && matchesExisting) {
      return false;
    }

    activeFiltersState[normalizedField].filters = [normalizedFilter];

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
  // Low-level state-only reset. This should not perform any UI cleanup.
  resetState(meta = {}) {
    assignDisplayedFields([]);
    assignActiveFilters({});
    notifyQueryStateSubscribers({ displayedFields: true, activeFilters: true }, meta);
  },
  setLifecycleState(nextState = {}) {
    return setQueryLifecycleState(nextState);
  }
};

function normalizeManagerMeta(meta = {}, fallbackSource) {
  return {
    ...meta,
    source: meta && meta.source ? meta.source : fallbackSource
  };
}

const queryStateReadMethodNames = Object.freeze([
  'getSnapshot',
  'getLifecycleState',
  'getQueryStatus',
  'getSerializableState',
  'getDisplayedFields',
  'getActiveFilters',
  'getFilterGroupForField',
  'hasDisplayedField',
  'hasFiltersForField',
  'subscribe'
]);

function createManagerStoreMethod(storeMethodName, requiredArgCount, fallbackSource) {
  return function queryManagerStoreMethod(...args) {
    if (args.length <= requiredArgCount) {
      args.push(normalizeManagerMeta({}, fallbackSource));
    } else {
      args[requiredArgCount] = normalizeManagerMeta(args[requiredArgCount], fallbackSource);
    }
    return queryStateStore[storeMethodName](...args);
  };
}

function showManagedField(fieldName, options = {}) {
  const normalizedField = String(fieldName || '').trim();
  if (!normalizedField) {
    return false;
  }

  const columnOps = window.DragDropColumnOps;
  if (columnOps && typeof columnOps.addColumn === 'function') {
    return columnOps.addColumn(normalizedField, options.insertAt);
  }

  return queryStateStore.addDisplayedField(normalizedField, normalizeManagerMeta(options, 'QueryChangeManager.showField'));
}

function hideManagedField(fieldName, options = {}) {
  const normalizedField = String(fieldName || '').trim();
  if (!normalizedField) {
    return false;
  }

  const columnOps = window.DragDropColumnOps;
  if (columnOps && typeof columnOps.removeColumnByName === 'function') {
    return columnOps.removeColumnByName(normalizedField);
  }

  return queryStateStore.removeDisplayedField(normalizedField, normalizeManagerMeta(options, 'QueryChangeManager.hideField'));
}

// App-level clear that resets query state plus all dependent UI surfaces.
async function clearQueryManagerState(meta = {}) {
  const normalizedMeta = normalizeManagerMeta(meta, 'QueryChangeManager.clearQuery');

  if (queryLifecycleState.queryRunning) {
    if (typeof window.showToastMessage === 'function') {
      window.showToastMessage('Stop the running query before clearing it.', 'warning');
    }
    return false;
  }

  const previousSelectedField = appStateStore.selectedField || '';

  services.modal?.closeAllPanels?.();
  services.clearInsertAffordance({ immediate: true });
  services.resetActiveBubbles();
  services.resetBubbleEditorUi({
    clearPanelContent: true,
    clearConditionListSelection: !previousSelectedField
  });

  if (window.PostFilterSystem && typeof window.PostFilterSystem.close === 'function') {
    window.PostFilterSystem.close();
  }
  if (services.table?.clearPostFilters) {
    services.clearPostFilters({ refreshView: false, notify: true, resetScroll: false });
  }

  if (services.isSplitColumnsActive()) {
    services.setSplitColumnsMode(false);
  }
  if (typeof window.resetSplitColumnsToggleUI === 'function') {
    window.resetSplitColumnsToggleUI();
  }

  // State reset fires all QueryStateSubscriptions, which reactively
  // update FilterSidePanel, category counts, JSON preview, button states, and bubbles.
  queryStateStore.resetState(normalizedMeta);
  queryStateStore.setLifecycleState({
    hasPartialResults: false,
    currentQueryId: null,
    lastExecutedQueryState: null
  });

  if (previousSelectedField && typeof window.renderConditionList === 'function') {
    window.renderConditionList(previousSelectedField);
  } else {
    document.getElementById('bubble-cond-list')?.replaceChildren();
  }

  appStateStore.selectedField = '';

  const dom = window.DOM;
  if (dom?.tableNameInput) {
    dom.tableNameInput.value = '';
    dom.tableNameInput.classList.remove('error');
    dom.tableNameInput.dispatchEvent(new Event('input', { bubbles: true }));
  }

  if (dom?.queryInput) {
    dom.queryInput.value = '';
    dom.queryInput.dispatchEvent(new Event('input', { bubbles: true }));
  }
  if (dom?.clearSearchBtn) {
    dom.clearSearchBtn.classList.add('hidden');
  }

  appStateStore.currentCategory = 'All';

  services.resetBubbleScroll();

  if (typeof window.updateButtonStates === 'function') {
    window.updateButtonStates();
  }

  if (typeof window.showToastMessage === 'function') {
    window.showToastMessage('Query cleared.', 'info');
  }

  return true;
}

const queryChangeManager = Object.freeze({
  ...Object.fromEntries(
    queryStateReadMethodNames.map(methodName => [methodName, queryStateStore[methodName]])
  ),
  replaceDisplayedFields: createManagerStoreMethod('replaceDisplayedFields', 1, 'QueryChangeManager.replaceDisplayedFields'),
  addDisplayedField: createManagerStoreMethod('addDisplayedField', 1, 'QueryChangeManager.addDisplayedField'),
  removeDisplayedField: createManagerStoreMethod('removeDisplayedField', 1, 'QueryChangeManager.removeDisplayedField'),
  moveDisplayedField: createManagerStoreMethod('moveDisplayedField', 2, 'QueryChangeManager.moveDisplayedField'),
  replaceActiveFilters: createManagerStoreMethod('replaceActiveFilters', 1, 'QueryChangeManager.replaceActiveFilters'),
  upsertFilter: createManagerStoreMethod('upsertFilter', 2, 'QueryChangeManager.upsertFilter'),
  removeFilter: createManagerStoreMethod('removeFilter', 1, 'QueryChangeManager.removeFilter'),
  reorderFilterGroups: createManagerStoreMethod('reorderFilterGroups', 1, 'QueryChangeManager.reorderFilterGroups'),
  setQueryState: createManagerStoreMethod('setQueryState', 1, 'QueryChangeManager.setQueryState'),
  setLifecycleState(nextState = {}, meta = {}) {
    const normalizedMeta = normalizeManagerMeta(meta, 'QueryChangeManager.setLifecycleState');
    const lifecycleState = queryStateStore.setLifecycleState(nextState);
    if (!normalizedMeta.silent) {
      notifyQueryStateSubscribers({}, normalizedMeta);
    }
    return lifecycleState;
  },
  showField: showManagedField,
  hideField: hideManagedField,
  resetQuery(meta = {}) {
    return queryStateStore.resetState(normalizeManagerMeta(meta, 'QueryChangeManager.resetQuery'));
  },
  clearQuery(meta = {}) {
    return clearQueryManagerState(meta);
  }
});

const queryStateReaders = Object.freeze({
  ...Object.fromEntries(
    queryStateReadMethodNames
      .filter(methodName => methodName !== 'subscribe')
      .map(methodName => [methodName, queryChangeManager[methodName]])
  )
});
Object.defineProperty(window, 'QueryChangeManager', {
  configurable: false,
  enumerable: false,
  writable: false,
  value: queryChangeManager
});

Object.defineProperty(window, 'QueryStateReaders', {
  configurable: false,
  enumerable: false,
  writable: false,
  value: queryStateReaders
});

Object.defineProperty(window, 'QueryStateStore', {
  configurable: false,
  enumerable: false,
  get() {
    throw new Error('window.QueryStateStore is private. Use window.QueryChangeManager or window.QueryStateReaders instead.');
  },
  set() {
    throw new Error('window.QueryStateStore is private. Use window.QueryChangeManager or window.QueryStateReaders instead.');
  }
});

Object.defineProperty(window, 'displayedFields', {
  configurable: false,
  get() {
    throwLegacyQueryStateRead('window.displayedFields');
  },
  set() {
    warnReadOnlyQueryStateMutation('window.displayedFields');
  }
});

Object.defineProperty(window, 'activeFilters', {
  configurable: false,
  get() {
    throwLegacyQueryStateRead('window.activeFilters');
  },
  set() {
    warnReadOnlyQueryStateMutation('window.activeFilters');
  }
});

Object.defineProperty(window, 'getCurrentQueryState', {
  configurable: false,
  enumerable: false,
  writable: false,
  value: function legacyGetCurrentQueryState() {
    throwLegacyQueryStateRead('window.getCurrentQueryState');
  }
});

window.QueryChangeManager.subscribe(event => {
  if (!event) {
    return;
  }

  // updateQueryJson and updateButtonStates are now handled via QueryStateSubscriptions
  // in their own modules (jsonViewerUI.js, queryUI.js) — no need to call them here.

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
  if (!queryLifecycleState.lastExecutedQueryState) return true; // Initial load should show play icon (brand new query)
  
  const current = queryStateReaders.getSerializableState();
  
  // Compare displayed fields
  if (JSON.stringify(getComparableDisplayedFields(current.displayedFields)) !== JSON.stringify(getComparableDisplayedFields(queryLifecycleState.lastExecutedQueryState.displayedFields))) {
    return true;
  }
  
  // Compare filters
  if (JSON.stringify(current.activeFilters) !== JSON.stringify(queryLifecycleState.lastExecutedQueryState.activeFilters)) {
    return true;
  }
  
  // Compare group method
  if (current.groupMethod !== queryLifecycleState.lastExecutedQueryState.groupMethod) {
    return true;
  }
  
  return false;
};
