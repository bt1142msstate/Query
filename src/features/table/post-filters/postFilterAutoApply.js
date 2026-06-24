const DEFAULT_AUTO_APPLY_DELAY_MS = 320;
const DEFAULT_WATCH_INTERVAL_MS = 250;

function createPostFilterAutoApplyController({
  applyDraft,
  delayMs = DEFAULT_AUTO_APPLY_DELAY_MS,
  getDraftSignature,
  watchIntervalMs = DEFAULT_WATCH_INTERVAL_MS,
  window
}) {
  let autoApplyTimer = null;
  let autoApplyWatcher = null;
  let hasPendingAutoApply = false;
  let lastDraftSignature = '';

  function cancel() {
    if (autoApplyTimer !== null) {
      window.clearTimeout(autoApplyTimer);
      autoApplyTimer = null;
    }
  }

  function syncDraftSignature() {
    hasPendingAutoApply = false;
    lastDraftSignature = getDraftSignature();
  }

  function applyNow() {
    const didApply = applyDraft();
    syncDraftSignature();
    return didApply;
  }

  function reset() {
    cancel();
    syncDraftSignature();
  }

  function stop() {
    if (autoApplyWatcher !== null) {
      window.clearInterval(autoApplyWatcher);
      autoApplyWatcher = null;
    }
    cancel();
    hasPendingAutoApply = false;
    lastDraftSignature = '';
  }

  function schedule(delay = delayMs) {
    cancel();
    hasPendingAutoApply = true;
    autoApplyTimer = window.setTimeout(() => {
      autoApplyTimer = null;
      applyNow();
    }, delay);
  }

  function start() {
    stop();
    syncDraftSignature();
    autoApplyWatcher = window.setInterval(() => {
      const nextSignature = getDraftSignature();
      if (nextSignature === lastDraftSignature) {
        return;
      }
      lastDraftSignature = nextSignature;
      schedule();
    }, watchIntervalMs);
  }

  function flush() {
    const draftChanged = getDraftSignature() !== lastDraftSignature;
    cancel();
    if (hasPendingAutoApply || draftChanged) {
      return applyNow();
    }
    return false;
  }

  return Object.freeze({
    cancel,
    flush,
    reset,
    schedule,
    start,
    stop
  });
}

export { createPostFilterAutoApplyController };
