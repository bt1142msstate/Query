import assert from 'node:assert/strict';
import {
  notifyHistoryResultLoadComplete,
  prepareHistoryResultLoadNotification
} from '../../history/queryHistoryNotifications.js';

const originalDocument = globalThis.document;
const originalNotification = globalThis.Notification;
const originalSetTimeout = globalThis.setTimeout;
const originalWindow = globalThis.window;
const notifications = [];

class TestNotification {
  static permission = 'granted';

  constructor(title, options) {
    this.title = title;
    this.options = options;
    notifications.push(this);
  }

  close() {}
}

globalThis.setTimeout = callback => {
  callback();
  return 1;
};
globalThis.document = {
  hidden: true,
  visibilityState: 'hidden',
  hasFocus: () => false
};
globalThis.window = {
  Notification: TestNotification,
  focus() {},
  setTimeout: globalThis.setTimeout
};
globalThis.Notification = TestNotification;

assert.equal(await prepareHistoryResultLoadNotification(), 'granted');

notifyHistoryResultLoadComplete({
  permissionPromise: Promise.resolve('granted'),
  query: { running: true },
  queryId: 'query-123',
  rowCount: 5,
  streamError: null
});

await new Promise(resolve => setTimeout(resolve, 0));

assert.equal(notifications.length, 1);
assert.equal(notifications[0].title, 'History results loaded');
assert.equal(notifications[0].options.body, 'Loaded 5 partial results from running query.');
assert.equal(notifications[0].options.tag, 'history-results-query-123');

globalThis.document = originalDocument;
globalThis.Notification = originalNotification;
globalThis.setTimeout = originalSetTimeout;
globalThis.window = originalWindow;

console.log('Query history notification logic tests passed');
