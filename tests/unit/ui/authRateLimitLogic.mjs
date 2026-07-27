import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatSignInRetryCountdown,
  getRateLimitDeadline,
  getRemainingSeconds
} from '../../../src/ui/authRateLimit.js';

test('rate-limit deadline prefers the absolute server deadline', () => {
  const now = 1_000_000;
  const deadline = getRateLimitDeadline({
    retryAfterSeconds: 30,
    payload: { block_until_epoch: 1_120 }
  }, now);
  assert.equal(deadline, 1_120_000);
});

test('rate-limit deadline falls back to the retry duration', () => {
  assert.equal(
    getRateLimitDeadline({ retryAfterSeconds: 45, payload: {} }, 1_000_000),
    1_045_000
  );
});

test('remaining time rounds up and never becomes negative', () => {
  assert.equal(getRemainingSeconds(10_001, 10_000), 1);
  assert.equal(getRemainingSeconds(10_000, 10_000), 0);
  assert.equal(getRemainingSeconds(9_000, 10_000), 0);
});

test('sign-in retry countdown uses fixed-width clock formatting', () => {
  assert.equal(formatSignInRetryCountdown(0), '0:00');
  assert.equal(formatSignInRetryCountdown(65), '1:05');
  assert.equal(formatSignInRetryCountdown(3661), '1:01:01');
});
