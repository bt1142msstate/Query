const ISO_DATE_PATTERN = /^(?:\d{1,2}\/\d{1,2}\/\d{4}|\d{8}|\d{12}|\d{14}|\d{4}[\/ -]\d{2}[\/ -]\d{2})$/;

function pad(value) {
  return String(value).padStart(2, '0');
}

function toDisplayDate(date) {
  return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
}

function toBackendDateValue(displayValue) {
  const parsed = parseDateValue(displayValue);
  if (!parsed) return displayValue;
  return `${parsed.getFullYear()}${pad(parsed.getMonth() + 1)}${pad(parsed.getDate())}`;
}

function toIsoDate(date) {
  return toDisplayDate(date);
}

function parseDisplayDate(normalized) {
  const slashFwd = normalized.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashFwd) {
    const [, month, day, year] = slashFwd.map(Number);
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
  }

  const compact = normalized.match(/^(\d{4})(\d{2})(\d{2})(?:\d{2})?(?:\d{2})?$/);
  if (compact) {
    const year = Number(compact[1]);
    const month = Number(compact[2]);
    const day = Number(compact[3]);
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
  }

  const iso = normalized.match(/^(\d{4})[\/-](\d{2})[\/-](\d{2})$/);
  if (iso) {
    const [, year, month, day] = iso.map(Number);
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
  }

  return null;
}

function parseIsoDate(value) {
  const normalized = String(value || '').trim();
  if (!ISO_DATE_PATTERN.test(normalized)) return null;
  return parseDisplayDate(normalized);
}

function parseDateValue(value) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : new Date(value.getTime());
  }

  return parseIsoDate(value);
}

function isValidDateValue(value) {
  return Boolean(parseDateValue(value));
}

function normalizeDateValue(value) {
  const parsed = parseDateValue(value);
  return parsed ? toIsoDate(parsed) : '';
}

function getComparableValue(value) {
  const parsed = parseDateValue(value);
  return parsed ? parsed.getTime() : NaN;
}

function formatDisplayValue(value, options = {}) {
  const {
    invalidValue = 'Never',
    fallbackToRaw = false
  } = options;

  const parsed = parseDateValue(value);
  if (parsed) {
    return toDisplayDate(parsed);
  }

  const rawText = String(value || '').trim();
  return fallbackToRaw ? rawText : invalidValue;
}

export {
  formatDisplayValue,
  getComparableValue,
  isValidDateValue,
  normalizeDateValue,
  parseDateValue,
  parseIsoDate,
  toBackendDateValue,
  toDisplayDate,
  toIsoDate
};
