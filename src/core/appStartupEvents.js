const FORM_MODE_READY_EVENT = 'query-form-mode:ready';
const FORM_MODE_READY_TIMEOUT_MS = 3000;

function waitForFormModeReady() {
  if (typeof window === 'undefined') {
    return Promise.resolve();
  }

  return new Promise(resolve => {
    let resolved = false;
    let timerId = null;
    const finish = () => {
      if (resolved) return;
      resolved = true;
      window.removeEventListener(FORM_MODE_READY_EVENT, finish);
      if (timerId) clearTimeout(timerId);
      resolve();
    };

    window.addEventListener(FORM_MODE_READY_EVENT, finish, { once: true });
    timerId = setTimeout(finish, FORM_MODE_READY_TIMEOUT_MS);
  });
}

export { FORM_MODE_READY_EVENT, waitForFormModeReady };
