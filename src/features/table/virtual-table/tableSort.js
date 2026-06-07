import { MoneyUtils } from '../../../core/formatting/moneyUtils.js';
import { getCellValueParts } from '../../../core/resultCellValues.js';
import {
  getLazyExpandedRowColumnPlan,
  getLazyExpandedRowSourceRow,
  getLazyExpandedRowsColumnPlan,
  getLazyExpandedRowsSourceRows
} from './splitColumnExpansion.js';

const PREPARED_STRING_SORT_ROW_THRESHOLD = 100000;

function parseSortNumericValue(value, type = 'number') {
  if (type === 'money') {
    return MoneyUtils.parseNumber(value);
  }

  if (typeof value === 'number') {
    return value;
  }

  return Number.parseFloat(String(value).replace(/,/gu, ''));
}

export function sortRowsByColumn(rows, colIndex, type, direction) {
  if (!Array.isArray(rows) || rows.length <= 1) {
    return;
  }

  if (sortLazyExpandedRowsByColumn(rows, colIndex, type, direction)) {
    return;
  }

  if (shouldUsePreparedStringSort(rows, type)) {
    sortPlainRowsByStringColumn(rows, colIndex, direction);
    return;
  }

  rows.sort((a, b) => compareSortValues(a[colIndex], b[colIndex], type, direction));
}

function sortLazyExpandedRowsByColumn(rows, colIndex, type, direction) {
  const projectedRowsSource = getLazyExpandedRowsSourceRows(rows);
  const projectedRowsPlan = getLazyExpandedRowsColumnPlan(rows);
  const projectedRowsColumnPlan = projectedRowsPlan?.[colIndex];

  if (projectedRowsSource && projectedRowsColumnPlan) {
    if (shouldUsePreparedStringSort(projectedRowsSource, type)) {
      sortRowsByPreparedStringKeys(
        projectedRowsSource,
        row => getProjectedSourceRowSortValue(row, projectedRowsColumnPlan),
        direction
      );
      return true;
    }

    projectedRowsSource.sort((left, right) => compareSortValues(
      getProjectedSourceRowSortValue(left, projectedRowsColumnPlan),
      getProjectedSourceRowSortValue(right, projectedRowsColumnPlan),
      type,
      direction
    ));
    return true;
  }

  const firstRowPlan = getLazyExpandedRowColumnPlan(rows[0]);
  const firstRowColumnPlan = firstRowPlan?.[colIndex];
  if (!firstRowColumnPlan) {
    return false;
  }

  if (shouldUsePreparedStringSort(rows, type)) {
    sortRowsByPreparedStringKeys(
      rows,
      row => getLazyExpandedProjectedSortValue(row, colIndex, firstRowColumnPlan),
      direction
    );
    return true;
  }

  rows.sort((left, right) => compareSortValues(
    getLazyExpandedProjectedSortValue(left, colIndex, firstRowColumnPlan),
    getLazyExpandedProjectedSortValue(right, colIndex, firstRowColumnPlan),
    type,
    direction
  ));
  return true;
}

function shouldUsePreparedStringSort(rows, type) {
  return rows.length >= PREPARED_STRING_SORT_ROW_THRESHOLD
    && type !== 'number'
    && type !== 'money'
    && type !== 'date';
}

function sortRowsByPreparedStringKeys(rows, getValue, direction) {
  const rowCount = rows.length;
  const keys = new Array(rowCount);
  const emptyFlags = new Uint8Array(rowCount);
  const indexes = new Array(rowCount);
  let hasEmptyValues = false;
  for (let index = 0; index < rowCount; index += 1) {
    const value = getValue(rows[index]);
    const isEmpty = value === undefined || value === null || value === '';
    emptyFlags[index] = isEmpty ? 1 : 0;
    hasEmptyValues = hasEmptyValues || isEmpty;
    keys[index] = isEmpty ? '' : String(value);
    indexes[index] = index;
  }

  const compareIndexes = getPreparedStringIndexComparator(keys, emptyFlags, hasEmptyValues, direction);

  indexes.sort(compareIndexes);

  const sourceRows = rows.slice();
  for (let index = 0; index < rowCount; index += 1) {
    rows[index] = sourceRows[indexes[index]];
  }
}

function sortPlainRowsByStringColumn(rows, colIndex, direction) {
  const columnProfile = getPlainStringColumnProfile(rows, colIndex);
  rows.sort(getPlainStringColumnComparator(colIndex, direction, columnProfile));
}

function getPlainStringColumnProfile(rows, colIndex) {
  let hasEmptyValues = false;
  let allValuesAreStrings = true;

  for (let index = 0; index < rows.length; index += 1) {
    const value = rows[index]?.[colIndex];
    if (value === undefined || value === null || value === '') {
      hasEmptyValues = true;
      if (!allValuesAreStrings) {
        break;
      }
      continue;
    }

    if (typeof value !== 'string') {
      allValuesAreStrings = false;
      if (hasEmptyValues) {
        break;
      }
    }
  }

  return { allValuesAreStrings, hasEmptyValues };
}

