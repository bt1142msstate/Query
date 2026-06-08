import { formatDuration } from './formatting/dataFormatters.js';
import { showToastMessage } from './toast.js';

const DEFAULT_API_URL = 'https://mlp.sirsi.net/uhtbin/query_api.pl';
const API_URL = DEFAULT_API_URL;
const API_URL_STORAGE_KEY = 'query-project.api-url';
const API_URL_PARAM_NAMES = ['api_url', 'query_api_url'];
let lastRateLimitNoticeUntil = 0;
let runtimeApiUrl = resolveConfiguredApiUrl();

function buildTimeoutError(timeoutMs) {
  const timeoutSeconds = Math.max(1, Math.ceil(Number(timeoutMs || 0) / 1000));
  const error = new Error(`Backend request timed out after ${formatDuration(timeoutSeconds)}.`);
  error.name = 'BackendRequestTimeoutError';
  error.isTimeout = true;
  error.timeoutMs = timeoutMs;
  return error;
}

function getLocationHref() {
  return typeof globalThis.location?.href === 'string'
    ? globalThis.location.href
    : 'http://localhost/';
}

function normalizeApiUrl(value) {
  const rawValue = String(value || '').trim();
  if (!rawValue) {
    return '';
  }

  try {
    const parsed = new URL(rawValue, getLocationHref());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
      ? parsed.href
      : '';
  } catch (_error) {
    return '';
  }
}

function getStorage() {
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    return window.localStorage || null;
  }

  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const storage = descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value')
    ? descriptor.value
    : null;

  return storage?.__queryProjectStorageMock === true ? storage : null;
}

function readStoredApiUrl() {
  try {
    return getStorage()?.getItem?.(API_URL_STORAGE_KEY) || '';
  } catch (_error) {
    return '';
  }
}

function writeStoredApiUrl(url) {
  try {
    getStorage()?.setItem?.(API_URL_STORAGE_KEY, url);
  } catch (_error) {
    // Storage can be blocked in private browsing or embedded contexts.
  }
}

function clearStoredApiUrl() {
  try {
    getStorage()?.removeItem?.(API_URL_STORAGE_KEY);
  } catch (_error) {
    // Storage can be blocked in private browsing or embedded contexts.
  }
}

function getSearchParamApiUrl() {
  const search = typeof globalThis.location?.search === 'string'
    ? globalThis.location.search
    : '';
  if (!search) {
    return '';
  }

  const params = new URLSearchParams(search);
  for (const paramName of API_URL_PARAM_NAMES) {
    const configured = normalizeApiUrl(params.get(paramName));
    if (configured) {
      return configured;
    }
  }

  return '';
}

function resolveConfiguredApiUrl() {
  const fromSearch = getSearchParamApiUrl();
  if (fromSearch) {
    writeStoredApiUrl(fromSearch);
    return fromSearch;
  }

  return normalizeApiUrl(readStoredApiUrl()) || DEFAULT_API_URL;
}

function getApiUrl() {
  return runtimeApiUrl;
}

function configureApiUrl(url, options = {}) {
  const normalized = normalizeApiUrl(url);
  if (!normalized) {
    throw new Error('API URL must be an absolute or same-origin HTTP(S) URL.');
  }

  runtimeApiUrl = normalized;
  if (options.persist !== false) {
    writeStoredApiUrl(normalized);
  }
  return runtimeApiUrl;
}

function resetApiUrl(options = {}) {
  runtimeApiUrl = DEFAULT_API_URL;
  if (options.clearStorage !== false) {
    clearStoredApiUrl();
  }
  return runtimeApiUrl;
}

function getRetryAfterSeconds(payload) {
  const rawValue = payload?.retry_after_seconds ?? payload?.retry_after ?? 0;
  const numericValue = Number(rawValue);
  return Number.isFinite(numericValue) && numericValue > 0 ? Math.ceil(numericValue) : 0;
}

function formatRetryDelay(seconds) {
  const safeSeconds = Number.isFinite(Number(seconds)) ? Math.max(0, Math.ceil(Number(seconds))) : 0;
  return formatDuration(safeSeconds);
}

