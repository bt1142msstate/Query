import { createTableQueryCircuitOverlay } from './spacefieldOverlay.js';

const STARTING_CLASS = 'app-starting';
const READY_CLASS = 'app-ready';
const COMPLETE_CLASS = 'is-complete';
const DEFAULT_STARTUP_WATCHDOG_MS = 18000;

let startupSpaceOverlay = null;
let startupWatchdogTimer = null;

function getStatusElement() {
  return typeof document === 'undefined'
    ? null
    : document.getElementById('app-startup-status');
}

function getTitleElement(statusElement) {
  return statusElement?.querySelector('[data-app-startup-title]') || null;
}

function getDetailElement(statusElement) {
  return statusElement?.querySelector('[data-app-startup-detail]') || null;
}

function mountSpaceAnimation(statusElement) {
  const host = statusElement?.querySelector('[data-app-startup-space]');
  if (!host || startupSpaceOverlay?.isConnected) return;

  startupSpaceOverlay = createTableQueryCircuitOverlay();
  startupSpaceOverlay.id = 'app-startup-spacefield';
  startupSpaceOverlay.classList.add('active', 'app-startup-spacefield');
  host.appendChild(startupSpaceOverlay);
  startupSpaceOverlay._startAnimation?.();
}

function stopSpaceAnimation() {
  if (!startupSpaceOverlay) return;

  startupSpaceOverlay.classList.add('fading-out');
  startupSpaceOverlay._stopAnimation?.();
  const overlay = startupSpaceOverlay;
  startupSpaceOverlay = null;
  window.setTimeout(() => {
    overlay.remove();
  }, 260);
}

function clearStartupWatchdog() {
  if (!startupWatchdogTimer) return;
  window.clearTimeout(startupWatchdogTimer);
  startupWatchdogTimer = null;
}

function scheduleStartupWatchdog(timeoutMs) {
  if (typeof window === 'undefined') return;

  clearStartupWatchdog();
  const timeoutValue = Number.isFinite(Number(timeoutMs))
    ? Number(timeoutMs)
    : DEFAULT_STARTUP_WATCHDOG_MS;

  if (timeoutValue <= 0) return;

  startupWatchdogTimer = window.setTimeout(() => {
    startupWatchdogTimer = null;
    if (document.documentElement.dataset.queryAppReady === 'true') {
      return;
    }

    update({
      title: 'Opening builder',
      detail: 'Field metadata is taking longer than expected. Opening the app so you can check API Settings or retry.'
    });
    complete();
  }, timeoutValue);
}

function initialize(options = {}) {
  if (typeof document === 'undefined') return;

  document.documentElement.dataset.queryAppReady = 'false';
  document.body?.classList.add(STARTING_CLASS);

  const statusElement = getStatusElement();
  if (!statusElement) return;

  statusElement.hidden = false;
  statusElement.classList.remove(COMPLETE_CLASS);
  statusElement.setAttribute('aria-hidden', 'false');
  mountSpaceAnimation(statusElement);
  scheduleStartupWatchdog(options.watchdogMs);
}

function update({ title, detail } = {}) {
  const statusElement = getStatusElement();
  if (!statusElement) return;

  if (typeof title === 'string' && title.trim()) {
    const titleElement = getTitleElement(statusElement);
    if (titleElement) titleElement.textContent = title.trim();
  }

  if (typeof detail === 'string' && detail.trim()) {
    const detailElement = getDetailElement(statusElement);
    if (detailElement) detailElement.textContent = detail.trim();
  }
}

function complete(options = {}) {
  if (typeof document === 'undefined') return;

  clearStartupWatchdog();
  const delay = Number.isFinite(Number(options.delay)) ? Math.max(0, Number(options.delay)) : 0;
  const finish = () => {
    const statusElement = getStatusElement();
    document.body?.classList.remove(STARTING_CLASS);
    document.body?.classList.add(READY_CLASS);
    document.documentElement.dataset.queryAppReady = 'true';
    window.dispatchEvent(new CustomEvent('query-app:ready'));

    if (!statusElement) return;
    stopSpaceAnimation();
    statusElement.classList.add(COMPLETE_CLASS);
    statusElement.setAttribute('aria-hidden', 'true');
    window.setTimeout(() => {
      statusElement.hidden = true;
    }, 240);
  };

  if (delay > 0) {
    window.setTimeout(finish, delay);
    return;
  }

  finish();
}

const StartupStatus = Object.freeze({
  complete,
  initialize,
  update
});

export { StartupStatus };
