import { RESULT_QUERY_URL_PARAM, RESULT_VIEW_URL_PARAM } from '../../core/queryResultUrl.js';
import {
  buildCurrentResultViewState,
  encodeResultViewState
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

async function restoreBaselineResultsForReset({
  clearRenderedResults,
  label,
  searchParams,
  services,
  showToastMessage
} = {}) {
  const { resultQueryId, resultViewParam } = getBaselineResultSearchParams(searchParams);
  if (!resultQueryId) {
    await Promise.resolve(services?.forgetOpenedHistoryResult?.()).catch(error => {
      console.warn('Failed to forget opened result during form reset:', error);
    });
    clearRenderedResults?.();
    return false;
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
  clearRenderedQueryResults,
  getBaselineResultSearchParams,
  replaceBrowserResultParams,
  restoreBaselineResultsForReset,
  stopRunningQueryForReset
};
