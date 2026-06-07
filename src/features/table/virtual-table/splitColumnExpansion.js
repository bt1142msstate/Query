import {
  cloneResultCellValue,
  getNonBlankCellValueParts,
  hasMultipleCellValues
} from '../../../core/resultCellValues.js';

const LAZY_EXPANDED_ROW_MARKER = Symbol('lazyExpandedRow');
const LAZY_EXPANDED_ROW_SOURCE = Symbol('lazyExpandedRowSource');
const LAZY_EXPANDED_ROW_COLUMN_PLAN = Symbol('lazyExpandedRowColumnPlan');
const LAZY_EXPANDED_ROWS_SOURCE = Symbol('lazyExpandedRowsSource');
const LAZY_EXPANDED_ROWS_COLUMN_PLAN = Symbol('lazyExpandedRowsColumnPlan');

export function buildExpandedMultiValueTable(rawTableData, options = {}) {
  if (!rawTableData || !Array.isArray(rawTableData.headers) || !Array.isArray(rawTableData.rows)) {
    return createEmptyTableData();
  }

  const lazyRows = options.lazyRows === true;
  const sourceColumnMap = rawTableData.columnMap instanceof Map
    ? rawTableData.columnMap
    : new Map();
  const multiMax = getMultiValueColumnMaxes(rawTableData.headers, rawTableData.rows, sourceColumnMap);

  if (multiMax.size === 0) {
    return {
      headers: [...rawTableData.headers],
      rows: lazyRows
        ? rawTableData.rows.slice()
        : rawTableData.rows.map(row => Array.isArray(row) ? row.map(cloneResultCellValue) : row),
      columnMap: new Map(sourceColumnMap),
      splitColumnGroups: new Map(),
      splitColumnParent: new Map(),
      splitColumnSourceMap: new Map()
    };
  }

  const headers = [];
  const columnPlan = [];
  const splitColumnGroups = new Map();
  const splitColumnParent = new Map();
  const splitColumnSourceMap = new Map();
  rawTableData.headers.forEach(field => {
    const max = multiMax.get(field);
    const sourceIndex = sourceColumnMap.get(field);
    if (max !== undefined) {
      const groupHeaders = [];
      for (let index = 0; index < max; index += 1) {
        const childHeader = `${field} ${index + 1}`;
        headers.push(childHeader);
        groupHeaders.push(childHeader);
        splitColumnParent.set(childHeader, field);
        columnPlan.push({
          sourceIndex,
          splitIndex: index,
          splitSource: true
        });
      }
      splitColumnGroups.set(field, groupHeaders);
      splitColumnSourceMap.set(field, sourceIndex);
      return;
    }

    headers.push(field);
    columnPlan.push({
      sourceIndex,
      splitIndex: -1,
      splitSource: false
    });
  });

  const columnMap = new Map(headers.map((header, index) => [header, index]));
  const rows = lazyRows ? createLazyExpandedRows(rawTableData.rows, columnPlan) : rawTableData.rows.map(row => {
    const nextRow = [];
    columnPlan.forEach(plan => {
      const { sourceIndex, splitIndex, splitSource } = plan;
      const rawValue = sourceIndex !== undefined && Array.isArray(row) ? row[sourceIndex] : undefined;
      if (splitSource) {
        const parts = getMultiValueParts(rawValue);
        nextRow.push(parts[splitIndex] ?? '');
        return;
      }

      nextRow.push(rawValue ?? '');
    });
    return nextRow;
  });

  return {
    headers,
    rows,
    columnMap,
    splitColumnGroups,
    splitColumnParent,
    splitColumnSourceMap
  };
}

export function getMultiValueTableSummary(rawTableData) {
  if (!rawTableData || !Array.isArray(rawTableData.headers) || !Array.isArray(rawTableData.rows)) {
    return { eligible: false, columnCount: 0, valueCount: 0 };
  }

  const columnMap = rawTableData.columnMap instanceof Map
    ? rawTableData.columnMap
    : new Map();
  let columnCount = 0;
  let valueCount = 0;

  rawTableData.headers.forEach((field, fallbackIndex) => {
    const columnIndex = columnMap.has(field) ? columnMap.get(field) : fallbackIndex;
    let fieldHasMultiValues = false;

    rawTableData.rows.forEach(row => {
      const rawValue = Array.isArray(row) ? row[columnIndex] : undefined;
      const extraValueCount = getExtraMultiValueCount(rawValue);
      if (extraValueCount > 0) {
        fieldHasMultiValues = true;
        valueCount += extraValueCount;
      }
    });

    if (fieldHasMultiValues) {
      columnCount += 1;
    }
  });

  return {
    eligible: columnCount > 0,
    columnCount,
    valueCount
  };
}

function createLazyExpandedRows(sourceRows, columnPlan) {
  const target = new Array(sourceRows.length);
  let hasIndexedOverrides = false;

  return new Proxy(target, {
    get(rowTarget, prop, receiver) {
      if (prop === LAZY_EXPANDED_ROWS_SOURCE) {
        return hasIndexedOverrides ? null : sourceRows;
      }
      if (prop === LAZY_EXPANDED_ROWS_COLUMN_PLAN) {
        return hasIndexedOverrides ? null : columnPlan;
      }

      const index = getArrayIndex(prop, sourceRows.length);
      if (index !== -1) {
        if (Object.prototype.hasOwnProperty.call(rowTarget, prop)) {
          return Reflect.get(rowTarget, prop, receiver);
        }
        return createLazyExpandedRow(sourceRows[index], columnPlan);
      }

      return Reflect.get(rowTarget, prop, receiver);
    },
    has(rowTarget, prop) {
      return prop === LAZY_EXPANDED_ROWS_SOURCE
        || getArrayIndex(prop, sourceRows.length) !== -1
        || Reflect.has(rowTarget, prop);
    },
    set(rowTarget, prop, value, receiver) {
      if (getArrayIndex(prop, sourceRows.length) !== -1) {
        hasIndexedOverrides = true;
      }
      return Reflect.set(rowTarget, prop, value, receiver);
    },
    deleteProperty(rowTarget, prop) {
      if (getArrayIndex(prop, sourceRows.length) !== -1) {
        hasIndexedOverrides = true;
      }
      return Reflect.deleteProperty(rowTarget, prop);
    }
  });
}

