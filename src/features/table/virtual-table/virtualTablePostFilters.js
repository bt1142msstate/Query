import {
  POST_FILTER_BLANK_SENTINEL,
  clonePostFilterEntry,
  getComparableRowValues,
  getPostFilterEntryValues,
  getRawCellValueParts,
  isBlankCellValue,
  isBlankPostFilterValue,
  normalizeNoValuePostFilterOperator,
  parseComparableDateValue,
  parseNumericValue
} from '../post-filters/postFilterLogic.js';
import {
  getSplitFieldColumnIndexes,
  getSplitFieldParentName,
  getSplitFieldValue
} from './splitColumnFields.js';
import {
  getLazyExpandedRowSourceValue,
  getLazyExpandedRowsSourceRows
} from './splitColumnExpansion.js';

export function createVirtualTablePostFilterController({
  getBaseViewData,
  getDisplayedFields,
  getFieldType
}) {
  const state = {};
  const valueOptionsCache = new Map();

  function invalidateValueOptionsCache() {
    valueOptionsCache.clear();
  }

  function cloneSnapshot() {
    return Object.fromEntries(
      Object.entries(state).map(([field, data]) => [
        field,
        {
          logic: normalizeLogic(data?.logic),
          filters: Array.isArray(data?.filters) ? data.filters.map(clonePostFilterEntry) : []
        }
      ])
    );
  }

  function assign(nextFilters) {
    Object.keys(state).forEach(key => delete state[key]);

    if (!nextFilters || typeof nextFilters !== 'object') {
      return;
    }

    Object.entries(nextFilters).forEach(([field, data]) => {
      const normalizedField = String(field || '').trim();
      if (!normalizedField) {
        return;
      }

      const filters = normalizeFilters(data?.filters);
      if (filters.length) {
        state[normalizedField] = {
          logic: normalizeLogic(data?.logic),
          filters
        };
      }
    });
  }

  function clear() {
    Object.keys(state).forEach(key => delete state[key]);
    invalidateValueOptionsCache();
  }

  function sanitizeForCurrentView() {
    const baseViewData = getBaseViewData();
    const visibleFieldSet = getVisibleFieldSet(getDisplayedFields(), baseViewData);

    Object.keys(state).forEach(field => {
      const canonicalField = getCanonicalFieldName(field, baseViewData);
      const isVisible = visibleFieldSet.has(field) || visibleFieldSet.has(canonicalField);
      if (!isVisible || !getSplitFieldColumnIndexes(field, baseViewData).length) {
        delete state[field];
        return;
      }

      const filters = normalizeFilters(state[field]?.filters);
      if (filters.length) {
        state[field].filters = filters;
        state[field].logic = normalizeLogic(state[field]?.logic);
      } else {
        delete state[field];
      }
    });
  }

  function getFieldOptions(fieldName) {
    const normalizedField = String(fieldName || '').trim();
    if (!normalizedField) {
      return [];
    }

    if (valueOptionsCache.has(normalizedField)) {
      return cloneOptions(valueOptionsCache.get(normalizedField));
    }

    const baseViewData = getBaseViewData();
    const columnIndexes = getSplitFieldColumnIndexes(normalizedField, baseViewData);
    if (!columnIndexes.length) {
      return [];
    }

    const options = buildFieldOptions({
      rows: baseViewData.rows,
      getRawValue: row => getSplitFieldValue(row, columnIndexes),
      fieldType: getFieldType(getCanonicalFieldName(normalizedField, baseViewData))
    });
    valueOptionsCache.set(normalizedField, options);
    return cloneOptions(options);
  }

  function getFilteredRows() {
    const baseViewData = getBaseViewData();
    const activeEntries = Object.entries(state)
      .filter(([, data]) => Array.isArray(data?.filters) && data.filters.length > 0);

    if (!activeEntries.length) {
      return baseViewData.rows;
    }

    const groups = compilePostFilterGroups(activeEntries, baseViewData, getFieldType);
    if (!groups.length) {
      return baseViewData.rows;
    }

    const rows = baseViewData.rows;
    const sourceRows = getLazyExpandedRowsSourceRows(rows);
    if (sourceRows && groups.every(group => group.sourceIndex !== undefined)) {
      return getFilteredRowsFromSourceRows(rows, sourceRows, groups);
    }

    const filteredRows = [];
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex];
      let matchesAllGroups = true;
      for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
        if (!doesRowMatchCompiledGroup(row, groups[groupIndex])) {
          matchesAllGroups = false;
          break;
        }
      }
      if (matchesAllGroups) {
        filteredRows.push(row);
      }
    }
    return filteredRows;
  }

  function hasActiveFilters() {
    return Object.values(state).some(data => Array.isArray(data?.filters) && data.filters.length > 0);
  }

  return {
    blankValue: POST_FILTER_BLANK_SENTINEL,
    assign,
    clear,
    cloneSnapshot,
    getFieldOptions,
    getFilteredRows,
    hasActiveFilters,
    invalidateValueOptionsCache,
    sanitizeForCurrentView
  };
}

