import { ClipboardUtils } from '../../../core/clipboard.js';
import { CellDisplayFormatting } from '../../../core/formatting/cellDisplayFormatting.js';

const COLLAPSED_ROWS_VIEWER_ID = 'query-collapsed-rows-viewer';
const MAX_RENDERED_COLLAPSED_ROWS = 1000;
let activeCollapsedRowsViewerCleanup = null;

function normalizeText(value) {
  if (value === undefined || value === null) {
    return '';
  }

  return String(value);
}

function getFormattedCellValue(row, header, columnIndex) {
  return CellDisplayFormatting.formatCellDisplay(row?.[columnIndex], header);
}

function buildTsv({ headers, rows }) {
  const safeHeaders = Array.isArray(headers) ? headers : [];
  const safeRows = Array.isArray(rows) ? rows : [];
  const escapeCell = value => normalizeText(value).replace(/\t/g, ' ').replace(/\r?\n/g, ' ');
  const lines = [
    safeHeaders.map(escapeCell).join('\t'),
    ...safeRows.map(row => safeHeaders.map((header, columnIndex) => (
      escapeCell(getFormattedCellValue(row, header, columnIndex))
    )).join('\t'))
  ];
  return lines.join('\n');
}

function getCollapsedFieldSet(group) {
  return new Set((Array.isArray(group?.displayedFields) ? group.displayedFields : [])
    .map(field => String(field || '').trim())
    .filter(Boolean));
}

function getRenderedRows(rows) {
  return (Array.isArray(rows) ? rows : []).slice(0, MAX_RENDERED_COLLAPSED_ROWS);
}

function appendCell(rowEl, text, document, options = {}) {
  const cell = document.createElement(options.header ? 'th' : 'td');
  cell.textContent = normalizeText(text);
  if (options.header) {
    cell.scope = options.scope || 'col';
  }
  if (options.className) {
    cell.className = options.className;
  }
  rowEl.appendChild(cell);
  return cell;
}

function renderCollapsedRowsTable({
  collapseFields,
  document,
  group,
  headers,
  renderedRows
}) {
  const tableWrap = document.createElement('div');
  tableWrap.className = 'query-collapsed-rows-viewer__table-wrap';

  const table = document.createElement('table');
  table.className = 'query-collapsed-rows-viewer__table';

  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  appendCell(headerRow, '#', document, {
    className: 'query-collapsed-rows-viewer__row-number',
    header: true,
    scope: 'col'
  });
  headers.forEach(header => {
    appendCell(headerRow, header, document, {
      className: collapseFields.has(header) ? 'query-collapsed-rows-viewer__collapse-field' : '',
      header: true,
      scope: 'col'
    });
  });
  thead.appendChild(headerRow);

  const tbody = document.createElement('tbody');
  renderedRows.forEach((row, index) => {
    const rowEl = document.createElement('tr');
    const sourceRowIndex = Number(group?.sourceRowIndexes?.[index]);
    appendCell(
      rowEl,
      Number.isFinite(sourceRowIndex) ? sourceRowIndex + 1 : index + 1,
      document,
      { className: 'query-collapsed-rows-viewer__row-number' }
    );

    headers.forEach((header, columnIndex) => {
      appendCell(
        rowEl,
        getFormattedCellValue(row, header, columnIndex),
        document,
        { className: collapseFields.has(header) ? 'query-collapsed-rows-viewer__collapse-field' : '' }
      );
    });

    tbody.appendChild(rowEl);
  });

  table.append(thead, tbody);
  tableWrap.appendChild(table);
  return tableWrap;
}

