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

function getDropAnchorLayout(options) {
  const {
    columnRect,
    viewportRect,
    clientX,
    colIndex,
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

  if (shouldHideAnchorBetweenDuplicateColumns(displayedFields, insertAt, getBaseFieldName)) {
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
  shouldHideAnchorBetweenDuplicateColumns
};
