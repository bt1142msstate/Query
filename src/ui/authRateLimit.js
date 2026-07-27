function getRateLimitDeadline(error, now = Date.now()) {
  const blockUntilEpoch = Number(error?.payload?.block_until_epoch);
  const absoluteDeadline = Number.isFinite(blockUntilEpoch)
    ? Math.ceil(blockUntilEpoch * 1000)
    : 0;
  if (absoluteDeadline > now) {
    return absoluteDeadline;
  }

  const retryAfterSeconds = Number(error?.retryAfterSeconds);
  return now + (
    Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
      ? Math.ceil(retryAfterSeconds) * 1000
      : 0
  );
}

function getRemainingSeconds(deadline, now = Date.now()) {
  const remainingMilliseconds = Number(deadline) - Number(now);
  return Number.isFinite(remainingMilliseconds) && remainingMilliseconds > 0
    ? Math.ceil(remainingMilliseconds / 1000)
    : 0;
}

function formatSignInRetryCountdown(seconds) {
  const totalSeconds = Number.isFinite(Number(seconds))
    ? Math.max(0, Math.ceil(Number(seconds)))
    : 0;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = totalSeconds % 60;

  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`
    : `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
}

export {
  formatSignInRetryCountdown,
  getRateLimitDeadline,
  getRemainingSeconds
};
