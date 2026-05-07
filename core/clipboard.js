import { showToastMessage } from './toast.js';
import { appRuntime } from './appRuntime.js';

async function copyWithFallback(text) {
  if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    await navigator.clipboard.writeText(text);
    return;
  }

  const scratch = document.createElement('textarea');
  scratch.value = text;
  scratch.setAttribute('readonly', '');
  scratch.style.position = 'fixed';
  scratch.style.opacity = '0';
  document.body.appendChild(scratch);
  scratch.select();
  document.execCommand('copy');
  scratch.remove();
}

async function resolveCopyText(source) {
  if (typeof source === 'function') {
    return source();
  }

  return source;
}

async function copy(text, options = {}) {
  const {
    successMessage = '',
    errorMessage = '',
    showToast = true,
    onSuccess = null,
    onError = null,
    logger = console.error
  } = options;

  const rawText = String(text || '');
  if (!rawText) {
    return false;
  }

  try {
    await copyWithFallback(rawText);
    if (showToast && successMessage) {
      showToastMessage(successMessage, 'success');
    }
    if (typeof onSuccess === 'function') {
      onSuccess();
    }
    return true;
  } catch (error) {
    if (showToast && errorMessage) {
      showToastMessage(errorMessage, 'error');
    }
    if (typeof onError === 'function') {
      onError(error);
    } else if (typeof logger === 'function') {
      logger('Clipboard copy failed:', error);
    }
    return false;
  }
}

async function copyFromSource(source, options = {}) {
  const {
    emptyMessage = '',
    emptyMessageType = 'warning'
  } = options;

  const resolvedText = await resolveCopyText(source);
  const rawText = String(resolvedText || '');

  if (!rawText) {
    if (emptyMessage) {
      showToastMessage(emptyMessage, emptyMessageType);
    }
    return false;
  }

  return copy(rawText, options);
}

function bindCopyButton(button, source, options = {}) {
  if (typeof HTMLElement !== 'undefined' && !(button instanceof HTMLElement)) {
    return () => {};
  }

  if (!button || typeof button.addEventListener !== 'function') {
    return () => {};
  }

  const handler = async event => {
    if (event) {
      event.preventDefault();
    }
    await copyFromSource(source, options);
  };

  button.addEventListener('click', handler);
  return () => button.removeEventListener('click', handler);
}

const ClipboardUtils = Object.freeze({
  bindCopyButton,
  copy,
  copyFromSource,
  copyWithFallback
});

if (typeof window !== 'undefined') {
  Object.defineProperty(appRuntime, 'ClipboardUtils', {
    configurable: false,
    enumerable: true,
    value: ClipboardUtils,
    writable: false
  });
}

export {
  ClipboardUtils,
  bindCopyButton,
  copy,
  copyFromSource,
  copyWithFallback
};
