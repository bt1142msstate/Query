import assert from 'node:assert/strict';
import {
  QUERY_STATUS,
  areSerializableQueryStatesEqual,
  computeQueryStatus,
  createQueryLifecycleStore,
  hasConfiguredQuery,
  hasLoadedCurrentQueryResultSet,
  normalizeQueryLifecyclePatch
} from '../../core/queryLifecycle.js';

const emptyQuery = {
  displayedFields: [],
  activeFilters: {},
  groupMethod: 'ExpandIntoColumns'
};

const configuredQuery = {
  displayedFields: ['Title', 'Author'],
  activeFilters: {
    Branch: { filters: [{ cond: 'equals', val: 'Main' }] }
  },
  groupMethod: 'ExpandIntoColumns'
};

assert.deepEqual(normalizeQueryLifecyclePatch({
  queryRunning: 1,
  hasPartialResults: '',
  hasLoadedResultSet: 'yes',
  currentQueryId: 42,
  ignored: true
}), {
  queryRunning: true,
  hasPartialResults: false,
  hasLoadedResultSet: true,
  currentQueryId: '42'
});

const lifecycleStore = createQueryLifecycleStore({ queryRunning: true, currentQueryId: 17 });
assert.deepEqual(lifecycleStore.getSnapshot(), {
  queryRunning: true,
  hasPartialResults: false,
  hasLoadedResultSet: false,
  currentQueryId: '17',
  currentQueryState: null,
  lastExecutedQueryState: null
});

lifecycleStore.setState({ queryRunning: false, currentQueryId: 0, unknown: true });
assert.equal(lifecycleStore.getSnapshot().queryRunning, false);
assert.equal(lifecycleStore.getSnapshot().currentQueryId, null);

const executedQuery = {
  displayedFields: ['Author', 'Title'],
  activeFilters: {
    Branch: { filters: [{ cond: 'equals', val: 'Main' }] }
  },
  groupMethod: 'ExpandIntoColumns'
};

assert.equal(areSerializableQueryStatesEqual(configuredQuery, executedQuery), true);
assert.equal(areSerializableQueryStatesEqual({ ...configuredQuery, groupMethod: 'CombineValues' }, executedQuery), false);
assert.equal(areSerializableQueryStatesEqual(configuredQuery, null), false);

assert.equal(hasConfiguredQuery(emptyQuery), false);
assert.equal(hasConfiguredQuery({ displayedFields: [], activeFilters: { Branch: { filters: [{ cond: 'equals', val: 'Main' }] } } }), true);

assert.equal(computeQueryStatus({
  lifecycleState: { queryRunning: true },
  snapshot: configuredQuery,
  rowCount: 10,
  currentQueryState: configuredQuery
}), QUERY_STATUS.running);

assert.equal(computeQueryStatus({
  lifecycleState: { queryRunning: false, hasPartialResults: true },
  snapshot: configuredQuery,
  rowCount: 10,
  currentQueryState: configuredQuery
}), QUERY_STATUS.partial);

assert.equal(computeQueryStatus({
  lifecycleState: { queryRunning: false },
  snapshot: configuredQuery,
  rowCount: 10,
  currentQueryState: configuredQuery
}), QUERY_STATUS.results);

assert.equal(hasLoadedCurrentQueryResultSet({
  hasLoadedResultSet: true,
  lastExecutedQueryState: executedQuery
}, configuredQuery), true);

assert.equal(computeQueryStatus({
  lifecycleState: {
    queryRunning: false,
    hasLoadedResultSet: true,
    lastExecutedQueryState: executedQuery
  },
  snapshot: configuredQuery,
  rowCount: 0,
  currentQueryState: configuredQuery
}), QUERY_STATUS.results);

assert.equal(computeQueryStatus({
  lifecycleState: {
    queryRunning: false,
    hasLoadedResultSet: false,
    lastExecutedQueryState: executedQuery
  },
  snapshot: configuredQuery,
  rowCount: 0,
  currentQueryState: configuredQuery
}), QUERY_STATUS.planning);

assert.equal(computeQueryStatus({
  lifecycleState: { queryRunning: false },
  snapshot: emptyQuery,
  rowCount: 0,
  currentQueryState: emptyQuery
}), QUERY_STATUS.idle);

console.log('Query lifecycle logic tests passed');
