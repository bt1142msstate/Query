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
  console.warn(`Direct query state read via ${path} is deprecated. Use window.QueryStateReaders instead.`);
}

function throwLegacyQueryStateRead(path) {
  warnLegacyQueryStateRead(path);
  throw new Error(`Direct query state read via ${path} is blocked. Use window.QueryStateReaders instead.`);
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

function normalizeResolvedFieldName(fieldName) {
  const normalizedField = String(fieldName || '').trim();
  if (!normalizedField) {
    return '';
  }

  return typeof window.resolveFieldName === 'function'
    ? window.resolveFieldName(normalizedField)
    : normalizedField;
}

function cloneFieldFiltersSnapshot(fieldName) {
  const normalizedField = normalizeResolvedFieldName(fieldName);
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

  return normalizedFilters;
}

function assignDisplayedFields(nextFields) {
  displayedFieldsState.length = 0;
  if (!Array.isArray(nextFields)) {
    return;
  }

  nextFields
    .map(field => normalizeResolvedFieldName(field))
    .filter(Boolean)
    .forEach(field => displayedFieldsState.push(field));
}

function assignActiveFilters(nextFilters) {
  Object.keys(activeFiltersState).forEach(key => delete activeFiltersState[key]);

  if (!nextFilters || typeof nextFilters !== 'object') {
    return;
  }

  Object.entries(nextFilters).forEach(([field, data]) => {
    const normalizedField = normalizeResolvedFieldName(field);
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
    .map(field => normalizeResolvedFieldName(field))
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

function computeQueryStatus(snapshot = getQueryStateSnapshot()) {
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

  if (source.startsWith('QueryFormMode.') || source.startsWith('SharedFieldPicker.')) {
    return true;
  }

  return [
    'Query.initialization',
    'Query.showExampleTable',
    'Query.showExampleTable.empty',
    'QueryTableView.showExampleTable',
    'QueryTableView.showExampleTable.empty',
    'QueryChangeManager.clearQuery',
    'Query.clearCurrentQuery',
    'QueryHistory.loadQueryConfig',
    'VirtualTable.setSplitMode',
    'Query.groupMethodChange',
    'window.displayedFields setter',
    'window.activeFilters setter'
  ].includes(source);
}

function capitalizeToastMessage(message) {
  const normalized = String(message || '').trim();
  if (!normalized) {
    return 'Query updated.';
  }

  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function truncateToastValue(value, maxLength = 60) {
  const normalized = String(value || '').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function diffItemLists(nextItems, previousItems) {
  const previousCounts = new Map();
  previousItems.forEach(item => {
    previousCounts.set(item, (previousCounts.get(item) || 0) + 1);
  });

  const added = [];
  nextItems.forEach(item => {
    const remaining = previousCounts.get(item) || 0;
    if (remaining > 0) {
      previousCounts.set(item, remaining - 1);
      return;
    }
    added.push(item);
  });

  const nextCounts = new Map();
  nextItems.forEach(item => {
    nextCounts.set(item, (nextCounts.get(item) || 0) + 1);
  });

  const removed = [];
  previousItems.forEach(item => {
    const remaining = nextCounts.get(item) || 0;
    if (remaining > 0) {
      nextCounts.set(item, remaining - 1);
      return;
    }
    removed.push(item);
  });

  return { added, removed };
}

function getDisplayedFieldDiff(previousSnapshot = {}, nextSnapshot = {}) {
  const previousFields = Array.isArray(previousSnapshot.displayedFields) ? previousSnapshot.displayedFields : [];
  const nextFields = Array.isArray(nextSnapshot.displayedFields) ? nextSnapshot.displayedFields : [];
  const { added, removed } = diffItemLists(nextFields, previousFields);
  const orderChanged = added.length === 0
    && removed.length === 0
    && previousFields.length === nextFields.length
    && previousFields.some((field, index) => field !== nextFields[index]);

  return { added, removed, orderChanged };
}

function flattenFilterEntries(snapshot = {}) {
  return Object.entries(snapshot.activeFilters || {}).flatMap(([field, data]) => (
    Array.isArray(data?.filters)
      ? data.filters.map(filter => ({
          field,
          filter,
          key: `${field}::${String(filter?.cond || '')}::${String(filter?.val || '')}`
        }))
      : []
  ));
}

function diffFilterEntries(nextEntries, previousEntries) {
  const previousCounts = new Map();
  previousEntries.forEach(entry => {
    previousCounts.set(entry.key, (previousCounts.get(entry.key) || 0) + 1);
  });

  const added = [];
  nextEntries.forEach(entry => {
    const remaining = previousCounts.get(entry.key) || 0;
    if (remaining > 0) {
      previousCounts.set(entry.key, remaining - 1);
      return;
    }
    added.push(entry);
  });

  const nextCounts = new Map();
  nextEntries.forEach(entry => {
    nextCounts.set(entry.key, (nextCounts.get(entry.key) || 0) + 1);
  });

  const removed = [];
  previousEntries.forEach(entry => {
    const remaining = nextCounts.get(entry.key) || 0;
    if (remaining > 0) {
      nextCounts.set(entry.key, remaining - 1);
      return;
    }
    removed.push(entry);
  });

  return { added, removed };
}

function getFilterGroupOrder(snapshot = {}) {
  return Object.entries(snapshot.activeFilters || {})
    .filter(([, data]) => Array.isArray(data?.filters) && data.filters.length > 0)
    .map(([field]) => field);
}

function getActiveFilterDiff(previousSnapshot = {}, nextSnapshot = {}) {
  const previousEntries = flattenFilterEntries(previousSnapshot);
  const nextEntries = flattenFilterEntries(nextSnapshot);
  const { added, removed } = diffFilterEntries(nextEntries, previousEntries);
  const previousOrder = getFilterGroupOrder(previousSnapshot);
  const nextOrder = getFilterGroupOrder(nextSnapshot);
  const reorderedGroups = added.length === 0
    && removed.length === 0
    && previousOrder.length === nextOrder.length
    && previousOrder.some((field, index) => field !== nextOrder[index]);

  return { added, removed, reorderedGroups };
}

function getOperatorToastLabel(cond) {
  const label = window.OperatorLabels?.get?.(cond);
  if (label) {
    return String(label).toLowerCase();
  }

  return String(cond || '')
    .replace(/_/g, ' ')
    .trim()
    .toLowerCase();
}

function formatFilterToastValue(filter) {
  const rawValue = String(filter?.val || '').trim();
  if (!rawValue) {
    return '';
  }

  if (String(filter?.cond || '').toLowerCase() === 'between') {
    const [startValue, endValue] = rawValue.split('|').map(value => truncateToastValue(value));
    if (startValue && endValue) {
      return `${startValue} and ${endValue}`;
    }
    return startValue || endValue || '';
  }

  const values = rawValue
    .split(',')
    .map(value => truncateToastValue(value))
    .filter(Boolean);

  if (values.length === 0) {
    return '';
  }

  if (values.length === 1) {
    return values[0];
  }

  const previewValues = values.slice(0, 3).join(', ');
  return values.length > 3
    ? `${previewValues} (+${values.length - 3} more)`
    : previewValues;
}

function formatFilterEntryToast(entry) {
  if (!entry || !entry.field) {
    return 'filter';
  }

  const operatorLabel = getOperatorToastLabel(entry.filter?.cond);
  const valueLabel = formatFilterToastValue(entry.filter);
  return valueLabel
    ? `${entry.field} ${operatorLabel} ${valueLabel}`
    : `${entry.field} ${operatorLabel}`.trim();
}

function getDisplayedFieldsToastClause(previousSnapshot, nextSnapshot) {
  const { added, removed, orderChanged } = getDisplayedFieldDiff(previousSnapshot, nextSnapshot);

  if (orderChanged) {
    return 'reordered columns';
  }

  if (added.length === 1 && removed.length === 0) {
    return `added column ${truncateToastValue(added[0])}`;
  }

  if (removed.length === 1 && added.length === 0) {
    return `removed column ${truncateToastValue(removed[0])}`;
  }

  if (added.length > 0 && removed.length === 0) {
    return `added ${added.length} columns`;
  }

  if (removed.length > 0 && added.length === 0) {
    return `removed ${removed.length} columns`;
  }

  if (added.length > 0 || removed.length > 0) {
    return `updated columns (${added.length} added, ${removed.length} removed)`;
  }

  return 'updated columns';
}

function getActiveFiltersToastClause(previousSnapshot, nextSnapshot) {
  const { added, removed, reorderedGroups } = getActiveFilterDiff(previousSnapshot, nextSnapshot);

  if (reorderedGroups) {
    return 'reordered filter groups';
  }

  if (added.length === 1 && removed.length === 0) {
    return `applied filter ${formatFilterEntryToast(added[0])}`;
  }

  if (removed.length === 1 && added.length === 0) {
    return `removed filter ${formatFilterEntryToast(removed[0])}`;
  }

  if (added.length === 1 && removed.length === 1 && added[0].field === removed[0].field) {
    return `updated filter ${truncateToastValue(added[0].field)}`;
  }

  if (added.length > 0 && removed.length === 0) {
    return `applied ${added.length} filters`;
  }

  if (removed.length > 0 && added.length === 0) {
    return `removed ${removed.length} filters`;
  }

  if (added.length > 0 || removed.length > 0) {
    return `updated filters (${added.length} added, ${removed.length} removed)`;
  }

  return 'updated filters';
}

function getQueryChangeToastMessage(event) {
  const source = String(event?.meta?.source || '');
  const displayedFieldsChanged = Boolean(event?.changes?.displayedFields);
  const activeFiltersChanged = Boolean(event?.changes?.activeFilters);
  const previousSnapshot = event?.previousSnapshot || {};
  const nextSnapshot = event?.snapshot || {};

  if (source === 'QueryBuilderShell.groupMethodChange') {
    return 'Updated column grouping.';
  }

  if (displayedFieldsChanged && activeFiltersChanged) {
    return `${capitalizeToastMessage(getDisplayedFieldsToastClause(previousSnapshot, nextSnapshot))} and ${getActiveFiltersToastClause(previousSnapshot, nextSnapshot)}.`;
  }

  if (displayedFieldsChanged) {
    return `${capitalizeToastMessage(getDisplayedFieldsToastClause(previousSnapshot, nextSnapshot))}.`;
  }

  if (activeFiltersChanged) {
    return `${capitalizeToastMessage(getActiveFiltersToastClause(previousSnapshot, nextSnapshot))}.`;
  }

  return 'Query updated.';
}

function notifyQueryStateSubscribers(changes = {}, meta = {}) {
  const nextSnapshot = getQueryStateSnapshot();
  const previousSnapshot = queryLifecycleState.currentQueryState || {
    displayedFields: [],
    activeFilters: {},
    groupMethod: nextSnapshot.groupMethod || 'ExpandIntoColumns'
  };
  const payload = {
    changes: {
      displayedFields: Boolean(changes.displayedFields),
      activeFilters: Boolean(changes.activeFilters)
    },
    meta,
    previousSnapshot,
    snapshot: nextSnapshot
  };

  setQueryLifecycleState({ currentQueryState: nextSnapshot });

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
    return computeQueryStatus();
  },
  getSerializableState() {
    return getSerializableQueryState();
  },
  hasQueryChanged() {
    if (!queryLifecycleState.lastExecutedQueryState) {
      return true;
    }

    const current = getSerializableQueryState();

    if (JSON.stringify(getComparableDisplayedFields(current.displayedFields)) !== JSON.stringify(getComparableDisplayedFields(queryLifecycleState.lastExecutedQueryState.displayedFields))) {
      return true;
    }

    if (JSON.stringify(current.activeFilters) !== JSON.stringify(queryLifecycleState.lastExecutedQueryState.activeFilters)) {
      return true;
    }

    return current.groupMethod !== queryLifecycleState.lastExecutedQueryState.groupMethod;
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
    const normalizedField = normalizeResolvedFieldName(fieldName);
    return Boolean(normalizedField) && displayedFieldsState.includes(normalizedField);
  },
  hasFiltersForField(fieldName) {
    const normalizedField = normalizeResolvedFieldName(fieldName);
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
    const normalizedField = normalizeResolvedFieldName(fieldName);
    const normalizedFilter = normalizeFilterInput(filter);
    if (!normalizedField || !normalizedFilter) {
      return false;
    }

    if (!activeFiltersState[normalizedField]) {
      activeFiltersState[normalizedField] = { filters: [] };
    }

    let nextFilters = Array.isArray(activeFiltersState[normalizedField].filters)
      ? activeFiltersState[normalizedField].filters.slice()
      : [];

    if (options.replaceByCond) {
      nextFilters = nextFilters.filter(existingFilter => existingFilter.cond !== normalizedFilter.cond);
    }

    const matchesExisting = nextFilters.some(existingFilter => (
      existingFilter &&
      existingFilter.cond === normalizedFilter.cond &&
      existingFilter.val === normalizedFilter.val
    ));

    if (options.dedupe && matchesExisting) {
      return false;
    }

    nextFilters.push(normalizedFilter);
    activeFiltersState[normalizedField].filters = normalizeFieldFilters(nextFilters);

    notifyQueryStateSubscribers({ activeFilters: true }, { source: options.source || 'QueryStateStore.upsertFilter' });
    return true;
  },
  removeFilter(fieldName, options = {}) {
    const normalizedField = normalizeResolvedFieldName(fieldName);
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

const queryStateReaderMethodNames = Object.freeze([
  'getSnapshot',
  'getLifecycleState',
  'getQueryStatus',
  'getSerializableState',
  'hasQueryChanged',
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
  const normalizedField = normalizeResolvedFieldName(fieldName);
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
  const normalizedField = normalizeResolvedFieldName(fieldName);
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
  const uiActions = window.AppUiActions || null;

  if (queryLifecycleState.queryRunning) {
    if (typeof window.showToastMessage === 'function') {
      window.showToastMessage('Stop the running query before clearing it.', 'warning');
    }
    return false;
  }

  const previousSelectedField = appStateStore.selectedField || '';

  uiActions?.prepareForQueryClear?.({ previousSelectedField });

  // Clear lifecycle first so subscribers observing the reset event see the fully
  // cleared query state instead of stale partial-results/history metadata.
  queryStateStore.setLifecycleState({
    hasPartialResults: false,
    currentQueryId: null,
    lastExecutedQueryState: null
  });

  // State reset fires all QueryStateSubscriptions, which reactively
  // update FilterSidePanel, category counts, JSON preview, button states, and bubbles.
  queryStateStore.resetState(normalizedMeta);

  uiActions?.finalizeQueryClear?.({ previousSelectedField });
  appStateStore.selectedField = '';
  appStateStore.currentCategory = 'All';

  if (typeof window.showToastMessage === 'function') {
    window.showToastMessage('Query cleared.', 'info');
  }

  return true;
}

const queryChangeManager = Object.freeze({
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
  clearQuery(meta = {}) {
    return clearQueryManagerState(meta);
  }
});

const queryStateReaders = Object.freeze({
  ...Object.fromEntries(
    queryStateReaderMethodNames.map(methodName => [methodName, queryStateStore[methodName]])
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

queryStateStore.subscribe(event => {
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
