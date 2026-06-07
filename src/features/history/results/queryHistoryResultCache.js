const HISTORY_RESULT_CACHE_DB_NAME = 'query-history-result-cache';
const HISTORY_RESULT_CACHE_STORE_NAME = 'resultSnapshots';
const HISTORY_RESULT_CACHE_DB_VERSION = 1;
const HISTORY_RESULT_CACHE_SCHEMA_VERSION = 1;

function getIndexedDB(dbFactory) {
  if (dbFactory) {
    return dbFactory;
  }

  try {
    return globalThis.indexedDB || null;
  } catch {
    return null;
  }
}

function normalizeQueryId(queryId) {
  return String(queryId || '').trim();
}

function normalizeHeaders(headers) {
  return Array.isArray(headers)
    ? headers.map(header => String(header || '').trim()).filter(Boolean)
    : [];
}

function normalizeCellValue(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  return JSON.stringify(value);
}

function buildTableRowsFromObjectRows(headers, objectRows) {
  const rows = Array.isArray(objectRows) ? objectRows : [];
  return rows.map(row => headers.map(header => normalizeCellValue(row?.[header])));
}

function normalizeTableRows(headers, rows, objectRows) {
  const sourceRows = Array.isArray(rows) ? rows : buildTableRowsFromObjectRows(headers, objectRows);
  return sourceRows.map(row => {
    const cells = Array.isArray(row) ? row : [];
    return headers.map((_, index) => normalizeCellValue(cells[index]));
  });
}

function serializeQueryForCache(query, queryId, rowCount) {
  const source = query && typeof query === 'object' ? query : {};
  const normalizedQueryId = normalizeQueryId(queryId || source.id);
  return {
    id: normalizedQueryId,
    name: source.name || (normalizedQueryId ? `Query ${normalizedQueryId}` : 'Cached query'),
    query: source.query || null,
    jsonConfig: source.jsonConfig || source.request?.ui_config || source.ui_config || null,
    startTime: source.startTime || source.start_time || null,
    endTime: source.endTime || source.end_time || null,
    status: source.status || 'complete',
    running: false,
    failed: Boolean(source.failed),
    cancelled: Boolean(source.cancelled),
    error: source.error || null,
    errorDetails: source.errorDetails || null,
    resultCount: Number.isFinite(Number(source.resultCount))
      ? Number(source.resultCount)
      : rowCount
  };
}

function normalizeCachedHistoryResultSnapshot(snapshot = {}) {
  const queryId = normalizeQueryId(snapshot.queryId || snapshot.query?.id);
  const headers = normalizeHeaders(snapshot.headers);
  const rows = normalizeTableRows(headers, snapshot.rows, snapshot.objectRows);

  if (!queryId || !headers.length) {
    return null;
  }

  return {
    queryId,
    savedAt: Number(snapshot.savedAt) || Date.now(),
    version: HISTORY_RESULT_CACHE_SCHEMA_VERSION,
    query: serializeQueryForCache(snapshot.query, queryId, rows.length),
    headers,
    rows,
    rowCount: rows.length
  };
}

function isUsableCachedHistoryResultSnapshot(snapshot, queryId = '') {
  const normalizedQueryId = normalizeQueryId(queryId || snapshot?.queryId);
  return Boolean(
    snapshot
    && snapshot.version === HISTORY_RESULT_CACHE_SCHEMA_VERSION
    && normalizeQueryId(snapshot.queryId) === normalizedQueryId
    && Array.isArray(snapshot.headers)
    && snapshot.headers.length
    && Array.isArray(snapshot.rows)
  );
}

function openHistoryResultCacheDatabase(options = {}) {
  const indexedDB = getIndexedDB(options.dbFactory);
  if (!indexedDB) {
    return Promise.resolve(null);
  }

  return new Promise(resolve => {
    const request = indexedDB.open(HISTORY_RESULT_CACHE_DB_NAME, HISTORY_RESULT_CACHE_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(HISTORY_RESULT_CACHE_STORE_NAME)) {
        db.createObjectStore(HISTORY_RESULT_CACHE_STORE_NAME, { keyPath: 'queryId' });
      }
    };
    request.onerror = () => resolve(null);
    request.onsuccess = () => resolve(request.result);
  });
}

async function writeCachedHistoryResultSnapshot(snapshot, options = {}) {
  const normalizedSnapshot = normalizeCachedHistoryResultSnapshot(snapshot);
  if (!normalizedSnapshot) {
    return false;
  }

  const db = await openHistoryResultCacheDatabase(options);
  if (!db) {
    return false;
  }

  return new Promise(resolve => {
    const transaction = db.transaction(HISTORY_RESULT_CACHE_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(HISTORY_RESULT_CACHE_STORE_NAME);

    transaction.oncomplete = () => {
      db.close();
      resolve(true);
    };
    transaction.onerror = () => {
      db.close();
      resolve(false);
    };
    transaction.onabort = () => {
      db.close();
      resolve(false);
    };

    store.clear();
    store.put(normalizedSnapshot);
  });
}

async function readCachedHistoryResultSnapshot(queryId, options = {}) {
  const normalizedQueryId = normalizeQueryId(queryId);
  if (!normalizedQueryId) {
    return null;
  }

  const db = await openHistoryResultCacheDatabase(options);
  if (!db) {
    return null;
  }

  return new Promise(resolve => {
    const transaction = db.transaction(HISTORY_RESULT_CACHE_STORE_NAME, 'readonly');
    const store = transaction.objectStore(HISTORY_RESULT_CACHE_STORE_NAME);
    const request = store.get(normalizedQueryId);

    request.onsuccess = () => {
      db.close();
      const snapshot = request.result || null;
      resolve(isUsableCachedHistoryResultSnapshot(snapshot, normalizedQueryId) ? snapshot : null);
    };
    request.onerror = () => {
      db.close();
      resolve(null);
    };
  });
}

async function clearCachedHistoryResultSnapshots(options = {}) {
  const db = await openHistoryResultCacheDatabase(options);
  if (!db) {
    return false;
  }

  return new Promise(resolve => {
    const transaction = db.transaction(HISTORY_RESULT_CACHE_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(HISTORY_RESULT_CACHE_STORE_NAME);

    transaction.oncomplete = () => {
      db.close();
      resolve(true);
    };
    transaction.onerror = () => {
      db.close();
      resolve(false);
    };
    transaction.onabort = () => {
      db.close();
      resolve(false);
    };

    store.clear();
  });
}

export {
  HISTORY_RESULT_CACHE_DB_NAME,
  HISTORY_RESULT_CACHE_SCHEMA_VERSION,
  HISTORY_RESULT_CACHE_STORE_NAME,
  buildTableRowsFromObjectRows,
  clearCachedHistoryResultSnapshots,
  isUsableCachedHistoryResultSnapshot,
  normalizeCachedHistoryResultSnapshot,
  normalizeTableRows,
  readCachedHistoryResultSnapshot,
  writeCachedHistoryResultSnapshot
};
