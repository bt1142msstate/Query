import {
  buildCurrentResultViewState,
  encodeResultViewState
} from '../../../core/resultViewState.js';
import {
  readCachedHistoryResultSnapshot,
  writeCachedHistoryResultSnapshot
} from './queryHistoryResultCache.js';
import { rememberOpenedHistoryResult } from './queryHistoryResultSession.js';

function buildResultViewState({ queryStateReaders, services, uiState }) {
  return buildCurrentResultViewState({
    queryStateReaders,
    services,
    uiState
  });
}

function createOpenedResultViewStatePersistence({
  getHistoryQueryById,
  queryStateReaders,
  services,
  uiState,
  windowRef = globalThis.window || globalThis
}) {
  let persistTimer = null;
  let persistGeneration = 0;

  async function cacheSnapshot(snapshot = {}) {
    persistGeneration += 1;
    const queryId = snapshot.queryId || snapshot.query?.id || '';
    const query = snapshot.query || getHistoryQueryById(queryId);
    if (!queryId || !query) {
      return false;
    }

    const viewState = snapshot.viewState || buildResultViewState({
      queryStateReaders,
      services,
      uiState
    });

    rememberOpenedHistoryResult(queryId, {
      resultViewParam: encodeResultViewState(viewState),
      updateUrl: true
    });

    return writeCachedHistoryResultSnapshot({
      ...snapshot,
      query,
      queryId,
      viewState
    });
  }

  async function persistSnapshot(expectedGeneration = null) {
    const generation = expectedGeneration === null ? persistGeneration + 1 : expectedGeneration;
    if (expectedGeneration === null) {
      persistGeneration = generation;
    }

    const lifecycleState = queryStateReaders.getLifecycleState();
    const queryId = String(lifecycleState.currentQueryId || '').trim();
    if (!lifecycleState.hasLoadedResultSet || !queryId) {
      return false;
    }

    const snapshot = await readCachedHistoryResultSnapshot(queryId);
    if (!snapshot) {
      return false;
    }

    const viewState = buildResultViewState({
      queryStateReaders,
      services,
      uiState
    });

    if (generation !== persistGeneration) {
      return false;
    }

    rememberOpenedHistoryResult(queryId, {
      resultViewParam: encodeResultViewState(viewState),
      updateUrl: true
    });

    return writeCachedHistoryResultSnapshot({
      ...snapshot,
      viewState
    });
  }

  function schedule(event = {}) {
    const source = String(event?.meta?.source || '');
    if (source === 'QueryHistory.loadQueryConfig') {
      return;
    }

    const lifecycleState = queryStateReaders.getLifecycleState();
    if (!lifecycleState.hasLoadedResultSet || !lifecycleState.currentQueryId) {
      return;
    }

    const generation = persistGeneration + 1;
    persistGeneration = generation;

    if (persistTimer) {
      windowRef.clearTimeout(persistTimer);
    }

    persistTimer = windowRef.setTimeout(() => {
      persistTimer = null;
      persistSnapshot(generation).catch(error => {
        console.warn('Failed to persist opened result view state:', error);
      });
    }, 100);
  }

  return Object.freeze({
    cacheSnapshot,
    persistSnapshot,
    schedule
  });
}

export { createOpenedResultViewStatePersistence };
