import { getComparableValue as getDefaultComparableDateValue, normalizeDateValue } from '../core/dateValues.js';

function supportsListSelectorCondition(cond) {
  const normalized = String(cond || '').trim().toLowerCase();
  return normalized === 'equals' || normalized === 'does_not_equal';
}

function isListPasteField(fieldDef) {
  return Boolean(fieldDef && fieldDef.allowValueList && (!fieldDef.values || fieldDef.values.length === 0));
}

function parseFilterValues(filter) {
  return filter.cond === 'between'
    ? String(filter.val || '').split('|').map(value => value.trim())
    : [String(filter.val || '').trim()];
}

function getFilterPhrase(filter) {
  const values = parseFilterValues(filter);
  switch (filter.cond) {
    case 'equals':
      return `equal ${values[0]}`;
    case 'does_not_equal':
      return `not equal ${values[0]}`;
    case 'contains':
      return `contain ${values[0]}`;
    case 'starts':
      return `start with ${values[0]}`;
    case 'doesnotcontain':
      return `not contain ${values[0]}`;
    case 'greater':
      return `be greater than ${values[0]}`;
    case 'less':
      return `be less than ${values[0]}`;
    case 'between':
      return `be between ${values[0]} and ${values[1]}`;
    case 'never':
      return 'be Never';
    case 'before':
      return `be before ${values[0]}`;
    case 'on_or_before':
      return `be on or before ${values[0]}`;
    case 'after':
      return `be after ${values[0]}`;
    case 'on_or_after':
      return `be on or after ${values[0]}`;
    default:
      return `${filter.cond} ${values.join(' and ')}`;
  }
}

function getComparableFilterValues(filter, fieldType, getComparableDateValue) {
  if (filter.cond === 'never') {
    return [Number.NaN];
  }

  return parseFilterValues(filter).map(value => {
    if (fieldType === 'date') {
      return getComparableDateValue(value);
    }
    return parseFloat(value);
  });
}

function normalizeRangeCondition(cond) {
  switch (String(cond || '').trim().toLowerCase()) {
    case 'after':
    case 'greater':
      return 'greater';
    case 'on_or_after':
    case 'greater_or_equal':
      return 'greater_or_equal';
    case 'before':
    case 'less':
      return 'less';
    case 'on_or_before':
    case 'less_or_equal':
      return 'less_or_equal';
    case 'equals':
    case 'between':
      return String(cond || '').trim().toLowerCase();
    default:
      return '';
  }
}

function getFilterRange(filter, fieldType, getComparableDateValue) {
  const cond = normalizeRangeCondition(filter?.cond);
  if (!cond) return null;

  const values = getComparableFilterValues(filter, fieldType, getComparableDateValue);
  if (!values.length || values.some(value => !Number.isFinite(value))) {
    return null;
  }

  if (cond === 'equals') {
    return { low: values[0], lowInclusive: true, high: values[0], highInclusive: true };
  }

  if (cond === 'between') {
    return {
      low: Math.min(...values),
      lowInclusive: true,
      high: Math.max(...values),
      highInclusive: true
    };
  }

  if (cond === 'greater') {
    return { low: values[0], lowInclusive: false, high: Infinity, highInclusive: false };
  }

  if (cond === 'greater_or_equal') {
    return { low: values[0], lowInclusive: true, high: Infinity, highInclusive: false };
  }

  if (cond === 'less') {
    return { low: -Infinity, lowInclusive: false, high: values[0], highInclusive: false };
  }

  if (cond === 'less_or_equal') {
    return { low: -Infinity, lowInclusive: false, high: values[0], highInclusive: true };
  }

  return null;
}

function filterRangesOverlap(left, right) {
  if (left.high < right.low || right.high < left.low) {
    return false;
  }

  if (left.high === right.low) {
    return left.highInclusive && right.lowInclusive;
  }

  if (right.high === left.low) {
    return right.highInclusive && left.lowInclusive;
  }

  return true;
}

function isNeverDateFilterValue(value) {
  return normalizeDateValue(value) === 'Never';
}

