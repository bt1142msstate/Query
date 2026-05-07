import { formatDuration } from './dataFormatters.js';
import { showToastMessage } from './toast.js';
import { appRuntime } from './appRuntime.js';

const API_URL = 'https://mlp.sirsi.net/uhtbin/query_api.pl';
let lastRateLimitNoticeUntil = 0;

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
    notifyOnRateLimit = true
  } = options;

  const response = await fetch(API_URL, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers
    },
    keepalive,
    body: JSON.stringify(payload)
  });

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
  assertNotRateLimited,
  buildHttpError,
  buildRateLimitMessage,
  formatRetryDelay,
  parseJsonResponse,
  postJson,
  postText,
  request
});

if (typeof window !== 'undefined') {
  Object.defineProperty(appRuntime, 'BackendApi', {
    configurable: false,
    enumerable: true,
    value: backendApi,
    writable: false
  });
}

export {
  API_URL,
  assertNotRateLimited,
  backendApi as BackendApi,
  buildHttpError,
  buildRateLimitMessage,
  formatRetryDelay,
  parseJsonResponse,
  postJson,
  postText,
  request
};
