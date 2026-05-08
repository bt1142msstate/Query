import assert from 'node:assert/strict';
import {
  getQueryStateSyncPlan,
  mergeQuerySyncOptions,
  normalizeQuerySyncOptions,
  shouldRunQueuedQuerySync
} from '../../ui/form-mode/formModeQueryReconcile.js';

assert.deepEqual(normalizeQuerySyncOptions(), {
  rebuildCard: false,
  refreshUrl: true
});
assert.deepEqual(normalizeQuerySyncOptions({ rebuildCard: 1, refreshUrl: false }), {
  rebuildCard: true,
  refreshUrl: false
});

assert.deepEqual(mergeQuerySyncOptions(null, { rebuildCard: true, refreshUrl: false }), {
  rebuildCard: true,
  refreshUrl: false
});
assert.deepEqual(mergeQuerySyncOptions(
  { rebuildCard: false, refreshUrl: false },
  { rebuildCard: true, refreshUrl: true }
), {
  rebuildCard: true,
  refreshUrl: true
});

assert.equal(shouldRunQueuedQuerySync({
  active: true,
  isClearingQuery: false,
  isApplyingFormState: false
}, { rebuildCard: false }), true);
assert.equal(shouldRunQueuedQuerySync({ active: false }, { rebuildCard: false }), false);
assert.equal(shouldRunQueuedQuerySync({ active: true, isClearingQuery: true }, { rebuildCard: false }), false);
assert.equal(shouldRunQueuedQuerySync({ active: true, isApplyingFormState: true }, { rebuildCard: false }), false);
assert.equal(shouldRunQueuedQuerySync({ active: true }, null), false);

assert.deepEqual(getQueryStateSyncPlan({
  meta: { source: 'QueryChangeManager.clearQuery' }
}, {
  viewMode: 'form'
}), { action: 'clear' });

assert.deepEqual(getQueryStateSyncPlan({}, {
  isClearingQuery: true,
  viewMode: 'form'
}), { action: 'skip' });

assert.deepEqual(getQueryStateSyncPlan({
  changes: { activeFilters: true }
}, {
  isApplyingFormState: true,
  viewMode: 'form'
}), {
  action: 'queue',
  options: {
    rebuildCard: false,
    refreshUrl: true
  }
});

assert.deepEqual(getQueryStateSyncPlan({
  changes: { activeFilters: true }
}, {
  isApplyingFormState: false,
  viewMode: 'form'
}), {
  action: 'sync',
  options: {
    rebuildCard: true,
    refreshUrl: true
  }
});

assert.deepEqual(getQueryStateSyncPlan({
  changes: { activeFilters: true }
}, {
  isApplyingFormState: false,
  viewMode: 'bubbles'
}), {
  action: 'sync',
  options: {
    rebuildCard: false,
    refreshUrl: true
  }
});

console.log('Form mode query reconcile logic tests passed');