function compilePostFilterGroups(activeEntries, baseViewData, getFieldType) {
  const groups = [];
  activeEntries.forEach(([field, data]) => {
    const columnIndexes = getSplitFieldColumnIndexes(field, baseViewData);
    if (!columnIndexes.length) {
      return;
    }

    const type = getFieldType(getCanonicalFieldName(field, baseViewData));
    const predicates = (Array.isArray(data?.filters) ? data.filters : [])
      .map(filter => compilePostFilterPredicate(filter, type))
      .filter(Boolean);
    if (!predicates.length) {
      return;
    }

    const splitSourceIndex = getSplitFieldSourceIndex(field, baseViewData);
    groups.push({
      any: normalizeLogic(data?.logic) === 'any',
      columnIndexes,
      predicates,
      sourceIndex: splitSourceIndex,
      readValue: splitSourceIndex !== undefined
        ? row => getLazyExpandedRowSourceValue(row, splitSourceIndex) ?? getSplitFieldValue(row, columnIndexes)
        : (columnIndexes.length === 1
        ? row => row[columnIndexes[0]] ?? ''
        : row => getSplitFieldValue(row, columnIndexes))
    });
  });
  return groups;
}

function getFilteredRowsFromSourceRows(rows, sourceRows, groups) {
  const filteredRows = [];
  for (let rowIndex = 0; rowIndex < sourceRows.length; rowIndex += 1) {
    const sourceRow = sourceRows[rowIndex];
    let matchesAllGroups = true;
    for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
      const group = groups[groupIndex];
      const rawCellValue = Array.isArray(sourceRow) ? sourceRow[group.sourceIndex] ?? '' : '';
      if (!doesRawCellValueMatchCompiledGroup(rawCellValue, group)) {
        matchesAllGroups = false;
        break;
      }
    }
    if (matchesAllGroups) {
      filteredRows.push(rows[rowIndex]);
    }
  }
  return filteredRows;
}

function doesRowMatchCompiledGroup(row, group) {
  return doesRawCellValueMatchCompiledGroup(group.readValue(row), group);
}

function doesRawCellValueMatchCompiledGroup(rawCellValue, group) {
  if (group.any) {
    for (let index = 0; index < group.predicates.length; index += 1) {
      if (group.predicates[index](rawCellValue)) {
        return true;
      }
    }
    return false;
  }

  for (let index = 0; index < group.predicates.length; index += 1) {
    if (!group.predicates[index](rawCellValue)) {
      return false;
    }
  }
  return true;
}

function compilePostFilterPredicate(filter, type) {
  const cond = normalizeNoValuePostFilterOperator(filter?.cond);
  const filterValues = getPostFilterEntryValues(filter);
  const filterValue = filterValues[0] || '';

  if (cond === 'is_blank') {
    return isBlankCellValueFast;
  }

  if (cond === 'has_value') {
    return rawCellValue => !isBlankCellValueFast(rawCellValue);
  }

  if (cond === 'has_multiple_values') {
    return hasMultipleCellValues;
  }

  if (cond === 'does_not_have_multiple_values') {
    return rawCellValue => !hasMultipleCellValues(rawCellValue);
  }

  if (cond === 'equals' && filterValues.length > 1) {
    return compileSelectionPredicate(filterValues, type, true);
  }

  if (cond === 'does_not_equal' && filterValues.length > 1) {
    return compileSelectionPredicate(filterValues, type, false);
  }

  if (cond === 'equals' && isBlankPostFilterValue(filterValue)) {
    return isBlankCellValueFast;
  }

  if (cond === 'does_not_equal' && isBlankPostFilterValue(filterValue)) {
    return rawCellValue => !isBlankCellValueFast(rawCellValue);
  }

  if (cond === 'between') {
    return compileBetweenPredicate(filterValue, type);
  }

  return compileScalarPredicate(cond, filterValue, type);
}

