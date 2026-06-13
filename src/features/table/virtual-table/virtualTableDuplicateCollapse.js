import {
  getLazyExpandedRowsColumnPlan,
  getLazyExpandedRowsSourceRows
} from './splitColumnExpansion.js';
import { getNonBlankCellValueParts } from '../../../core/resultCellValues.js';

function normalizeFieldList(fields) {
  return (Array.isArray(fields) ? fields : [])
    .map(field => String(field || '').trim())
    .filter(Boolean);
}

function normalizeCellValueForKey(value) {
  if (value === undefined) return 'u:';
  if (value === null) return 'n:';
  if (typeof value === 'string') return `s:${value.length}:${value}`;
  if (typeof value === 'number') return `num:${value}`;
  if (typeof value === 'boolean') return value ? 'b:1' : 'b:0';
  if (typeof value === 'bigint') return `bi:${value}`;
  if (Array.isArray(value)) {
    return `a:[${value.map(normalizeCellValueForKey).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    return `o:{${Object.keys(value)
      .sort()
      .map(key => `${JSON.stringify(key)}:${normalizeCellValueForKey(value[key])}`)
      .join(',')}}`;
  }

  return `${typeof value}:${JSON.stringify(value)}`;
}

function createProjectedRowKeyBuilder(fields, columnMap) {
  const columns = columnMap instanceof Map ? columnMap : new Map();
  const columnIndexes = normalizeFieldList(fields).map(field => (
    columns.has(field) ? columns.get(field) : -1
  ));

  return row => {
    let key = '';
    for (let index = 0; index < columnIndexes.length; index += 1) {
      if (index > 0) {
        key += '\x1E';
      }

      const columnIndex = columnIndexes[index];
      key += columnIndex >= 0
        ? normalizeCellValueForKey(row?.[columnIndex])
        : 'm:';
    }
    return key;
  };
}

function createLazyProjectedRowKeyBuilder(fields, columnMap, columnPlan) {
  const columns = columnMap instanceof Map ? columnMap : new Map();
  const plans = normalizeFieldList(fields).map(field => {
    const columnIndex = columns.has(field) ? columns.get(field) : -1;
    return columnIndex >= 0 ? columnPlan[columnIndex] || null : null;
  });

  return sourceRow => {
    let key = '';
    let cachedSplitSourceIndex = -1;
    let cachedSplitParts = null;

    for (let index = 0; index < plans.length; index += 1) {
      if (index > 0) {
        key += '\x1E';
      }

      const plan = plans[index];
      if (!plan) {
        key += 'm:';
        continue;
      }

      if (!plan.splitSource) {
        key += normalizeCellValueForKey(
          Array.isArray(sourceRow) && plan.sourceIndex !== undefined ? sourceRow[plan.sourceIndex] ?? '' : ''
        );
        continue;
      }

      if (cachedSplitSourceIndex !== plan.sourceIndex) {
        const rawValue = Array.isArray(sourceRow) && plan.sourceIndex !== undefined ? sourceRow[plan.sourceIndex] : undefined;
        const parts = getNonBlankCellValueParts(rawValue);
        cachedSplitParts = parts.length ? parts : [''];
        cachedSplitSourceIndex = plan.sourceIndex;
      }

      key += normalizeCellValueForKey(cachedSplitParts?.[plan.splitIndex] ?? '');
    }

    return key;
  };
}

function getLazyProjectedCellValue(sourceRow, plan) {
  if (!plan) return undefined;
  if (!plan.splitSource) {
    return Array.isArray(sourceRow) && plan.sourceIndex !== undefined ? sourceRow[plan.sourceIndex] ?? '' : '';
  }

  const rawValue = Array.isArray(sourceRow) && plan.sourceIndex !== undefined ? sourceRow[plan.sourceIndex] : undefined;
  const parts = getNonBlankCellValueParts(rawValue);
  return (parts.length ? parts : [''])[plan.splitIndex] ?? '';
}

function isFirstDisplayedFieldUnique({ fields, columnMap, keySourceRows, lazyColumnPlan, useLazyKeySource }) {
  const firstField = fields[0];
  const columnIndex = columnMap instanceof Map && columnMap.has(firstField) ? columnMap.get(firstField) : -1;
  if (columnIndex < 0) return false;

  const seen = new Set();
  const plan = useLazyKeySource ? lazyColumnPlan[columnIndex] || null : null;
  for (let rowIndex = 0; rowIndex < keySourceRows.length; rowIndex += 1) {
    const row = keySourceRows[rowIndex];
    const value = useLazyKeySource ? getLazyProjectedCellValue(row, plan) : row?.[columnIndex];
    const key = normalizeCellValueForKey(value);
    if (seen.has(key)) return false;
    seen.add(key);
  }
  return true;
}

function createDuplicateRowGroup({ key, row, rowIndex, displayedFields }) {
  return {
    collapsedRowCount: 0,
    displayedFields: [...displayedFields],
    key,
    matchingRowCount: 1,
    rows: [row],
    sourceRowIndexes: [rowIndex]
  };
}

function addRowToDuplicateGroup(group, row, rowIndex) {
  group.rows.push(row);
  group.sourceRowIndexes.push(rowIndex);
  group.matchingRowCount = group.rows.length;
  group.collapsedRowCount = Math.max(0, group.rows.length - 1);
}

function cloneDuplicateRowGroup(group) {
  if (!group || typeof group !== 'object') {
    return null;
  }

  return {
    collapsedRowCount: Number(group.collapsedRowCount || 0),
    displayedFields: Array.isArray(group.displayedFields) ? [...group.displayedFields] : [],
    key: String(group.key || ''),
    matchingRowCount: Number(group.matchingRowCount || 0),
    rows: Array.isArray(group.rows) ? [...group.rows] : [],
    sourceRowIndexes: Array.isArray(group.sourceRowIndexes) ? [...group.sourceRowIndexes] : []
  };
}

function cloneDuplicateRowGroups(groups) {
  return (Array.isArray(groups) ? groups : []).map(cloneDuplicateRowGroup);
}

function collapseDuplicateProjectedRows({ rows, displayedFields, columnMap }) {
  const sourceRows = Array.isArray(rows) ? rows : [];
  const fields = normalizeFieldList(displayedFields);
  const columns = columnMap instanceof Map ? columnMap : new Map();
  const lazySourceRows = getLazyExpandedRowsSourceRows(sourceRows);
  const lazyColumnPlan = getLazyExpandedRowsColumnPlan(sourceRows);
  const keySourceRows = lazySourceRows || sourceRows;
  const useLazyKeySource = Array.isArray(lazySourceRows) && Array.isArray(lazyColumnPlan);

  if (sourceRows.length <= 1 || !fields.length) {
    return {
      collapsedRows: 0,
      displayedFields: fields,
      duplicateRowGroups: [],
      rows: sourceRows,
      sourceRows: sourceRows.length,
      uniqueRows: sourceRows.length
    };
  }

  if (isFirstDisplayedFieldUnique({ fields, columnMap: columns, keySourceRows, lazyColumnPlan, useLazyKeySource })) {
    return {
      collapsedRows: 0,
      displayedFields: fields,
      duplicateRowGroups: [],
      rows: sourceRows,
      sourceRows: sourceRows.length,
      uniqueRows: sourceRows.length
    };
  }

  const groupsByKey = new Map();
  const duplicateGroupsByFirstRowIndex = new Map();
  let duplicateSourceRowIndexes = null;
  const buildProjectedRowKey = useLazyKeySource
    ? createLazyProjectedRowKeyBuilder(fields, columns, lazyColumnPlan)
    : createProjectedRowKeyBuilder(fields, columns);
  let collapsedRows = 0;

  const getResultRow = rowIndex => sourceRows[rowIndex];

  for (let rowIndex = 0; rowIndex < keySourceRows.length; rowIndex += 1) {
    const row = keySourceRows[rowIndex];
    const key = buildProjectedRowKey(row);
    const existingGroup = groupsByKey.get(key);

    if (existingGroup && typeof existingGroup !== 'number') {
      if (!duplicateSourceRowIndexes) {
        duplicateSourceRowIndexes = new Set();
      }
      addRowToDuplicateGroup(existingGroup, getResultRow(rowIndex), rowIndex);
      duplicateSourceRowIndexes.add(rowIndex);
      collapsedRows += 1;
      continue;
    }

    if (typeof existingGroup === 'number') {
      if (!duplicateSourceRowIndexes) {
        duplicateSourceRowIndexes = new Set();
      }
      const group = createDuplicateRowGroup({
        key,
        row: getResultRow(existingGroup),
        rowIndex: existingGroup,
        displayedFields: fields
      });
      addRowToDuplicateGroup(group, getResultRow(rowIndex), rowIndex);
      duplicateSourceRowIndexes.add(rowIndex);
      duplicateGroupsByFirstRowIndex.set(existingGroup, group);
      groupsByKey.set(key, group);
      collapsedRows += 1;
      continue;
    }

    groupsByKey.set(key, rowIndex);
  }

  let uniqueRows = sourceRows;
  let duplicateRowGroups = [];

  if (collapsedRows > 0) {
    uniqueRows = [];
    duplicateRowGroups = [];
    for (let rowIndex = 0; rowIndex < sourceRows.length; rowIndex += 1) {
      if (duplicateSourceRowIndexes?.has(rowIndex)) {
        continue;
      }

      const outputIndex = uniqueRows.length;
      uniqueRows.push(getResultRow(rowIndex));
      const group = duplicateGroupsByFirstRowIndex.get(rowIndex);
      if (group) {
        duplicateRowGroups[outputIndex] = group;
      }
    }
  }

  return {
    collapsedRows,
    displayedFields: fields,
    duplicateRowGroups: collapsedRows > 0 ? cloneDuplicateRowGroups(duplicateRowGroups) : [],
    rows: uniqueRows,
    sourceRows: sourceRows.length,
    uniqueRows: uniqueRows.length
  };
}

function cloneMap(source) {
  return source instanceof Map ? new Map(source) : new Map();
}

function createEmptyDuplicateCollapseStats() {
  return { totalRows: 0, postFilteredRows: 0, uniqueRows: 0, duplicateRowsCollapsed: 0, displayedFields: [] };
}

function buildVirtualTableProjection({ baseViewData, displayedFields, filteredRows, collapseDuplicates = true }) {
  const baseRows = Array.isArray(baseViewData?.rows) ? baseViewData.rows : [];
  const sourceRows = Array.isArray(filteredRows) ? filteredRows : [];
  const fields = normalizeFieldList(displayedFields);
  const collapseResult = collapseDuplicates === false
    ? {
        collapsedRows: 0,
        displayedFields: fields,
        duplicateRowGroups: [],
        rows: sourceRows,
        sourceRows: sourceRows.length,
        uniqueRows: sourceRows.length
      }
    : collapseDuplicateProjectedRows({
        rows: sourceRows,
        displayedFields: fields,
        columnMap: baseViewData?.columnMap
      });

  return {
    stats: {
      totalRows: baseRows.length,
      postFilteredRows: collapseResult.sourceRows,
      uniqueRows: collapseResult.uniqueRows,
      duplicateRowsCollapsed: collapseResult.collapsedRows,
      displayedFields: collapseResult.displayedFields
    },
    tableData: {
      headers: Array.isArray(baseViewData?.headers) ? [...baseViewData.headers] : [],
      rows: collapseResult.rows,
      columnMap: cloneMap(baseViewData?.columnMap),
      duplicateRowGroups: cloneDuplicateRowGroups(collapseResult.duplicateRowGroups),
      splitColumnGroups: cloneMap(baseViewData?.splitColumnGroups),
      splitColumnParent: cloneMap(baseViewData?.splitColumnParent),
      splitColumnSourceMap: cloneMap(baseViewData?.splitColumnSourceMap)
    }
  };
}

function buildDuplicateCollapseSignature(stats, generation = 0) {
  return [
    generation,
    (Array.isArray(stats?.displayedFields) ? stats.displayedFields : []).join('\x1E'),
    Number(stats?.postFilteredRows || 0),
    Number(stats?.uniqueRows || 0),
    Number(stats?.duplicateRowsCollapsed || 0)
  ].join('|');
}

function buildDuplicateCollapseToastMessage(stats) {
  const collapsedRows = Number(stats?.duplicateRowsCollapsed || 0);
  const uniqueRows = Number(stats?.uniqueRows || 0);
  return `${collapsedRows.toLocaleString()} duplicate row${collapsedRows === 1 ? '' : 's'} collapsed for the current columns. Showing ${uniqueRows.toLocaleString()} unique row${uniqueRows === 1 ? '' : 's'}.`;
}

export {
  buildDuplicateCollapseToastMessage,
  buildDuplicateCollapseSignature,
  buildVirtualTableProjection,
  collapseDuplicateProjectedRows,
  cloneDuplicateRowGroups,
  createEmptyDuplicateCollapseStats
};
