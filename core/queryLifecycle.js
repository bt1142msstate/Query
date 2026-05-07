const DEFAULT_QUERY_LIFECYCLE_STATE = Object.freeze({
  queryRunning: false,
  lastExecutedQueryState: null,
  currentQueryState: null,
  hasPartialResults: false,
  hasLoadedResultSet: false,
  currentQueryId: null
});

const QUERY_STATUS = Object.freeze({
  idle: 'idle',
  planning: 'planning',
  running: 'running',
  partial: 'partial',
  results: 'results'
});

const queryLifecycleNormalizers = Object.freeze({
  queryRunning: value => Boolean(value),
  lastExecutedQueryState: value => value ?? null,
  currentQueryState: value => value ?? null,
  hasPartialResults: value => Boolean(value),
  hasLoadedResultSet: value => Boolean(value),
  currentQueryId: value => value ? String(value) : null
});

function normalizeQueryLifecyclePatch(patch = {}) {
  if (!patch || typeof patch !== 'object') {
    return {};
  }

  return Object.fromEntries(
    Object.entries(patch)
      .filter(([key]) => Object.prototype.hasOwnProperty.call(DEFAULT_QUERY_LIFECYCLE_STATE, key))
      .map(([key, value]) => {
        const normalize = queryLifecycleNormalizers[key];
        return [key, typeof normalize === 'function' ? normalize(value) : value];
      })
  );
}

function createQueryLifecycleStore(initialState = {}) {
  const state = {
    ...DEFAULT_QUERY_LIFECYCLE_STATE,
    ...normalizeQueryLifecyclePatch(initialState)
  };

  function getSnapshot() {
    return {
      queryRunning: state.queryRunning,
      hasPartialResults: state.hasPartialResults,
      hasLoadedResultSet: state.hasLoadedResultSet,
      currentQueryId: state.currentQueryId,
      currentQueryState: state.currentQueryState,
      lastExecutedQueryState: state.lastExecutedQueryState
    };
  }

  function setState(nextState = {}) {
    const patch = normalizeQueryLifecyclePatch(nextState);
    Object.entries(patch).forEach(([key, value]) => {
      state[key] = value;
    });
    return getSnapshot();
  }

  function reset() {
    return setState(DEFAULT_QUERY_LIFECYCLE_STATE);
  }

  return Object.freeze({
    getSnapshot,
    setState,
    reset
  });
}

function getComparableDisplayedFields(fieldNames) {
  return (Array.isArray(fieldNames) ? fieldNames : [])
    .map(field => String(field || '').trim())
    .filter(Boolean)
    .slice()
    .sort();
}

function areSerializableQueryStatesEqual(currentState, executedState) {
  if (!executedState) {
    return false;
  }

  const current = currentState || {};

  if (JSON.stringify(getComparableDisplayedFields(current.displayedFields)) !== JSON.stringify(getComparableDisplayedFields(executedState.displayedFields))) {
    return false;
  }

  if (JSON.stringify(current.activeFilters) !== JSON.stringify(executedState.activeFilters)) {
    return false;
  }

  return current.groupMethod === executedState.groupMethod;
}

function hasLoadedCurrentQueryResultSet(lifecycleState = {}, currentQueryState = null) {
  return Boolean(lifecycleState.hasLoadedResultSet)
    && areSerializableQueryStatesEqual(currentQueryState, lifecycleState.lastExecutedQueryState);
}

function hasConfiguredQuery(snapshot = {}) {
  const hasFilters = Object.values(snapshot?.activeFilters || {})
    .some(data => Array.isArray(data?.filters) && data.filters.length > 0);

  return (snapshot?.displayedFields?.length || 0) > 0 || hasFilters;
}

function computeQueryStatus({
  lifecycleState = DEFAULT_QUERY_LIFECYCLE_STATE,
  snapshot = {},
  rowCount = 0,
  currentQueryState = null
} = {}) {
  if (lifecycleState.queryRunning) {
    return QUERY_STATUS.running;
  }

  const normalizedRowCount = Number.isFinite(Number(rowCount)) ? Number(rowCount) : 0;

  if (lifecycleState.hasPartialResults && normalizedRowCount > 0) {
    return QUERY_STATUS.partial;
  }

  if (normalizedRowCount > 0) {
    return QUERY_STATUS.results;
  }

  if (hasLoadedCurrentQueryResultSet(lifecycleState, currentQueryState)) {
    return QUERY_STATUS.results;
  }

  if (hasConfiguredQuery(snapshot)) {
    return QUERY_STATUS.planning;
  }

  return QUERY_STATUS.idle;
}

export {
  DEFAULT_QUERY_LIFECYCLE_STATE,
  QUERY_STATUS,
  areSerializableQueryStatesEqual,
  computeQueryStatus,
  createQueryLifecycleStore,
  hasConfiguredQuery,
  hasLoadedCurrentQueryResultSet,
  normalizeQueryLifecyclePatch
};
