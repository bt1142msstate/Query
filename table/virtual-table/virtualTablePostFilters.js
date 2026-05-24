import {
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
} from '../post-filters/postFilterLogic.js';

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
    const visibleFieldSet = getVisibleFieldSet(getDisplayedFields());
    const baseViewData = getBaseViewData();

    Object.keys(state).forEach(field => {
      if (!visibleFieldSet.has(field) || !baseViewData.columnMap.has(field)) {
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
    const columnIndex = baseViewData.columnMap.get(normalizedField);
    if (columnIndex === undefined) {
      return [];
    }

    const options = buildFieldOptions({
      rows: baseViewData.rows,
      columnIndex,
      fieldType: getFieldType(normalizedField)
    });
    valueOptionsCache.set(normalizedField, options);
    return cloneOptions(options);
  }

  function getFilteredRows() {
    const baseViewData = getBaseViewData();
    const activeEntries = Object.entries(state)
      .filter(([, data]) => Array.isArray(data?.filters) && data.filters.length > 0);

    if (!activeEntries.length) {
      return baseViewData.rows.map(row => [...row]);
    }

    return baseViewData.rows
      .filter(row => activeEntries.every(([field, data]) => doesRowMatchFieldFilters(row, field, data)))
      .map(row => [...row]);
  }

  function hasActiveFilters() {
    return Object.values(state).some(data => Array.isArray(data?.filters) && data.filters.length > 0);
  }

  function doesRowMatchFieldFilters(row, field, data) {
    const filters = Array.isArray(data?.filters) ? data.filters : [];
    if (!filters.length) {
      return true;
    }

    if (normalizeLogic(data?.logic) === 'any') {
      return filters.some(filter => doesRowMatchFilter(row, field, filter));
    }

    return filters.every(filter => doesRowMatchFilter(row, field, filter));
  }

  function doesRowMatchFilter(row, field, filter) {
    const baseViewData = getBaseViewData();
    const columnIndex = baseViewData.columnMap.get(field);
    if (columnIndex === undefined) {
      return true;
    }

    const type = getFieldType(field);
    return doesCellMatchPostFilter(row[columnIndex], type, filter);
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

export function doesCellMatchPostFilter(rawCellValue, type, filter) {
  const cond = String(filter?.cond || '').trim().toLowerCase();
  const filterValues = getPostFilterEntryValues(filter);
  const filterValue = filterValues[0] || '';

  if (cond === 'equals' && filterValues.length > 1) {
    return rowMatchesEqualsSelection(rawCellValue, type, filterValues);
  }

  if (cond === 'does_not_equal' && filterValues.length > 1) {
    return rowMatchesDoesNotEqualSelection(rawCellValue, type, filterValues);
  }

  if (cond === 'equals' && isBlankPostFilterValue(filterValue)) {
    return isBlankCellValue(rawCellValue);
  }

  if (cond === 'does_not_equal' && isBlankPostFilterValue(filterValue)) {
    return !isBlankCellValue(rawCellValue);
  }

  const rowValues = getComparableRowValues(rawCellValue, type);

  if (cond === 'between') {
    return doesCellMatchBetweenFilter(rowValues, filterValue, type);
  }

  const comparableExpected = getComparableExpectedValue(filterValue, type);
  return rowValues.some(value => compareScalarCondition(value, comparableExpected, cond, type));
}

function normalizeLogic(logic) {
  return String(logic || 'all').toLowerCase() === 'any' ? 'any' : 'all';
}

function normalizeFilters(filters) {
  return Array.isArray(filters)
    ? filters.map(clonePostFilterEntry).filter(filter => filter.cond && getPostFilterEntryValues(filter).length > 0)
    : [];
}

function getVisibleFieldSet(displayedFields) {
  return new Set(
    (Array.isArray(displayedFields) ? displayedFields : [])
      .map(field => String(field || '').trim())
      .filter(Boolean)
  );
}

function buildFieldOptions({ rows, columnIndex, fieldType }) {
  const counts = new Map();
  let blankCount = 0;

  rows.forEach(row => {
    const rawValue = row[columnIndex];

    if (isBlankCellValue(rawValue)) {
      blankCount += 1;
      return;
    }

    const values = getComparableRowValues(rawValue, fieldType)
      .map(value => fieldType === 'number' || fieldType === 'money' || fieldType === 'date'
        ? String(rawValue).trim()
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

function doesCellMatchBetweenFilter(rowValues, filterValue, type) {
  const [leftRaw, rightRaw] = filterValue.split('|');
  const left = getComparableExpectedValue(leftRaw, type);
  const right = getComparableExpectedValue(rightRaw, type);

  if (Number.isNaN(left) || Number.isNaN(right)) {
    return false;
  }

  const minValue = Math.min(left, right);
  const maxValue = Math.max(left, right);
  return rowValues.some(value => !Number.isNaN(value) && value >= minValue && value <= maxValue);
}

function getComparableExpectedValue(value, type) {
  if (type === 'number' || type === 'money') {
    return parseNumericValue(value, type);
  }

  if (type === 'date') {
    return parseComparableDateValue(value);
  }

  return value;
}
