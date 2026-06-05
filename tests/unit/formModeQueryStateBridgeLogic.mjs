import assert from 'node:assert/strict';
import { bindFormModeQueryStateSync } from '../../ui/form-mode/formModeQueryStateBridge.js';
import test from 'node:test';

test('form mode query state bridge', async () => {
  function createBridgeHarness(plan) {
    const scheduled = [];
    let subscribedCallback = null;
    const state = {
      active: true,
      isApplyingFormState: false,
      isClearingQuery: false,
      pendingQuerySync: null,
      querySyncQueued: false,
      unsubscribeQueryState: null,
      viewMode: 'form'
    };
    const syncedOptions = [];
    let validationCount = 0;
    let resetCount = 0;

    bindFormModeQueryStateSync({
      state,
      window: {
        queueMicrotask(callback) {
          scheduled.push(callback);
        }
      },
      queryStateSubscriptions: {
        subscribe(callback, options) {
          subscribedCallback = callback;
          assert.deepEqual(options, {
            displayedFields: true,
            activeFilters: true,
            predicate: options.predicate
          });
          return () => {};
        }
      },
      getQueryStateSyncPlan() {
        return plan;
      },
      mergeQuerySyncOptions(previous, next) {
        return { ...(previous || {}), ...(next || {}) };
      },
      normalizeQuerySyncOptions(options) {
        return { ...options, normalized: true };
      },
      shouldRunQueuedQuerySync() {
        return true;
      },
      syncActiveSpecWithCurrentQuery(options) {
        syncedOptions.push(options);
      },
      syncValidationUi() {
        validationCount += 1;
      },
      resetActiveFormAfterClear() {
        resetCount += 1;
      }
    });

    return {
      resetCount: () => resetCount,
      scheduled,
      state,
      subscribedCallback,
      syncedOptions,
      validationCount: () => validationCount
    };
  }

  {
    const harness = createBridgeHarness({ action: 'queue', options: { rebuildCard: true } });
    harness.subscribedCallback({ type: 'change' });

    assert.equal(harness.syncedOptions.length, 0, 'queued sync should wait for the microtask');
    assert.equal(harness.scheduled.length, 1);
    harness.scheduled[0]();

    assert.deepEqual(harness.syncedOptions, [{ rebuildCard: true, normalized: true }]);
    assert.equal(harness.validationCount(), 1);
    assert.equal(harness.state.querySyncQueued, false);
  }

  {
    const harness = createBridgeHarness({ action: 'clear' });
    harness.subscribedCallback({ type: 'clear' });

    assert.equal(harness.state.isClearingQuery, true);
    harness.scheduled[0]();

    assert.equal(harness.resetCount(), 1);
    assert.equal(harness.state.isClearingQuery, false);
  }
});