function createLazyExpandedRow(sourceRow, columnPlan) {
  const target = new Array(columnPlan.length);
  const splitCache = new Map();

  return new Proxy(target, {
    get(rowTarget, prop, receiver) {
      if (prop === LAZY_EXPANDED_ROW_MARKER) {
        return true;
      }
      if (prop === LAZY_EXPANDED_ROW_SOURCE) {
        return sourceRow;
      }
      if (prop === LAZY_EXPANDED_ROW_COLUMN_PLAN) {
        return columnPlan;
      }

      const index = getArrayIndex(prop, columnPlan.length);
      if (index !== -1) {
        return getProjectedCellValue(sourceRow, columnPlan[index], splitCache);
      }

      return Reflect.get(rowTarget, prop, receiver);
    },
    getOwnPropertyDescriptor(rowTarget, prop) {
      const index = getArrayIndex(prop, columnPlan.length);
      if (index !== -1) {
        return {
          configurable: true,
          enumerable: true,
          value: getProjectedCellValue(sourceRow, columnPlan[index], splitCache),
          writable: false
        };
      }

      return Reflect.getOwnPropertyDescriptor(rowTarget, prop);
    },
    has(rowTarget, prop) {
      return prop === LAZY_EXPANDED_ROW_MARKER
        || prop === LAZY_EXPANDED_ROW_SOURCE
        || getArrayIndex(prop, columnPlan.length) !== -1
        || Reflect.has(rowTarget, prop);
    },
    ownKeys(rowTarget) {
      const keys = [];
      for (let index = 0; index < columnPlan.length; index += 1) {
        keys.push(String(index));
      }
      return keys.concat(Reflect.ownKeys(rowTarget).filter(key => !keys.includes(key)));
    }
  });
}

function getProjectedCellValue(sourceRow, plan, splitCache) {
  if (!plan || plan.sourceIndex === undefined || !Array.isArray(sourceRow)) {
    return '';
  }

  const rawValue = sourceRow[plan.sourceIndex];
  if (!plan.splitSource) {
    return rawValue ?? '';
  }

  if (!splitCache.has(plan.sourceIndex)) {
    splitCache.set(plan.sourceIndex, getMultiValueParts(rawValue));
  }

  return splitCache.get(plan.sourceIndex)[plan.splitIndex] ?? '';
}

function getArrayIndex(prop, length) {
  if (typeof prop === 'symbol') {
    return -1;
  }

  const text = String(prop);
  if (!/^(?:0|[1-9]\d*)$/u.test(text)) {
    return -1;
  }

  const index = Number(text);
  return Number.isInteger(index) && index >= 0 && index < length ? index : -1;
}

function getMultiValueParts(value) {
  const parts = getNonBlankCellValueParts(value);
  return parts.length ? parts : [''];
}

function getMultiValueColumnMaxes(headers, rows, columnMap) {
  const multiMax = new Map();

  headers.forEach(field => {
    const columnIndex = columnMap.get(field);
    if (columnIndex === undefined) return;

    let max = 1;
    rows.forEach(row => {
      const value = Array.isArray(row) ? row[columnIndex] : undefined;
      if (hasMultipleCellValues(value)) {
        max = Math.max(max, countMultiValueParts(value));
      }
    });

    if (max > 1) {
      multiMax.set(field, max);
    }
  });

  return multiMax;
}

function countMultiValueParts(value) {
  return getMultiValueParts(value).length;
}

function getExtraMultiValueCount(value) {
  return Math.max(0, getNonBlankCellValueParts(value).length - 1);
}

function createEmptyTableData() {
  return {
    headers: [],
    rows: [],
    columnMap: new Map(),
    splitColumnGroups: new Map(),
    splitColumnParent: new Map(),
    splitColumnSourceMap: new Map()
  };
}

export function isLazyExpandedRow(row) {
  return Boolean(row?.[LAZY_EXPANDED_ROW_MARKER]);
}

export function materializeExpandedRow(row) {
  return isLazyExpandedRow(row) ? Array.from(row) : row;
}

export function getLazyExpandedRowSourceValue(row, sourceIndex) {
  const sourceRow = row?.[LAZY_EXPANDED_ROW_SOURCE];
  return Array.isArray(sourceRow) && sourceIndex !== undefined
    ? sourceRow[sourceIndex] ?? ''
    : undefined;
}

export function getLazyExpandedRowSourceRow(row) {
  const sourceRow = row?.[LAZY_EXPANDED_ROW_SOURCE];
  return Array.isArray(sourceRow) ? sourceRow : null;
}

export function getLazyExpandedRowColumnPlan(row) {
  const columnPlan = row?.[LAZY_EXPANDED_ROW_COLUMN_PLAN];
  return Array.isArray(columnPlan) ? columnPlan : null;
}

export function getLazyExpandedRowsSourceRows(rows) {
  const sourceRows = rows?.[LAZY_EXPANDED_ROWS_SOURCE];
  return Array.isArray(sourceRows) ? sourceRows : null;
}

export function getLazyExpandedRowsColumnPlan(rows) {
  const columnPlan = rows?.[LAZY_EXPANDED_ROWS_COLUMN_PLAN];
  return Array.isArray(columnPlan) ? columnPlan : null;
}
