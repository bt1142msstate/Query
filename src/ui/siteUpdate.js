import { onDOMReady } from '../core/domReady.js';
import { QueryStateReaders } from '../core/queryState.js';

const DEFAULT_MANIFEST_URL = './cache-bust.json';
const DEFAULT_SERVICE_WORKER_URL = './backgroundNotificationServiceWorker.js';
const DEFAULT_PAGE_VERSION_META_NAME = 'query-app-cache-version';
const DEFAULT_STORED_VERSION_KEY = 'queryAppCacheVersion';
const DEFAULT_GLOBAL_NAME = 'QueryAppSiteUpdate';
const DEFAULT_CHECK_INTERVAL_MS = 2 * 60 * 1000;
const DEFAULT_INTERACTION_CHECK_THROTTLE_MS = 30 * 1000;
const DEFAULT_IDLE_RELOAD_DELAY_MS = 8 * 1000;
const DEFAULT_IDLE_THRESHOLD_MS = 45 * 1000;
const DEFAULT_INITIAL_CHECK_DELAY_MS = 1200;
const DEFAULT_RUNNING_RECHECK_MS = 5 * 1000;
const DEFAULT_EDITING_RECHECK_MS = 3 * 1000;
const INTERACTION_EVENTS = ['pointerdown', 'keydown', 'touchstart', 'wheel'];
const ACTIVE_WORK_SELECTOR = [
  'dialog[open]',
  "[aria-busy='true']",
  '.modal-open',
  '.is-submit-in-flight',
  '.is-saving',
  '.is-uploading',
  '#post-filter-overlay:not(.hidden)',
  '#export-overlay:not(.hidden)',
  '#templates-detail-overlay:not(.hidden)',
  '#templates-categories-overlay:not(.hidden)',
  '.query-filter-editor-backdrop:not([hidden])',
  '.form-mode-field-picker-backdrop:not([hidden])',
  '.form-mode-popup-list-backdrop:not([hidden])',
  '.query-multi-value-viewer-backdrop',
  '.query-collapsed-rows-viewer-backdrop'
].join(', ');

function normalizeSiteUpdateVersion(manifest) {
  if (!manifest || typeof manifest !== 'object') {
    return '';
  }

  const candidate = manifest.version || manifest.sha || manifest.commit || manifest.build;
  return normalizeSiteUpdateVersionValue(candidate);
}

function normalizeSiteUpdateVersionValue(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function normalizeSiteUpdateSummary(manifest) {
  if (!manifest || typeof manifest !== 'object') {
    return '';
  }

  const update = manifest.update && typeof manifest.update === 'object' ? manifest.update : {};
  return String(update.title || manifest.updateTitle || manifest.title || update.summary || manifest.updateSummary || manifest.summary || '')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, 140);
}

function getSiteUpdateAutoReloadState(options = {}) {
  const updateVersion = String(options.updateVersion || '').trim();
  const idleMs = Math.max(0, Number(options.idleMs) || 0);
  const idleThresholdMs = Math.max(0, Number(options.idleThresholdMs) || DEFAULT_IDLE_THRESHOLD_MS);

  if (!updateVersion) {
    return { canReload: false, reason: 'none', nextCheckMs: null };
  }

  if (options.queryRunning) {
    return { canReload: false, reason: 'running-query', nextCheckMs: options.runningRecheckMs || DEFAULT_RUNNING_RECHECK_MS };
  }

  if (options.hasLocalEdits) {
    return { canReload: false, reason: 'local-edits', nextCheckMs: null };
  }

  if (options.activeEditor) {
    return { canReload: false, reason: 'editing', nextCheckMs: options.editingRecheckMs || DEFAULT_EDITING_RECHECK_MS };
  }

  if (options.visibilityState === 'hidden') {
    return { canReload: true, reason: 'hidden', nextCheckMs: 0 };
  }

  if (idleMs >= idleThresholdMs) {
    return { canReload: true, reason: 'idle', nextCheckMs: 0 };
  }

  return { canReload: false, reason: 'active', nextCheckMs: Math.max(100, idleThresholdMs - idleMs) };
}