function buildRateLimitMessage(payload = {}) {
  const retryAfterSeconds = getRetryAfterSeconds(payload);
  const waitMessage = retryAfterSeconds > 0
    ? `Try again in ${formatRetryDelay(retryAfterSeconds)}.`
    : 'Try again shortly.';
  return `${payload.error || 'Too many requests from this IP.'} ${waitMessage}`;
}

async function parseJsonResponse(response) {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch (_) {
    return { error: text };
  }
}

async function assertNotRateLimited(response, options = {}) {
  if (!response || response.status !== 429) {
    return response;
  }

  const payload = await parseJsonResponse(response);
  const retryAfterSeconds = getRetryAfterSeconds(payload);
  const noticeUntil = Date.now() + (retryAfterSeconds * 1000);
  const message = buildRateLimitMessage(payload);

  if (options.notify !== false) {
    if (!lastRateLimitNoticeUntil || Date.now() >= (lastRateLimitNoticeUntil - 1000)) {
      showToastMessage(message, 'warning', Math.max(4000, Math.min(retryAfterSeconds * 1000, 15000) || 8000));
      lastRateLimitNoticeUntil = noticeUntil || (Date.now() + 8000);
    }
  }

  const error = new Error(message);
  error.name = 'RateLimitError';
  error.isRateLimited = true;
  error.retryAfterSeconds = retryAfterSeconds;
  error.payload = payload;
  throw error;
}

async function request(payload, options = {}) {
  const {
    method = 'POST',
    headers = {},
    keepalive = false,
    notifyOnRateLimit = true,
    timeoutMs = 0
  } = options;

  const timeoutValue = Number(timeoutMs);
  const shouldTimeout = Number.isFinite(timeoutValue)
    && timeoutValue > 0
    && typeof AbortController !== 'undefined';
  const controller = shouldTimeout ? new AbortController() : null;
  const timeoutId = controller
    ? setTimeout(() => controller.abort(), timeoutValue)
    : null;

  let response;
  try {
    response = await fetch(getApiUrl(), {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
      keepalive,
      body: JSON.stringify(payload),
      ...(controller ? { signal: controller.signal } : {})
    });
  } catch (error) {
    if (controller?.signal?.aborted) {
      throw buildTimeoutError(timeoutValue);
    }
    throw error;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }

  await assertNotRateLimited(response, { notify: notifyOnRateLimit });
  return response;
}

function buildHttpError(response, payload = {}) {
  const message = payload?.error || `Server error: ${response.status} ${response.statusText}`;
  const error = new Error(message);
  error.name = 'BackendApiError';
  error.status = response.status;
  error.payload = payload;
  return error;
}

async function postJson(payload, options = {}) {
  const response = await request(payload, options);
  const data = await parseJsonResponse(response);

  if (!response.ok) {
    throw buildHttpError(response, data);
  }

  return {
    response,
    data
  };
}

async function postText(payload, options = {}) {
  const {
    jsonErrorMessage = 'Results are not available yet.'
  } = options;

  const response = await request(payload, options);
  const contentType = response.headers.get('Content-Type') || '';

  if (contentType.includes('application/json')) {
    const data = await parseJsonResponse(response);
    throw buildHttpError(response, {
      ...data,
      error: data?.error || jsonErrorMessage
    });
  }

  if (!response.ok) {
    const text = await response.text();
    throw buildHttpError(response, { error: text });
  }

  const text = await response.text();
  return {
    response,
    text
  };
}

const backendApi = Object.freeze({
  API_URL,
  API_URL_PARAM_NAMES,
  API_URL_STORAGE_KEY,
  DEFAULT_API_URL,
  assertNotRateLimited,
  buildHttpError,
  buildRateLimitMessage,
  configureApiUrl,
  formatRetryDelay,
  getApiUrl,
  parseJsonResponse,
  postJson,
  postText,
  request,
  resetApiUrl,
  resolveConfiguredApiUrl
});

export {
  API_URL,
  API_URL_PARAM_NAMES,
  API_URL_STORAGE_KEY,
  DEFAULT_API_URL,
  assertNotRateLimited,
  backendApi as BackendApi,
  buildHttpError,
  buildRateLimitMessage,
  configureApiUrl,
  formatRetryDelay,
  getApiUrl,
  normalizeApiUrl,
  parseJsonResponse,
  postJson,
  postText,
  request,
  resetApiUrl,
  resolveConfiguredApiUrl
};
