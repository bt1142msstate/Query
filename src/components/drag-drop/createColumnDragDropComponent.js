import { getDropAnchorLayout } from '../../features/table/drag-drop/dragDropAnchorLayout.js';
import {
  calculateAutoScrollStep,
  getAutoScrollIntent,
  getHeaderInsertPositionFromRects
} from '../../features/table/drag-drop/dragDropInteractionMath.js';
import {
  buildDisplayedFieldMove,
  getSplitFieldGroupIndices
} from '../../features/table/virtual-table/splitColumnFields.js';

function normalizeStringList(values) {
  return (Array.isArray(values) ? values : [])
    .map(value => String(value || '').trim())
    .filter(Boolean);
}

function cloneMap(value) {
  return value instanceof Map ? new Map(value) : new Map();
}

function normalizeTableData(data = {}) {
  return {
    columnMap: cloneMap(data.columnMap),
    splitColumnGroups: cloneMap(data.splitColumnGroups),
    splitColumnParent: cloneMap(data.splitColumnParent),
    splitColumnSourceMap: cloneMap(data.splitColumnSourceMap)
  };
}

function normalizeIndexList(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map(value => Number(value))
    .filter(Number.isInteger))]
    .sort((left, right) => left - right);
}

function getIdentityBaseFieldName(fieldName) {
  return String(fieldName || '').trim();
}

function createNoOpMoveResult(fields, metadata = {}) {
  return {
    changed: false,
    fields: fields.slice(),
    groupIndices: [],
    insertAt: -1,
    isGroupMove: false,
    movedFields: [],
    ...metadata
  };
}

function createColumnDragDropComponent(options = {}) {
  let displayedFields = normalizeStringList(options.displayedFields);
  let tableData = normalizeTableData(options.tableData);
  let activeDrag = null;
  const getBaseFieldName = typeof options.getBaseFieldName === 'function'
    ? options.getBaseFieldName
    : getIdentityBaseFieldName;
  const onFieldsChange = typeof options.onFieldsChange === 'function'
    ? options.onFieldsChange
    : () => {};
  const getMoveGroupIndices = typeof options.getMoveGroupIndices === 'function'
    ? options.getMoveGroupIndices
    : null;

  function resolveFieldIndex(input = {}) {
    if (Number.isInteger(input.index) && input.index >= 0 && input.index < displayedFields.length) {
      return input.index;
    }

    const field = String(input.field || '').trim();
    return field ? displayedFields.indexOf(field) : -1;
  }

  function getDragGroupIndices(index) {
    if (!Number.isInteger(index) || index < 0 || index >= displayedFields.length) {
      return [];
    }

    const field = displayedFields[index];
    const customGroup = normalizeIndexList(getMoveGroupIndices?.({
      displayedFields: displayedFields.slice(),
      field,
      index,
      tableData
    }));
    if (customGroup.length > 1) {
      return customGroup;
    }

    const splitGroup = normalizeIndexList(getSplitFieldGroupIndices(field, displayedFields, tableData));
    return splitGroup.length > 1 ? splitGroup : [index];
  }

  function commitMoveResult(result) {
    if (!result.changed) {
      return result;
    }

    displayedFields = normalizeStringList(result.fields);
    onFieldsChange(displayedFields.slice(), result);
    return result;
  }

  function previewMove(fromIndex, toIndex) {
    if (!Number.isInteger(fromIndex) || !Number.isInteger(toIndex)) {
      return createNoOpMoveResult(displayedFields);
    }

    return buildDisplayedFieldMove(displayedFields, fromIndex, toIndex, tableData);
  }

  function moveField(fromIndex, toIndex) {
    return commitMoveResult(previewMove(fromIndex, toIndex));
  }

  function startDrag(input = {}) {
    const index = resolveFieldIndex(input);
    if (index === -1) {
      activeDrag = null;
      return null;
    }

    const configuredGroup = normalizeIndexList(input.groupIndices);
    const groupIndices = configuredGroup.length ? configuredGroup : getDragGroupIndices(index);
    activeDrag = {
      field: displayedFields[index],
      groupIndices,
      index
    };
    return { ...activeDrag, groupIndices: activeDrag.groupIndices.slice() };
  }

  function getDropPreview(options = {}) {
    if (!activeDrag) {
      return { visible: false };
    }

    return getDropAnchorLayout({
      ...options,
      displayedFields,
      draggedIndex: activeDrag.index,
      dragGroupIndices: activeDrag.groupIndices,
      getBaseFieldName
    });
  }

  function getHeaderInsertPreview(headerRects, clientX, threshold) {
    return getHeaderInsertPositionFromRects(headerRects, clientX, threshold);
  }

  function dropAt(toIndex, options = {}) {
    if (!activeDrag) {
      return createNoOpMoveResult(displayedFields);
    }

    const result = moveField(activeDrag.index, toIndex);
    if (options.keepDragging === true && result.changed) {
      const movedField = result.movedFields[0] || activeDrag.field;
      activeDrag = {
        field: movedField,
        groupIndices: result.groupIndices,
        index: displayedFields.indexOf(movedField)
      };
    } else {
      activeDrag = null;
    }
    return result;
  }

  function endDrag() {
    activeDrag = null;
  }

  function setDisplayedFields(fields) {
    displayedFields = normalizeStringList(fields);
    activeDrag = null;
    return displayedFields.slice();
  }

  function setTableData(data) {
    tableData = normalizeTableData(data);
    activeDrag = null;
    return tableData;
  }

  return Object.freeze({
    get activeDrag() {
      return activeDrag ? { ...activeDrag, groupIndices: activeDrag.groupIndices.slice() } : null;
    },
    get displayedFields() {
      return displayedFields.slice();
    },
    get tableData() {
      return normalizeTableData(tableData);
    },
    calculateAutoScrollStep,
    endDrag,
    getAutoScrollIntent,
    getDropPreview,
    getHeaderInsertPreview,
    moveField,
    previewMove,
    setDisplayedFields,
    setTableData,
    startDrag,
    dropAt
  });
}

export {
  createColumnDragDropComponent,
  normalizeTableData as normalizeDragDropTableData
};
