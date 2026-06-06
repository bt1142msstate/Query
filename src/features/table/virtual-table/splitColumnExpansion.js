export function buildExpandedMultiValueTable(rawTableData) {
  if (!rawTableData || !Array.isArray(rawTableData.headers) || !Array.isArray(rawTableData.rows)) {
    return createEmptyTableData();
  }

  const sourceColumnMap = rawTableData.columnMap instanceof Map
    ? rawTableData.columnMap
    : new Map();
  const multiMax = getMultiValueColumnMaxes(rawTableData.headers, rawTableData.rows, sourceColumnMap);

  if (multiMax.size === 0) {
    return {
      headers: [...rawTableData.headers],
      rows: rawTableData.rows.map(row => Array.isArray(row) ? [...row] : row),
      columnMap: new Map(sourceColumnMap),
      splitColumnGroups: new Map(),
      splitColumnParent: new Map()
    };
  }

  const headers = [];
  const splitColumnGroups = new Map();
  const splitColumnParent = new Map();
  rawTableData.headers.forEach(field => {
    const max = multiMax.get(field);
    if (max !== undefined) {
      const groupHeaders = [];
      for (let index = 0; index < max; index += 1) {
        const childHeader = `${field} ${index + 1}`;
        headers.push(childHeader);
        groupHeaders.push(childHeader);
        splitColumnParent.set(childHeader, field);
      }
      splitColumnGroups.set(field, groupHeaders);
      return;
    }

    headers.push(field);
  });

  const columnMap = new Map(headers.map((header, index) => [header, index]));
  const rows = rawTableData.rows.map(row => {
    const nextRow = [];
    rawTableData.headers.forEach(field => {
      const sourceIndex = sourceColumnMap.get(field);
      const rawValue = sourceIndex !== undefined && Array.isArray(row) ? row[sourceIndex] : undefined;
      const max = multiMax.get(field);
      if (max !== undefined) {
        const parts = rawValue != null && typeof rawValue === 'string' && rawValue.includes('\x1F')
          ? rawValue.split('\x1F')
          : [rawValue ?? ''];
        for (let index = 0; index < max; index += 1) {
          nextRow.push(parts[index] ?? '');
        }
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
    splitColumnParent
  };
}

function getMultiValueColumnMaxes(headers, rows, columnMap) {
  const multiMax = new Map();

  headers.forEach(field => {
    const columnIndex = columnMap.get(field);
    if (columnIndex === undefined) return;

    let max = 1;
    rows.forEach(row => {
      const value = Array.isArray(row) ? row[columnIndex] : undefined;
      if (value != null && typeof value === 'string' && value.includes('\x1F')) {
        max = Math.max(max, value.split('\x1F').length);
      }
    });

    if (max > 1) {
      multiMax.set(field, max);
    }
  });

  return multiMax;
}

function createEmptyTableData() {
  return {
    headers: [],
    rows: [],
    columnMap: new Map(),
    splitColumnGroups: new Map(),
    splitColumnParent: new Map()
  };
}
