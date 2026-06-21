import { RESULT_QUERY_URL_PARAM, RESULT_VIEW_URL_PARAM } from '../../core/queryResultUrl.js';
import {
  applyResultViewState,
  buildCurrentResultViewState,
  encodeResultViewState,
  readResultViewStateFromLocation
} from '../../core/resultViewState.js';

function buildCurrentResultSearchParams({
  getCurrentShareResultQueryId,
  getFieldSearch,
  queryStateReaders,
  services
} = {}) {
  const searchParams = new URLSearchParams();
  const resultQueryId = typeof getCurrentShareResultQueryId === 'function'
    ? getCurrentShareResultQueryId()
    : '';
  if (!resultQueryId) {
    return searchParams;
  }

  const resultViewParam = encodeResultViewState(buildCurrentResultViewState({
    queryStateReaders,
    services,
    uiState: {
      getFieldSearch: () => (typeof getFieldSearch === 'function' ? getFieldSearch() : '')
    }
  }));
  searchParams.set(RESULT_QUERY_URL_PARAM, resultQueryId);
  if (resultViewParam) {
    searchParams.set(RESULT_VIEW_URL_PARAM, resultViewParam);
  }
  return searchParams;
}

function getBaselineResultSearchParams(searchParams) {
  const source = searchParams instanceof URLSearchParams ? searchParams : new URLSearchParams();
  const resultQueryId = String(source.get(RESULT_QUERY_URL_PARAM) || '').trim();
  const resultViewParam = String(source.get(RESULT_VIEW_URL_PARAM) || '').trim();
  return { resultQueryId, resultViewParam };
}

function replaceBrowserResultParams({
  resultQueryId,
  resultViewParam = '',
  state,
  windowRef = window
} = {}) {
  try {
    const nextUrl = new URL(windowRef.location.href);
    const normalizedQueryId = String(resultQueryId || '').trim();
    const normalizedView = String(resultViewParam || '').trim();

    if (normalizedQueryId) {
      nextUrl.searchParams.set(RESULT_QUERY_URL_PARAM, normalizedQueryId);
      if (normalizedView) {
        nextUrl.searchParams.set(RESULT_VIEW_URL_PARAM, normalizedView);
      } else {
        nextUrl.searchParams.delete(RESULT_VIEW_URL_PARAM);
      }
    } else {
      nextUrl.searchParams.delete(RESULT_QUERY_URL_PARAM);
      nextUrl.searchParams.delete(RESULT_VIEW_URL_PARAM);
    }

    windowRef.history.replaceState({}, '', nextUrl);
    if (state) {
      state.lastBrowserUrl = nextUrl.toString();
    }
  } catch (_error) {}
}

function stopRunningQueryForReset({
  queryChangeManager,
  queryStateReaders,
  services,
  uiActions
} = {}) {
  const lifecycleState = queryStateReaders?.getLifecycleState?.();
  if (!lifecycleState?.queryRunning || !lifecycleState.currentQueryId) {
    return;
  }

  Promise.resolve(services?.cancelHistoryQuery?.(lifecycleState.currentQueryId)).catch(console.error);
  queryChangeManager?.setLifecycleState?.(
    { queryRunning: false },
    { source: 'QueryFormMode.reset.stopQuery', silent: true }
  );
  uiActions?.updateRunButtonIcon?.();
}

function clearRenderedQueryResults({
  queryTableView,
  services
} = {}) {
  services?.clearVirtualTableData?.();
  queryTableView?.renderEmptyQueryTableState?.();
}

function buildResultViewFieldSearchUiState(dom = {}) {
  return {
    getFieldSearch: () => dom?.queryInput?.value || '',
    setFieldSearch: value => {
      if (!dom?.queryInput) {
        return;
      }
      dom.queryInput.value = String(value || '');
      dom.queryInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
  };
}

function hasLoadedBaselineResult({
  queryStateReaders,
  resultQueryId,
  services
} = {}) {
  const normalizedQueryId = String(resultQueryId || '').trim();
  const lifecycleState = queryStateReaders?.getLifecycleState?.();
  const tableData = services?.getVirtualTableData?.();

  return Boolean(
    normalizedQueryId
    && String(lifecycleState?.currentQueryId || '').trim() === normalizedQueryId
    && lifecycleState?.hasLoadedResultSet === true
    && Array.isArray(tableData?.headers)
    && tableData.headers.length > 0
    && Array.isArray(tableData?.rows)
  );
}

async function preserveLoadedBaselineResultsForReset({
  queryChangeManager,
  queryStateReaders,
  resultQueryId,
  searchParams,
  services,
  uiActions,
  uiState
} = {}) {
  if (!hasLoadedBaselineResult({ queryStateReaders, resultQueryId, services })) {
    return false;
  }

  const viewState = readResultViewStateFromLocation(
    { search: `?${searchParams.toString()}` },
    { queryId: resultQueryId }
  );

  applyResultViewState(viewState, {
    queryChangeManager,
    services,
    uiActions,
    uiState
  });

  queryChangeManager?.setLifecycleState?.({
    currentQueryId: resultQueryId,
    hasLoadedResultSet: true,
    hasPartialResults: false,
    queryRunning: false
  }, { source: 'QueryFormMode.reset.preserveLoadedResult', silent: true });

  const displayedFields = queryStateReaders?.getDisplayedFields?.() || [];
  const renderFields = displayedFields.length
    ? displayedFields
    : (services?.getVirtualTableData?.()?.headers || []);

  await uiActions?.showExampleTable?.(renderFields, {
    syncQueryState: false
  });
  services?.rerenderBubbles?.();
  uiActions?.updateTableResultsLip?.();
  uiActions?.updateButtonStates?.();
  uiActions?.syncTableViewportHeight?.();
  services?.renderVirtualTable?.();
  return true;
}

async function restoreBaselineResultsForReset({
  clearRenderedResults,
  label,
  queryChangeManager,
  queryStateReaders,
  searchParams,
  services,
  showToastMessage,
  uiActions,
  uiState
} = {}) {
  const { resultQueryId, resultViewParam } = getBaselineResultSearchParams(searchParams);
  if (!resultQueryId) {
    await Promise.resolve(services?.forgetOpenedHistoryResult?.()).catch(error => {
      console.warn('Failed to forget opened result during form reset:', error);
    });
    clearRenderedResults?.();
    return false;
  }

  const preserved = await preserveLoadedBaselineResultsForReset({
    queryChangeManager,
    queryStateReaders,
    resultQueryId,
    searchParams,
    services,
    uiActions,
    uiState
  });
  if (preserved) {
    return true;
  }

  const loaded = await services?.loadHistoryQueryResults?.(resultQueryId, {
    location: { search: `?${searchParams.toString()}` },
    notify: false,
    restore: true,
    resultViewParam
  });

  if (!loaded) {
    showToastMessage?.(`Reset to ${label}, but the saved results were not available.`, 'warning');
  }
  return Boolean(loaded);
}

export {
  buildCurrentResultSearchParams,
  buildResultViewFieldSearchUiState,
  clearRenderedQueryResults,
  getBaselineResultSearchParams,
  hasLoadedBaselineResult,
  preserveLoadedBaselineResultsForReset,
  replaceBrowserResultParams,
  restoreBaselineResultsForReset,
  stopRunningQueryForReset
};