function getDateFilterValidationMessage(filter, fieldLabel, options = {}) {
  const cond = String(filter?.cond || '').trim().toLowerCase();
  const values = parseFilterValues(filter).filter(value => value !== '');

  if (values.some(isNeverDateFilterValue)) {
    if (cond === 'between') {
      return `${fieldLabel} cannot use Never in a between filter. Use Before for open-ended ranges, or Equals Never by itself.`;
    }

    if (cond && !['equals', 'does_not_equal', 'never'].includes(cond)) {
      return `${fieldLabel} can only use Never with equals or does not equal.`;
    }
  }

  if (cond !== 'between' || values.length < 2 || values.some(isNeverDateFilterValue)) {
    return null;
  }

  const getComparableDateValue = typeof options.getComparableDateValue === 'function'
    ? options.getComparableDateValue
    : getDefaultComparableDateValue;
  const [start, end] = values.map(getComparableDateValue);
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return null;
  }

  if (start === end) {
    return `${fieldLabel} between dates must be different.`;
  }

  if (start > end) {
    return `${fieldLabel} start date must be before the end date.`;
  }

  return null;
}

function getContradictionMessage(existing, newFilter, fieldType, fieldLabel, options = {}) {
  if (!existing || !Array.isArray(existing.filters)) return null;

  const getComparableDateValue = typeof options.getComparableDateValue === 'function'
    ? options.getComparableDateValue
    : getDefaultComparableDateValue;

  const newLabel = getFilterPhrase(newFilter);
  if (newFilter.cond === 'never' && existing.filters.some(filter => filter.cond !== 'never')) {
    return `${fieldLabel} cannot ${newLabel} and ${getFilterPhrase(existing.filters.find(filter => filter.cond !== 'never'))}`;
  }

  const newValues = getComparableFilterValues(newFilter, fieldType, getComparableDateValue);
  const newLow = Math.min(...newValues);
  const newHigh = Math.max(...newValues);

  for (const filter of existing.filters) {
    const filterLabel = getFilterPhrase(filter);
    const message = `${fieldLabel} cannot ${newLabel} and ${filterLabel}`;
    if (filter.cond === 'never' && newFilter.cond !== 'never') return message;
    const filterValues = getComparableFilterValues(filter, fieldType, getComparableDateValue);
    const low = Math.min(...filterValues);
    const high = Math.max(...filterValues);
    const newRange = getFilterRange(newFilter, fieldType, getComparableDateValue);
    const existingRange = getFilterRange(filter, fieldType, getComparableDateValue);
    if (newRange && existingRange && !filterRangesOverlap(newRange, existingRange)) {
      return message;
    }

    if (newFilter.cond === 'equals') {
      if (filter.cond === 'does_not_equal' && newValues[0] === filterValues[0]) return message;
      if (filter.cond === 'equals' && newValues[0] !== filterValues[0]) return message;
      if (filter.cond === 'greater' && newValues[0] <= filterValues[0]) return message;
      if (filter.cond === 'less' && newValues[0] >= filterValues[0]) return message;
      if (filter.cond === 'between' && (newValues[0] < low || newValues[0] > high)) return message;
    }

    if (filter.cond === 'equals') {
      if (newFilter.cond === 'does_not_equal' && filterValues[0] === newValues[0]) return message;
      if (newFilter.cond === 'greater' && filterValues[0] <= newValues[0]) return message;
      if (newFilter.cond === 'less' && filterValues[0] >= newValues[0]) return message;
      if (newFilter.cond === 'between' && (filterValues[0] < newLow || filterValues[0] > newHigh)) return message;
    }

    if (newFilter.cond === 'greater') {
      if (filter.cond === 'less' && newValues[0] >= filterValues[0]) return message;
      if (filter.cond === 'between' && newValues[0] >= high) return message;
    }

    if (newFilter.cond === 'less') {
      if (filter.cond === 'greater' && newValues[0] <= filterValues[0]) return message;
      if (filter.cond === 'between' && newValues[0] <= low) return message;
    }

    if (newFilter.cond === 'between') {
      if (filter.cond === 'greater' && newHigh <= filterValues[0]) return message;
      if (filter.cond === 'less' && newLow >= filterValues[0]) return message;
      if (filter.cond === 'between' && (high < newLow || low > newHigh)) return message;
    }
  }

  return null;
}

export {
  getDateFilterValidationMessage,
  getContradictionMessage,
  isListPasteField,
  supportsListSelectorCondition
};
