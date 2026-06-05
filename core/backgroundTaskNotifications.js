let notificationPermissionPromise = null;
let notificationServiceWorkerRegistrationPromise = null;
const NOTIFICATION_SERVICE_WORKER_URL = '../backgroundNotificationServiceWorker.js';

function getBrowserNotificationApi() {
  return (typeof window !== 'undefined' && window.Notification)
    || (typeof Notification !== 'undefined' && Notification)
    || null;
}

function requestBackgroundTaskNotificationPermission(notificationApi) {
  if (!notificationApi || notificationApi.permission !== 'default' || typeof notificationApi.requestPermission !== 'function') {
    return Promise.resolve(notificationApi?.permission || 'unsupported');
  }
  if (!notificationPermissionPromise) {
    notificationPermissionPromise = new Promise(resolve => {
      try {
        if (notificationApi.requestPermission.length > 0) {
          notificationApi.requestPermission(resolve);
          return;
        }
        Promise.resolve(notificationApi.requestPermission()).then(resolve, () => resolve(notificationApi.permission || 'default'));
      } catch {
        resolve(notificationApi.permission || 'default');
      }
    }).then(permission => {
      notificationPermissionPromise = null;
      return permission || notificationApi.permission || 'default';
    });
  }
  return notificationPermissionPromise;
}

function canUseNotificationServiceWorker() {
  return typeof navigator !== 'undefined'
    && navigator.serviceWorker
    && typeof navigator.serviceWorker.register === 'function'
    && typeof window !== 'undefined'
    && window.isSecureContext !== false;
}

function getNotificationServiceWorkerUrl() {
  const url = new URL(NOTIFICATION_SERVICE_WORKER_URL, import.meta.url);
  const cacheVersion = typeof document !== 'undefined'
    ? document.documentElement?.dataset?.queryAppCacheVersion
    : '';

  if (cacheVersion) {
    url.searchParams.set('v', cacheVersion);
  }

  return url;
}

async function ensureNotificationServiceWorker() {
  if (!canUseNotificationServiceWorker()) {
    return null;
  }

  if (!notificationServiceWorkerRegistrationPromise) {
    notificationServiceWorkerRegistrationPromise = navigator.serviceWorker
      .register(getNotificationServiceWorkerUrl(), { updateViaCache: 'none' })
      .then(registration => {
        registration.update?.().catch(() => {});
        return navigator.serviceWorker.ready
          .then(readyRegistration => readyRegistration || registration)
          .catch(() => registration);
      })
      .catch(() => {
        notificationServiceWorkerRegistrationPromise = null;
        return null;
      });
  }

  return notificationServiceWorkerRegistrationPromise;
}

function prepareBackgroundTaskNotification() {
  return requestBackgroundTaskNotificationPermission(getBrowserNotificationApi()).then(permission => {
    if (permission === 'granted') {
      ensureNotificationServiceWorker().catch(() => {});
    }
    return permission;
  });
}

function isPageUnfocusedForBackgroundTaskNotification() {
  if (typeof document === 'undefined') return false;
  if (document.hidden || document.visibilityState === 'hidden') return true;
  return typeof document.hasFocus === 'function' ? !document.hasFocus() : false;
}

async function notifyBackgroundTaskComplete({
  autoCloseMs = 0,
  body = 'The background task is done.',
  permissionPromise = null,
  tag = 'query-background-task',
  title = 'Task finished'
} = {}) {
  if (!isPageUnfocusedForBackgroundTaskNotification()) return false;
  const notificationApi = getBrowserNotificationApi();
  const permission = permissionPromise ? await permissionPromise : notificationApi?.permission;
  if (!notificationApi || (permission !== 'granted' && notificationApi.permission !== 'granted')) return false;
  const options = {
    body,
    data: {
      url: typeof location !== 'undefined' ? location.href : './index.html'
    },
    renotify: true,
    requireInteraction: autoCloseMs <= 0,
    tag
  };

  const registration = await ensureNotificationServiceWorker();
  if (registration && typeof registration.showNotification === 'function') {
    try {
      await registration.showNotification(title, options);
      return true;
    } catch {
      // Fall back to the page Notification API below.
    }
  }

  try {
    const notification = new notificationApi(title, options);
    notification.onclick = () => {
      if (typeof window !== 'undefined') window.focus?.();
      notification.close?.();
    };
    if (autoCloseMs > 0) {
      const timeout = typeof window !== 'undefined' && typeof window.setTimeout === 'function' ? window.setTimeout : setTimeout;
      timeout(() => notification.close?.(), autoCloseMs);
    }
    return true;
  } catch {
    return false;
  }
}

export {
  notifyBackgroundTaskComplete,
  prepareBackgroundTaskNotification
};
