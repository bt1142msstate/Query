function normalizeErrorText(value, maxLength = 600) {
  if (value === null || value === undefined || typeof value === 'object') {
    return '';
  }

  const text = String(value).replace(/\s+/gu, ' ').trim();
  if (!text) {
    return '';
  }

  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

function normalizeErrorNumber(value) {
  if (value === null || value === undefined || value === '' || typeof value === 'object') {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function formatErrorToken(value) {
  return normalizeErrorText(value, 120)
    .replace(/[_:.-]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
    .replace(/\b\w/gu, letter => letter.toUpperCase());
}

function normalizeBackendErrorContext(context) {
  if (!context || typeof context !== 'object' || Array.isArray(context)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(context)
      .map(([key, value]) => {
        const safeKey = normalizeErrorText(key, 80);
        if (!safeKey) {
          return null;
        }

        const number = normalizeErrorNumber(value);
        return [safeKey, number === null ? normalizeErrorText(value, 240) : number];
      })
      .filter(Boolean)
  );
}

function normalizeBackendErrorDetails(errorDetails) {
  if (!errorDetails || typeof errorDetails !== 'object' || Array.isArray(errorDetails)) {
    return null;
  }

  const normalized = {
    schemaVersion: normalizeErrorNumber(errorDetails.schema_version) || 1,
    stage: normalizeErrorText(errorDetails.stage, 120),
    component: normalizeErrorText(errorDetails.component, 120),
    code: normalizeErrorText(errorDetails.code, 120),
    message: normalizeErrorText(errorDetails.message, 900),
    hint: normalizeErrorText(errorDetails.hint, 600),
    command: normalizeErrorText(errorDetails.command, 900),
    exitCode: normalizeErrorNumber(errorDetails.exit_code),
    occurredAt: normalizeErrorText(errorDetails.occurred_at || errorDetails.occurredAt, 120),
    occurredEpoch: normalizeErrorNumber(errorDetails.occurred_epoch || errorDetails.occurredEpoch),
    context: normalizeBackendErrorContext(errorDetails.context)
  };

  const hasContent = normalized.stage
    || normalized.component
    || normalized.code
    || normalized.message
    || normalized.hint
    || normalized.command
    || normalized.exitCode !== null
    || Object.keys(normalized.context).length > 0;

  return hasContent ? normalized : null;
}

function formatBackendErrorSummary(errorDetails) {
  const normalized = normalizeBackendErrorDetails(errorDetails);
  if (!normalized) {
    return '';
  }

  const parts = [
    formatErrorToken(normalized.component),
    formatErrorToken(normalized.code)
  ].filter(Boolean);

  return parts.join(' - ') || normalized.message || normalized.hint || '';
}

function getBackendErrorDetailItems(errorDetails) {
  const normalized = normalizeBackendErrorDetails(errorDetails);
  if (!normalized) {
    return [];
  }

  const items = [];
  const push = (label, value) => {
    if (value === null || value === undefined || value === '') {
      return;
    }
    items.push({ label, value: String(value) });
  };

  push('Stage', formatErrorToken(normalized.stage));
  push('Component', formatErrorToken(normalized.component));
  push('Code', normalized.code);
  push('Message', normalized.message);
  push('Hint', normalized.hint);
  push('Exit code', normalized.exitCode);
  push('Command', normalized.command);
  push('Occurred', normalized.occurredAt);

  Object.entries(normalized.context).forEach(([key, value]) => {
    push(formatErrorToken(key), value);
  });

  return items;
}

export {
  formatBackendErrorSummary,
  getBackendErrorDetailItems,
  normalizeBackendErrorDetails
};
