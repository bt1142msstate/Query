import {
  clearCachedHistoryResultSnapshots,
  isUsableCachedHistoryResultSnapshot,
  readCachedHistoryResultSnapshot
} from './queryHistoryResultCache.js';
import { hydrateHistoryResultTable } from './queryHistoryResultsLoader.js';
import {
  forgetOpenedHistoryResult,
  readOpenedHistoryResult,
  rememberOpenedHistoryResult,
  shouldRestoreOpenedHistoryResult
} from './queryHistoryResultSession.js';

function createOpenedHistoryResultRestoreController({
  appState,
  getHistoryQueryById,
  loadQueryConfig,
  loadQueryResults,
  queryChangeManager,
  queryStateReaders,
  services,
  showToastMessage,
  uiActions
}) {
  let restoreAttempted = false;

  function shouldAttemptRestore(location) {
    return shouldRestoreOpenedHistoryResult({ location });
  }

  async function forgetRestoreSnapshot() {
    forgetOpenedHistoryResult({ clearUrl: true });
    await clearCachedHistoryResultSnapshots();
  }

  async function restoreFromCache(options = {}) {
    if (restoreAttempted || !shouldAttemptRestore(options.location)) {
      return false;
    }

    const remembered = readOpenedHistoryResult({ location: options.location });
    const queryId = remembered?.queryId || '';
    if (!queryId) {
      return false;
    }

    const snapshot = await readCachedHistoryResultSnapshot(queryId);
    if (!isUsableCachedHistoryResultSnapshot(snapshot, queryId)) {
      return false;
    }

    const query = snapshot.query || getHistoryQueryById(queryId);
    if (!query?.jsonConfig) {
      return false;
    }

    restoreAttempted = true;
    loadQueryConfig(query);
    queryChangeManager.setLifecycleState({
      currentQueryId: query.id,
      hasPartialResults: false,
      hasLoadedResultSet: true
    }, { source: 'QueryHistory.restoreCachedResults', silent: true });

    await hydrateHistoryResultTable({
      headers: snapshot.headers,
      rows: snapshot.rows,
      appState,
      queryStateReaders,
      services,
      uiActions
    });

    uiActions.updateTableResultsLip();
    rememberOpenedHistoryResult(query.id, { updateUrl: true });
    services.closeAllModals();
    showToastMessage(`Restored ${snapshot.rows.length} cached results.`, 'info');
    return true;
  }

  function restoreFromBackendAfterStatus(options = {}) {
    if (restoreAttempted || !shouldAttemptRestore(options.location)) {
      return;
    }

    const remembered = readOpenedHistoryResult({ location: options.location });
    const queryId = remembered?.queryId || '';
    if (!queryId) {
      return;
    }

    if (!getHistoryQueryById(queryId)) {
      forgetRestoreSnapshot().catch(error => {
        console.warn('Failed to clear stale cached history result:', error);
      });
      return;
    }

    restoreAttempted = true;
    loadQueryResults(queryId, { notify: false, restore: true }).catch(error => {
      console.error('Failed to restore opened history results:', error);
    });
  }

  return Object.freeze({
    forgetRestoreSnapshot,
    restoreFromBackendAfterStatus,
    restoreFromCache,
    shouldAttemptRestore
  });
}

export { createOpenedHistoryResultRestoreController };
