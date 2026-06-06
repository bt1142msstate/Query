function shouldHideAnchorBetweenDuplicateColumns(displayedFields, insertAt, getBaseFieldName) {
  const fields = Array.isArray(displayedFields) ? displayedFields : [];
  if (fields.length <= 1 || insertAt <= 0 || insertAt >= fields.length) {
    return false;
  }

  const beforeField = fields[insertAt - 1];
  const afterField = fields[insertAt];
  if (!beforeField || !afterField) {
    return false;
  }

  const getBase = typeof getBaseFieldName === 'function'
    ? getBaseFieldName
    : field => field;
  return getBase(beforeField) === getBase(afterField);
}

function shouldHideAnchorForNoOpDrop(insertAt, draggedIndex, dragGroupIndices = []) {
  if (!Number.isInteger(insertAt)) {
    return false;
  }

  const normalizedGroup = getNormalizedDragGroupIndices(draggedIndex, dragGroupIndices);
  if (!normalizedGroup.length || !isContiguousIndexGroup(normalizedGroup)) {
    return false;
  }

  const firstIndex = normalizedGroup[0];
  const lastIndex = normalizedGroup[normalizedGroup.length - 1];
  return insertAt >= firstIndex && insertAt <= lastIndex + 1;
}

function getNormalizedDragGroupIndices(draggedIndex, dragGroupIndices) {
  const indices = Array.isArray(dragGroupIndices)
    ? dragGroupIndices
      .map(index => Number(index))
      .filter(Number.isInteger)
    : [];

  if (!indices.length && Number.isInteger(draggedIndex)) {
    indices.push(draggedIndex);
  }

  return [...new Set(indices)].sort((left, right) => left - right);
}

function isContiguousIndexGroup(indices) {
  return indices.every((index, offset) => index === indices[0] + offset);
}

function getDropAnchorLayout(options) {
  const {
    columnRect,
    viewportRect,
    clientX,
    colIndex,
    draggedIndex,
    dragGroupIndices,
    displayedFields,
    getBaseFieldName,
    scrollX = 0,
    scrollY = 0
  } = options;

  if (!columnRect || !viewportRect) {
    return { visible: false };
  }

  if (columnRect.right < viewportRect.left || columnRect.left > viewportRect.right) {
    return { visible: false };
  }

  const insertLeft = (clientX - columnRect.left) < columnRect.width / 2;
  const insertAt = insertLeft ? colIndex : colIndex + 1;

  if (
    shouldHideAnchorForNoOpDrop(insertAt, draggedIndex, dragGroupIndices)
    || shouldHideAnchorBetweenDuplicateColumns(displayedFields, insertAt, getBaseFieldName)
  ) {
    return { visible: false, insertAt };
  }

  const rawAnchorX = insertLeft ? columnRect.left : columnRect.right;
  const clampedAnchorX = Math.max(viewportRect.left, Math.min(rawAnchorX, viewportRect.right));

  return {
    visible: true,
    insertAt,
    width: 4,
    height: Math.max(0, viewportRect.height),
    left: clampedAnchorX + scrollX - 2,
    top: viewportRect.top + scrollY
  };
}

export {
  getDropAnchorLayout,
  shouldHideAnchorBetweenDuplicateColumns,
  shouldHideAnchorForNoOpDrop
};
