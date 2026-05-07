import { showToastMessage } from './toast.js';
import { MoneyUtils, ValueFormatting } from './utils.js';
import { appRuntime } from './appRuntime.js';
import { resolveFieldName } from '../filters/fieldDefs.js';

(function initializeQueryPrevalidation() {
  let lastRejectedToast = {
    message: '',
    time: 0
  };

  function cloneFilterEntry(filter) {
    if (!filter || typeof filter !== 'object') {
      return { cond: '', val: '' };
    }

    return {
      cond: String(filter.cond || '').trim().toLowerCase(),
      val: String(filter.val || '').trim()
    };
  }

  function normalizeResolvedFieldName(fieldName) {
    const normalizedField = String(fieldName || '').trim();
    if (!normalizedField) {
      return '';
    }

    return typeof resolveFieldName === 'function'
      ? resolveFieldName(normalizedField)
      : normalizedField;
  }

  function normalizeFieldList(fieldNames) {
    const values = Array.isArray(fieldNames) ? fieldNames : [fieldNames];
    return values
      .map(field => normalizeResolvedFieldName(field))
      .filter(Boolean);
  }

  function normalizeFieldFilters(filters) {
    if (!Array.isArray(filters)) {
      return [];
    }

    return filters
      .map(cloneFilterEntry)
      .filter(filter => filter.cond || filter.val);
  }

  function cloneDisplayedFields(snapshot) {
    return Array.isArray(snapshot?.displayedFields) ? snapshot.displayedFields.slice() : [];
  }

  function cloneActiveFilters(snapshot) {
    if (!snapshot?.activeFilters || typeof snapshot.activeFilters !== 'object') {
      return {};
    }

    return Object.fromEntries(
      Object.entries(snapshot.activeFilters).map(([field, data]) => [
        field,
        {
          filters: normalizeFieldFilters(data?.filters)
        }
      ])
    );
  }

  function buildNextState(currentState, operation, args) {
    const nextDisplayedFields = cloneDisplayedFields(currentState);
    const nextActiveFilters = cloneActiveFilters(currentState);

    switch (operation) {
      case 'replaceDisplayedFields': {
        return {
          displayedFields: normalizeFieldList(args[0]),
          activeFilters: nextActiveFilters
        };
      }
      case 'addDisplayedField': {
        const normalizedFields = normalizeFieldList(args[0]);
        const options = args[1] && typeof args[1] === 'object' ? args[1] : {};
        const insertAt = Number.isInteger(options.insertAt) ? options.insertAt : -1;
        normalizedFields.forEach((fieldName, index) => {
          if (insertAt >= 0 && insertAt <= nextDisplayedFields.length) {
            nextDisplayedFields.splice(insertAt + index, 0, fieldName);
          } else {
            nextDisplayedFields.push(fieldName);
          }
        });
        break;
      }
      case 'removeDisplayedField': {
        const normalizedFields = new Set(normalizeFieldList(args[0]));
        const options = args[1] && typeof args[1] === 'object' ? args[1] : {};
        const removeAll = options.all !== false;
        if (removeAll) {
          for (let index = nextDisplayedFields.length - 1; index >= 0; index -= 1) {
            if (normalizedFields.has(nextDisplayedFields[index])) {
              nextDisplayedFields.splice(index, 1);
            }
          }
        } else {
          for (let index = 0; index < nextDisplayedFields.length; index += 1) {
            if (normalizedFields.has(nextDisplayedFields[index])) {
              nextDisplayedFields.splice(index, 1);
              break;
            }
          }
        }
        break;
      }
      case 'moveDisplayedField': {
        const fromIndex = args[0];
        const toIndex = args[1];
        const options = args[2] && typeof args[2] === 'object' ? args[2] : {};
        if (Number.isInteger(fromIndex) && Number.isInteger(toIndex) && fromIndex !== toIndex && fromIndex >= 0 && fromIndex < nextDisplayedFields.length) {
          const count = Math.max(1, Number.isInteger(options.count) ? options.count : 1);
          const safeCount = Math.min(count, nextDisplayedFields.length - fromIndex);
          const movedFields = nextDisplayedFields.splice(fromIndex, safeCount);
          let insertAt = toIndex;
          if (options.behavior === 'group') {
            for (let offset = 0; offset < safeCount; offset += 1) {
              if (fromIndex + offset < toIndex) {
                insertAt -= 1;
              }
            }
          }
          insertAt = Math.max(0, Math.min(insertAt, nextDisplayedFields.length));
          nextDisplayedFields.splice(insertAt, 0, ...movedFields);
        }
        break;
      }
      case 'replaceActiveFilters': {
        return {
          displayedFields: nextDisplayedFields,
          activeFilters: cloneActiveFilters({ activeFilters: args[0] })
        };
      }
      case 'upsertFilter': {
        const fieldName = normalizeResolvedFieldName(args[0]);
        const filter = cloneFilterEntry(args[1]);
        const options = args[2] && typeof args[2] === 'object' ? args[2] : {};
        if (fieldName && (filter.cond || filter.val)) {
          if (!nextActiveFilters[fieldName]) {
            nextActiveFilters[fieldName] = { filters: [] };
          }

          let filters = nextActiveFilters[fieldName].filters.slice();
          if (options.replaceByCond) {
            filters = filters.filter(existingFilter => existingFilter.cond !== filter.cond);
          }

          const hasMatch = filters.some(existingFilter => existingFilter.cond === filter.cond && existingFilter.val === filter.val);
          if (!(options.dedupe && hasMatch)) {
            filters.push(filter);
          }
          nextActiveFilters[fieldName].filters = normalizeFieldFilters(filters);
        }
        break;
      }
      case 'removeFilter': {
        const fieldName = normalizeResolvedFieldName(args[0]);
        const options = args[1] && typeof args[1] === 'object' ? args[1] : {};
        if (fieldName && nextActiveFilters[fieldName]) {
          if (options.removeAll) {
            delete nextActiveFilters[fieldName];
          } else {
            const filters = nextActiveFilters[fieldName].filters.slice();
            if (Number.isInteger(options.index) && options.index >= 0 && options.index < filters.length) {
              filters.splice(options.index, 1);
            } else {
              const targetCond = options.cond === undefined ? null : String(options.cond || '');
              const targetVal = options.val === undefined ? null : String(options.val || '');
              const removeIndex = filters.findIndex(filter => {
                if (targetCond !== null && filter.cond !== targetCond) return false;
                if (targetVal !== null && filter.val !== targetVal) return false;
                return true;
              });
              if (removeIndex !== -1) {
                filters.splice(removeIndex, 1);
              }
            }

            if (filters.length > 0) {
              nextActiveFilters[fieldName].filters = normalizeFieldFilters(filters);
            } else {
              delete nextActiveFilters[fieldName];
            }
          }
        }
        break;
      }
      case 'reorderFilterGroups': {
        const normalizedOrder = normalizeFieldList(args[0]);
        if (normalizedOrder.length > 0) {
          const reordered = {};
          normalizedOrder.forEach(fieldName => {
            if (nextActiveFilters[fieldName]) {
              reordered[fieldName] = nextActiveFilters[fieldName];
            }
          });
          Object.keys(nextActiveFilters).forEach(fieldName => {
            if (!reordered[fieldName]) {
              reordered[fieldName] = nextActiveFilters[fieldName];
            }
          });
          return {
            displayedFields: nextDisplayedFields,
            activeFilters: reordered
          };
        }
        break;
      }
      case 'setQueryState': {
        const nextState = args[0] && typeof args[0] === 'object' ? args[0] : {};
        return {
          displayedFields: nextState.displayedFields !== undefined
            ? normalizeFieldList(nextState.displayedFields)
            : nextDisplayedFields,
          activeFilters: nextState.activeFilters !== undefined
            ? cloneActiveFilters({ activeFilters: nextState.activeFilters })
            : nextActiveFilters
        };
      }
      default:
        break;
    }

    return {
      displayedFields: nextDisplayedFields,
      activeFilters: nextActiveFilters
    };
  }

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
      const parsed = appRuntime.CustomDatePicker?.getComparableValue
        ? appRuntime.CustomDatePicker.getComparableValue(normalized)
        : NaN;
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

  appRuntime.QueryPrevalidation = Object.freeze({
    buildNextState,
    validateQueryChange
  });
})();
