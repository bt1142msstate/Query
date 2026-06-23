import { getMultiValueItems, renderMultiValueCell, renderTruncatedValueCell } from './multiValueCells.js';
import { hasMultipleCellValues } from '../../core/resultCellValues.js';

export function createVirtualTableEmptyRow({
  colSpan,
  message,
  document
}) {
  const emptyRow = document.createElement('tr');
  const emptyCell = document.createElement('td');
  emptyCell.setAttribute('colspan', String(colSpan));
  emptyCell.className = 'px-6 py-10 text-center text-sm text-gray-500 italic';
  emptyCell.textContent = message;
  emptyRow.appendChild(emptyCell);
  return emptyRow;
}

export function createVirtualTableRow({
  rowData,
  rowIndex,
  duplicateRowGroup,
  displayedFields,
  columnLayout,
  calculatedColumnWidths,
  columnMap,
  rowHeight,
  shouldRenderAllRows,
  tableBuilder,
  tableColumnLayout,
  textMeasurement,
  valueFormatting,
  parseNumericValue,
  getFieldType,
  document
}) {
  const tr = tableBuilder.createRow();
  tr.style.height = `${rowHeight}px`;

  if (!shouldRenderAllRows) {
    tr.style.position = 'absolute';
    tr.style.top = '0';
    tr.style.left = '0';
    tr.style.right = '0';
    tr.style.display = 'table';
    tr.style.tableLayout = 'fixed';
    tr.style.transform = `translate3d(0, ${rowIndex * rowHeight}px, 0)`;
    tr.style.width = `${columnLayout.totalWidth}px`;
  }

  tr.dataset.rowIndex = rowIndex;
  applyDuplicateRowGroupMetadata(tr, duplicateRowGroup);

  displayedFields.forEach((field, colIndex) => {
    tr.appendChild(createVirtualTableCell({
      rowData,
      field,
      colIndex,
      columnLayout,
      calculatedColumnWidths,
      columnMap,
      rowHeight,
      tableBuilder,
      tableColumnLayout,
      textMeasurement,
      valueFormatting,
      parseNumericValue,
      getFieldType,
      document
    }));
  });

  return tr;
}

function applyDuplicateRowGroupMetadata(tr, duplicateRowGroup) {
  const matchingRowCount = Number(duplicateRowGroup?.matchingRowCount || 0);
  if (matchingRowCount <= 1) {
    return;
  }

  const collapsedRowCount = Math.max(0, Number(duplicateRowGroup?.collapsedRowCount || matchingRowCount - 1));
  tr.classList.add('query-table-collapsed-row');
  tr.dataset.collapsedRowCount = String(collapsedRowCount);
  tr.dataset.matchingRowCount = String(matchingRowCount);
  tr.dataset.tooltipIntent = 'instant';
  tr.setAttribute('data-tooltip', buildCollapsedRowTooltip(duplicateRowGroup));
}

function buildCollapsedRowTooltip(duplicateRowGroup) {
  const matchingRowCount = Number(duplicateRowGroup?.matchingRowCount || 0);
  const collapsedRowCount = Math.max(0, Number(duplicateRowGroup?.collapsedRowCount || matchingRowCount - 1));
  const fields = Array.isArray(duplicateRowGroup?.displayedFields)
    ? duplicateRowGroup.displayedFields.filter(Boolean)
    : [];
  const fieldLabel = formatCollapsedFieldsLabel(fields);
  const rowLabel = matchingRowCount === 1 ? 'row' : 'rows';
  const hiddenLabel = collapsedRowCount === 1 ? 'row is' : 'rows are';

  return `${matchingRowCount.toLocaleString()} matching ${rowLabel} share the same visible ${fieldLabel}. ${collapsedRowCount.toLocaleString()} ${hiddenLabel} collapsed here. Right-click to inspect them.`;
}

