function onDOMReady(callback) {
  if (typeof callback !== 'function') {
    return;
  }

  if (typeof document === 'undefined') {
    callback();
    return;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', callback, { once: true });
    return;
  }

  callback();
}

if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'onDOMReady', {
    configurable: false,
    enumerable: true,
    value: onDOMReady,
    writable: false
  });
}

export { onDOMReady };
