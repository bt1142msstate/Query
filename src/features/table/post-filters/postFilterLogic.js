import { getComparableValue } from '../../../core/formatting/dateValues.js';
import { MoneyUtils } from '../../../core/formatting/moneyUtils.js';
import {
  getCellValueParts,
  hasMultipleCellValues,
  isBlankCellValue as isBlankResultCellValue
} from '../../../core/resultCellValues.js';

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
  return isBlankResultCellValue(rawValue);
}

function isMultiValueCellValue(rawValue) {
  return hasMultipleCellValues(rawValue);
}

function isNoValuePostFilterOperator(cond) {
  const normalized = String(cond || '').trim().toLowerCase();
  return [
    'is_blank',
    'blank',
    'is_empty',
    'empty',
    'has_value',
    'is_not_blank',
    'not_blank',
    'not_empty',
    'has_multiple_values',
    'multiple_values',
    'is_multi_value',
    'does_not_have_multiple_values',
    'not_multiple_values',
    'single_value',
    'is_single_value'
  ].includes(normalized);
}

function normalizeNoValuePostFilterOperator(cond) {
  const normalized = String(cond || '').trim().toLowerCase();
  if (['is_blank', 'blank', 'is_empty', 'empty'].includes(normalized)) {
    return 'is_blank';
  }
  if (['has_value', 'is_not_blank', 'not_blank', 'not_empty'].includes(normalized)) {
    return 'has_value';
  }
  if (['has_multiple_values', 'multiple_values', 'is_multi_value'].includes(normalized)) {
    return 'has_multiple_values';
  }
  if ([
    'does_not_have_multiple_values',
    'not_multiple_values',
    'single_value',
    'is_single_value'
  ].includes(normalized)) {
    return 'does_not_have_multiple_values';
  }
  return normalized;
}

function clonePostFilterEntry(filter) {
  const entry = {
    cond: normalizeNoValuePostFilterOperator(filter?.cond),
    val: String(filter?.val || '')
  };

  if (Array.isArray(filter?.vals)) {
    entry.vals = filter.vals.map(value => String(value || ''));
  }

  return entry;
}

function getPostFilterEntryValues(filter) {
  if (isNoValuePostFilterOperator(filter?.cond)) {
    return [''];
  }

  if (Array.isArray(filter?.vals)) {
    return filter.vals.map(value => String(value || '')).filter(value => value || isBlankPostFilterValue(value));
  }

  const scalarValue = String(filter?.val || '');
  return scalarValue || isBlankPostFilterValue(scalarValue) ? [scalarValue] : [];
}

function parseComparableDateValue(value) {
  return getComparableValue(value);
}

function getRawCellValueParts(rawValue) {
  if (isBlankCellValue(rawValue)) {
    return [''];
  }

  return getCellValueParts(rawValue).map(part => String(part ?? '').trim()).filter(Boolean);
}

function getComparableRowValues(rawValue, type) {
  const rawParts = getRawCellValueParts(rawValue);

  if (rawParts.length === 1 && rawParts[0] === '') {
    return [''];
  }

  if (type === 'number' || type === 'money') {
    return rawParts.map(value => parseNumericValue(value, type));
  }

  if (type === 'date') {
    return rawParts.map(parseComparableDateValue);
  }

  return rawParts.map(value => String(value ?? '').trim()).filter(Boolean);
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
  getRawCellValueParts,
  isBlankCellValue,
  isBlankPostFilterValue,
  isMultiValueCellValue,
  isNoValuePostFilterOperator,
  normalizeNoValuePostFilterOperator,
  parseComparableDateValue,
  parseNumericValue,
  rowMatchesDoesNotEqualSelection,
  rowMatchesEqualsSelection
};
