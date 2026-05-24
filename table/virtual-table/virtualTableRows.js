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
  escapeHtml,
  document
}) {
  const tr = tableBuilder.createRow();
  tr.style.height = `${rowHeight}px`;

  if (!shouldRenderAllRows) {
    tr.style.position = 'absolute';
    tr.style.top = `${rowIndex * rowHeight}px`;
    tr.style.left = '0';
    tr.style.right = '0';
    tr.style.display = 'table';
    tr.style.tableLayout = 'fixed';
    tr.style.width = `${columnLayout.totalWidth}px`;
  }

  tr.dataset.rowIndex = rowIndex;

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
      escapeHtml,
      document
    }));
  });

  return tr;
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
  escapeHtml,
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

  if (typeof displayValue === 'string' && displayValue.includes('\x1F')) {
    renderMultiValueCell({
      td,
      displayValue,
      rowHeight,
      escapeHtml,
      document
    });
    return td;
  }

  renderStandardCell({
    td,
    displayValue,
    width,
    textMeasurement
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
    if (type === 'date') {
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

function renderMultiValueCell({
  td,
  displayValue,
  rowHeight,
  escapeHtml,
  document
}) {
  const items = displayValue.split('\x1F').filter(item => item.trim() !== '');

  td.className = 'px-3 py-2 text-sm text-gray-900 align-top';
  td.style.whiteSpace = 'normal';

  const scrollContainer = document.createElement('div');
  const paddingOffset = 16;
  scrollContainer.style.maxHeight = `${rowHeight - paddingOffset > 20 ? rowHeight - paddingOffset : 26}px`;
  scrollContainer.style.overflowY = 'auto';
  scrollContainer.style.paddingRight = '4px';
  scrollContainer.style.scrollbarWidth = 'thin';

  items.forEach((item, index) => {
    const div = document.createElement('div');
    div.style.marginBottom = index < items.length - 1 ? '4px' : '0';
    div.style.paddingBottom = index < items.length - 1 ? '4px' : '0';
    div.style.borderBottom = index < items.length - 1 ? '1px solid #f3f4f6' : 'none';
    div.style.wordBreak = 'break-word';
    div.textContent = item;
    scrollContainer.appendChild(div);
  });

  const tooltipItems = items.map(item => `<li>${escapeHtml(item)}</li>`).join('');
  const tooltipHtml = `<div class="text-left font-sans text-sm pb-1"><div class="font-bold border-b border-gray-500 pb-1 mb-2">Multiple Values (${items.length})</div><ul class="list-disc pl-4 space-y-1">${tooltipItems}</ul></div>`;

  td.setAttribute('data-tooltip-html', tooltipHtml);
  td.textContent = '';
  td.appendChild(scrollContainer);
}

function renderStandardCell({
  td,
  displayValue,
  width,
  textMeasurement
}) {
  if (typeof displayValue === 'string' && displayValue.length > 0 && displayValue !== '—') {
    const availableWidth = width - 48;
    const fullTextWidth = textMeasurement.measureText(displayValue);

    if (fullTextWidth > availableWidth) {
      const maxFitChars = textMeasurement.findMaxFittingChars(displayValue, availableWidth);
      td.textContent = `${displayValue.substring(0, maxFitChars)}...`;
      td.setAttribute('data-tooltip', displayValue);
      return;
    }
  }

  td.textContent = displayValue;
}
