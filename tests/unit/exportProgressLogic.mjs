import assert from 'node:assert/strict';
import { yieldToBrowser } from '../../table/export/exportProgress.js';
import test from 'node:test';

test('export progress', async () => {
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  const originalSetTimeout = globalThis.setTimeout;

  let rafCalls = 0;
  let schedulerCalls = 0;
  let timeoutCalls = 0;

  globalThis.setTimeout = callback => {
    timeoutCalls += 1;
    callback();
    return 1;
  };

  globalThis.document = { hidden: false };
  globalThis.window = {
    requestAnimationFrame(callback) {
      rafCalls += 1;
      callback();
    },
    scheduler: {
      postTask(callback) {
        schedulerCalls += 1;
        callback();
        return Promise.resolve();
      }
    }
  };

  await yieldToBrowser();
  assert.equal(rafCalls, 1);
  assert.equal(schedulerCalls, 0);
  assert.equal(timeoutCalls, 0);

  globalThis.document.hidden = true;
  await yieldToBrowser();
  assert.equal(rafCalls, 1);
  assert.equal(schedulerCalls, 1);
  assert.equal(timeoutCalls, 0);

  globalThis.window.requestAnimationFrame = null;
  await yieldToBrowser();
  assert.equal(rafCalls, 1);
  assert.equal(schedulerCalls, 2);
  assert.equal(timeoutCalls, 0);

  globalThis.document = originalDocument;
  globalThis.window = originalWindow;
  globalThis.setTimeout = originalSetTimeout;
});
