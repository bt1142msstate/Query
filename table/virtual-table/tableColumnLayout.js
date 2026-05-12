const MIN_COLUMN_WIDTH = 90;
const MOBILE_MIN_COLUMN_WIDTH = 92;
const MOBILE_COLUMN_WIDTH_SCALE = 0.62;
const DEFAULT_COLUMN_WIDTH = 150;

function normalizeColumnWidth(width) {
  return Math.max(MIN_COLUMN_WIDTH, Math.round(Number(width) || DEFAULT_COLUMN_WIDTH));
}

function normalizeFields(fields) {
  return Array.isArray(fields)
    ? fields.map(field => String(field || '').trim()).filter(Boolean)
    : [];
}

function getAvailableTableWidth(container) {
  if (!container) {
    return 0;
  }

  return Math.max(0, Math.floor(container.clientWidth));
}

function shouldUseCompactMobileColumns() {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(max-width: 640px)').matches;
}

function getResponsiveColumnWidth(width, isManualWidth = false) {
  const normalizedWidth = normalizeColumnWidth(width);
  if (isManualWidth || !shouldUseCompactMobileColumns()) {
    return normalizedWidth;
  }

  return Math.max(MOBILE_MIN_COLUMN_WIDTH, Math.round(normalizedWidth * MOBILE_COLUMN_WIDTH_SCALE));
}

function applyElementColumnWidth(element, width) {
  if (!element) {
    return;
  }

  const normalizedWidth = normalizeColumnWidth(width);
  element.style.width = `${normalizedWidth}px`;
  element.style.minWidth = `${normalizedWidth}px`;
  element.style.maxWidth = `${normalizedWidth}px`;
}

function syncTableColGroup(table, fields, widths) {
  if (!table) {
    return;
  }

  let colgroup = Array.from(table.children).find(child => child.tagName === 'COLGROUP');
  if (!colgroup) {
    colgroup = document.createElement('colgroup');
    table.insertBefore(colgroup, table.firstChild);
  }

  while (colgroup.children.length > fields.length) {
    colgroup.lastElementChild?.remove();
  }

  while (colgroup.children.length < fields.length) {
    colgroup.appendChild(document.createElement('col'));
  }

  Array.from(colgroup.children).forEach((col, index) => {
    col.dataset.fieldName = fields[index] || '';
    applyElementColumnWidth(col, widths[index]);
  });
}

export function createTableColumnLayoutController(options = {}) {
  const getContainer = typeof options.getContainer === 'function' ? options.getContainer : () => null;
  const getDisplayedFields = typeof options.getDisplayedFields === 'function' ? options.getDisplayedFields : () => [];
  const getColumnWidth = typeof options.getColumnWidth === 'function' ? options.getColumnWidth : () => DEFAULT_COLUMN_WIDTH;
  const isManualColumnWidth = typeof options.isManualColumnWidth === 'function' ? options.isManualColumnWidth : () => false;
  const calculateColumnWidths = typeof options.calculateColumnWidths === 'function' ? options.calculateColumnWidths : () => {};
  const getTableData = typeof options.getTableData === 'function' ? options.getTableData : () => null;

  function getRenderedColumnLayout(fields = getDisplayedFields()) {
    const renderFields = normalizeFields(fields);

    if (!renderFields.length) {
      return { fields: [], widths: [], totalWidth: 0 };
    }

    const hasMissingWidths = renderFields.some(field => {
      const cachedWidth = Number(getColumnWidth(field));
      return !Number.isFinite(cachedWidth) || cachedWidth <= 0;
    });
    if (hasMissingWidths) {
      calculateColumnWidths(renderFields, getTableData());
    }

    const baseWidths = renderFields.map(field => getResponsiveColumnWidth(
      getColumnWidth(field),
      isManualColumnWidth(field)
    ));
    const baseTotalWidth = baseWidths.reduce((sum, width) => sum + width, 0);
    const availableWidth = getAvailableTableWidth(getContainer());

    if (availableWidth <= baseTotalWidth) {
      return {
        fields: renderFields,
        widths: baseWidths,
        totalWidth: baseTotalWidth
      };
    }

    const stretchableIndexes = renderFields
      .map((field, index) => isManualColumnWidth(field) ? -1 : index)
      .filter(index => index >= 0);

    if (!stretchableIndexes.length) {
      return {
        fields: renderFields,
        widths: baseWidths,
        totalWidth: baseTotalWidth
      };
    }

    const extraWidth = availableWidth - baseTotalWidth;
    const sharedExtraWidth = Math.floor(extraWidth / stretchableIndexes.length);
    const remainderWidth = extraWidth % stretchableIndexes.length;
    const widths = [...baseWidths];
    stretchableIndexes.forEach((columnIndex, stretchIndex) => {
      widths[columnIndex] += sharedExtraWidth + (stretchIndex < remainderWidth ? 1 : 0);
    });

    return {
      fields: renderFields,
      widths,
      totalWidth: widths.reduce((sum, width) => sum + width, 0)
    };
  }

  function syncRenderedColumnLayout(table = document.getElementById('example-table'), fields = getDisplayedFields()) {
    const layout = getRenderedColumnLayout(fields);
    if (!table || !layout.fields.length) {
      return layout;
    }

    const totalWidth = `${layout.totalWidth}px`;
    table.style.width = totalWidth;
    table.style.minWidth = totalWidth;
    table.style.tableLayout = 'fixed';

    syncTableColGroup(table, layout.fields, layout.widths);

    table.querySelectorAll('thead th[data-col-index]').forEach(th => {
      const columnIndex = Number.parseInt(th.dataset.colIndex || '', 10);
      if (Number.isInteger(columnIndex)) {
        applyElementColumnWidth(th, layout.widths[columnIndex]);
      }
    });

    table.querySelectorAll('tbody td[data-col-index]').forEach(td => {
      const columnIndex = Number.parseInt(td.dataset.colIndex || '', 10);
      if (Number.isInteger(columnIndex)) {
        applyElementColumnWidth(td, layout.widths[columnIndex]);
      }
    });

    table.querySelectorAll('tbody tr[data-row-index]').forEach(row => {
      if (row.style.display === 'table' || row.style.position === 'absolute') {
        row.style.width = totalWidth;
      }
    });

    return layout;
  }

  return {
    applyElementColumnWidth,
    getRenderedColumnLayout,
    normalizeColumnWidth,
    syncRenderedColumnLayout
  };
}
