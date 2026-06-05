function createMicrotaskScheduler(windowRef) {
  if (windowRef && typeof windowRef.queueMicrotask === 'function') {
    return callback => windowRef.queueMicrotask(callback);
  }

  return callback => Promise.resolve().then(callback);
}

function bindFormModeQueryStateSync(options) {
  const {
    state,
    window: windowRef,
    queryStateSubscriptions,
    getQueryStateSyncPlan,
    mergeQuerySyncOptions,
    normalizeQuerySyncOptions,
    shouldRunQueuedQuerySync,
    syncActiveSpecWithCurrentQuery,
    syncValidationUi,
    resetActiveFormAfterClear
  } = options;

  if (state.unsubscribeQueryState || !queryStateSubscriptions) {
    return state.unsubscribeQueryState;
  }

  const scheduleMicrotask = createMicrotaskScheduler(windowRef);

  const deferCompletedClearReset = () => {
    const runReset = () => {
      if (!state.active) {
        state.isClearingQuery = false;
        return;
      }

      try {
        resetActiveFormAfterClear();
      } finally {
        state.isClearingQuery = false;
      }
    };

    scheduleMicrotask(runReset);
  };

  const queueQueryStateReconcile = (options = {}) => {
    state.pendingQuerySync = mergeQuerySyncOptions(state.pendingQuerySync, options);

    if (state.querySyncQueued) {
      return;
    }

    state.querySyncQueued = true;
    scheduleMicrotask(() => {
      state.querySyncQueued = false;
      const queuedOptions = state.pendingQuerySync;
      state.pendingQuerySync = null;

      if (!shouldRunQueuedQuerySync(state, queuedOptions)) {
        return;
      }

      syncActiveSpecWithCurrentQuery(queuedOptions);

      if (state.viewMode === 'form') {
        syncValidationUi();
      }
    });
  };

  state.unsubscribeQueryState = queryStateSubscriptions.subscribe(event => {
    if (!state.active) {
      return;
    }

    const syncPlan = getQueryStateSyncPlan(event, {
      isApplyingFormState: state.isApplyingFormState,
      isClearingQuery: state.isClearingQuery,
      viewMode: state.viewMode
    });

    if (syncPlan.action === 'clear') {
      state.isClearingQuery = true;
      deferCompletedClearReset();
      return;
    }

    if (syncPlan.action === 'skip') {
      return;
    }

    if (syncPlan.action === 'queue') {
      queueQueryStateReconcile(normalizeQuerySyncOptions(syncPlan.options));
      return;
    }

    syncActiveSpecWithCurrentQuery(syncPlan.options);

    if (state.viewMode === 'form') {
      syncValidationUi();
    }
  }, {
    displayedFields: true,
    activeFilters: true,
    predicate: () => state.active
  });

  return state.unsubscribeQueryState;
}

export { bindFormModeQueryStateSync };
