import {
  formatSignInRetryCountdown,
  getRateLimitDeadline,
  getRemainingSeconds
} from '../authRateLimit.js';

const RETRY_GRACE_MS = 1500;

function getHydrationRetryDeadline(error, now = Date.now()) {
  return Math.max(now + 1000, getRateLimitDeadline(error, now) + RETRY_GRACE_MS);
}

function hydrationPauseMessage(deadline, now = Date.now()) {
  const remaining = getRemainingSeconds(deadline, now);
  return `Request limit reached. Paused safely; retrying in ${formatSignInRetryCountdown(remaining)}.`;
}

async function waitForHydrationRetry({
  error,
  isCurrent,
  onTick,
  now = Date.now,
  wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))
}) {
  const deadline = getHydrationRetryDeadline(error, now());
  while (isCurrent()) {
    const remaining = getRemainingSeconds(deadline, now());
    if (remaining <= 0) return true;
    onTick?.({ deadline, remaining, message: hydrationPauseMessage(deadline, now()) });
    await wait(Math.min(1000, Math.max(1, deadline - now())));
  }
  return false;
}

export {
  getHydrationRetryDeadline,
  hydrationPauseMessage,
  waitForHydrationRetry
};
