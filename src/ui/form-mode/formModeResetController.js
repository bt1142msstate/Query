async function resetFormToBaselineAction({
  buildResultViewFieldSearchUiState,
  clearRenderedQueryResults,
  cloneSpec,
  dom,
  getBaselineResultSearchParams,
  queryChangeManager,
  queryStateReaders,
  queryTableView,
  rebuildFormCardFromSpec,
  refreshBrowserUrl,
  replaceBrowserResultParams,
  restoreBaselineResultsForReset,
  sanitizeSpecDisplayColumns,
  services,
  showToastMessage,
  state,
  stopRunningQueryForReset,
  uiActions
} = {}, kind = 'original') {
  const isShared = kind === 'shared';
  const nextSpec = cloneSpec(isShared ? state.sharedBaselineSpec : state.initialSpec) || cloneSpec(state.spec);
  const nextSearchParamsSource = isShared ? state.sharedBaselineSearchParams : state.initialSearchParams;
  const nextSearchParams = new URLSearchParams(nextSearchParamsSource ? nextSearchParamsSource.toString() : '');

  if (!nextSpec) {
    return;
  }
  const { resultQueryId, resultViewParam } = getBaselineResultSearchParams(nextSearchParams);
  replaceBrowserResultParams({
    resultQueryId,
    resultViewParam,
    state,
    windowRef: window
  });
  state.searchParams = nextSearchParams;
  state.spec = nextSpec;
  sanitizeSpecDisplayColumns(state.spec);
  state.lastSuggestedTableName = '';
  state.suppressAutoTableNameOnce = false;
  state.forceTableNameSyncOnce = true;

  stopRunningQueryForReset({
    queryChangeManager,
    queryStateReaders,
    services,
    uiActions
  });
  rebuildFormCardFromSpec({
    preserveCurrentDefaults: false,
    applyState: true,
    refreshUrl: false,
    clearSearchParams: false,
    querySource: isShared ? 'QueryFormMode.resetToShared' : 'QueryFormMode.resetToOriginal'
  });
  await restoreBaselineResultsForReset({
    clearRenderedResults: () => clearRenderedQueryResults({
      queryTableView,
      services
    }),
    label: isShared ? 'last shared link' : 'original form',
    queryChangeManager,
    queryStateReaders,
    searchParams: nextSearchParams,
    services,
    showToastMessage,
    uiActions,
    uiState: buildResultViewFieldSearchUiState(dom)
  });
  refreshBrowserUrl({
    includeResult: Boolean(resultQueryId),
    preserveResult: false,
    resultQueryId,
    resultViewParam
  });
  const preservedBaselineSearchParams = new URLSearchParams(nextSearchParams.toString());
  if (isShared) {
    state.sharedBaselineSearchParams = preservedBaselineSearchParams;
  } else {
    state.initialSearchParams = preservedBaselineSearchParams;
  }
}

export { resetFormToBaselineAction };