function getSiteUpdateStatusMessage(decision) {
  if (decision?.canReload) {
    return decision.reason === 'hidden'
      ? 'Updating in the background.'
      : 'Updating automatically in a few seconds.';
  }

  switch (decision?.reason) {
    case 'running-query':
      return 'Update will wait for the running query to finish.';
    case 'local-edits':
      return 'Update is ready when your current edits are done.';
    case 'editing':
      return 'Update will wait until editing is idle.';
    default:
      return 'Use the latest version when you are ready.';
  }
}

function isEditableElement(element) {
  if (!element || typeof element !== 'object') {
    return false;
  }

  if (element.isContentEditable) {
    return true;
  }

  if (typeof element.matches !== 'function') {
    return false;
  }

  if (element.matches('textarea, select, [contenteditable=""], [contenteditable="true"]')) {
    return !element.disabled && !element.readOnly;
  }

  if (!element.matches('input')) {
    return false;
  }

  const type = String(element.type || 'text').toLowerCase();
  return !element.disabled && !element.readOnly && !['button', 'checkbox', 'color', 'file', 'hidden', 'image', 'radio', 'range', 'reset', 'submit'].includes(type);
}

function buildCacheBypassUrl(url, options = {}) {
  const baseHref = options.baseHref || options.window?.location?.href || globalThis.location?.href || 'http://localhost/';
  const now = options.now || Date.now;
  const random = options.random || Math.random;
  const cacheBuster = `${now()}-${String(random()).slice(2)}`;
  const parsed = new URL(url, baseHref);
  parsed.searchParams.set('siteUpdate', cacheBuster);
  return parsed.toString();
}

function readEmbeddedSiteUpdateVersion(options = {}) {
  const documentRef = options.document || globalThis.document;
  const root = options.root || documentRef?.documentElement;
  const metaName = options.metaName || DEFAULT_PAGE_VERSION_META_NAME;
  const metaVersion = documentRef?.querySelector?.(`meta[name="${metaName}"]`)?.getAttribute?.('content');
  return normalizeSiteUpdateVersionValue(metaVersion || root?.dataset?.queryAppCacheVersion);
}

function readStoredSiteUpdateVersion(options = {}) {
  const storage = options.storage || options.window?.localStorage || globalThis.window?.localStorage;
  const storageKey = options.storageKey || DEFAULT_STORED_VERSION_KEY;
  try {
    return normalizeSiteUpdateVersionValue(storage?.getItem?.(storageKey));
  } catch {
    return '';
  }
}

function rememberLoadedSiteUpdateVersion(version, options = {}) {
  const normalizedVersion = normalizeSiteUpdateVersionValue(version);
  const storage = options.storage || options.window?.localStorage || globalThis.window?.localStorage;
  const storageKey = options.storageKey || DEFAULT_STORED_VERSION_KEY;

  if (!normalizedVersion) {
    return false;
  }

  try {
    storage?.setItem?.(storageKey, normalizedVersion);
    return true;
  } catch {
    return false;
  }
}

function readCurrentVersion(options = {}) {
  return normalizeSiteUpdateVersionValue(options.explicitVersion)
    || readEmbeddedSiteUpdateVersion(options)
    || readStoredSiteUpdateVersion(options);
}

function getQueryRunning(queryStateReaders = QueryStateReaders) {
  try {
    const lifecycleState = queryStateReaders?.getLifecycleState?.();
    return Boolean(lifecycleState?.queryRunning || lifecycleState?.running || lifecycleState?.status === 'running');
  } catch {
    return false;
  }
}

function hasActiveWork(documentRef, selector = ACTIVE_WORK_SELECTOR) {
  if (!documentRef) {
    return false;
  }

  if (isEditableElement(documentRef.activeElement)) {
    return true;
  }

  try {
    return Boolean(documentRef.querySelector?.(selector));
  } catch {
    return false;
  }
}

