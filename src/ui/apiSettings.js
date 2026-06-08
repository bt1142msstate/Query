import {
  API_URL_PARAM_NAMES,
  DEFAULT_API_URL,
  configureApiUrl,
  getApiUrl,
  normalizeApiUrl,
  resetApiUrl
} from '../core/backendApi.js';
import { ClipboardUtils } from '../core/clipboard.js';
import { showToastMessage } from '../core/toast.js';

const DEFAULT_TEST_TIMEOUT_MS = 10000;
let initialized = false;
let pendingReloadHref = '';

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
    label: isDefault ? 'Public default' : 'Custom endpoint'
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
    const response = await fetch(apiUrl, {
      body: JSON.stringify(payload),
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

function handleSave() {
  const { input } = getElements();
  const normalized = normalizeApiUrl(input?.value || '');
  if (!normalized) {
    setStatus('Enter a valid HTTP(S) API URL or same-origin path.', 'error');
    return;
  }

  configureApiUrl(normalized);
  sync();
  showReloadPrompt(buildApiLaunchUrl(globalThis.location?.href || 'http://localhost/', normalized));
  setStatus('Endpoint saved. Reload fields to load metadata from this API.', 'success');
  showToastMessage('API endpoint saved.', 'success');
}

function handleReset() {
  resetApiUrl();
  sync();
  showReloadPrompt(buildPageUrlWithoutApiParams(globalThis.location?.href || 'http://localhost/'));
  setStatus('Public default restored. Reload fields to refresh metadata.', 'success');
  showToastMessage('Public default API restored.', 'success');
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

  setBusy(testButton, true);
  setStatus('Testing field metadata endpoint...', 'info');

  try {
    const { data } = await postJsonToApiUrl(targetUrl, { action: 'get_fields' });
    const fields = extractFields(data);
    if (!fields.length) {
      throw new Error('The API responded, but no fields were returned.');
    }
    setStatus(`Connected. Loaded ${fields.length} field${fields.length === 1 ? '' : 's'}.`, 'success');
  } catch (error) {
    setStatus(getConnectionErrorMessage(error), 'error');
  } finally {
    setBusy(testButton, false);
  }
}

function bindEvents() {
  const {
    copyLinkButton,
    input,
    reloadButton,
    resetButton,
    saveButton,
    testButton
  } = getElements();

  input?.addEventListener('input', updateLaunchUrl);
  saveButton?.addEventListener('click', handleSave);
  resetButton?.addEventListener('click', handleReset);
  reloadButton?.addEventListener('click', handleReload);
  copyLinkButton?.addEventListener('click', handleCopyLaunchLink);
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
  extractFields,
  getApiConnectionMode,
  normalizeApiUrlForHref,
  postJsonToApiUrl
};