function formatCollapsedFieldsLabel(fields) {
  if (!fields.length) {
    return 'columns';
  }

  if (fields.length <= 3) {
    return fields.length === 1 ? `field: ${fields[0]}` : `fields: ${fields.join(', ')}`;
  }

  return `fields: ${fields.slice(0, 3).join(', ')} + ${fields.length - 3} more`;
}

function createVirtualTableCell({
  rowData,
  field,
  colIndex,
  columnLayout,
  calculatedColumnWidths,
  columnMap,
  rowHeight,
  tableBuilder,
  tableColumnLayout,
  textMeasurement,
  valueFormatting,
  parseNumericValue,
  getFieldType,
  document
}) {
  const td = tableBuilder.createCell('', 'px-6 py-3 whitespace-nowrap text-sm text-gray-900');
  td.dataset.colIndex = colIndex;

  const columnIndex = columnMap.get(field);
  const fieldExistsInData = columnIndex !== undefined;
  const cellValue = getCellValue(rowData, columnIndex);
  const type = getFieldType(field);
  const cellDisplay = getVirtualTableCellDisplay({
    cellValue,
    field,
    type,
    valueFormatting,
    parseNumericValue
  });
  const displayValue = cellDisplay.displayValue;
  if (cellDisplay.textAlign) {
    td.style.textAlign = cellDisplay.textAlign;
  }
  const width = columnLayout.widths[colIndex] || calculatedColumnWidths[field] || 150;
  tableColumnLayout.applyElementColumnWidth(td, width);

  if (!fieldExistsInData) {
    td.classList.add('query-table-column-missing-data');
    td.setAttribute('data-tooltip', 'This field is not in the current data. Run a new query to populate it.');
  }

  if (hasMultipleCellValues(displayValue)) {
    const multiValueItems = getMultiValueItems(displayValue);
    if (multiValueItems.length <= 1) {
      renderStandardCell({
        td,
        field,
        displayValue: multiValueItems[0] || '',
        width,
        textMeasurement,
        document
      });
      return td;
    }

    renderMultiValueCell({
      td,
      field,
      items: multiValueItems,
      rowHeight,
      document
    });
    return td;
  }

  renderStandardCell({
    td,
    field,
    displayValue,
    width,
    textMeasurement,
    document
  });

  return td;
}

function getCellValue(rowData, columnIndex) {
  if (columnIndex !== undefined && rowData[columnIndex] !== undefined) {
    return rowData[columnIndex];
  }

  if (columnIndex === undefined) {
    return '';
  }

  return '—';
}

export function getVirtualTableCellDisplay({
  cellValue,
  field,
  type,
  valueFormatting,
  parseNumericValue
}) {
  let displayValue = cellValue;
  let textAlign = '';

  if (cellValue !== '' && cellValue !== '—' && cellValue !== undefined && cellValue !== null) {
    if (hasMultipleCellValues(cellValue)) {
      displayValue = cellValue;
    } else if (type === 'date') {
      displayValue = valueFormatting.formatValueByType(cellValue, type, {
        fieldName: field,
        invalidDateValue: 'Never'
      });
      textAlign = 'right';
    } else if (type === 'number' || type === 'money') {
      const numericValue = parseNumericValue(cellValue, type);
      if (!isNaN(numericValue)) {
        displayValue = valueFormatting.formatValueByType(numericValue, type, { fieldName: field });
        textAlign = 'right';
      }
    } else if (type === 'boolean') {
      textAlign = 'center';
    }
  }

  return { displayValue, textAlign };
}

function renderStandardCell({
  td,
  field,
  displayValue,
  width,
  textMeasurement,
  document
}) {
  if (typeof displayValue === 'string' && displayValue.length > 0 && displayValue !== '—') {
    const availableWidth = width - 48;
    const fullTextWidth = textMeasurement.measureText(displayValue);

    if (fullTextWidth > availableWidth) {
      renderTruncatedValueCell({
        td,
        field,
        value: displayValue,
        document
      });
      return;
    }
  }

  td.textContent = displayValue;
}
