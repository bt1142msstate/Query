const MAX_PROGRESS_TEXT_LENGTH = 180;

function normalizeProgressText(value, maxLength = MAX_PROGRESS_TEXT_LENGTH) {
  if (value === null || value === undefined || typeof value === 'object') {
    return '';
  }

  const text = String(value).trim();
  if (!text) {
    return '';
  }

  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

function normalizeProgressNumber(value) {
  if (value === null || value === undefined || value === '' || typeof value === 'object') {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function clampPercent(value) {
  const number = normalizeProgressNumber(value);
  if (number === null) {
    return null;
  }

  return Math.max(0, Math.min(100, number));
}

function formatProgressNumber(value) {
  const number = normalizeProgressNumber(value);
  if (number === null) {
    return '';
  }

  const rounded = Math.abs(number % 1) > 0 ? Number(number.toFixed(1)) : number;
  return rounded.toLocaleString();
}

function formatProgressCounterLabel(key) {
  return normalizeProgressText(key)
    .replace(/[_:.-]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
    .replace(/\b\w/gu, letter => letter.toUpperCase());
}

function normalizeProgressCounters(counters) {
  if (!counters || typeof counters !== 'object' || Array.isArray(counters)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(counters)
      .map(([key, value]) => {
        const safeKey = normalizeProgressText(key, 80)
          .toLowerCase()
          .replace(/[^a-z0-9_.:-]+/gu, '_')
          .replace(/^_+|_+$/gu, '');
        if (!safeKey) {
          return null;
        }

        const number = normalizeProgressNumber(value);
        return [safeKey, number === null ? normalizeProgressText(value, 100) : number];
      })
      .filter(Boolean)
  );
}

function normalizeBackendProgress(progress) {
  if (!progress || typeof progress !== 'object' || Array.isArray(progress)) {
    return null;
  }

  const normalized = {
    schemaVersion: normalizeProgressNumber(progress.schema_version) || 1,
    stage: normalizeProgressText(progress.stage, 80),
    label: normalizeProgressText(progress.label, 120),
    detail: normalizeProgressText(progress.detail, 240),
    current: normalizeProgressNumber(progress.current),
    total: normalizeProgressNumber(progress.total),
    percent: clampPercent(progress.percent),
    unit: normalizeProgressText(progress.unit, 80),
    counters: normalizeProgressCounters(progress.counters),
    updatedAt: normalizeProgressText(progress.updated_at || progress.updatedAt, 80),
    updatedEpoch: normalizeProgressNumber(progress.updated_epoch || progress.updatedEpoch)
  };

  if (normalized.percent === null && normalized.current !== null && normalized.total > 0) {
    normalized.percent = clampPercent((normalized.current / normalized.total) * 100);
  }

  const hasContent = normalized.stage
    || normalized.label
    || normalized.detail
    || normalized.current !== null
    || Object.keys(normalized.counters).length > 0;

  return hasContent ? normalized : null;
}

function formatBackendProgressAmount(progress) {
  const normalized = normalizeBackendProgress(progress);
  if (!normalized) {
    return '';
  }

  const unit = normalized.unit || 'items';
  if (normalized.current !== null && normalized.total !== null) {
    return `${formatProgressNumber(normalized.current)} / ${formatProgressNumber(normalized.total)} ${unit}`;
  }

  if (normalized.current !== null) {
    return `${formatProgressNumber(normalized.current)} ${unit}`;
  }

  if (normalized.percent !== null) {
    return `${formatProgressNumber(normalized.percent)}%`;
  }

  return '';
}

function formatBackendProgressSummary(progress) {
  const normalized = normalizeBackendProgress(progress);
  if (!normalized) {
    return '';
  }

  return normalized.label || formatProgressCounterLabel(normalized.stage) || 'Working';
}

function formatBackendProgressDetail(progress) {
  const normalized = normalizeBackendProgress(progress);
  if (!normalized) {
    return '';
  }

  const amount = formatBackendProgressAmount(normalized);
  if (normalized.detail && amount) {
    return `${normalized.detail} - ${amount}`;
  }

  return normalized.detail || amount;
}

function getBackendProgressCounterItems(progress, limit = 3) {
  const normalized = normalizeBackendProgress(progress);
  if (!normalized) {
    return [];
  }

  return Object.entries(normalized.counters)
    .slice(0, Math.max(0, limit))
    .map(([key, value]) => ({
      key,
      label: formatProgressCounterLabel(key),
      value: typeof value === 'number' ? formatProgressNumber(value) : normalizeProgressText(value, 100)
    }))
    .filter(item => item.label && item.value !== '');
}

export {
  formatBackendProgressAmount,
  formatBackendProgressDetail,
  formatBackendProgressSummary,
  getBackendProgressCounterItems,
  normalizeBackendProgress
};
