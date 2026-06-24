import { showToastMessage } from './toast.js';
import { getComparableValue } from './formatting/dateValues.js';
import { MoneyUtils } from './formatting/moneyUtils.js';
import { ValueFormatting } from './formatting/valueFormatting.js';
import { registerQueryStateRuntimeAccessors } from './queryState.js';
import { buildNextState, normalizeFieldFilters } from './queryPrevalidationState.js';

let lastRejectedToast = {
  message: '',
  time: 0
};

function getFieldType(fieldName) {
  return ValueFormatting.getFieldType(fieldName, { inferMoneyFromName: true }) || '';
}

function parseComparableValue(fieldName, rawValue) {
  const normalized = String(rawValue || '').trim();
  const fieldType = getFieldType(fieldName);

  if (fieldType === 'number' || fieldType === 'money') {
    const parsed = MoneyUtils.parseNumber(normalized);
    return { kind: fieldType, value: parsed };
  }

  if (fieldType === 'date') {
    const parsed = getComparableValue(normalized);
    return { kind: 'date', value: parsed };
  }

  return { kind: 'text', value: normalized.toLowerCase() };
}

function isDistinctComparableValue(left, right) {
  if (left.kind !== right.kind) {
    return String(left.value) !== String(right.value);
  }
  if (left.kind === 'number' || left.kind === 'money' || left.kind === 'date') {
    return !(Number.isFinite(left.value) && Number.isFinite(right.value) && left.value === right.value);
  }
  return String(left.value) !== String(right.value);
}

function compareComparableValues(left, right) {
  if (left.kind !== right.kind) {
    return 0;
  }
  if (left.kind === 'number' || left.kind === 'money' || left.kind === 'date') {
    if (!Number.isFinite(left.value) || !Number.isFinite(right.value)) {
      return 0;
    }
    if (left.value < right.value) return -1;
    if (left.value > right.value) return 1;
    return 0;
  }
  return String(left.value).localeCompare(String(right.value));
}

function doesTextEqualsSatisfyFilters(equalsValue, filters) {
  return filters.every(filter => {
    const cond = String(filter.cond || '').trim().toLowerCase();
    const expected = String(filter.val || '').trim().toLowerCase();
    if (!expected) {
      return true;
    }

    if (cond === 'equals') {
      return equalsValue === expected;
    }
    if (cond === 'starts' || cond === 'starts_with') {
      return equalsValue.startsWith(expected);
    }
    if (cond === 'contains') {
      return equalsValue.includes(expected);
    }
    return true;
  });
}

function describeField(fieldName) {
  return fieldName || 'This field';
}

function validateTextFilters(fieldName, filters) {
  const equalsFilters = filters.filter(filter => String(filter.cond || '').toLowerCase() === 'equals');
  const startsFilters = filters.filter(filter => {
    const cond = String(filter.cond || '').toLowerCase();
    return cond === 'starts' || cond === 'starts_with';
  });

  if (equalsFilters.length > 1) {
    const firstValue = String(equalsFilters[0].val || '').trim().toLowerCase();
    const hasConflict = equalsFilters.slice(1).some(filter => String(filter.val || '').trim().toLowerCase() !== firstValue);
    if (hasConflict) {
      return {
        accepted: false,
        message: `${describeField(fieldName)} cannot equal multiple different values at once.`
      };
    }
  }

  if (equalsFilters.length === 1) {
    const equalsValue = String(equalsFilters[0].val || '').trim().toLowerCase();
    if (!doesTextEqualsSatisfyFilters(equalsValue, filters)) {
      return {
        accepted: false,
        message: `${describeField(fieldName)} has conflicting text filters that cannot all match the same value.`
      };
    }
  }

  if (startsFilters.length > 1) {
    const normalizedPrefixes = startsFilters
      .map(filter => String(filter.val || '').trim().toLowerCase())
      .filter(Boolean);
    for (let index = 0; index < normalizedPrefixes.length; index += 1) {
      for (let compareIndex = index + 1; compareIndex < normalizedPrefixes.length; compareIndex += 1) {
        const left = normalizedPrefixes[index];
        const right = normalizedPrefixes[compareIndex];
        if (!left.startsWith(right) && !right.startsWith(left)) {
          return {
            accepted: false,
            message: `${describeField(fieldName)} cannot start with both "${left}" and "${right}".`
          };
        }
      }
    }
  }

  return { accepted: true };
}

function doesComparableEqualsSatisfyFilter(equalsValue, filter, fieldName) {
  const cond = String(filter.cond || '').trim().toLowerCase();
  const rawValue = String(filter.val || '').trim();
  if (!rawValue) {
    return true;
  }

  if (cond === 'between') {
    const [leftRaw, rightRaw] = rawValue.split('|');
    const left = parseComparableValue(fieldName, leftRaw);
    const right = parseComparableValue(fieldName, rightRaw);
    const low = compareComparableValues(left, right) <= 0 ? left : right;
    const high = compareComparableValues(left, right) <= 0 ? right : left;
    return compareComparableValues(equalsValue, low) >= 0 && compareComparableValues(equalsValue, high) <= 0;
  }

  const expected = parseComparableValue(fieldName, rawValue);
  const comparison = compareComparableValues(equalsValue, expected);
  switch (cond) {
    case 'equals':
      return comparison === 0;
    case 'greater':
    case 'after':
      return comparison > 0;
    case 'greater_or_equal':
    case 'on_or_after':
      return comparison >= 0;
    case 'less':
    case 'before':
      return comparison < 0;
    case 'less_or_equal':
    case 'on_or_before':
      return comparison <= 0;
    default:
      return true;
  }
}

