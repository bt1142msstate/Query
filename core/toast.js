import { appRuntime } from './appRuntime.js';
let toastImplementation = null;

function normalizeToastImplementation(implementation = {}) {
  const show = typeof implementation.showToastMessage === 'function'
    ? implementation.showToastMessage
    : implementation.show;
  const dismiss = typeof implementation.dismissToastMessage === 'function'
    ? implementation.dismissToastMessage
    : implementation.dismiss;
  const dismissAll = typeof implementation.dismissAllToasts === 'function'
    ? implementation.dismissAllToasts
    : implementation.dismissAll;

  return {
    dismiss: typeof dismiss === 'function' ? dismiss : null,
    dismissAll: typeof dismissAll === 'function' ? dismissAll : null,
    show: typeof show === 'function' ? show : null
  };
}

function registerToastImplementation(implementation = {}) {
  toastImplementation = normalizeToastImplementation(implementation);
  return toast;
}

function showToastMessage(...args) {
  return toastImplementation?.show?.(...args) ?? null;
}

function dismissToastMessage(...args) {
  return toastImplementation?.dismiss?.(...args) ?? null;
}

function dismissAllToastMessages(...args) {
  return toastImplementation?.dismissAll?.(...args) ?? null;
}

const toast = Object.freeze({
  show: showToastMessage,
  dismiss: dismissToastMessage,
  dismissAll: dismissAllToastMessages,
  info(message, duration) {
    return showToastMessage(message, 'info', duration);
  },
  success(message, duration) {
    return showToastMessage(message, 'success', duration);
  },
  warning(message, duration) {
    return showToastMessage(message, 'warning', duration);
  },
  error(message, duration) {
    return showToastMessage(message, 'error', duration);
  }
});

if (typeof window !== 'undefined') {
  Object.defineProperty(appRuntime, 'dismissToastMessage', {
    configurable: true,
    enumerable: true,
    get: () => dismissToastMessage
  });
  Object.defineProperty(appRuntime, 'showToast', {
    configurable: true,
    enumerable: true,
    get: () => showToastMessage
  });
  Object.defineProperty(appRuntime, 'showToastMessage', {
    configurable: true,
    enumerable: true,
    get: () => showToastMessage
  });
  Object.defineProperty(appRuntime, 'toast', {
    configurable: true,
    enumerable: true,
    get: () => toast
  });
}

export {
  dismissToastMessage,
  registerToastImplementation,
  showToastMessage,
  toast
};
