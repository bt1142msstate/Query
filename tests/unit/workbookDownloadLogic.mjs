import assert from 'node:assert/strict';
import {
  buildWorkbookFilename,
  notifyWorkbookDownloadComplete,
  prepareWorkbookDownloadNotification
} from '../../table/export/workbookDownload.js';

const originalDocument = globalThis.document;
const originalNotification = globalThis.Notification;
const originalSetTimeout = globalThis.setTimeout;
const originalWindow = globalThis.window;

const notifications = [];
let focusCalls = 0;
let permissionRequests = 0;
let timeoutCalls = 0;

class TestNotification {
  static permission = 'default';

  static requestPermission() {
    permissionRequests += 1;
    TestNotification.permission = 'granted';
    return Promise.resolve('granted');
  }

  constructor(title, options) {
    this.title = title;
    this.options = options;
    this.closed = false;
    notifications.push(this);
  }

  close() {
    this.closed = true;
  }
}

globalThis.setTimeout = callback => {
  timeoutCalls += 1;
  callback();
  return 1;
};
globalThis.document = {
  hidden: false,
  visibilityState: 'visible',
  hasFocus: () => true
};
globalThis.window = {
  Notification: TestNotification,
  focus() {
    focusCalls += 1;
  },
  setTimeout: globalThis.setTimeout
};
globalThis.Notification = TestNotification;

assert.equal(buildWorkbookFilename('My Report', { mode: 'single' }), 'My-Report.xlsx');
assert.equal(buildWorkbookFilename('My Report', { groupField: 'Home Library', mode: 'grouped' }), 'My-Report-by-Home-Library.xlsx');

const permission = await prepareWorkbookDownloadNotification();
assert.equal(permission, 'granted');
assert.equal(permissionRequests, 1);

const visibleResult = await notifyWorkbookDownloadComplete({
  filename: 'My-Report.xlsx',
  permissionPromise: Promise.resolve('granted')
});
assert.equal(visibleResult, false);
assert.equal(notifications.length, 0);

globalThis.document = {
  hidden: false,
  visibilityState: 'visible',
  hasFocus: () => false
};
const unfocusedResult = await notifyWorkbookDownloadComplete({
  filename: 'My-Report.xlsx',
  permissionPromise: Promise.resolve('granted')
});
assert.equal(unfocusedResult, true);
assert.equal(notifications.length, 1);
assert.equal(notifications[0].title, 'Excel export finished');
assert.equal(notifications[0].options.body, 'My-Report.xlsx is ready.');
assert.equal(notifications[0].closed, true);
assert.equal(timeoutCalls, 1);

notifications[0].onclick();
assert.equal(focusCalls, 1);

TestNotification.permission = 'denied';
globalThis.document = {
  hidden: true,
  visibilityState: 'hidden',
  hasFocus: () => false
};
const deniedResult = await notifyWorkbookDownloadComplete({
  filename: 'Denied.xlsx',
  permissionPromise: Promise.resolve('denied')
});
assert.equal(deniedResult, false);
assert.equal(notifications.length, 1);

globalThis.document = originalDocument;
globalThis.Notification = originalNotification;
globalThis.setTimeout = originalSetTimeout;
globalThis.window = originalWindow;

console.log('Workbook download logic tests passed');
