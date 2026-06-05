const WARNING_KEYS = [
  'performanceWarning',
  'retrievalWarning',
  'fieldWarning',
  'warning'
];

function normalizeFieldWarningLevel(level) {
  const normalized = String(level || '').trim().toLowerCase();
  return ['info', 'warning', 'error'].includes(normalized) ? normalized : 'warning';
}

function normalizeFieldWarningPayload(payload) {
  if (!payload) return null;

  if (typeof payload === 'string') {
    const message = payload.trim();
    return message ? { level: 'warning', message } : null;
  }

  if (typeof payload !== 'object') {
    return null;
  }

  const message = String(
    payload.message
    ?? payload.text
    ?? payload.detail
    ?? payload.description
    ?? ''
  ).trim();

  return message
    ? {
        level: normalizeFieldWarningLevel(payload.level || payload.severity || payload.type),
        message
      }
    : null;
}

function getFieldPerformanceWarning(fieldDefOrOption) {
  if (!fieldDefOrOption || typeof fieldDefOrOption !== 'object') {
    return null;
  }

  for (const key of WARNING_KEYS) {
    const warning = normalizeFieldWarningPayload(fieldDefOrOption[key]);
    if (warning) return warning;
  }

  return null;
}

function getFieldPerformanceWarningMessage(fieldDefOrOption) {
  return getFieldPerformanceWarning(fieldDefOrOption)?.message || '';
}

export {
  getFieldPerformanceWarning,
  getFieldPerformanceWarningMessage,
  normalizeFieldWarningPayload
};
