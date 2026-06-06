function getColumnMap(tableData) {
  return tableData?.columnMap instanceof Map ? tableData.columnMap : new Map();
}

function getSplitColumnGroups(tableData) {
  return tableData?.splitColumnGroups instanceof Map ? tableData.splitColumnGroups : new Map();
}

function getSplitColumnParentMap(tableData) {
  return tableData?.splitColumnParent instanceof Map ? tableData.splitColumnParent : new Map();
}

function getSplitFieldParentName(fieldName, tableData) {
  const normalizedField = String(fieldName || '').trim();
  if (!normalizedField) {
    return '';
  }

  return getSplitColumnParentMap(tableData).get(normalizedField) || normalizedField;
}

function getSplitFieldColumnIndexes(fieldName, tableData) {
  const normalizedField = String(fieldName || '').trim();
  if (!normalizedField) {
    return [];
  }

  const columnMap = getColumnMap(tableData);
  if (columnMap.has(normalizedField)) {
    return [columnMap.get(normalizedField)];
  }

  const splitChildren = getSplitColumnGroups(tableData).get(normalizedField);
  if (Array.isArray(splitChildren) && splitChildren.length) {
    return splitChildren
      .map(childField => columnMap.get(childField))
      .filter(index => index !== undefined);
  }

  const parentField = getSplitColumnParentMap(tableData).get(normalizedField);
  if (parentField && columnMap.has(parentField)) {
    return [columnMap.get(parentField)];
  }

  return [];
}

function getSplitFieldValue(row, columnIndexes) {
  if (!Array.isArray(row) || !Array.isArray(columnIndexes) || !columnIndexes.length) {
    return '';
  }

  if (columnIndexes.length === 1) {
    return row[columnIndexes[0]] ?? '';
  }

  return columnIndexes
    .map(index => row[index] ?? '')
    .join('\x1F');
}

function isSplitFieldAvailable(fieldName, tableData) {
  return getSplitFieldColumnIndexes(fieldName, tableData).length > 0;
}

function getPostFilterActionFieldsForTable(displayedFields, tableData) {
  const actionFields = [];
  const seen = new Set();

  (Array.isArray(displayedFields) ? displayedFields : [])
    .map(field => getSplitFieldParentName(field, tableData))
    .filter(field => field && isSplitFieldAvailable(field, tableData))
    .forEach(field => {
      if (seen.has(field)) {
        return;
      }
      seen.add(field);
      actionFields.push(field);
    });

  return actionFields;
}

export {
  getPostFilterActionFieldsForTable,
  getSplitFieldColumnIndexes,
  getSplitFieldParentName,
  getSplitFieldValue,
  isSplitFieldAvailable
};
