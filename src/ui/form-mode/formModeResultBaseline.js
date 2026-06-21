function syncFormModeResultBaseline({
  buildCurrentResultSearchParams,
  getBaselineResultSearchParams,
  mergeBaselineResultSearchParams,
  state
} = {}, options = {}) {
  if (!state?.active) {
    return false;
  }

  const baselineKey = options.shared === true ? 'sharedBaselineSearchParams' : 'initialSearchParams';
  const existingBaseline = state[baselineKey] instanceof URLSearchParams
    ? state[baselineKey]
    : new URLSearchParams();
  const currentBaselineResult = getBaselineResultSearchParams(existingBaseline);
  const currentResultParams = buildCurrentResultSearchParams(options);
  const nextBaselineResult = getBaselineResultSearchParams(currentResultParams);

  if (!nextBaselineResult.resultQueryId) {
    return false;
  }

  if (
    options.force !== true
    && currentBaselineResult.resultQueryId
    && currentBaselineResult.resultQueryId !== nextBaselineResult.resultQueryId
  ) {
    return false;
  }

  if (
    options.force !== true
    && currentBaselineResult.resultQueryId
    && currentBaselineResult.resultViewParam
  ) {
    return false;
  }

  state[baselineKey] = mergeBaselineResultSearchParams(existingBaseline, currentResultParams);
  return true;
}

export { syncFormModeResultBaseline };
