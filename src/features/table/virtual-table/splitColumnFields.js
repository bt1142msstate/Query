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

function getSplitFieldGroupNames(fieldName, tableData) {
  const normalizedField = String(fieldName || '').trim();
  if (!normalizedField) {
    return [];
  }

  const parentField = getSplitFieldParentName(normalizedField, tableData);
  const group = getSplitColumnGroups(tableData).get(parentField);
  if (!Array.isArray(group) || !group.includes(normalizedField)) {
    return [];
  }

  return group.slice();
}

function getSplitFieldGroupIndices(fieldName, displayedFields, tableData) {
  const fields = Array.isArray(displayedFields) ? displayedFields : [];
  const groupNames = getSplitFieldGroupNames(fieldName, tableData);
  if (!groupNames.length) {
    return [];
  }

  return fields
    .map((field, index) => groupNames.includes(field) ? index : -1)
    .filter(index => index >= 0)
    .sort((left, right) => left - right);
}

function buildDisplayedFieldMove(displayedFields, fromIndex, toIndex, tableData) {
  const fields = Array.isArray(displayedFields) ? displayedFields.slice() : [];
  if (
    !Number.isInteger(fromIndex)
    || !Number.isInteger(toIndex)
    || fromIndex < 0
    || fromIndex >= fields.length
  ) {
    return createMoveResult(fields);
  }

  const groupIndices = getSplitFieldGroupIndices(fields[fromIndex], fields, tableData);
  if (groupIndices.length <= 1) {
    return buildSingleDisplayedFieldMove(fields, fromIndex, toIndex);
  }

  const groupSet = new Set(groupIndices);
  if (groupSet.has(toIndex)) {
    return createMoveResult(fields, {
      groupIndices,
      isGroupMove: true,
      movedFields: groupIndices.map(index => fields[index])
    });
  }

  const rawInsertAt = fromIndex < toIndex ? toIndex + 1 : toIndex;
  const movedFields = fields.filter((field, index) => groupSet.has(index));
  const remainingFields = [];
  fields.forEach((field, index) => {
    if (!groupSet.has(index)) {
      remainingFields.push(field);
    }
  });
  const removedBeforeInsert = groupIndices.filter(index => index < rawInsertAt).length;
  const insertAt = clampIndex(rawInsertAt - removedBeforeInsert, 0, remainingFields.length);
  const nextFields = remainingFields.slice();
  nextFields.splice(insertAt, 0, ...movedFields);

  return createMoveResult(nextFields, {
    changed: !areStringArraysEqual(fields, nextFields),
    groupIndices,
    insertAt,
    isGroupMove: true,
    movedFields
  });
}

function buildSplitModeDisplayedFields(displayedFields, tableData, splitActive) {
  const fields = Array.isArray(displayedFields) ? displayedFields : [];
  const nextFields = [];
  const seen = new Set();
  const columnMap = getColumnMap(tableData);
  const splitGroups = getSplitColumnGroups(tableData);

  fields
    .map(field => String(field || '').trim())
    .filter(Boolean)
    .forEach(field => {
      const parentField = getSplitFieldParentName(field, tableData);
      if (splitActive) {
        const group = splitGroups.get(parentField);
        if (Array.isArray(group) && group.length) {
          group.forEach(childField => appendField(nextFields, seen, childField, columnMap));
          return;
        }
        appendField(nextFields, seen, field, columnMap);
        return;
      }

      appendField(nextFields, seen, parentField, columnMap);
    });

  return nextFields;
}

function appendField(fields, seen, field, columnMap) {
  const normalizedField = String(field || '').trim();
  if (!normalizedField || seen.has(normalizedField) || !columnMap.has(normalizedField)) {
    return;
  }
  seen.add(normalizedField);
  fields.push(normalizedField);
}

function buildSingleDisplayedFieldMove(fields, fromIndex, toIndex) {
  if (fromIndex === toIndex) {
    return createMoveResult(fields);
  }

  const nextFields = fields.slice();
  const [movedField] = nextFields.splice(fromIndex, 1);
  const insertAt = clampIndex(toIndex, 0, nextFields.length);
  nextFields.splice(insertAt, 0, movedField);

  return createMoveResult(nextFields, {
    changed: !areStringArraysEqual(fields, nextFields),
    groupIndices: [fromIndex],
    insertAt,
    movedFields: [movedField]
  });
}

function createMoveResult(fields, overrides = {}) {
  return {
    changed: false,
    fields,
    groupIndices: [],
    insertAt: -1,
    isGroupMove: false,
    movedFields: [],
    ...overrides
  };
}

function clampIndex(value, min, max) {
  return Math.max(min, Math.min(value, max));
}

function areStringArraysEqual(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

export {
  buildDisplayedFieldMove,
  buildSplitModeDisplayedFields,
  getPostFilterActionFieldsForTable,
  getSplitFieldColumnIndexes,
  getSplitFieldGroupIndices,
  getSplitFieldGroupNames,
  getSplitFieldParentName,
  getSplitFieldValue,
  isSplitFieldAvailable
};
