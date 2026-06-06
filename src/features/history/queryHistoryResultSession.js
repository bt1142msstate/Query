const OPENED_HISTORY_RESULT_STORAGE_KEY = 'query:lastOpenedHistoryResult';
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

function rememberOpenedHistoryResult(queryId, options = {}) {
  const normalizedQueryId = normalizeQueryId(queryId);
  const storage = getStorage(options.storage);
  if (!normalizedQueryId || !storage) {
    return false;
  }

  storage.setItem(OPENED_HISTORY_RESULT_STORAGE_KEY, JSON.stringify({
    queryId: normalizedQueryId,
    savedAt: Date.now(),
    version: OPENED_HISTORY_RESULT_STORAGE_VERSION
  }));
  return true;
}

function forgetOpenedHistoryResult(options = {}) {
  const storage = getStorage(options.storage);
  if (!storage) {
    return false;
  }

  storage.removeItem(OPENED_HISTORY_RESULT_STORAGE_KEY);
  return true;
}

function readOpenedHistoryResult(options = {}) {
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
    return new URLSearchParams(locationLike?.search || '').has('form');
  } catch {
    return false;
  }
}

function shouldRestoreOpenedHistoryResult(options = {}) {
  return !hasSharedFormUrl(options.location) && Boolean(readOpenedHistoryResult(options));
}

export {
  OPENED_HISTORY_RESULT_STORAGE_KEY,
  forgetOpenedHistoryResult,
  hasSharedFormUrl,
  readOpenedHistoryResult,
  rememberOpenedHistoryResult,
  shouldRestoreOpenedHistoryResult
};
