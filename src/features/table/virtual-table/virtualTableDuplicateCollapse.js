function normalizeFieldList(fields) {
  return (Array.isArray(fields) ? fields : [])
    .map(field => String(field || '').trim())
    .filter(Boolean);
}

function normalizeCellValueForKey(value) {
  if (value === undefined) return 'u:';
  if (value === null) return 'n:';
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

  return row => columnIndexes
    .map(columnIndex => (
      columnIndex >= 0
        ? normalizeCellValueForKey(row?.[columnIndex])
        : 'm:'
    ))
    .join('\x1E');
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

  const groupsByKey = new Map();
  const uniqueRows = [];
  const uniqueRowGroups = [];
  const buildProjectedRowKey = createProjectedRowKeyBuilder(fields, columns);
  let collapsedRows = 0;

  sourceRows.forEach((row, rowIndex) => {
    const key = buildProjectedRowKey(row);
    const existingGroup = groupsByKey.get(key);

    if (existingGroup) {
      addRowToDuplicateGroup(existingGroup, row, rowIndex);
      collapsedRows += 1;
      return;
    }

    const group = createDuplicateRowGroup({
      key,
      row,
      rowIndex,
      displayedFields: fields
    });
    groupsByKey.set(key, group);

    uniqueRows.push(row);
    uniqueRowGroups.push(group);
  });

  return {
    collapsedRows,
    displayedFields: fields,
    duplicateRowGroups: collapsedRows > 0 ? cloneDuplicateRowGroups(uniqueRowGroups) : [],
    rows: collapsedRows > 0 ? uniqueRows : sourceRows,
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