function compileSelectionPredicate(filterValues, type, equalsMode) {
  const includesBlank = filterValues.some(isBlankPostFilterValue);
  if (type === 'number' || type === 'money' || type === 'date') {
    const expectedValues = new Set(filterValues
      .filter(value => !isBlankPostFilterValue(value))
      .map(value => getComparableExpectedValueFast(value, type))
      .filter(value => !Number.isNaN(value)));
    return rawCellValue => {
      if (isBlankCellValueFast(rawCellValue)) {
        return equalsMode ? includesBlank : !includesBlank;
      }
      const hasMatch = someComparableCellValue(rawCellValue, type, actual => expectedValues.has(actual));
      return equalsMode ? hasMatch : !hasMatch;
    };
  }

  const expectedValues = new Set(
    filterValues
      .filter(value => !isBlankPostFilterValue(value))
      .map(value => String(value || '').trim().toLowerCase())
  );
  return rawCellValue => {
    if (isBlankCellValueFast(rawCellValue)) {
      return equalsMode ? includesBlank : !includesBlank;
    }
    const hasMatch = someTextCellValue(rawCellValue, actual => expectedValues.has(actual));
    return equalsMode ? hasMatch : !hasMatch;
  };
}

function compileBetweenPredicate(filterValue, type) {
  const [leftRaw, rightRaw] = String(filterValue || '').split('|');
  const left = getComparableExpectedValueFast(leftRaw, type);
  const right = getComparableExpectedValueFast(rightRaw, type);

  if (Number.isNaN(left) || Number.isNaN(right)) {
    return () => false;
  }

  const minValue = Math.min(left, right);
  const maxValue = Math.max(left, right);
  return rawCellValue => someComparableCellValue(rawCellValue, type, value => value >= minValue && value <= maxValue);
}

function compileScalarPredicate(cond, filterValue, type) {
  if (type === 'number' || type === 'money' || type === 'date') {
    const expected = getComparableExpectedValueFast(filterValue, type);
    return rawCellValue => {
      if (cond === 'does_not_equal') {
        return everyComparableCellValue(rawCellValue, type, value => compareComparableValue(value, expected, cond));
      }
      return someComparableCellValue(rawCellValue, type, value => compareComparableValue(value, expected, cond));
    };
  }

  const expected = String(filterValue || '').trim().toLowerCase();
  if (cond === 'does_not_equal') {
    return rawCellValue => everyTextCellValue(rawCellValue, value => value !== expected);
  }
  if (cond === 'starts' || cond === 'starts_with') {
    return rawCellValue => someTextCellValue(rawCellValue, value => value.startsWith(expected));
  }
  if (cond === 'contains') {
    return rawCellValue => someTextCellValue(rawCellValue, value => value.includes(expected));
  }
  if (cond === 'equals') {
    return rawCellValue => someTextCellValue(rawCellValue, value => value === expected);
  }
  return () => false;
}

export function doesCellMatchPostFilter(rawCellValue, type, filter) {
  const predicate = compilePostFilterPredicate(filter, type);
  return predicate ? predicate(rawCellValue) : true;
}

function isBlankCellValueFast(rawValue) {
  return isBlankCellValue(rawValue);
}

function hasMultipleCellValues(rawValue) {
  return getRawCellValueParts(rawValue).filter(value => String(value ?? '').trim()).length > 1;
}

function someTextCellValue(rawValue, predicate) {
  const parts = getRawCellValueParts(rawValue);
  if (parts.length === 1 && parts[0] === '') {
    return predicate('');
  }

  const nonBlankParts = parts.map(part => String(part ?? '').trim()).filter(Boolean);
  return nonBlankParts.length
    ? nonBlankParts.some(part => predicate(part.toLowerCase()))
    : predicate('');
}

function everyTextCellValue(rawValue, predicate) {
  const parts = getRawCellValueParts(rawValue);
  if (parts.length === 1 && parts[0] === '') {
    return predicate('');
  }

  const nonBlankParts = parts.map(part => String(part ?? '').trim()).filter(Boolean);
  return nonBlankParts.length
    ? nonBlankParts.every(part => predicate(part.toLowerCase()))
    : predicate('');
}

function someComparableCellValue(rawValue, type, predicate) {
  if (isBlankCellValueFast(rawValue)) {
    return predicate(Number.NaN);
  }

  return getRawCellValueParts(rawValue)
    .map(part => String(part ?? '').trim())
    .filter(Boolean)
    .some(part => predicate(getComparableExpectedValueFast(part, type)));
}

