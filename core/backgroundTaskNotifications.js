let notificationPermissionPromise = null;

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

function prepareBackgroundTaskNotification() {
  return requestBackgroundTaskNotificationPermission(getBrowserNotificationApi());
}

function isPageUnfocusedForBackgroundTaskNotification() {
  if (typeof document === 'undefined') return false;
  if (document.hidden || document.visibilityState === 'hidden') return true;
  return typeof document.hasFocus === 'function' ? !document.hasFocus() : false;
}

async function notifyBackgroundTaskComplete({
  autoCloseMs = 10000,
  body = 'The background task is done.',
  permissionPromise = null,
  tag = 'query-background-task',
  title = 'Task finished'
} = {}) {
  if (!isPageUnfocusedForBackgroundTaskNotification()) return false;
  const notificationApi = getBrowserNotificationApi();
  const permission = permissionPromise ? await permissionPromise : notificationApi?.permission;
  if (!notificationApi || (permission !== 'granted' && notificationApi.permission !== 'granted')) return false;
  try {
    const notification = new notificationApi(title, {
      body,
      tag,
      renotify: true
    });
    notification.onclick = () => {
      if (typeof window !== 'undefined') window.focus?.();
      notification.close?.();
    };
    const timeout = typeof window !== 'undefined' && typeof window.setTimeout === 'function' ? window.setTimeout : setTimeout;
    timeout(() => notification.close?.(), autoCloseMs);
    return true;
  } catch {
    return false;
  }
}

export {
  isPageUnfocusedForBackgroundTaskNotification,
  notifyBackgroundTaskComplete,
  prepareBackgroundTaskNotification
};