function chooseStrongerLowerBound(currentBound, nextBound) {
  if (!currentBound) return nextBound;
  const comparison = compareComparableValues(currentBound.value, nextBound.value);
  if (comparison < 0) return nextBound;
  if (comparison > 0) return currentBound;
  return {
    value: currentBound.value,
    strict: currentBound.strict || nextBound.strict
  };
}

function chooseStrongerUpperBound(currentBound, nextBound) {
  if (!currentBound) return nextBound;
  const comparison = compareComparableValues(currentBound.value, nextBound.value);
  if (comparison < 0) return currentBound;
  if (comparison > 0) return nextBound;
  return {
    value: currentBound.value,
    strict: currentBound.strict || nextBound.strict
  };
}

function validateComparableFilters(fieldName, filters) {
  const neverFilters = filters.filter(filter => String(filter.cond || '').toLowerCase() === 'never');
  if (neverFilters.length > 0 && filters.some(filter => String(filter.cond || '').toLowerCase() !== 'never')) {
    return {
      accepted: false,
      message: `${describeField(fieldName)} cannot be Never and have a date or range filter at the same time.`
    };
  }

  const equalsFilters = filters
    .filter(filter => String(filter.cond || '').toLowerCase() === 'equals')
    .map(filter => parseComparableValue(fieldName, filter.val));

  if (equalsFilters.length > 1) {
    const firstValue = equalsFilters[0];
    const hasConflict = equalsFilters.slice(1).some(value => isDistinctComparableValue(firstValue, value));
    if (hasConflict) {
      return {
        accepted: false,
        message: `${describeField(fieldName)} cannot equal multiple different values at once.`
      };
    }
  }

  if (equalsFilters.length === 1) {
    const equalsValue = equalsFilters[0];
    const matchesAll = filters.every(filter => doesComparableEqualsSatisfyFilter(equalsValue, filter, fieldName));
    if (!matchesAll) {
      return {
        accepted: false,
        message: `${describeField(fieldName)} has conflicting filters that would reject the only allowed value.`
      };
    }
    return { accepted: true };
  }

  let lowerBound = null;
  let upperBound = null;

  filters.forEach(filter => {
    const cond = String(filter.cond || '').trim().toLowerCase();
    const rawValue = String(filter.val || '').trim();
    if (!rawValue) {
      return;
    }

    if (cond === 'between') {
      const [leftRaw, rightRaw] = rawValue.split('|');
      const left = parseComparableValue(fieldName, leftRaw);
      const right = parseComparableValue(fieldName, rightRaw);
      const low = compareComparableValues(left, right) <= 0 ? left : right;
      const high = compareComparableValues(left, right) <= 0 ? right : left;
      lowerBound = chooseStrongerLowerBound(lowerBound, { value: low, strict: false });
      upperBound = chooseStrongerUpperBound(upperBound, { value: high, strict: false });
      return;
    }

    const comparable = parseComparableValue(fieldName, rawValue);
    switch (cond) {
      case 'greater':
      case 'after':
        lowerBound = chooseStrongerLowerBound(lowerBound, { value: comparable, strict: true });
        break;
      case 'greater_or_equal':
      case 'on_or_after':
        lowerBound = chooseStrongerLowerBound(lowerBound, { value: comparable, strict: false });
        break;
      case 'less':
      case 'before':
        upperBound = chooseStrongerUpperBound(upperBound, { value: comparable, strict: true });
        break;
      case 'less_or_equal':
      case 'on_or_before':
        upperBound = chooseStrongerUpperBound(upperBound, { value: comparable, strict: false });
        break;
      default:
        break;
    }
  });

  if (lowerBound && upperBound) {
    const comparison = compareComparableValues(lowerBound.value, upperBound.value);
    if (comparison > 0 || (comparison === 0 && (lowerBound.strict || upperBound.strict))) {
      return {
        accepted: false,
        message: `${describeField(fieldName)} has range filters that cannot overlap.`
      };
    }
  }

  return { accepted: true };
}

function validateActiveFilters(nextState) {
  const activeFilters = nextState?.activeFilters && typeof nextState.activeFilters === 'object'
    ? nextState.activeFilters
    : {};

  for (const [fieldName, data] of Object.entries(activeFilters)) {
    const filters = normalizeFieldFilters(data?.filters);
    if (filters.length <= 1) {
      continue;
    }

    const fieldType = getFieldType(fieldName);
    const result = fieldType === 'number' || fieldType === 'money' || fieldType === 'date'
      ? validateComparableFilters(fieldName, filters)
      : validateTextFilters(fieldName, filters);
    if (!result.accepted) {
      return result;
    }
  }

  return { accepted: true };
}

function shouldBypassPrevalidation(meta) {
  return Boolean(meta?.skipPrevalidation || meta?.prevalidate === false);
}

function notifyRejection(result, meta) {
  if (meta?.toast === false) {
    return;
  }

  if (result?.message) {
    const now = Date.now();
    if (lastRejectedToast.message === result.message && now - lastRejectedToast.time < 1500) {
      return;
    }
    lastRejectedToast = {
      message: result.message,
      time: now
    };
    showToastMessage(result.message, 'warning');
  }
}

function validateQueryChange(change) {
  if (!change || shouldBypassPrevalidation(change.meta)) {
    return { accepted: true };
  }

  const result = validateActiveFilters(change.nextState);
  if (!result.accepted) {
    notifyRejection(result, change.meta);
  }
  return result;
}

const QueryPrevalidation = Object.freeze({
  buildNextState,
  validateQueryChange
});

registerQueryStateRuntimeAccessors({ getPrevalidation: () => QueryPrevalidation });

export { buildNextState, validateQueryChange };
