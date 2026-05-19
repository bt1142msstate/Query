const XLSX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
let notificationPermissionPromise = null;

function getSafeWorkbookName(value) {
  return String(value || '')
    .replace(/[^a-zA-Z0-9\-_\s]/g, '')
    .replace(/\s+/g, '-');
}

function buildWorkbookFilename(tableName, config = {}) {
  const safeFileName = getSafeWorkbookName(tableName);
  const suffix = config.mode === 'grouped' && config.groupField
    ? `-by-${getSafeWorkbookName(config.groupField).trim()}`
    : '';
  return `${safeFileName || 'Query-Results'}${suffix}.xlsx`;
}

function downloadWorkbookBlob(blob, filename) {
  const link = document.createElement('a');
  const objectUrl = URL.createObjectURL(blob);
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
}

function triggerWorkbookDownload(buffer, filename) {
  downloadWorkbookBlob(new Blob([buffer], { type: XLSX_MIME_TYPE }), filename);
}

function getBrowserNotificationApi() {
  return (typeof window !== 'undefined' && window.Notification)
    || (typeof Notification !== 'undefined' && Notification)
    || null;
}

function requestWorkbookNotificationPermission(notificationApi) {
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

function prepareWorkbookDownloadNotification() {
  return requestWorkbookNotificationPermission(getBrowserNotificationApi());
}

function isPageUnfocusedForDownloadNotification() {
  if (typeof document === 'undefined') return false;
  if (document.hidden || document.visibilityState === 'hidden') return true;
  return typeof document.hasFocus === 'function' ? !document.hasFocus() : false;
}

async function notifyWorkbookDownloadComplete({ filename = '', permissionPromise = null } = {}) {
  if (!isPageUnfocusedForDownloadNotification()) return false;
  const notificationApi = getBrowserNotificationApi();
  const permission = permissionPromise ? await permissionPromise : notificationApi?.permission;
  if (!notificationApi || (permission !== 'granted' && notificationApi.permission !== 'granted')) return false;
  try {
    const notification = new notificationApi('Excel export finished', {
      body: `${filename || 'Workbook'} is ready.`,
      tag: 'query-workbook-export',
      renotify: true
    });
    notification.onclick = () => {
      if (typeof window !== 'undefined') window.focus?.();
      notification.close?.();
    };
    const timeout = typeof window !== 'undefined' && typeof window.setTimeout === 'function' ? window.setTimeout : setTimeout;
    timeout(() => notification.close?.(), 10000);
    return true;
  } catch {
    return false;
  }
}

export {
  XLSX_MIME_TYPE,
  buildWorkbookFilename,
  downloadWorkbookBlob,
  notifyWorkbookDownloadComplete,
  prepareWorkbookDownloadNotification,
  triggerWorkbookDownload
};