function openCollapsedRowsViewer({
  document,
  displayedFields,
  group,
  headers,
  trigger
}) {
  closeActiveCollapsedRowsViewer();

  const safeHeaders = (Array.isArray(headers) ? headers : []).filter(Boolean);
  const safeRows = Array.isArray(group?.rows) ? group.rows : [];
  const renderedRows = getRenderedRows(safeRows);
  const collapseFields = getCollapsedFieldSet({
    displayedFields: Array.isArray(group?.displayedFields) && group.displayedFields.length
      ? group.displayedFields
      : displayedFields
  });
  const matchingRowCount = Number(group?.matchingRowCount || safeRows.length || 0);
  const collapsedRowCount = Math.max(0, Number(group?.collapsedRowCount || matchingRowCount - 1));
  const fieldText = Array.from(collapseFields).join(', ') || 'the current visible columns';

  const shell = document.createElement('div');
  shell.id = COLLAPSED_ROWS_VIEWER_ID;
  shell.className = 'query-collapsed-rows-viewer-shell';
  shell.setAttribute('role', 'presentation');

  const backdrop = document.createElement('button');
  backdrop.type = 'button';
  backdrop.className = 'query-collapsed-rows-viewer-backdrop';
  backdrop.setAttribute('aria-label', 'Close collapsed rows viewer');

  const dialog = document.createElement('section');
  dialog.className = 'query-collapsed-rows-viewer';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'query-collapsed-rows-viewer-title');
  dialog.tabIndex = -1;

  const header = document.createElement('header');
  header.className = 'query-collapsed-rows-viewer__header';

  const titleWrap = document.createElement('div');
  titleWrap.className = 'query-collapsed-rows-viewer__title-wrap';

  const eyebrow = document.createElement('p');
  eyebrow.className = 'query-collapsed-rows-viewer__eyebrow';
  eyebrow.textContent = `${matchingRowCount.toLocaleString()} matching rows`;

  const title = document.createElement('h3');
  title.id = 'query-collapsed-rows-viewer-title';
  title.className = 'query-collapsed-rows-viewer__title';
  title.textContent = 'Collapsed row details';

  const summary = document.createElement('p');
  summary.className = 'query-collapsed-rows-viewer__summary';
  summary.textContent = `${collapsedRowCount.toLocaleString()} duplicate row${collapsedRowCount === 1 ? '' : 's'} collapsed because these visible fields matched: ${fieldText}.`;

  titleWrap.append(eyebrow, title, summary);

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'query-collapsed-rows-viewer__close';
  closeButton.setAttribute('aria-label', 'Close collapsed rows viewer');
  closeButton.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M5 5l10 10M15 5L5 15" /></svg>';

  header.append(titleWrap, closeButton);

  const body = document.createElement('div');
  body.className = 'query-collapsed-rows-viewer__body';

  if (renderedRows.length < safeRows.length) {
    const truncatedNote = document.createElement('p');
    truncatedNote.className = 'query-collapsed-rows-viewer__note';
    truncatedNote.textContent = `Showing the first ${renderedRows.length.toLocaleString()} of ${safeRows.length.toLocaleString()} rows. Copy all includes the full collapsed group.`;
    body.appendChild(truncatedNote);
  }

  body.appendChild(renderCollapsedRowsTable({
    collapseFields,
    document,
    group,
    headers: safeHeaders,
    renderedRows
  }));

  const footer = document.createElement('footer');
  footer.className = 'query-collapsed-rows-viewer__footer';

  const copyButton = document.createElement('button');
  copyButton.type = 'button';
  copyButton.className = 'query-collapsed-rows-viewer__copy';
  copyButton.textContent = 'Copy all rows';
  copyButton.addEventListener('click', async event => {
    event.preventDefault();
    event.stopPropagation();
    await ClipboardUtils.copy(buildTsv({ headers: safeHeaders, rows: safeRows }), {
      errorMessage: 'Failed to copy collapsed rows.',
      successMessage: `${safeRows.length.toLocaleString()} collapsed row${safeRows.length === 1 ? '' : 's'} copied.`
    });
  });

  footer.appendChild(copyButton);
  dialog.append(header, body, footer);
  shell.append(backdrop, dialog);
  document.body.appendChild(shell);
  document.body.classList.add('collapsed-rows-viewer-open');

  const cleanup = () => {
    shell.remove();
    document.body.classList.remove('collapsed-rows-viewer-open');
    document.removeEventListener('keydown', handleKeydown);
    activeCollapsedRowsViewerCleanup = null;
    if (trigger && typeof trigger.focus === 'function') {
      trigger.focus({ preventScroll: true });
    }
  };

  function handleKeydown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      cleanup();
    }
  }

  activeCollapsedRowsViewerCleanup = cleanup;
  backdrop.addEventListener('click', cleanup);
  closeButton.addEventListener('click', cleanup);
  document.addEventListener('keydown', handleKeydown);
  dialog.focus({ preventScroll: true });
}

function closeActiveCollapsedRowsViewer() {
  if (typeof activeCollapsedRowsViewerCleanup === 'function') {
    activeCollapsedRowsViewerCleanup();
  }
}

export {
  closeActiveCollapsedRowsViewer,
  openCollapsedRowsViewer
};
