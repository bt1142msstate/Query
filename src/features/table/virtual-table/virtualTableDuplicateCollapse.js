function normalizeFieldList(fields) {
  return (Array.isArray(fields) ? fields : [])
    .map(field => String(field || '').trim())
    .filter(Boolean);
}

function normalizeCellValueForKey(value) {
  if (value === undefined) return ['undefined'];
  if (value === null) return ['null'];
  if (Array.isArray(value)) return ['array', value.map(normalizeCellValueForKey)];

  if (value && typeof value === 'object') {
    const entries = Object.keys(value)
      .sort()
      .map(key => [key, normalizeCellValueForKey(value[key])]);
    return ['object', entries];
  }

  return [typeof value, value];
}

function buildProjectedRowKey(row, fields, columnMap) {
  return JSON.stringify(fields.map(field => {
    const columnIndex = columnMap.get(field);
    if (columnIndex === undefined) {
      return [field, 'missing'];
    }
    return [field, normalizeCellValueForKey(row?.[columnIndex])];
  }));
}

function collapseDuplicateProjectedRows({ rows, displayedFields, columnMap }) {
  const sourceRows = Array.isArray(rows) ? rows : [];
  const fields = normalizeFieldList(displayedFields);
  const columns = columnMap instanceof Map ? columnMap : new Map();

  if (sourceRows.length <= 1 || !fields.length) {
    return {
      collapsedRows: 0,
      displayedFields: fields,
      rows: sourceRows,
      sourceRows: sourceRows.length,
      uniqueRows: sourceRows.length
    };
  }

  const seen = new Set();
  const uniqueRows = [];
  let collapsedRows = 0;

  sourceRows.forEach(row => {
    const key = buildProjectedRowKey(row, fields, columns);
    if (seen.has(key)) {
      collapsedRows += 1;
      return;
    }
    seen.add(key);
    uniqueRows.push(row);
  });

  return {
    collapsedRows,
    displayedFields: fields,
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
  createEmptyDuplicateCollapseStats
};