function getPlainStringColumnComparator(colIndex, direction, columnProfile) {
  if (columnProfile?.allValuesAreStrings && !columnProfile.hasEmptyValues) {
    return direction === 'asc'
      ? (leftRow, rightRow) => {
        const left = leftRow[colIndex];
        const right = rightRow[colIndex];
        return left < right ? -1 : (left > right ? 1 : 0);
      }
      : (leftRow, rightRow) => {
        const left = leftRow[colIndex];
        const right = rightRow[colIndex];
        return left > right ? -1 : (left < right ? 1 : 0);
      };
  }

  if (direction === 'asc') {
    return (leftRow, rightRow) => {
      const leftValue = leftRow?.[colIndex];
      const rightValue = rightRow?.[colIndex];
      const emptyLeft = leftValue === undefined || leftValue === null || leftValue === '';
      const emptyRight = rightValue === undefined || rightValue === null || rightValue === '';

      if (emptyLeft && emptyRight) return 0;
      if (emptyLeft) return 1;
      if (emptyRight) return -1;

      const left = String(leftValue);
      const right = String(rightValue);
      return left < right ? -1 : (left > right ? 1 : 0);
    };
  }

  return (leftRow, rightRow) => {
    const leftValue = leftRow?.[colIndex];
    const rightValue = rightRow?.[colIndex];
    const emptyLeft = leftValue === undefined || leftValue === null || leftValue === '';
    const emptyRight = rightValue === undefined || rightValue === null || rightValue === '';

    if (emptyLeft && emptyRight) return 0;
    if (emptyLeft) return -1;
    if (emptyRight) return 1;

    const left = String(leftValue);
    const right = String(rightValue);
    return left > right ? -1 : (left < right ? 1 : 0);
  };
}

function getPreparedStringIndexComparator(keys, emptyFlags, hasEmptyValues, direction) {
  if (hasEmptyValues) {
    return direction === 'asc'
      ? (leftIndex, rightIndex) => comparePreparedStringKeys(
        keys[leftIndex],
        keys[rightIndex],
        emptyFlags[leftIndex] === 1,
        emptyFlags[rightIndex] === 1,
        'asc'
      )
      : (leftIndex, rightIndex) => comparePreparedStringKeys(
        keys[leftIndex],
        keys[rightIndex],
        emptyFlags[leftIndex] === 1,
        emptyFlags[rightIndex] === 1,
        'desc'
      );
  }

  return direction === 'asc'
    ? (leftIndex, rightIndex) => {
      const left = keys[leftIndex];
      const right = keys[rightIndex];
      return left < right ? -1 : (left > right ? 1 : 0);
    }
    : (leftIndex, rightIndex) => {
      const left = keys[leftIndex];
      const right = keys[rightIndex];
      return left > right ? -1 : (left < right ? 1 : 0);
    };
}

function comparePreparedStringKeys(left, right, emptyLeft, emptyRight, direction) {
  if (emptyLeft && emptyRight) return 0;
  if (emptyLeft) return direction === 'asc' ? 1 : -1;
  if (emptyRight) return direction === 'asc' ? -1 : 1;

  const result = compareStringValues(left, right);
  return direction === 'asc' ? result : -result;
}

function getLazyExpandedProjectedSortValue(row, colIndex, columnPlan) {
  const sourceRow = getLazyExpandedRowSourceRow(row);
  if (sourceRow) {
    return getProjectedSourceRowSortValue(sourceRow, columnPlan);
  }

  return row?.[colIndex] ?? '';
}

function getProjectedSourceRowSortValue(sourceRow, columnPlan) {
  if (!columnPlan || columnPlan.sourceIndex === undefined || !Array.isArray(sourceRow)) {
    return '';
  }

  const rawValue = sourceRow[columnPlan.sourceIndex];
  if (!columnPlan.splitSource) {
    return rawValue ?? '';
  }

  return getMultiValuePart(rawValue, columnPlan.splitIndex);
}

function getMultiValuePart(value, splitIndex) {
  if (value === undefined || value === null) {
    return '';
  }

  if (Array.isArray(value)) {
    return getCellValueParts(value)[splitIndex] ?? '';
  }

  const text = typeof value === 'string' ? value : String(value);
  const firstSeparatorIndex = text.indexOf('\x1F');

  if (firstSeparatorIndex === -1) {
    return splitIndex === 0 ? text : '';
  }

  if (splitIndex <= 0) {
    return text.slice(0, firstSeparatorIndex);
  }

  if (splitIndex === 1) {
    const secondSeparatorIndex = text.indexOf('\x1F', firstSeparatorIndex + 1);
    return secondSeparatorIndex === -1
      ? text.slice(firstSeparatorIndex + 1)
      : text.slice(firstSeparatorIndex + 1, secondSeparatorIndex);
  }

  let partStart = firstSeparatorIndex + 1;
  let partIndex = 1;
  for (let index = partStart; index <= text.length; index += 1) {
    if (index === text.length || text.charCodeAt(index) === 31) {
      if (partIndex === splitIndex) {
        return text.slice(partStart, index);
      }
      partIndex += 1;
      partStart = index + 1;
    }
  }

  return '';
}

function compareSortValues(valA, valB, type, direction) {
  const emptyA = valA === undefined || valA === null || valA === '';
  const emptyB = valB === undefined || valB === null || valB === '';

  if (emptyA && emptyB) return 0;
  if (emptyA) return direction === 'asc' ? 1 : -1;
  if (emptyB) return direction === 'asc' ? -1 : 1;

  let result = 0;
  if (type === 'number' || type === 'money') {
    result = (parseSortNumericValue(valA, type) || 0) - (parseSortNumericValue(valB, type) || 0);
  } else if (type === 'date') {
    result = (Number.parseInt(valA, 10) || 0) - (Number.parseInt(valB, 10) || 0);
  } else {
    result = compareStringValues(valA, valB);
  }

  return direction === 'asc' ? result : -result;
}

function compareStringValues(leftValue, rightValue) {
  const left = String(leftValue);
  const right = String(rightValue);
  if (left === right) return 0;
  return left < right ? -1 : 1;
}
