import { appRuntime } from './appRuntime.js';
const raisedUiKeys = new Set();

function normalizeTargets(targets) {
  if (!Array.isArray(targets)) {
    return [];
  }

  return targets.filter(Boolean);
}

function syncRaisedUiState() {
  if (typeof document !== 'undefined' && document.body) {
    document.body.classList.toggle('raised-ui-open', raisedUiKeys.size > 0);
  }
}

function acquireRaisedUi(key = '') {
  const normalizedKey = String(key || '').trim();
  if (!normalizedKey) {
    return;
  }

  raisedUiKeys.add(normalizedKey);
  syncRaisedUiState();
}

function releaseRaisedUi(key = '') {
  const normalizedKey = String(key || '').trim();
  if (!normalizedKey) {
    return;
  }

  raisedUiKeys.delete(normalizedKey);
  syncRaisedUiState();
}

function show(targets, options = {}) {
  const {
    bodyClass = '',
    ariaHidden = null,
    raisedUiKey = ''
  } = options;

  normalizeTargets(targets).forEach(target => {
    target.classList.remove('hidden');
    target.hidden = false;
    target.removeAttribute('hidden');
    if (ariaHidden !== null) {
      target.setAttribute('aria-hidden', String(ariaHidden));
    }
  });

  if (bodyClass && typeof document !== 'undefined' && document.body) {
    document.body.classList.add(bodyClass);
  }

  if (raisedUiKey) {
    acquireRaisedUi(raisedUiKey);
  }
}

function hide(targets, options = {}) {
  const {
    bodyClass = '',
    ariaHidden = null,
    raisedUiKey = ''
  } = options;

  normalizeTargets(targets).forEach(target => {
    target.classList.add('hidden');
    target.hidden = true;
    target.setAttribute('hidden', '');
    if (ariaHidden !== null) {
      target.setAttribute('aria-hidden', String(ariaHidden));
    }
  });

  if (bodyClass && typeof document !== 'undefined' && document.body) {
    document.body.classList.remove(bodyClass);
  }

  if (raisedUiKey) {
    releaseRaisedUi(raisedUiKey);
  }
}

function isVisible(target) {
  return !!(
    target
    && !target.classList.contains('hidden')
    && !target.hidden
    && !target.hasAttribute('hidden')
  );
}

const VisibilityUtils = Object.freeze({
  acquireRaisedUi,
  hide,
  isVisible,
  releaseRaisedUi,
  show
});

if (typeof window !== 'undefined') {
  Object.defineProperty(appRuntime, 'VisibilityUtils', {
    configurable: false,
    enumerable: true,
    value: VisibilityUtils,
    writable: false
  });
}

export {
  VisibilityUtils,
  acquireRaisedUi,
  hide,
  isVisible,
  releaseRaisedUi,
  show
};
