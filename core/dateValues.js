const DATE_INPUT_PATTERN = '^(Never|\\d{1,2}[\\/\\-. ]\\d{1,2}[\\/\\-. ]\\d{2,4}|\\d{4}[\\/\\-. ]\\d{1,2}[\\/\\-. ]\\d{1,2}|\\d{8}(?:\\d{4}|\\d{6})?|[A-Za-z]{3,9}\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s+\\d{2,4}|\\d{1,2}(?:st|nd|rd|th)?\\s+[A-Za-z]{3,9}\\.?,?\\s+\\d{2,4})$';
const MONTH_ALIASES = new Map([
  ['jan', 1], ['january', 1],
  ['feb', 2], ['february', 2],
  ['mar', 3], ['march', 3],
  ['apr', 4], ['april', 4],
  ['may', 5],
  ['jun', 6], ['june', 6],
  ['jul', 7], ['july', 7],
  ['aug', 8], ['august', 8],
  ['sep', 9], ['sept', 9], ['september', 9],
  ['oct', 10], ['october', 10],
  ['nov', 11], ['november', 11],
  ['dec', 12], ['december', 12]
]);

function pad(value) {
  return String(value).padStart(2, '0');
}

function toDisplayDate(date) {
  return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
}

function toBackendDateValue(displayValue) {
  if (isNeverDateValue(displayValue)) {
    return 'NEVER';
  }

  const parsed = parseDateValue(displayValue);
  if (!parsed) return displayValue;
  return `${parsed.getFullYear()}${pad(parsed.getMonth() + 1)}${pad(parsed.getDate())}`;
}

function toIsoDate(date) {
  return toDisplayDate(date);
}

function expandYear(rawYear) {
  const text = String(rawYear || '').trim();
  const year = Number(text);
  if (!Number.isInteger(year)) {
    return NaN;
  }
  if (text.length === 2) {
    return year >= 50 ? 1900 + year : 2000 + year;
  }
  return year;
}

function createDate(year, month, day) {
  if (![year, month, day].every(Number.isInteger)) {
    return null;
  }
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}

function parseMonthName(value) {
  const normalized = String(value || '').trim().toLowerCase().replace(/\.$/, '');
  return MONTH_ALIASES.get(normalized) || NaN;
}

function parseDisplayDate(normalized) {
  const numeric = normalized.match(/^(\d{1,4})[\/.\-\s]+(\d{1,2})[\/.\-\s]+(\d{1,4})$/);
  if (numeric) {
    const [, first, second, third] = numeric;
    if (first.length === 4) {
      return createDate(Number(first), Number(second), Number(third));
    }

    return createDate(expandYear(third), Number(first), Number(second));
  }

  const compact = normalized.match(/^(\d{4})(\d{2})(\d{2})(?:\d{2})?(?:\d{2})?$/);
  if (compact) {
    const parsedDate = createDate(Number(compact[1]), Number(compact[2]), Number(compact[3]));
    if (parsedDate) {
      return parsedDate;
    }
  }

  const compactUs = normalized.match(/^(\d{2})(\d{2})(\d{4})$/);
  if (compactUs) {
    return createDate(Number(compactUs[3]), Number(compactUs[1]), Number(compactUs[2]));
  }

  const isoDateTime = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[T\s]/);
  if (isoDateTime) {
    return createDate(Number(isoDateTime[1]), Number(isoDateTime[2]), Number(isoDateTime[3]));
  }

  const monthFirst = normalized.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{2,4})$/i);
  if (monthFirst) {
    return createDate(expandYear(monthFirst[3]), parseMonthName(monthFirst[1]), Number(monthFirst[2]));
  }

  const dayFirst = normalized.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?,?\s+(\d{2,4})$/i);
  if (dayFirst) {
    return createDate(expandYear(dayFirst[3]), parseMonthName(dayFirst[2]), Number(dayFirst[1]));
  }

  return null;
}

function parseIsoDate(value) {
  const normalized = String(value || '').trim();
  return parseDisplayDate(normalized);
}

function parseDateValue(value) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : new Date(value.getTime());
  }

  return parseIsoDate(value);
}

function isValidDateValue(value) {
  return isNeverDateValue(value) || Boolean(parseDateValue(value));
}

function normalizeDateValue(value) {
  if (isNeverDateValue(value)) {
    return 'Never';
  }

  const parsed = parseDateValue(value);
  return parsed ? toIsoDate(parsed) : '';
}

function getComparableValue(value) {
  const parsed = parseDateValue(value);
  return parsed ? parsed.getTime() : NaN;
}

function isNeverDateValue(value) {
  const normalized = String(value || '').trim().toUpperCase();
  return normalized === 'NEVER' || normalized === '=NEVER' || normalized === '0' || normalized === '=0';
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

  if (isNeverDateValue(value)) {
    return invalidValue;
  }

  const rawText = String(value || '').trim();
  return fallbackToRaw ? rawText : invalidValue;
}

export {
  DATE_INPUT_PATTERN,
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
