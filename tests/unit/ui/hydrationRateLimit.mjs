import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getHydrationRetryDeadline,
  hydrationPauseMessage,
  waitForHydrationRetry
} from '../../../src/ui/bib-compare/hydrationRateLimit.js';

test('hydration retry uses the server deadline with a small clearance margin', () => {
  assert.equal(getHydrationRetryDeadline({
    retryAfterSeconds: 10,
    payload: { block_until_epoch: 20 }
  }, 5000), 21_500);
  assert.equal(hydrationPauseMessage(70_000, 5000), 'Request limit reached. Paused safely; retrying in 1:05.');
});

test('hydration retry waits through the countdown and preserves the same batch', async () => {
  let currentTime = 1000;
  const ticks = [];
  const completed = await waitForHydrationRetry({
    error: { retryAfterSeconds: 2, payload: {} },
    isCurrent: () => true,
    onTick: state => ticks.push(state.remaining),
    now: () => currentTime,
    wait: async milliseconds => { currentTime += milliseconds; }
  });
  assert.equal(completed, true);
  assert.deepEqual(ticks, [4, 3, 2, 1]);
});

test('hydration retry stops immediately when the user cancels', async () => {
  assert.equal(await waitForHydrationRetry({
    error: { retryAfterSeconds: 30, payload: {} },
    isCurrent: () => false
  }), false);
});
