const MAX_OPTIMISTIC_BODY_ROWS = 500;

function getHeaderFieldName(th) {
  if (!th) {
    return '';
  }

  return String(
    th.getAttribute('data-sort-field')
    || th.querySelector('.th-text')?.textContent
    || th.textContent
    || ''
  ).trim();
}

function getCurrentHeaderFields(table) {
  return Array.from(table?.querySelectorAll('thead th[data-col-index]') || [])
    .map(getHeaderFieldName)
    .filter(Boolean);
}

function getColumnOrderIndexes(currentFields, nextFields) {
  const remainingByField = new Map();
  currentFields.forEach((field, index) => {
    if (!remainingByField.has(field)) {
      remainingByField.set(field, []);
    }
    remainingByField.get(field).push(index);
  });

  const order = [];
  for (const field of nextFields) {
    const indexes = remainingByField.get(field);
    if (!indexes?.length) {
      return [];
    }
    order.push(indexes.shift());
  }

  return order.length === currentFields.length ? order : [];
}

function getKeptColumnIndexes(currentFields, nextFields) {
  const remainingByField = new Map();
  currentFields.forEach((field, index) => {
    if (!remainingByField.has(field)) {
      remainingByField.set(field, []);
    }
    remainingByField.get(field).push(index);
  });

  const keptIndexes = [];
  for (const field of nextFields) {
    const indexes = remainingByField.get(field);
    if (!indexes?.length) {
      return [];
    }
    keptIndexes.push(indexes.shift());
  }

  return keptIndexes;
}

function syncChildColumnIndex(child, index) {
  if (child?.hasAttribute?.('data-col-index')) {
    child.dataset.colIndex = String(index);
  }
}

function syncRemainingChildColumnIndexes(parent) {
  Array.from(parent?.children || []).forEach(syncChildColumnIndex);
}

function reorderChildrenByIndex(parent, order) {
  if (!parent || !order.length) {
    return false;
  }

  const children = Array.from(parent.children);
  if (children.length < order.length) {
    return false;
  }

  order.forEach((index, position) => {
    const child = children[index];
    if (child) {
      parent.appendChild(child);
      syncChildColumnIndex(child, position);
    }
  });
  return true;
}

function removeChildrenByIndexes(parent, indexes) {
  if (!parent || !indexes.length) {
    return 0;
  }

  const children = Array.from(parent.children);
  let removedCount = 0;
  indexes
    .slice()
    .sort((left, right) => right - left)
    .forEach(index => {
      const child = children[index];
      if (child?.parentElement === parent) {
        child.remove();
        removedCount += 1;
      }
    });
  syncRemainingChildColumnIndexes(parent);
  return removedCount;
}

function applyImmediateColumnOrder(table, nextFields, options = {}) {
  const normalizedNextFields = (Array.isArray(nextFields) ? nextFields : [])
    .map(field => String(field || '').trim())
    .filter(Boolean);
  const currentFields = getCurrentHeaderFields(table);

  if (!table || !currentFields.length || currentFields.length !== normalizedNextFields.length) {
    return { bodyRowsReordered: 0, changed: false, headerReordered: false, skippedBodyRows: 0 };
  }

  const order = getColumnOrderIndexes(currentFields, normalizedNextFields);
  if (!order.length || order.every((index, position) => index === position)) {
    return { bodyRowsReordered: 0, changed: false, headerReordered: false, skippedBodyRows: 0 };
  }

  const headerRow = table.querySelector('thead tr');
  const headerReordered = reorderChildrenByIndex(headerRow, order);
  const colgroup = Array.from(table.children).find(child => child.tagName === 'COLGROUP');
  reorderChildrenByIndex(colgroup, order);

  const maxRows = Number.isInteger(options.maxBodyRows)
    ? options.maxBodyRows
    : MAX_OPTIMISTIC_BODY_ROWS;
  const rows = Array.from(table.querySelectorAll('tbody tr'));
  const canReorderBody = rows.length <= maxRows;
  let bodyRowsReordered = 0;

  if (canReorderBody) {
    rows.forEach(row => {
      const cells = row.querySelectorAll('td[data-col-index]');
      if (cells.length === currentFields.length && reorderChildrenByIndex(row, order)) {
        bodyRowsReordered += 1;
      }
    });
  }

  return {
    bodyRowsReordered,
    changed: headerReordered,
    headerReordered,
    skippedBodyRows: canReorderBody ? 0 : rows.length
  };
}

function applyImmediateColumnRemoval(table, nextFields, options = {}) {
  const normalizedNextFields = (Array.isArray(nextFields) ? nextFields : [])
    .map(field => String(field || '').trim())
    .filter(Boolean);
  const currentFields = getCurrentHeaderFields(table);

  if (!table || !currentFields.length || normalizedNextFields.length >= currentFields.length) {
    return {
      bodyRowsUpdated: 0,
      changed: false,
      colgroupColumnsRemoved: 0,
      headerColumnsRemoved: 0,
      skippedBodyRows: 0
    };
  }

  const keptIndexes = getKeptColumnIndexes(currentFields, normalizedNextFields);
  if (!keptIndexes.length && normalizedNextFields.length > 0) {
    return {
      bodyRowsUpdated: 0,
      changed: false,
      colgroupColumnsRemoved: 0,
      headerColumnsRemoved: 0,
      skippedBodyRows: 0
    };
  }

  const keptIndexSet = new Set(keptIndexes);
  const removedIndexes = currentFields
    .map((field, index) => index)
    .filter(index => !keptIndexSet.has(index));

  if (!removedIndexes.length) {
    return {
      bodyRowsUpdated: 0,
      changed: false,
      colgroupColumnsRemoved: 0,
      headerColumnsRemoved: 0,
      skippedBodyRows: 0
    };
  }

  const headerRow = table.querySelector('thead tr');
  const headerColumnsRemoved = removeChildrenByIndexes(headerRow, removedIndexes);
  const colgroup = Array.from(table.children).find(child => child.tagName === 'COLGROUP');
  const colgroupColumnsRemoved = removeChildrenByIndexes(colgroup, removedIndexes);

  const maxRows = Number.isInteger(options.maxBodyRows)
    ? options.maxBodyRows
    : MAX_OPTIMISTIC_BODY_ROWS;
  const rows = Array.from(table.querySelectorAll('tbody tr'));
  const canUpdateBody = rows.length <= maxRows;
  let bodyRowsUpdated = 0;

  if (canUpdateBody) {
    rows.forEach(row => {
      const cells = row.querySelectorAll('td[data-col-index]');
      if (cells.length >= currentFields.length && removeChildrenByIndexes(row, removedIndexes) > 0) {
        bodyRowsUpdated += 1;
      }
    });
  }

  return {
    bodyRowsUpdated,
    changed: headerColumnsRemoved > 0,
    colgroupColumnsRemoved,
    headerColumnsRemoved,
    skippedBodyRows: canUpdateBody ? 0 : rows.length
  };
}

export { applyImmediateColumnOrder, applyImmediateColumnRemoval };
