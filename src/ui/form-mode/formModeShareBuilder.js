import {
  buildCurrentResultViewState,
  encodeResultViewState
} from '../../core/resultViewState.js';
import { buildFormShareUrl } from './formModeShareUrl.js';

function buildCurrentShareUrl({
  fieldDefs,
  getCurrentInputValues,
  getCurrentShareResultQueryId,
  getCurrentTableNameValue,
  getFieldSearch,
  queryStateReaders,
  services,
  state,
  supportsMultipleValues
} = {}, options = {}) {
  const resultQueryId = typeof getCurrentShareResultQueryId === 'function'
    ? getCurrentShareResultQueryId(options)
    : '';
  const resultViewParam = resultQueryId
    ? encodeResultViewState(buildCurrentResultViewState({
        queryStateReaders,
        services,
        uiState: {
          getFieldSearch: () => (typeof getFieldSearch === 'function' ? getFieldSearch() : '')
        }
      }))
    : '';

  return buildFormShareUrl(window.location.href, state?.spec, {
    fieldDefs,
    getInputValues: getCurrentInputValues,
    resultQueryId,
    resultViewParam,
    supportsMultipleValues,
    tableName: typeof getCurrentTableNameValue === 'function' ? getCurrentTableNameValue() : '',
    ...options
  });
}

function saveCurrentFormAsSharedBaseline({
  buildShareUrl,
  captureCurrentControlDefaults,
  cloneSpec,
  sanitizeSpecDisplayColumns,
  state
} = {}, options = {}) {
  if (!state?.active || !state.spec) {
    return false;
  }

  captureCurrentControlDefaults?.();
  sanitizeSpecDisplayColumns?.(state.spec);
  const nextSpec = cloneSpec?.(state.spec);
  if (!nextSpec) {
    return false;
  }

  state.sharedBaselineSpec = nextSpec;
  const shareUrl = buildShareUrl?.({ includeResult: options.includeResult !== false });
  state.sharedBaselineSearchParams = shareUrl
    ? new URL(shareUrl).searchParams
    : new URLSearchParams();
  return true;
}

export {
  buildCurrentShareUrl,
  saveCurrentFormAsSharedBaseline
};
