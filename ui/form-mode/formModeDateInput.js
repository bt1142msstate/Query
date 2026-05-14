import { normalizeDateValue as normalizeSharedDateValue } from '../../core/dateValues.js';

const FORM_MODE_DATE_IDLE_MS = 800;

function readInputValue(input) {
  return String(input?.value ?? '').trim();
}

function resolveDateValue(value, normalizeDateValue = normalizeSharedDateValue) {
  const raw = String(value ?? '').trim();
  if (!raw) {
    return {
      canCommit: true,
      normalized: '',
      raw
    };
  }

  const normalized = typeof normalizeDateValue === 'function'
    ? normalizeDateValue(raw)
    : normalizeSharedDateValue(raw);

  return {
    canCommit: Boolean(normalized),
    normalized: normalized || '',
    raw
  };
}

function createFormModeDateInputState(input, options = {}) {
  const normalizeDateValue = typeof options.normalizeDateValue === 'function'
    ? options.normalizeDateValue
    : normalizeSharedDateValue;
  const idleMs = Number.isFinite(options.idleMs) ? Math.max(0, options.idleMs) : FORM_MODE_DATE_IDLE_MS;
  const initialValue = resolveDateValue(readInputValue(input), normalizeDateValue);
  let committedValue = initialValue.canCommit ? initialValue.normalized : initialValue.raw;
  let drafting = false;
  let commitTimer = null;
  let dispatchingCommit = false;

  function clearCommitTimer() {
    if (commitTimer) {
      clearTimeout(commitTimer);
      commitTimer = null;
    }
  }

  function dispatchCommitEvents() {
    dispatchingCommit = true;
    try {
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    } finally {
      dispatchingCommit = false;
    }
  }

  function finishDraft(options = {}) {
    clearCommitTimer();
    const wasDrafting = drafting;
    const previousValue = input.value;
    const previousCommittedValue = committedValue;
    const resolved = resolveDateValue(readInputValue(input), normalizeDateValue);
    drafting = false;

    if (resolved.canCommit) {
      committedValue = resolved.normalized;
      input.value = resolved.normalized;
    }

    const changed = previousValue !== input.value || previousCommittedValue !== committedValue || wasDrafting;
    if (options.dispatch && changed) {
      dispatchCommitEvents();
    }

    return resolved;
  }

  function scheduleIdleCommit() {
    clearCommitTimer();
    commitTimer = setTimeout(() => {
      const resolved = resolveDateValue(readInputValue(input), normalizeDateValue);
      if (resolved.canCommit) {
        finishDraft({ dispatch: true });
      }
    }, idleMs);
  }

  function handleInput() {
    if (dispatchingCommit) return;
    drafting = true;
    scheduleIdleCommit();
  }

  function handleChange() {
    if (dispatchingCommit) return;
    finishDraft();
  }

  function handleBlur() {
    if (dispatchingCommit) return;
    finishDraft({ dispatch: true });
  }

  input.addEventListener('input', handleInput);
  input.addEventListener('change', handleChange);
  input.addEventListener('blur', handleBlur);

  return {
    destroy() {
      clearCommitTimer();
      input.removeEventListener('input', handleInput);
      input.removeEventListener('change', handleChange);
      input.removeEventListener('blur', handleBlur);
    },
    getFormValues() {
      const activeElement = input.ownerDocument?.activeElement || null;
      if (drafting && activeElement === input) {
        return committedValue ? [committedValue] : [];
      }

      const value = readInputValue(input);
      return value ? [value] : [];
    },
    setValue(value) {
      clearCommitTimer();
      drafting = false;
      const resolved = resolveDateValue(value, normalizeDateValue);
      committedValue = resolved.canCommit ? resolved.normalized : resolved.raw;
      input.value = committedValue;
    }
  };
}

export {
  FORM_MODE_DATE_IDLE_MS,
  createFormModeDateInputState,
  resolveDateValue
};
