function normalizeQuerySyncOptions(options = {}) {
  return {
    rebuildCard: Boolean(options.rebuildCard),
    refreshUrl: options.refreshUrl !== false
  };
}

function mergeQuerySyncOptions(previousOptions, nextOptions = {}) {
  const normalizedNext = normalizeQuerySyncOptions(nextOptions);
  if (!previousOptions) {
    return normalizedNext;
  }

  const normalizedPrevious = normalizeQuerySyncOptions(previousOptions);
  return {
    rebuildCard: normalizedPrevious.rebuildCard || normalizedNext.rebuildCard,
    refreshUrl: normalizedPrevious.refreshUrl || normalizedNext.refreshUrl
  };
}

function shouldRunQueuedQuerySync(state = {}, queuedOptions = null) {
  return Boolean(
    queuedOptions
    && state.active
    && !state.isClearingQuery
    && !state.isApplyingFormState
  );
}

function getQueryStateSyncPlan(event = {}, state = {}) {
  const source = String(event && event.meta && event.meta.source || '');
  if (source === 'QueryChangeManager.clearQuery') {
    return { action: 'clear' };
  }

  if (state.isClearingQuery) {
    return { action: 'skip' };
  }

  const hasActiveFilterChanges = Boolean(event && event.changes && event.changes.activeFilters);
  const baseOptions = {
    rebuildCard: Boolean(state.viewMode === 'form' && hasActiveFilterChanges),
    refreshUrl: true
  };

  if (state.isApplyingFormState) {
    if (source.startsWith('QueryFormMode.')) {
      return { action: 'skip' };
    }

    return {
      action: 'queue',
      options: {
        rebuildCard: false,
        refreshUrl: baseOptions.refreshUrl
      }
    };
  }

  return {
    action: 'sync',
    options: baseOptions
  };
}

export {
  getQueryStateSyncPlan,
  mergeQuerySyncOptions,
  normalizeQuerySyncOptions,
  shouldRunQueuedQuerySync
};
