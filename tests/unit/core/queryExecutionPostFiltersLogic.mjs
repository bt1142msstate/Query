import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldPreservePostFiltersForRun } from '../../../src/core/queryExecutionPostFilters.js';

function createServices(hasPostFilters) {
  return {
    hasPostFilters() {
      return hasPostFilters;
    }
  };
}

function createReaders(queryChanged) {
  return {
    hasQueryChanged() {
      return queryChanged;
    }
  };
}

test('post filters are preserved only when refreshing the same loaded query', () => {
  assert.equal(shouldPreservePostFiltersForRun({
    lifecycleState: { hasLoadedResultSet: true },
    queryStateReaders: createReaders(false),
    services: createServices(true)
  }), true);

  assert.equal(shouldPreservePostFiltersForRun({
    lifecycleState: { hasLoadedResultSet: true },
    queryStateReaders: createReaders(true),
    services: createServices(true)
  }), false);

  assert.equal(shouldPreservePostFiltersForRun({
    lifecycleState: { hasLoadedResultSet: false },
    queryStateReaders: createReaders(false),
    services: createServices(true)
  }), false);

  assert.equal(shouldPreservePostFiltersForRun({
    lifecycleState: { hasLoadedResultSet: true },
    queryStateReaders: createReaders(false),
    services: createServices(false)
  }), false);
});
