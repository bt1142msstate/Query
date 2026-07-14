import {
  API_URL_PARAM_NAMES,
  DEFAULT_API_URL,
  configureApiUrl,
  getApiUrl,
  normalizeApiUrl,
  resetApiUrl
} from '../core/backendApi.js';
import { isDemoApiUrl, queryFetch } from '../core/mockQueryBackend.js';
import { ClipboardUtils } from '../core/clipboard.js';
import { showToastMessage } from '../core/toast.js';
import { runApiCompatibilityCheck, summarizeCompatibilityChecks } from './apiCompatibility.js';

const DEFAULT_TEST_TIMEOUT_MS = 10000;
let initialized = false;
let pendingReloadHref = '';

function createApiSettingsAsyncGuard() {
  let version = 0;

  return Object.freeze({
    invalidate() {
      version += 1;
      return version;
    },
    isCurrent(token) {
      return token === version;
    },
    next() {
      version += 1;
      return version;
    }
  });
}

const asyncActionGuard = createApiSettingsAsyncGuard();

function invalidateAsyncActions(options = {}) {
  asyncActionGuard.invalidate();
  if (options.releaseButtons === false) {
    return;
  }

  const { compatibilityButton, testButton } = getElements();
  setBusy(compatibilityButton, false);
  setBusy(testButton, false);
}

function normalizeApiUrlForHref(value, currentHref) {
  const rawValue = String(value || '').trim();
  if (!rawValue) {
    return '';
  }

  try {
    const parsed = new URL(rawValue, currentHref);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
      ? parsed.href
      : '';
  } catch (_error) {
    return '';
  }
}

function buildPageUrlWithoutApiParams(currentHref, paramNames = API_URL_PARAM_NAMES) {
  const url = new URL(currentHref);
  paramNames.forEach(paramName => url.searchParams.delete(paramName));
  return url.href;
}

function buildApiLaunchUrl(currentHref, apiUrl, paramNames = API_URL_PARAM_NAMES) {
  const normalizedApiUrl = normalizeApiUrlForHref(apiUrl, currentHref);
  if (!normalizedApiUrl) {
    return buildPageUrlWithoutApiParams(currentHref, paramNames);
  }

  const url = new URL(buildPageUrlWithoutApiParams(currentHref, paramNames));
  url.searchParams.set(paramNames[0] || 'api_url', normalizedApiUrl);
  return url.href;
}

function getApiConnectionMode(apiUrl, defaultApiUrl = DEFAULT_API_URL, currentHref = globalThis.location?.href || 'http://localhost/') {
  const normalizedApiUrl = normalizeApiUrlForHref(apiUrl, currentHref);
  const normalizedDefaultUrl = normalizeApiUrlForHref(defaultApiUrl, currentHref);
  const isDefault = Boolean(normalizedApiUrl && normalizedApiUrl === normalizedDefaultUrl);

  return {
    isDefault,
    label: isDefault
      ? (isDemoApiUrl(normalizedApiUrl) ? 'Sample data demo' : 'Default endpoint')
      : 'Custom endpoint'
  };
}

function getElements() {
  return {
    copyLinkButton: document.getElementById('api-settings-copy-link-btn'),
    currentUrl: document.getElementById('api-settings-current-url'),
    defaultUrl: document.getElementById('api-settings-default-url'),
    input: document.getElementById('api-settings-url-input'),
    launchUrl: document.getElementById('api-settings-launch-url'),
    mode: document.getElementById('api-settings-mode'),
    compatibilityButton: document.getElementById('api-settings-compatibility-btn'),
    compatibilityResults: document.getElementById('api-compatibility-results'),
    compatibilitySummary: document.getElementById('api-compatibility-summary'),
    reloadButton: document.getElementById('api-settings-reload-btn'),
    resetButton: document.getElementById('api-settings-reset-btn'),
    saveButton: document.getElementById('api-settings-save-btn'),
    status: document.getElementById('api-settings-status'),
    testButton: document.getElementById('api-settings-test-btn')
  };
}

function setStatus(message, tone = 'info') {
  const { status } = getElements();
  if (!status) {
    return;
  }

  status.textContent = message || '';
  if (message) {
    status.dataset.tone = tone;
  } else {
    status.removeAttribute('data-tone');
  }
}

function setBusy(button, busy) {
  if (!button) {
    return;
  }

  button.disabled = Boolean(busy);
  button.setAttribute('aria-busy', busy ? 'true' : 'false');
}

function getInputApiUrl() {
  const { input } = getElements();
  const rawValue = String(input?.value || '').trim();
  if (!rawValue) {
    return getApiUrl();
  }

  return normalizeApiUrl(rawValue);
}

function updateLaunchUrl() {
  const { input, launchUrl } = getElements();
  if (!launchUrl) {
    return '';
  }

  const apiUrl = normalizeApiUrl(input?.value || '') || getApiUrl();
  const href = buildApiLaunchUrl(globalThis.location?.href || 'http://localhost/', apiUrl);
  launchUrl.textContent = href;
  return href;
}

