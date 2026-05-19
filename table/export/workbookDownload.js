import { notifyBackgroundTaskComplete, prepareBackgroundTaskNotification } from '../../core/backgroundTaskNotifications.js';

const XLSX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

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

function prepareWorkbookDownloadNotification() {
  return prepareBackgroundTaskNotification();
}

async function notifyWorkbookDownloadComplete({ filename = '', permissionPromise = null } = {}) {
  return notifyBackgroundTaskComplete({
    body: `${filename || 'Workbook'} is ready.`,
    permissionPromise,
    tag: 'query-workbook-export',
    title: 'Excel export finished'
  });
}

export {
  XLSX_MIME_TYPE,
  buildWorkbookFilename,
  downloadWorkbookBlob,
  notifyWorkbookDownloadComplete,
  prepareWorkbookDownloadNotification,
  triggerWorkbookDownload
};
