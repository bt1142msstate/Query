import { getComparableValue } from '../core/dateValues.js';
import { MoneyUtils } from '../core/utils.js';

const POST_FILTER_BLANK_SENTINEL = '__QUERY_POST_FILTER_BLANK__';

function parseNumericValue(value, type = 'number') {
  if (type === 'money') {
    return MoneyUtils.parseNumber(value);
  }

  if (typeof value === 'number') return value;
  return parseFloat(String(value).replace(/,/g, ''));
}

function isBlankPostFilterValue(value) {
  return String(value || '') === POST_FILTER_BLANK_SENTINEL;
}

function isBlankCellValue(rawValue) {
  if (rawValue === undefined || rawValue === null) {
    return true;
  }

  if (typeof rawValue === 'string') {
    if (rawValue.includes('\x1F')) {
      const parts = rawValue.split('\x1F').map(part => String(part).trim());
      return parts.length === 0 || parts.every(part => !part);
    }

    return String(rawValue).trim() === '';
  }

  return false;
}

function clonePostFilterEntry(filter) {
  const entry = {
    cond: String(filter?.cond || '').trim().toLowerCase(),
    val: String(filter?.val || '')
  };

  if (Array.isArray(filter?.vals)) {
    entry.vals = filter.vals.map(value => String(value || ''));
  }

  return entry;
}

function getPostFilterEntryValues(filter) {
  if (Array.isArray(filter?.vals)) {
    return filter.vals.map(value => String(value || '')).filter(value => value || isBlankPostFilterValue(value));
  }

  const scalarValue = String(filter?.val || '');
  return scalarValue || isBlankPostFilterValue(scalarValue) ? [scalarValue] : [];
}

function parseComparableDateValue(value) {
  return getComparableValue(value);
}

function getComparableRowValues(rawValue, type) {
  if (isBlankCellValue(rawValue)) {
    return [''];
  }

  if (type === 'number' || type === 'money') {
    return [parseNumericValue(rawValue, type)];
  }

  if (type === 'date') {
    return [parseComparableDateValue(rawValue)];
  }

  if (typeof rawValue === 'string' && rawValue.includes('\x1F')) {
    return rawValue.split('\x1F').map(part => String(part).trim()).filter(Boolean);
  }

  return [String(rawValue ?? '').trim()];
}

function compareScalarCondition(actual, expected, cond, type) {
  if (type === 'number' || type === 'money' || type === 'date') {
    if (Number.isNaN(actual) || Number.isNaN(expected)) {
      return false;
    }

    switch (cond) {
      case 'greater':
      case 'after':
        return actual > expected;
      case 'less':
      case 'before':
        return actual < expected;
      case 'greater_or_equal':
      case 'on_or_after':
        return actual >= expected;
      case 'less_or_equal':
      case 'on_or_before':
        return actual <= expected;
      case 'equals':
        return actual === expected;
      case 'does_not_equal':
        return actual !== expected;
      default:
        return false;
    }
  }

  const actualText = String(actual || '').toLowerCase();
  const expectedText = String(expected || '').toLowerCase();

  switch (cond) {
    case 'equals':
      return actualText === expectedText;
    case 'does_not_equal':
      return actualText !== expectedText;
    case 'starts':
    case 'starts_with':
      return actualText.startsWith(expectedText);
    case 'contains':
      return actualText.includes(expectedText);
    default:
      return false;
  }
}

function rowMatchesEqualsSelection(rawCellValue, type, selectedValues) {
  if (isBlankCellValue(rawCellValue) && selectedValues.some(isBlankPostFilterValue)) {
    return true;
  }

  const rowValues = getComparableRowValues(rawCellValue, type);
  return selectedValues.some(selectedValue => {
    if (isBlankPostFilterValue(selectedValue)) {
      return false;
    }

    const comparableExpected = (type === 'number' || type === 'money')
      ? parseNumericValue(selectedValue, type)
      : (type === 'date' ? parseComparableDateValue(selectedValue) : selectedValue);

    return rowValues.some(value => compareScalarCondition(value, comparableExpected, 'equals', type));
  });
}

function rowMatchesDoesNotEqualSelection(rawCellValue, type, selectedValues) {
  if (isBlankCellValue(rawCellValue) && selectedValues.some(isBlankPostFilterValue)) {
    return false;
  }

  const rowValues = getComparableRowValues(rawCellValue, type);
  return selectedValues.every(selectedValue => {
    if (isBlankPostFilterValue(selectedValue)) {
      return true;
    }

    const comparableExpected = (type === 'number' || type === 'money')
      ? parseNumericValue(selectedValue, type)
      : (type === 'date' ? parseComparableDateValue(selectedValue) : selectedValue);

    return rowValues.every(value => !compareScalarCondition(value, comparableExpected, 'equals', type));
  });
}

export {
  POST_FILTER_BLANK_SENTINEL,
  clonePostFilterEntry,
  compareScalarCondition,
  getComparableRowValues,
  getPostFilterEntryValues,
  isBlankCellValue,
  isBlankPostFilterValue,
  parseComparableDateValue,
  parseNumericValue,
  rowMatchesDoesNotEqualSelection,
  rowMatchesEqualsSelection
};
