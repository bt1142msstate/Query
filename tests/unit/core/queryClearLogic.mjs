import assert from 'node:assert/strict';
import test from 'node:test';

test('clear report waits for remembered result cleanup and resets query lifecycle state', async () => {
  const {
    QueryChangeManager,
    QueryStateReaders,
    registerQueryStateRuntimeAccessors
  } = await import('../../../src/core/queryState.js');
  let cleanupFinished = false;

  registerQueryStateRuntimeAccessors({
    getServices: () => ({
      async forgetOpenedHistoryResult() {
        await Promise.resolve();
        cleanupFinished = true;
      }
    }),
    getUiActions: () => ({
      finalizeQueryClear() {},
      prepareForQueryClear() {}
    })
  });

  QueryChangeManager.setQueryState({
    activeFilters: {
      Branch: { filters: [{ cond: 'equals', val: 'Main' }] }
    },
    displayedFields: ['Title', 'Branch']
  }, { source: 'QueryClearLogic.setup', silent: true });
  QueryChangeManager.setLifecycleState({
    currentQueryId: 'query-to-clear',
    hasLoadedResultSet: true,
    hasPartialResults: true,
    lastExecutedQueryState: { displayedFields: ['Title'] }
  }, { source: 'QueryClearLogic.setup', silent: true });

  assert.equal(await QueryChangeManager.clearQuery({ suppressToast: true }), true);
  assert.equal(cleanupFinished, true);
  assert.deepEqual(QueryStateReaders.getDisplayedFields(), []);
  assert.deepEqual(QueryStateReaders.getActiveFilters(), {});
  assert.equal(QueryStateReaders.getLifecycleState().currentQueryId, null);
  assert.equal(QueryStateReaders.getLifecycleState().hasLoadedResultSet, false);
  assert.equal(QueryStateReaders.getLifecycleState().hasPartialResults, false);
  assert.equal(QueryStateReaders.getLifecycleState().lastExecutedQueryState, null);
});