function everyComparableCellValue(rawValue, type, predicate) {
  if (isBlankCellValueFast(rawValue)) {
    return predicate(Number.NaN);
  }

  const parts = getRawCellValueParts(rawValue)
    .map(part => String(part ?? '').trim())
    .filter(Boolean);
  return parts.length
    ? parts.every(part => predicate(getComparableExpectedValueFast(part, type)))
    : predicate(Number.NaN);
}

function getComparableExpectedValueFast(value, type) {
  if (type === 'number' || type === 'money') {
    return parseNumericValueFast(value, type);
  }

  if (type === 'date') {
    return parseDateComparableFast(value);
  }

  return String(value || '').trim().toLowerCase();
}

function parseNumericValueFast(value, type) {
  if (type === 'money') {
    return parseNumericValue(value, type);
  }
  if (typeof value === 'number') {
    return value;
  }

  const text = String(value || '').trim();
  if (!text) {
    return Number.NaN;
  }
  return text.includes(',') ? parseNumericValue(text, type) : Number.parseFloat(text);
}

function parseDateComparableFast(value) {
  const text = String(value || '').trim();
  if (!text) {
    return Number.NaN;
  }

  if (/^\d{8}(?:\d{4}|\d{6})?$/u.test(text)) {
    const year = Number(text.slice(0, 4));
    const month = Number(text.slice(4, 6));
    const day = Number(text.slice(6, 8));
    if (isValidDateParts(year, month, day)) {
      return year * 10000 + month * 100 + day;
    }
  }

  const comparable = parseComparableDateValue(text);
  if (Number.isNaN(comparable)) {
    return Number.NaN;
  }

  const date = new Date(comparable);
  return date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
}

function isValidDateParts(year, month, day) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return false;
  }
  if (month < 1 || month > 12 || day < 1) {
    return false;
  }
  const monthLengths = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= monthLengths[month - 1];
}

function isLeapYear(year) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function compareComparableValue(actual, expected, cond) {
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

function normalizeLogic(logic) {
  return String(logic || 'all').toLowerCase() === 'any' ? 'any' : 'all';
}

function normalizeFilters(filters) {
  return Array.isArray(filters)
    ? filters.map(clonePostFilterEntry).filter(filter => filter.cond && getPostFilterEntryValues(filter).length > 0)
    : [];
}

function getVisibleFieldSet(displayedFields, baseViewData) {
  const visibleFields = new Set();
  (Array.isArray(displayedFields) ? displayedFields : [])
    .map(field => String(field || '').trim())
    .filter(Boolean)
    .forEach(field => {
      visibleFields.add(field);
      visibleFields.add(getCanonicalFieldName(field, baseViewData));
    });
  return visibleFields;
}

function buildFieldOptions({ rows, columnIndex, getRawValue, fieldType }) {
  const counts = new Map();
  let blankCount = 0;

  rows.forEach(row => {
    const rawValue = typeof getRawValue === 'function'
      ? getRawValue(row)
      : row[columnIndex];

    if (isBlankCellValue(rawValue)) {
      blankCount += 1;
      return;
    }

    const rawParts = getRawCellValueParts(rawValue).filter(value => String(value ?? '').trim());
    const values = getComparableRowValues(rawValue, fieldType)
      .map((value, index) => fieldType === 'number' || fieldType === 'money' || fieldType === 'date'
        ? String(rawParts[index] ?? rawValue).trim()
        : String(value ?? '').trim())
      .filter(Boolean);

    const seenInRow = new Set();
    values.forEach(value => {
      if (seenInRow.has(value)) {
        return;
      }
      seenInRow.add(value);
      counts.set(value, (counts.get(value) || 0) + 1);
    });
  });

  const options = Array.from(counts.entries())
    .map(([value, count]) => ({
      value,
      label: value,
      count,
      isBlank: false
    }))
    .sort((left, right) => String(left.label).localeCompare(String(right.label), undefined, { numeric: true, sensitivity: 'base' }));

  if (blankCount > 0) {
    options.unshift({
      value: POST_FILTER_BLANK_SENTINEL,
      label: '(Blank values)',
      count: blankCount,
      isBlank: true
    });
  }

  return options;
}

function cloneOptions(options) {
  return options.map(option => ({ ...option }));
}

function getCanonicalFieldName(field, baseViewData) {
  return getSplitFieldParentName(field, baseViewData);
}

function getSplitFieldSourceIndex(field, baseViewData) {
  const normalizedField = String(field || '').trim();
  const sourceMap = baseViewData?.splitColumnSourceMap instanceof Map
    ? baseViewData.splitColumnSourceMap
    : new Map();
  return sourceMap.get(normalizedField);
}
