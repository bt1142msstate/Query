import {
  dismissToastMessage,
  registerToastImplementation,
  showToastMessage,
  toast
} from '../core/toast.js';

(() => {
  const TOAST_CONTAINER_ID = 'toast-container';
  const DESKTOP_MAX_VISIBLE_TOASTS = 4;
  const MOBILE_MAX_VISIBLE_TOASTS = 1;
  const MOBILE_TOAST_QUERY = '(max-width: 1024px)';
  const DEFAULT_DURATION = 3000;
  const EXIT_DURATION = 180;
  const TYPE_CONFIG = {
    info: {
      label: 'Info',
      icon: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z'
    },
    error: {
      label: 'Error',
      icon: 'M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z'
    },
    warning: {
      label: 'Warning',
      icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 16.5c-.77.833.192 2.5 1.732 2.5z'
    },
    success: {
      label: 'Success',
      icon: 'M5 13l4 4L19 7'
    }
  };

  const activeToasts = new Map();
  const pendingToasts = [];

  function getResolvedDuration(type, requestedDuration) {
    if (type === 'error') {
      return 0;
    }

    return Number.isFinite(requestedDuration) ? requestedDuration : DEFAULT_DURATION;
  }

  function ensureContainer() {
    let container = document.getElementById(TOAST_CONTAINER_ID);
    if (container) {
      return container;
    }

    container = document.createElement('div');
    container.id = TOAST_CONTAINER_ID;
    container.setAttribute('aria-live', 'polite');
    container.setAttribute('aria-atomic', 'false');
    document.body.appendChild(container);
    return container;
  }

  function normalizeOptions(messageOrOptions, type, duration) {
    if (messageOrOptions && typeof messageOrOptions === 'object') {
      const resolvedType = messageOrOptions.type || 'info';
      return {
        message: String(messageOrOptions.message || ''),
        type: resolvedType,
        duration: getResolvedDuration(resolvedType, messageOrOptions.duration),
        action: normalizeAction(messageOrOptions.action)
      };
    }

    const resolvedType = type || 'info';

    return {
      message: String(messageOrOptions || ''),
      type: resolvedType,
      duration: getResolvedDuration(resolvedType, duration),
      action: null
    };
  }

  function normalizeAction(action) {
    if (!action || typeof action !== 'object' || typeof action.onClick !== 'function') {
      return null;
    }

    return {
      label: String(action.label || 'Confirm'),
      onClick: action.onClick,
      dismissOnAction: action.dismissOnAction !== false
    };
  }

  function getToastKey(message, type) {
    return `${type}::${message}`;
  }

  function createToastElement(type, message, key, action) {
    const config = TYPE_CONFIG[type] || TYPE_CONFIG.info;
    const toast = document.createElement('section');
    toast.className = `app-toast app-toast--${type}`;
    toast.dataset.toastKey = key;
    toast.setAttribute('role', type === 'error' || type === 'warning' ? 'alert' : 'status');

    const iconWrap = document.createElement('div');
    iconWrap.className = 'app-toast-icon';
    iconWrap.setAttribute('aria-hidden', 'true');
    iconWrap.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${config.icon}"></path>
      </svg>
    `;

    const body = document.createElement('div');
    body.className = 'app-toast-body';

    const title = document.createElement('div');
    title.className = 'app-toast-title';
    title.textContent = config.label;

    const text = document.createElement('div');
    text.className = 'app-toast-message';
    text.textContent = message;

    const meta = document.createElement('div');
    meta.className = 'app-toast-meta';

    const count = document.createElement('span');
    count.className = 'app-toast-count';
    count.hidden = true;
    meta.appendChild(count);

    if (action) {
      const actionButton = document.createElement('button');
      actionButton.type = 'button';
      actionButton.className = 'app-toast-action';
      actionButton.textContent = action.label;
      meta.appendChild(actionButton);
    }

    body.appendChild(title);
    body.appendChild(text);
    body.appendChild(meta);

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'app-toast-close';
    closeButton.setAttribute('aria-label', 'Dismiss notification');
    closeButton.textContent = '×';

    toast.appendChild(iconWrap);
    toast.appendChild(body);
    toast.appendChild(closeButton);
    return toast;
  }

  function updateToastCount(entry) {
    const countElement = entry.element.querySelector('.app-toast-count');
    if (!countElement) {
      return;
    }

    if (entry.count > 1) {
      countElement.hidden = false;
      countElement.textContent = `${entry.count}x`;
    } else {
      countElement.hidden = true;
      countElement.textContent = '';
    }
  }

  function clearToastTimer(entry) {
    if (entry.timerId) {
      window.clearTimeout(entry.timerId);
      entry.timerId = null;
    }
  }

  function clearRemovalTimer(entry) {
    if (entry.removalTimerId) {
      window.clearTimeout(entry.removalTimerId);
      entry.removalTimerId = null;
    }
  }

  function getVisibleToastCount() {
    let total = 0;
    activeToasts.forEach((entry) => {
      if (!entry.isClosing) {
        total += 1;
      }
    });
    return total;
  }

  function getMaxVisibleToasts() {
    return window.matchMedia?.(MOBILE_TOAST_QUERY)?.matches
      ? MOBILE_MAX_VISIBLE_TOASTS
      : DESKTOP_MAX_VISIBLE_TOASTS;
  }

  function findPendingToast(key) {
    return pendingToasts.find((entry) => entry.key === key) || null;
  }

  function updateToast(entry, options) {
    entry.duration = options.duration;
    entry.count += 1;
    entry.action = options.action;

    if (entry.message !== options.message) {
      entry.message = options.message;
      const messageElement = entry.element.querySelector('.app-toast-message');
      if (messageElement) {
        messageElement.textContent = options.message;
      }
    }

    syncToastAction(entry);

    updateToastCount(entry);
  }

  function syncToastAction(entry) {
    const meta = entry.element.querySelector('.app-toast-meta');
    if (!meta) {
      return;
    }

    let actionButton = meta.querySelector('.app-toast-action');

    if (!entry.action) {
      if (actionButton) {
        actionButton.remove();
      }
      return;
    }

    if (!actionButton) {
      actionButton = document.createElement('button');
      actionButton.type = 'button';
      actionButton.className = 'app-toast-action';
      meta.appendChild(actionButton);
    }

    actionButton.textContent = entry.action.label;
  }

  function activateToast(entry, container) {
    entry.isClosing = false;
    clearRemovalTimer(entry);
    activeToasts.set(entry.key, entry);
    container.appendChild(entry.element);
    window.requestAnimationFrame(() => {
      entry.element.classList.add('is-visible');
    });
    scheduleDismiss(entry, entry.duration);
  }

  function flushPendingToasts() {
    const container = document.getElementById(TOAST_CONTAINER_ID);
    if (!container) {
      return;
    }

    while (pendingToasts.length > 0 && getVisibleToastCount() < getMaxVisibleToasts()) {
      const nextEntry = pendingToasts.shift();
      activateToast(nextEntry, container);
    }
  }

  function dismissToast(key) {
    const entry = activeToasts.get(key);
    if (!entry || entry.isClosing) {
      return;
    }

    entry.isClosing = true;
    clearToastTimer(entry);
    entry.element.classList.remove('is-visible');

    clearRemovalTimer(entry);
    entry.removalTimerId = window.setTimeout(() => {
      if (entry.element.parentNode) {
        entry.element.parentNode.removeChild(entry.element);
      }
      activeToasts.delete(key);
      entry.removalTimerId = null;
      flushPendingToasts();
    }, EXIT_DURATION);
  }

  function dismissAllToasts() {
    pendingToasts.length = 0;
    Array.from(activeToasts.keys()).forEach((key) => dismissToast(key));
  }

  function scheduleDismiss(entry, duration) {
    clearToastTimer(entry);
    if (duration <= 0) {
      return;
    }

    entry.duration = duration;
    entry.timerId = window.setTimeout(() => dismissToast(entry.key), duration);
  }

  function bindToastEvents(entry) {
    entry.element.addEventListener('mouseenter', () => {
      clearToastTimer(entry);
    });

    entry.element.addEventListener('mouseleave', () => {
      scheduleDismiss(entry, entry.duration);
    });

    const closeButton = entry.element.querySelector('.app-toast-close');
    if (closeButton) {
      closeButton.addEventListener('click', () => dismissToast(entry.key));
    }

    const actionButton = entry.element.querySelector('.app-toast-action');
    if (actionButton) {
      actionButton.addEventListener('click', () => {
        if (!entry.action || typeof entry.action.onClick !== 'function') {
          return;
        }

        try {
          entry.action.onClick();
        } finally {
          if (entry.action.dismissOnAction !== false) {
            dismissToast(entry.key);
          }
        }
      });
    }
  }

  function showToast(messageOrOptions, type = 'info', duration = DEFAULT_DURATION) {
    const options = normalizeOptions(messageOrOptions, type, duration);
    if (!options.message) {
      return null;
    }

    const container = ensureContainer();
    const key = getToastKey(options.message, options.type);
    const existing = activeToasts.get(key);
    const pending = findPendingToast(key);

    if (existing) {
      updateToast(existing, options);
      existing.isClosing = false;
      clearRemovalTimer(existing);
      container.appendChild(existing.element);
      existing.element.classList.add('is-visible');
      scheduleDismiss(existing, options.duration);
      return existing.element;
    }

    if (pending) {
      updateToast(pending, options);
      return pending.element;
    }

    const element = createToastElement(options.type, options.message, key, options.action);
    const entry = {
      key,
      message: options.message,
      action: options.action,
      element,
      timerId: null,
      removalTimerId: null,
      duration: options.duration,
      count: 1,
      isClosing: false
    };

    bindToastEvents(entry);
    updateToastCount(entry);

    if (getVisibleToastCount() >= getMaxVisibleToasts()) {
      pendingToasts.push(entry);
      return element;
    }

    activateToast(entry, container);
    return element;
  }

  registerToastImplementation({
    dismissToastMessage: dismissToast,
    dismissAllToasts,
    showToastMessage: showToast
  });
})();

export { dismissToastMessage, showToastMessage, toast };