async function waitForServiceWorkerActivation(registration, options = {}) {
  const navigatorRef = options.navigator || globalThis.navigator;
  const timeoutMs = options.timeoutMs || 2500;

  if (!registration || !navigatorRef?.serviceWorker) {
    return false;
  }

  const waitingWorker = registration.waiting || registration.installing;
  if (!waitingWorker) {
    return false;
  }

  return new Promise(resolve => {
    let settled = false;
    let timeoutId = null;

    const done = activated => {
      if (settled) {
        return;
      }
      settled = true;
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
      navigatorRef.serviceWorker.removeEventListener?.('controllerchange', onControllerChange);
      waitingWorker.removeEventListener?.('statechange', onWorkerStateChange);
      resolve(Boolean(activated));
    };

    const requestActivation = () => {
      try {
        waitingWorker.postMessage?.({ type: 'SKIP_WAITING' });
      } catch {
        // Reload can still proceed with the browser's current service worker.
      }
    };

    const onControllerChange = () => done(true);
    const onWorkerStateChange = () => {
      if (waitingWorker.state === 'installed') {
        requestActivation();
      }
      if (waitingWorker.state === 'activated') {
        done(true);
      }
    };

    navigatorRef.serviceWorker.addEventListener?.('controllerchange', onControllerChange, { once: true });
    waitingWorker.addEventListener?.('statechange', onWorkerStateChange);
    requestActivation();
    timeoutId = setTimeout(() => done(false), timeoutMs);
  });
}

async function prepareServiceWorkerForSiteUpdate(version, options = {}) {
  const navigatorRef = options.navigator || globalThis.navigator;
  const serviceWorkerUrl = options.serviceWorkerUrl || DEFAULT_SERVICE_WORKER_URL;

  if (!version || !navigatorRef?.serviceWorker) {
    return false;
  }

  const registrationUrl = `${serviceWorkerUrl}?v=${encodeURIComponent(version)}`;
  const registration = await navigatorRef.serviceWorker.register(registrationUrl, {
    scope: './',
    updateViaCache: 'none'
  });
  await registration.update?.();
  await waitForServiceWorkerActivation(registration, options);
  return true;
}