function showReloadPrompt(href) {
  const { reloadButton } = getElements();
  pendingReloadHref = href || globalThis.location?.href || '';
  if (reloadButton) {
    reloadButton.classList.remove('hidden');
  }
}

function sync() {
  const {
    currentUrl,
    defaultUrl,
    input,
    launchUrl,
    mode,
    reloadButton
  } = getElements();
  const apiUrl = getApiUrl();
  const connectionMode = getApiConnectionMode(apiUrl);

  if (input) {
    input.value = apiUrl;
  }
  if (currentUrl) {
    currentUrl.textContent = apiUrl;
  }
  if (defaultUrl) {
    defaultUrl.textContent = DEFAULT_API_URL;
  }
  if (mode) {
    mode.textContent = connectionMode.label;
  }
  if (launchUrl) {
    launchUrl.textContent = buildApiLaunchUrl(globalThis.location?.href || 'http://localhost/', apiUrl);
  }
  if (reloadButton && !pendingReloadHref) {
    reloadButton.classList.add('hidden');
  }
}

async function postJsonToApiUrl(apiUrl, payload, options = {}) {
  const timeoutMs = Number(options.timeoutMs) || DEFAULT_TEST_TIMEOUT_MS;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await queryFetch(apiUrl, {
      body: JSON.stringify(payload),
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json'
      },
      method: 'POST',
      signal: controller.signal
    });
    const text = await response.text();
    let data = {};

    if (text) {
      try {
        data = JSON.parse(text);
      } catch (_error) {
        data = { error: text };
      }
    }

    if (!response.ok) {
      throw new Error(data?.error || `Server error: ${response.status} ${response.statusText}`);
    }

    return { data, response };
  } finally {
    clearTimeout(timeoutId);
  }
}

function extractFields(data) {
  if (Array.isArray(data)) {
    return data;
  }

  if (Array.isArray(data?.fields)) {
    return data.fields;
  }

  return [];
}

function getConnectionErrorMessage(error) {
  if (error?.name === 'AbortError') {
    return 'Connection test timed out.';
  }

  return error?.message || 'Connection test failed.';
}

function getCompatibilityStatusLabel(status) {
  switch (status) {
    case 'supported':
      return 'Supported';
    case 'warning':
      return 'Check';
    case 'missing':
      return 'Missing';
    case 'failed':
      return 'Failed';
    default:
      return 'Unknown';
  }
}

function createCompatibilityRow(check) {
  const item = document.createElement('li');
  item.className = 'api-compatibility-row';
  item.dataset.status = check.status || 'unknown';
  item.dataset.checkId = check.id || '';

  const copy = document.createElement('span');
  copy.className = 'api-compatibility-row-copy';

  const label = document.createElement('strong');
  label.textContent = check.label || 'Compatibility check';
  copy.appendChild(label);

  const detail = document.createElement('span');
  detail.textContent = check.detail || '';
  copy.appendChild(detail);

  const badge = document.createElement('span');
  badge.className = 'api-compatibility-badge';
  badge.textContent = getCompatibilityStatusLabel(check.status);
  item.append(copy, badge);

  return item;
}

function renderCompatibilityReport(report) {
  const { compatibilityResults, compatibilitySummary } = getElements();
  if (!compatibilityResults || !compatibilitySummary) {
    return;
  }

  const checks = Array.isArray(report?.checks) ? report.checks : [];
  const summary = report?.summary || summarizeCompatibilityChecks(checks);

  compatibilitySummary.dataset.status = summary.worstStatus || 'supported';
  compatibilitySummary.textContent = checks.length
    ? `${summary.supported || 0} supported, ${summary.warning || 0} warnings, ${summary.missing || 0} missing, ${summary.failed || 0} failed.`
    : 'Run a compatibility check to test the API contract.';

  compatibilityResults.replaceChildren(...checks.map(createCompatibilityRow));
}

function resetCompatibilityReport() {
  const { compatibilityResults, compatibilitySummary } = getElements();
  if (compatibilitySummary) {
    compatibilitySummary.removeAttribute('data-status');
    compatibilitySummary.textContent = 'Run a compatibility check to test field loading, JSONL streaming, and optional actions.';
  }
  if (compatibilityResults) {
    compatibilityResults.replaceChildren();
  }
}

function handleSave() {
  const { input } = getElements();
  const normalized = normalizeApiUrl(input?.value || '');
  if (!normalized) {
    setStatus('Enter a valid HTTP(S) API URL or same-origin path.', 'error');
    return;
  }

  invalidateAsyncActions();
  configureApiUrl(normalized);
  sync();
  showReloadPrompt(buildApiLaunchUrl(globalThis.location?.href || 'http://localhost/', normalized));
  setStatus('Endpoint saved. Reload fields to load metadata from this API.', 'success');
  showToastMessage('API endpoint saved.', 'success');
}

