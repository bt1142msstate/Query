import assert from 'node:assert/strict';
import {
  buildWorkbookFilename,
  notifyWorkbookDownloadComplete,
  prepareWorkbookDownloadNotification
} from '../../../src/lib/workbook-export/workbookDownload.js';
import test from 'node:test';

test('workbook download', async () => {
  const originalDocument = globalThis.document;
  const originalNavigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const originalNotification = globalThis.Notification;
  const originalSetTimeout = globalThis.setTimeout;
  const originalWindow = globalThis.window;

  const notifications = [];
  const serviceWorkerNotifications = [];
  let focusCalls = 0;
  let permissionRequests = 0;
  let timeoutCalls = 0;
  let serviceWorkerRegisterCalls = 0;

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
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {}
  });

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
  assert.equal(notifications[0].closed, false);
  assert.equal(timeoutCalls, 0);

  notifications[0].onclick();
  assert.equal(focusCalls, 1);
  assert.equal(notifications[0].closed, true);

  TestNotification.permission = 'denied';
  globalThis.document = {
    hidden: true,
    documentElement: {
      dataset: {
        queryAppCacheVersion: 'unit-test-version'
      }
    },
    visibilityState: 'hidden',
    hasFocus: () => false
  };
  const deniedResult = await notifyWorkbookDownloadComplete({
    filename: 'Denied.xlsx',
    permissionPromise: Promise.resolve('denied')
  });
  assert.equal(deniedResult, false);
  assert.equal(notifications.length, 1);

  TestNotification.permission = 'granted';
  const serviceWorkerRegistration = {
    showNotification(title, options) {
      serviceWorkerNotifications.push({ options, title });
      return Promise.resolve();
    },
    update() {
      return Promise.resolve();
    }
  };
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      serviceWorker: {
        ready: Promise.resolve(serviceWorkerRegistration),
        register(url, options) {
          serviceWorkerRegisterCalls += 1;
          assert.match(String(url), /backgroundNotificationServiceWorker\.js\?v=unit-test-version$/u);
          assert.equal(options?.updateViaCache, 'none');
          return Promise.resolve(serviceWorkerRegistration);
        }
      }
    }
  });

  assert.equal(await prepareWorkbookDownloadNotification(), 'granted');
  const serviceWorkerResult = await notifyWorkbookDownloadComplete({
    filename: 'Service-Worker.xlsx',
    permissionPromise: Promise.resolve('granted')
  });
  assert.equal(serviceWorkerResult, true);
  assert.equal(serviceWorkerRegisterCalls, 1);
  assert.equal(serviceWorkerNotifications.length, 1);
  assert.equal(serviceWorkerNotifications[0].title, 'Excel export finished');
  assert.equal(serviceWorkerNotifications[0].options.body, 'Service-Worker.xlsx is ready.');
  assert.equal(serviceWorkerNotifications[0].options.requireInteraction, true);
  assert.equal(serviceWorkerNotifications[0].options.tag, 'query-workbook-export');
  assert.equal(notifications.length, 1);

  globalThis.document = originalDocument;
  globalThis.Notification = originalNotification;
  globalThis.setTimeout = originalSetTimeout;
  globalThis.window = originalWindow;
  if (originalNavigatorDescriptor) {
    Object.defineProperty(globalThis, 'navigator', originalNavigatorDescriptor);
  } else {
    delete globalThis.navigator;
  }
});
