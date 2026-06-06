import { RESULT_QUERY_URL_PARAM } from '../../core/queryResultUrl.js';

const OPENED_HISTORY_RESULT_STORAGE_KEY = 'query:lastOpenedHistoryResult';
const OPENED_HISTORY_RESULT_URL_PARAM = RESULT_QUERY_URL_PARAM;
const OPENED_HISTORY_RESULT_STORAGE_VERSION = 1;

function getStorage(storage) {
  if (storage) {
    return storage;
  }

  try {
    return globalThis.window?.localStorage || globalThis.localStorage || null;
  } catch {
    return null;
  }
}

function normalizeQueryId(queryId) {
  return String(queryId || '').trim();
}

function getLocationSearch(locationLike) {
  return String(locationLike?.search || '');
}

function readOpenedHistoryResultQueryIdFromUrl(locationLike = globalThis.location) {
  try {
    return normalizeQueryId(new URLSearchParams(getLocationSearch(locationLike)).get(OPENED_HISTORY_RESULT_URL_PARAM));
  } catch {
    return '';
  }
}

function syncOpenedHistoryResultUrl(queryId, options = {}) {
  if (options.updateUrl !== true && options.clearUrl !== true) {
    return false;
  }

  try {
    const historyRef = options.history || globalThis.window?.history || globalThis.history;
    const currentUrl = options.url || globalThis.window?.location?.href || globalThis.location?.href;
    if (!historyRef || !currentUrl) {
      return false;
    }

    const url = new URL(currentUrl);
    const normalizedQueryId = normalizeQueryId(queryId);
    if (normalizedQueryId && options.clearUrl !== true) {
      url.searchParams.set(OPENED_HISTORY_RESULT_URL_PARAM, normalizedQueryId);
    } else {
      url.searchParams.delete(OPENED_HISTORY_RESULT_URL_PARAM);
    }

    const nextUrl = url.toString();
    if (nextUrl !== currentUrl) {
      historyRef.replaceState({}, '', nextUrl);
    }
    return true;
  } catch {
    return false;
  }
}

function rememberOpenedHistoryResult(queryId, options = {}) {
  const normalizedQueryId = normalizeQueryId(queryId);
  const storage = getStorage(options.storage);
  if (!normalizedQueryId) {
    return false;
  }

  if (storage) {
    storage.setItem(OPENED_HISTORY_RESULT_STORAGE_KEY, JSON.stringify({
      queryId: normalizedQueryId,
      savedAt: Date.now(),
      version: OPENED_HISTORY_RESULT_STORAGE_VERSION
    }));
  }
  syncOpenedHistoryResultUrl(normalizedQueryId, options);
  return Boolean(storage || options.updateUrl === true);
}

function forgetOpenedHistoryResult(options = {}) {
  const storage = getStorage(options.storage);
  if (storage) {
    storage.removeItem(OPENED_HISTORY_RESULT_STORAGE_KEY);
  }

  syncOpenedHistoryResultUrl('', { ...options, clearUrl: options.clearUrl === true });
  return Boolean(storage || options.clearUrl === true);
}

function readOpenedHistoryResult(options = {}) {
  const urlQueryId = readOpenedHistoryResultQueryIdFromUrl(options.location);
  if (urlQueryId) {
    return {
      queryId: urlQueryId,
      savedAt: 0,
      source: 'url',
      version: OPENED_HISTORY_RESULT_STORAGE_VERSION
    };
  }

  const storage = getStorage(options.storage);
  if (!storage) {
    return null;
  }

  let parsed = null;
  try {
    parsed = JSON.parse(storage.getItem(OPENED_HISTORY_RESULT_STORAGE_KEY) || 'null');
  } catch {
    forgetOpenedHistoryResult({ storage });
    return null;
  }

  const queryId = normalizeQueryId(parsed?.queryId);
  if (!queryId) {
    return null;
  }

  return {
    queryId,
    savedAt: Number(parsed.savedAt) || 0,
    version: Number(parsed.version) || 0
  };
}

function hasSharedFormUrl(locationLike = globalThis.location) {
  try {
    return new URLSearchParams(getLocationSearch(locationLike)).has('form');
  } catch {
    return false;
  }
}

function parseBooleanFlag(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  return normalized === ''
    || normalized === '1'
    || normalized === 'true'
    || normalized === 'yes'
    || normalized === 'limited';
}

function hasLimitedSharedFormUrl(locationLike = globalThis.location) {
  try {
    const searchParams = new URLSearchParams(getLocationSearch(locationLike));
    if (!searchParams.has('form')) {
      return false;
    }

    if (searchParams.has('limited')) {
      return parseBooleanFlag(searchParams.get('limited'));
    }

    if (searchParams.has('limitedView')) {
      return parseBooleanFlag(searchParams.get('limitedView'));
    }

    return String(searchParams.get('view') || searchParams.get('mode') || '').trim().toLowerCase() === 'limited';
  } catch {
    return false;
  }
}

function shouldRestoreOpenedHistoryResult(options = {}) {
  if (readOpenedHistoryResultQueryIdFromUrl(options.location)) {
    return true;
  }

  return !hasLimitedSharedFormUrl(options.location) && Boolean(readOpenedHistoryResult(options));
}

export {
  OPENED_HISTORY_RESULT_STORAGE_KEY,
  OPENED_HISTORY_RESULT_URL_PARAM,
  forgetOpenedHistoryResult,
  hasLimitedSharedFormUrl,
  hasSharedFormUrl,
  readOpenedHistoryResultQueryIdFromUrl,
  readOpenedHistoryResult,
  rememberOpenedHistoryResult,
  shouldRestoreOpenedHistoryResult
};
