import test from 'node:test';
import assert from 'node:assert/strict';

import {
  areFilterFieldOrdersEqual,
  buildPlannedFilterFieldOrder
} from '../../../src/core/queryPlanOrdering.js';

test('planned filter ordering groups duplicate field predicates and appends unplanned fields', () => {
  const activeFilters = {
    'Item Library': { filters: [{ cond: 'equals', val: 'MSU-MAIN' }] },
    'Total Checkouts': { filters: [{ cond: 'between', val: '1|10' }] },
    'Catalog Key': { filters: [{ cond: 'equals', val: '12345' }] },
    Title: { filters: [{ cond: 'contains', val: 'history' }] }
  };
  const plan = {
    order: [
      { field: 'Total Checkouts', planned_position: 3 },
      { field: 'Catalog Key', planned_position: 1 },
      { field: 'Total Checkouts', planned_position: 4 },
      { field: 'Item Library', planned_position: 2 }
    ]
  };

  assert.deepEqual(buildPlannedFilterFieldOrder(plan, activeFilters), [
    'Catalog Key',
    'Item Library',
    'Total Checkouts',
    'Title'
  ]);
});

test('planned filter ordering matches backend field names without case sensitivity', () => {
  const activeFilters = {
    'Item Type': { filters: [{ cond: 'equals', val: 'BOOK' }] },
    'Item Library': { filters: [{ cond: 'equals', val: 'MSU-MAIN' }] }
  };

  assert.deepEqual(buildPlannedFilterFieldOrder({
    order: [
      { field: 'item library', planned_position: 1 },
      { field: 'ITEM TYPE', planned_position: 2 }
    ]
  }, activeFilters), ['Item Library', 'Item Type']);
  assert.equal(areFilterFieldOrdersEqual(['Item Library'], ['Item Library']), true);
  assert.equal(areFilterFieldOrdersEqual(['Item Library'], ['Item Type']), false);
});
