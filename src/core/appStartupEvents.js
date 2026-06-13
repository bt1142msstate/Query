const FORM_MODE_READY_EVENT = 'query-form-mode:ready';
const FORM_MODE_READY_TIMEOUT_MS = 3000;
let formModeReady = false;

function markFormModeReady(windowRef = globalThis.window) {
  formModeReady = true;
  if (windowRef && typeof windowRef.dispatchEvent === 'function') {
    windowRef.dispatchEvent(new windowRef.CustomEvent(FORM_MODE_READY_EVENT));
  }
}

function waitForFormModeReady(options = {}) {
  const windowRef = options.windowRef || globalThis.window;
  const timeoutMs = Number(options.timeoutMs) || FORM_MODE_READY_TIMEOUT_MS;

  if (!windowRef || formModeReady) {
    return Promise.resolve();
  }

  return new Promise(resolve => {
    let resolved = false;
    let timerId = null;
    const finish = () => {
      if (resolved) return;
      resolved = true;
      windowRef.removeEventListener(FORM_MODE_READY_EVENT, finish);
      if (timerId) clearTimeout(timerId);
      resolve();
    };

    windowRef.addEventListener(FORM_MODE_READY_EVENT, finish, { once: true });
    timerId = setTimeout(finish, timeoutMs);
  });
}

export { FORM_MODE_READY_EVENT, markFormModeReady, waitForFormModeReady };