function handleReset() {
  invalidateAsyncActions();
  resetApiUrl();
  sync();
  showReloadPrompt(buildPageUrlWithoutApiParams(globalThis.location?.href || 'http://localhost/'));
  setStatus('Site default restored. Reload fields to refresh metadata.', 'success');
  showToastMessage('Site default API restored.', 'success');
}

function handleReload() {
  const targetHref = pendingReloadHref || globalThis.location?.href;
  if (targetHref && typeof globalThis.location?.assign === 'function') {
    globalThis.location.assign(targetHref);
    return;
  }

  globalThis.location?.reload?.();
}

async function handleCopyLaunchLink() {
  const href = updateLaunchUrl();
  const copied = await ClipboardUtils.copy(href, {
    errorMessage: 'Unable to copy API link.',
    successMessage: 'API launch link copied.'
  });

  if (copied) {
    setStatus('Launch link copied.', 'success');
  }
}

async function handleTestConnection() {
  const { testButton } = getElements();
  const targetUrl = getInputApiUrl();
  if (!targetUrl) {
    setStatus('Enter a valid API URL before testing.', 'error');
    return;
  }

  const actionToken = asyncActionGuard.next();
  setBusy(testButton, true);
  setStatus('Testing field metadata endpoint...', 'info');

  try {
    const { data } = await postJsonToApiUrl(targetUrl, { action: 'get_fields' });
    if (!asyncActionGuard.isCurrent(actionToken)) {
      return;
    }
    const fields = extractFields(data);
    if (!fields.length) {
      throw new Error('The API responded, but no fields were returned.');
    }
    setStatus(`Connected. Loaded ${fields.length} field${fields.length === 1 ? '' : 's'}.`, 'success');
  } catch (error) {
    if (!asyncActionGuard.isCurrent(actionToken)) {
      return;
    }
    setStatus(getConnectionErrorMessage(error), 'error');
  } finally {
    if (asyncActionGuard.isCurrent(actionToken)) {
      setBusy(testButton, false);
    }
  }
}

async function handleCompatibilityCheck() {
  const { compatibilityButton } = getElements();
  const targetUrl = getInputApiUrl();
  if (!targetUrl) {
    setStatus('Enter a valid API URL before running compatibility checks.', 'error');
    return;
  }

  const actionToken = asyncActionGuard.next();
  setBusy(compatibilityButton, true);
  setStatus('Running API compatibility checks...', 'info');
  resetCompatibilityReport();

  try {
    const report = await runApiCompatibilityCheck(targetUrl);
    if (!asyncActionGuard.isCurrent(actionToken)) {
      return;
    }
    renderCompatibilityReport(report);
    const summary = report.summary || summarizeCompatibilityChecks(report.checks);
    const tone = summary.failed || summary.missing ? 'warning' : summary.warning ? 'warning' : 'success';
    const message = summary.failed || summary.missing
      ? 'Compatibility check finished with items to review.'
      : summary.warning
        ? 'Compatibility check finished with warnings.'
        : 'Compatibility check passed.';
    setStatus(message, tone);
  } catch (error) {
    if (!asyncActionGuard.isCurrent(actionToken)) {
      return;
    }
    renderCompatibilityReport({
      checks: [{
        detail: getConnectionErrorMessage(error),
        id: 'compatibility',
        label: 'Compatibility check',
        status: 'failed'
      }]
    });
    setStatus(getConnectionErrorMessage(error), 'error');
  } finally {
    if (asyncActionGuard.isCurrent(actionToken)) {
      setBusy(compatibilityButton, false);
    }
  }
}

function bindEvents() {
  const {
    copyLinkButton,
    compatibilityButton,
    input,
    reloadButton,
    resetButton,
    saveButton,
    testButton
  } = getElements();

  input?.addEventListener('input', () => {
    invalidateAsyncActions();
    updateLaunchUrl();
  });
  saveButton?.addEventListener('click', handleSave);
  resetButton?.addEventListener('click', handleReset);
  reloadButton?.addEventListener('click', handleReload);
  copyLinkButton?.addEventListener('click', handleCopyLaunchLink);
  compatibilityButton?.addEventListener('click', handleCompatibilityCheck);
  testButton?.addEventListener('click', handleTestConnection);
}

function initialize() {
  if (initialized) {
    return;
  }

  const { input } = getElements();
  if (!input) {
    return;
  }

  initialized = true;
  bindEvents();
  sync();
}

const ApiSettings = Object.freeze({
  initialize,
  sync
});

export {
  ApiSettings,
  buildApiLaunchUrl,
  buildPageUrlWithoutApiParams,
  createApiSettingsAsyncGuard,
  extractFields,
  getApiConnectionMode,
  normalizeApiUrlForHref,
  postJsonToApiUrl
};
