const RESULT_VIEW_STATE_VERSION = 1;
const RESULT_VIEW_URL_PARAM = 'resultView';

function normalizeStringList(values) {
  return (Array.isArray(values) ? values : [])
    .map(value => String(value || '').trim())
    .filter(Boolean);
}

function normalizePostFilterEntry(filter) {
  if (!filter || typeof filter !== 'object') {
    return null;
  }

  const cond = String(filter.cond || '').trim();
  const val = String(filter.val || '');
  const vals = Array.isArray(filter.vals)
    ? filter.vals.map(value => String(value || '')).filter(value => value !== '')
    : [];

  if (!cond && !val && vals.length === 0) {
    return null;
  }

  const entry = { cond, val };
  if (vals.length) {
    entry.vals = vals;
  }
  return entry;
}

function normalizePostFilterSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') {
    return {};
  }

  return Object.fromEntries(
    Object.entries(snapshot)
      .map(([field, data]) => {
        const normalizedField = String(field || '').trim();
        const filters = (Array.isArray(data?.filters) ? data.filters : [])
          .map(normalizePostFilterEntry)
          .filter(Boolean);
        if (!normalizedField || !filters.length) {
          return null;
        }

        return [
          normalizedField,
          {
            logic: String(data?.logic || '').trim().toLowerCase() === 'any' ? 'any' : 'all',
            filters
          }
        ];
      })
      .filter(Boolean)
  );
}

function normalizeResultViewState(viewState = {}) {
  const source = viewState && typeof viewState === 'object' ? viewState : {};
  const displayedFields = normalizeStringList(source.displayedFields);
  const fieldSearch = String(source.fieldSearch || '').trim();
  const postFilters = normalizePostFilterSnapshot(source.postFilters);
  const splitColumns = typeof source.splitColumns === 'boolean'
    ? source.splitColumns
    : undefined;
  const collapseDuplicateRows = typeof source.collapseDuplicateRows === 'boolean'
    ? source.collapseDuplicateRows
    : undefined;
  const normalized = { version: RESULT_VIEW_STATE_VERSION };

  if (displayedFields.length) {
    normalized.displayedFields = displayedFields;
  }
  if (fieldSearch) {
    normalized.fieldSearch = fieldSearch;
  }
  if (Object.keys(postFilters).length) {
    normalized.postFilters = postFilters;
  }
  if (typeof splitColumns === 'boolean') {
    normalized.splitColumns = splitColumns;
  }
  if (typeof collapseDuplicateRows === 'boolean') {
    normalized.collapseDuplicateRows = collapseDuplicateRows;
  }

  return normalized;
}

function hasResultViewStatePayload(viewState) {
  const normalized = normalizeResultViewState(viewState);
  return Boolean(
    normalized.displayedFields?.length
    || normalized.fieldSearch
    || Object.keys(normalized.postFilters || {}).length
    || typeof normalized.splitColumns === 'boolean'
    || typeof normalized.collapseDuplicateRows === 'boolean'
  );
}

function buildCurrentResultViewState({ queryStateReaders, services, uiState } = {}) {
  return normalizeResultViewState({
    displayedFields: queryStateReaders?.getDisplayedFields?.() || [],
    fieldSearch: uiState?.getFieldSearch?.() || '',
    postFilters: services?.getPostFilterState?.() || {},
    splitColumns: Boolean(services?.isSplitColumnsActive?.()),
    collapseDuplicateRows: services?.isDuplicateRowCollapseActive?.() !== false
  });
}

function encodeBase64UrlJson(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = '';
  bytes.forEach(byte => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/gu, '');
}

function decodeBase64UrlJson(rawValue) {
  const normalized = String(rawValue || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

function encodeResultViewState(viewState) {
  const normalized = normalizeResultViewState(viewState);
  return hasResultViewStatePayload(normalized) ? encodeBase64UrlJson(normalized) : '';
}

function decodeResultViewStateParam(rawValue) {
  const value = String(rawValue || '').trim();
  if (!value) {
    return null;
  }

  try {
    return normalizeResultViewState(decodeBase64UrlJson(value));
  } catch {
    return null;
  }
}

function readResultViewStateFromLocation(locationLike = globalThis.location, options = {}) {
  try {
    const rawLocation = typeof locationLike === 'string' ? locationLike : '';
    const search = rawLocation
      ? (rawLocation.startsWith('?') ? rawLocation : new URL(rawLocation, 'https://query.local/').search)
      : String(locationLike?.search || '');
    const searchParams = new URLSearchParams(search);
    const expectedQueryId = String(options.queryId || '').trim();
    if (expectedQueryId && String(searchParams.get('result') || '').trim() !== expectedQueryId) {
      return null;
    }
    return decodeResultViewStateParam(searchParams.get(RESULT_VIEW_URL_PARAM));
  } catch {
    return null;
  }
}

function applyResultViewState(viewState, options = {}) {
  const normalized = normalizeResultViewState(viewState);
  const hasPayload = hasResultViewStatePayload(viewState);
  const {
    queryChangeManager,
    services,
    uiState,
    uiActions
  } = options;

  if (typeof normalized.splitColumns === 'boolean') {
    if (normalized.splitColumns) {
      uiActions?.setSplitColumnsToggleUIActive?.();
    } else {
      uiActions?.resetSplitColumnsToggleUI?.();
    }
    if (services?.isSplitColumnsActive?.() !== normalized.splitColumns) {
      services?.setSplitColumnsMode?.(normalized.splitColumns);
    }
  }

  if (typeof normalized.collapseDuplicateRows === 'boolean') {
    if (normalized.collapseDuplicateRows) {
      uiActions?.setDuplicateRowsToggleUIActive?.();
    } else {
      uiActions?.resetDuplicateRowsToggleUI?.();
    }
    if (services?.isDuplicateRowCollapseActive?.() !== normalized.collapseDuplicateRows) {
      services?.setDuplicateRowCollapseMode?.(normalized.collapseDuplicateRows, { resetScroll: false });
    }
  }

  if (normalized.displayedFields?.length) {
    queryChangeManager?.replaceDisplayedFields?.(normalized.displayedFields, {
      source: 'ResultViewState.restoreDisplayedFields'
    });
  }

  if (normalized.fieldSearch || Object.prototype.hasOwnProperty.call(viewState || {}, 'fieldSearch')) {
    uiState?.setFieldSearch?.(normalized.fieldSearch || '');
  }

  if (hasPayload || Object.prototype.hasOwnProperty.call(viewState || {}, 'postFilters')) {
    services?.replacePostFilters?.(normalized.postFilters || {}, {
      refreshView: false,
      notify: true,
      resetScroll: false
    });
  }

  return normalized;
}

export {
  RESULT_VIEW_STATE_VERSION,
  RESULT_VIEW_URL_PARAM,
  applyResultViewState,
  buildCurrentResultViewState,
  decodeResultViewStateParam,
  encodeResultViewState,
  hasResultViewStatePayload,
  normalizePostFilterSnapshot,
  normalizeResultViewState,
  readResultViewStateFromLocation
};