function createSiteUpdateController(options = {}) {
  const documentRef = options.document || globalThis.document;
  const windowRef = options.window || globalThis.window;
  const root = options.root || documentRef?.documentElement;
  const fetchRef = options.fetch || globalThis.fetch?.bind(globalThis);
  const queryStateReaders = options.queryStateReaders || QueryStateReaders;
  const manifestUrl = options.manifestUrl || DEFAULT_MANIFEST_URL;
  const pageVersionMetaName = options.pageVersionMetaName || DEFAULT_PAGE_VERSION_META_NAME;
  const storedVersionKey = options.storedVersionKey || DEFAULT_STORED_VERSION_KEY;
  const globalName = options.globalName === undefined ? DEFAULT_GLOBAL_NAME : options.globalName;
  const now = options.now || Date.now;
  const random = options.random || Math.random;
  const checkIntervalMs = options.checkIntervalMs || DEFAULT_CHECK_INTERVAL_MS;
  const interactionCheckThrottleMs = options.interactionCheckThrottleMs || DEFAULT_INTERACTION_CHECK_THROTTLE_MS;
  const idleReloadDelayMs = options.idleReloadDelayMs || DEFAULT_IDLE_RELOAD_DELAY_MS;
  const idleThresholdMs = options.idleThresholdMs || DEFAULT_IDLE_THRESHOLD_MS;
  const initialCheckDelayMs = options.initialCheckDelayMs ?? DEFAULT_INITIAL_CHECK_DELAY_MS;
  const runningRecheckMs = options.runningRecheckMs || DEFAULT_RUNNING_RECHECK_MS;
  const editingRecheckMs = options.editingRecheckMs || DEFAULT_EDITING_RECHECK_MS;
  const reloadPage = options.reload || (() => windowRef?.location?.reload?.());

  let currentVersion = readCurrentVersion({
    document: documentRef,
    explicitVersion: options.currentVersion,
    metaName: pageVersionMetaName,
    root,
    storage: windowRef?.localStorage,
    storageKey: storedVersionKey,
    window: windowRef
  });
  let updateVersion = '';
  let updateManifest = null;
  let updateSummary = '';
  let lastInteractionAt = now();
  let lastInteractionCheckAt = 0;
  let hasLocalEdits = false;
  let isChecking = false;
  let isStarted = false;
  let isReloading = false;
  let banner = null;
  let autoReloadTimer = null;
  let checkInterval = null;
  let initialCheckTimer = null;
  let updateDetailsPromise = null;
  const cleanupCallbacks = [];

  function updateRootDataset() {
    if (!root?.dataset) {
      return;
    }

    if (updateVersion) {
      root.dataset.queryAppUpdateAvailable = 'true';
      root.dataset.queryAppUpdateVersion = updateVersion;
      return;
    }

    delete root.dataset.queryAppUpdateAvailable;
    delete root.dataset.queryAppUpdateVersion;
  }

  function rememberCurrentVersion(version = currentVersion) {
    const normalizedVersion = normalizeSiteUpdateVersionValue(version);
    if (!normalizedVersion) {
      return;
    }

    rememberLoadedSiteUpdateVersion(normalizedVersion, {
      storage: windowRef?.localStorage,
      storageKey: storedVersionKey,
      window: windowRef
    });
    if (root?.dataset && !root.dataset.queryAppCacheVersion) {
      root.dataset.queryAppCacheVersion = normalizedVersion;
    }
  }

  function clearUpdateState() {
    updateVersion = '';
    updateManifest = null;
    updateSummary = '';
    updateRootDataset();
    if (autoReloadTimer !== null) {
      clearTimeout(autoReloadTimer);
      autoReloadTimer = null;
    }
    banner?.remove?.();
    banner = null;
  }

  function getDecision() {
    return getSiteUpdateAutoReloadState({
      activeEditor: hasActiveWork(documentRef),
      editingRecheckMs,
      hasLocalEdits,
      idleMs: now() - lastInteractionAt,
      idleThresholdMs,
      queryRunning: getQueryRunning(queryStateReaders),
      runningRecheckMs,
      updateVersion,
      visibilityState: documentRef?.visibilityState || 'visible'
    });
  }

  function createBanner() {
    if (banner || !documentRef?.createElement || !documentRef.body) {
      return banner;
    }

    banner = documentRef.createElement('section');
    banner.className = 'site-update-banner';
    banner.setAttribute('role', 'status');
    banner.setAttribute('aria-live', 'polite');
    banner.dataset.siteUpdateBanner = 'true';
    banner.innerHTML = `
      <div class="site-update-banner-copy">
        <strong data-site-update-title>Site update ready</strong>
        <span data-site-update-status>Use the latest version when you are ready.</span>
      </div>
      <div class="site-update-banner-actions">
        <button class="site-update-banner-details-toggle" type="button" data-site-update-details-toggle aria-controls="site-update-details" aria-expanded="false" hidden>What changed</button>
        <button class="site-update-banner-action" type="button" data-site-update-action>Update now</button>
      </div>
      <div class="site-update-banner-details" id="site-update-details" data-site-update-details hidden>
        <strong class="site-update-banner-details-title" data-site-update-details-title></strong>
        <p class="site-update-banner-details-summary" data-site-update-details-summary></p>
        <ul class="site-update-banner-details-list" data-site-update-details-list></ul>
      </div>
    `;

    banner.querySelector('[data-site-update-action]')?.addEventListener('click', () => {
      void reloadForUpdate();
    });
    documentRef.body.appendChild(banner);
    return banner;
  }

  function renderBannerUpdateDetails() {
    if (!banner || !updateManifest) {
      return;
    }

    updateDetailsPromise ||= import('./siteUpdateDetails.js');
    updateDetailsPromise
      .then(module => module.renderSiteUpdateDetails?.(banner, updateManifest, { document: documentRef }))
      .catch(() => {});
  }

  function updateBanner(decision = getDecision()) {
    const activeBanner = createBanner();
    if (!activeBanner) {
      return;
    }

    activeBanner.dataset.siteUpdateState = decision.canReload ? 'auto' : decision.reason;
    const status = activeBanner.querySelector('[data-site-update-status]');
    if (status) {
      status.textContent = getSiteUpdateStatusMessage(decision);
    }
    renderBannerUpdateDetails();
  }

  function scheduleAutoReload() {
    if (autoReloadTimer !== null) {
      clearTimeout(autoReloadTimer);
      autoReloadTimer = null;
    }

    if (!updateVersion || isReloading) {
      return;
    }

    const decision = getDecision();
    updateBanner(decision);

    if (decision.canReload) {
      autoReloadTimer = setTimeout(() => {
        const nextDecision = getDecision();
        if (nextDecision.canReload) {
          void reloadForUpdate();
          return;
        }
        updateBanner(nextDecision);
        scheduleAutoReload();
      }, idleReloadDelayMs);
      return;
    }

    if (decision.nextCheckMs !== null) {
      autoReloadTimer = setTimeout(scheduleAutoReload, decision.nextCheckMs);
    }
  }

  async function fetchManifest() {
    if (typeof fetchRef !== 'function') {
      return null;
    }

    const response = await fetchRef(buildCacheBypassUrl(manifestUrl, { now, random, window: windowRef }), {
      cache: 'no-store',
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json'
      }
    });

    if (!response?.ok) {
      return null;
    }

    return response.json();
  }

  function handleManifest(manifest) {
    const nextVersion = normalizeSiteUpdateVersion(manifest);
    const nextSummary = normalizeSiteUpdateSummary(manifest);
    if (!nextVersion) {
      return false;
    }

    if (!currentVersion) {
      currentVersion = nextVersion;
      rememberCurrentVersion(nextVersion);
      return false;
    }

    if (nextVersion === currentVersion) {
      rememberCurrentVersion(nextVersion);
      clearUpdateState();
      return false;
    }

    if (nextVersion === updateVersion) {
      updateManifest = manifest || updateManifest;
      updateSummary = nextSummary || updateSummary;
      updateRootDataset();
      updateBanner();
      scheduleAutoReload();
      return false;
    }

    updateVersion = nextVersion;
    updateManifest = manifest;
    updateSummary = nextSummary;
    updateRootDataset();
    updateBanner();
    scheduleAutoReload();
    return true;
  }

  async function checkNow() {
    if (isChecking) {
      return false;
    }

    isChecking = true;
    try {
      const manifest = await fetchManifest();
      return handleManifest(manifest);
    } catch {
      return false;
    } finally {
      isChecking = false;
    }
  }

  async function reloadForUpdate() {
    if (!updateVersion || isReloading) {
      return;
    }

    isReloading = true;
    if (autoReloadTimer !== null) {
      clearTimeout(autoReloadTimer);
      autoReloadTimer = null;
    }

    updateBanner({ canReload: false, reason: 'updating', nextCheckMs: null });
    if (banner) {
      banner.dataset.siteUpdateState = 'updating';
      const status = banner.querySelector('[data-site-update-status]');
      const action = banner.querySelector('[data-site-update-action]');
      if (status) status.textContent = 'Updating to the latest version.';
      if (action) action.disabled = true;
    }

    try {
      await prepareServiceWorkerForSiteUpdate(updateVersion, {
        navigator: windowRef?.navigator,
        serviceWorkerUrl: options.serviceWorkerUrl || DEFAULT_SERVICE_WORKER_URL,
        timeoutMs: options.serviceWorkerTimeoutMs
      });
    } catch {
      // The manifest changed, so reloading is still the correct fallback.
    }

    reloadPage();
  }

  function markInteraction() {
    lastInteractionAt = now();
    if (updateVersion) {
      scheduleAutoReload();
    }
  }

  function checkAfterInteraction() {
    markInteraction();
    const elapsed = now() - lastInteractionCheckAt;
    if (elapsed < interactionCheckThrottleMs) {
      return;
    }
    lastInteractionCheckAt = now();
    void checkNow();
  }

  function markLocalEdit(event) {
    if (event?.isTrusted === false) {
      return;
    }

    if (!isEditableElement(event?.target)) {
      return;
    }

    hasLocalEdits = true;
    if (updateVersion) {
      scheduleAutoReload();
    }
  }

  function clearSubmittedEdits() {
    hasLocalEdits = false;
    if (updateVersion) {
      scheduleAutoReload();
    }
  }

  function addManagedListener(target, type, listener, listenerOptions) {
    target?.addEventListener?.(type, listener, listenerOptions);
    cleanupCallbacks.push(() => target?.removeEventListener?.(type, listener, listenerOptions));
  }

  function start() {
    if (isStarted || !documentRef || !windowRef || !root || typeof fetchRef !== 'function') {
      return api;
    }

    isStarted = true;
    rememberCurrentVersion();
    if (globalName && windowRef) {
      windowRef[globalName] = api;
    }
    INTERACTION_EVENTS.forEach(eventName => {
      addManagedListener(windowRef, eventName, checkAfterInteraction, { capture: true, passive: true });
    });
    addManagedListener(documentRef, 'input', markLocalEdit, true);
    addManagedListener(documentRef, 'change', markLocalEdit, true);
    addManagedListener(documentRef, 'submit', clearSubmittedEdits, true);
    addManagedListener(documentRef, 'visibilitychange', () => {
      if (documentRef.visibilityState === 'visible') {
        void checkNow();
      }
      scheduleAutoReload();
    });
    addManagedListener(windowRef, 'focus', () => {
      markInteraction();
      void checkNow();
    });
    addManagedListener(windowRef, 'online', checkNow);
    addManagedListener(windowRef, 'pageshow', event => {
      if (event?.persisted) {
        void checkNow();
      }
      scheduleAutoReload();
    });
    addManagedListener(windowRef, 'query-app:check-site-update', checkNow);

    checkInterval = setInterval(checkNow, checkIntervalMs);
    initialCheckTimer = setTimeout(checkNow, Math.max(0, initialCheckDelayMs));
    return api;
  }

  function stop() {
    cleanupCallbacks.splice(0).forEach(callback => callback());
    if (checkInterval !== null) {
      clearInterval(checkInterval);
      checkInterval = null;
    }
    if (initialCheckTimer !== null) {
      clearTimeout(initialCheckTimer);
      initialCheckTimer = null;
    }
    if (autoReloadTimer !== null) {
      clearTimeout(autoReloadTimer);
      autoReloadTimer = null;
    }
    banner?.remove?.();
    banner = null;
    if (globalName && windowRef?.[globalName] === api) {
      delete windowRef[globalName];
    }
    isStarted = false;
  }

  function getState() {
    return {
      currentVersion,
      hasLocalEdits,
      bannerVisible: Boolean(banner?.isConnected),
      isChecking,
      isReloading,
      lastInteractionAt,
      updateSummary,
      updateManifest,
      updateVersion
    };
  }

  const api = {
    checkNow,
    getState,
    start,
    stop
  };

  return api;
}

onDOMReady(() => {
  createSiteUpdateController().start();
});

export {
  ACTIVE_WORK_SELECTOR,
  buildCacheBypassUrl,
  createSiteUpdateController,
  getSiteUpdateAutoReloadState,
  getSiteUpdateStatusMessage,
  hasActiveWork,
  isEditableElement,
  normalizeSiteUpdateVersionValue,
  readCurrentVersion,
  readEmbeddedSiteUpdateVersion,
  readStoredSiteUpdateVersion,
  rememberLoadedSiteUpdateVersion,
  normalizeSiteUpdateVersion,
  normalizeSiteUpdateSummary,
  prepareServiceWorkerForSiteUpdate
};
