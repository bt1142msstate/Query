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

function reorderChildrenByIndex(parent, order) {
  if (!parent || !order.length) {
    return false;
  }

  const children = Array.from(parent.children);
  if (children.length < order.length) {
    return false;
  }

  order.forEach(index => {
    const child = children[index];
    if (child) {
      parent.appendChild(child);
    }
  });
  return true;
}

function syncColumnIndexes(table) {
  Array.from(table.querySelectorAll('thead th[data-col-index]')).forEach((th, index) => {
    th.dataset.colIndex = String(index);
  });

  Array.from(table.querySelectorAll('tbody tr')).forEach(row => {
    Array.from(row.querySelectorAll('td[data-col-index]')).forEach((cell, index) => {
      cell.dataset.colIndex = String(index);
    });
  });
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

  syncColumnIndexes(table);

  return {
    bodyRowsReordered,
    changed: headerReordered,
    headerReordered,
    skippedBodyRows: canReorderBody ? 0 : rows.length
  };
}

export { applyImmediateColumnOrder };
