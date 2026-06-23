import { ClipboardUtils } from '../../core/clipboard.js';
import { getNonBlankCellValueParts } from '../../core/resultCellValues.js';

const MULTI_VALUE_VIEWER_ID = 'query-multi-value-viewer';
let activeMultiValueViewerCleanup = null;

function getMultiValueItems(displayValue) {
  return getNonBlankCellValueParts(displayValue);
}

function renderMultiValueCell({
  td,
  field,
  items,
  rowHeight,
  document
}) {
  const [firstValue] = items;

  td.className = 'query-table-multi-value-cell px-3 py-2 text-sm text-gray-900 align-middle';
  td.style.whiteSpace = '';
  td.removeAttribute('data-tooltip');
  td.removeAttribute('data-tooltip-html');
  td.dataset.multiValueCount = String(items.length);

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'query-table-multi-value-trigger';
  trigger.style.minHeight = `${Math.max(28, rowHeight - 12)}px`;
  trigger.setAttribute('aria-label', `View all ${items.length} values for ${field}`);

  const valueText = document.createElement('span');
  valueText.className = 'query-table-multi-value-primary';
  valueText.textContent = firstValue;

  const countBadge = document.createElement('span');
  countBadge.className = 'query-table-multi-value-count';
  countBadge.textContent = `${items.length} values`;

  trigger.append(valueText, countBadge);
  trigger.addEventListener('pointerdown', event => {
    event.stopPropagation();
  });
  trigger.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    openMultiValueViewer({ document, field, items, trigger });
  });

  td.textContent = '';
  td.appendChild(trigger);
}

function renderTruncatedValueCell({
  td,
  field,
  value,
  document
}) {
  td.classList.add('query-table-truncated-cell');
  td.setAttribute('data-tooltip', value);
  td.dataset.fullCellValue = value;

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'query-table-truncated-trigger';
  trigger.setAttribute('aria-label', `View full value for ${field}`);

  const valueText = document.createElement('span');
  valueText.className = 'query-table-truncated-text';
  valueText.textContent = value;

  trigger.appendChild(valueText);
  trigger.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    openSingleValueViewer({ document, field, value, trigger });
  });

  td.textContent = '';
  td.appendChild(trigger);
}

function openSingleValueViewer({
  document,
  field,
  value,
  trigger
}) {
  openCellValueViewer({
    copyLabel: 'Copy value',
    copyText: value,
    eyebrowText: 'Full value',
    field,
    trigger,
    values: [value],
    valueCountLabel: '1 value',
    document
  });
}

function openMultiValueViewer({
  document,
  field,
  items,
  trigger
}) {
  openCellValueViewer({
    copyLabel: 'Copy all',
    copyText: items.join('\n'),
    eyebrowText: `${items.length} values`,
    field,
    trigger,
    values: items,
    valueCountLabel: `${items.length} values`,
    document
  });
}

function openCellValueViewer({
  copyLabel,
  copyText,
  eyebrowText,
  field,
  trigger,
  values,
  valueCountLabel,
  document
}) {
  closeActiveMultiValueViewer();

  const shell = document.createElement('div');
  shell.id = MULTI_VALUE_VIEWER_ID;
  shell.className = 'query-multi-value-viewer-shell';
  shell.setAttribute('role', 'presentation');

  const backdrop = document.createElement('button');
  backdrop.type = 'button';
  backdrop.className = 'query-multi-value-viewer-backdrop';
  backdrop.setAttribute('aria-label', 'Close value viewer');

  const dialog = document.createElement('section');
  dialog.className = 'query-multi-value-viewer';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'query-multi-value-viewer-title');
  dialog.tabIndex = -1;

  const header = document.createElement('header');
  header.className = 'query-multi-value-viewer__header';

  const titleWrap = document.createElement('div');
  titleWrap.className = 'query-multi-value-viewer__title-wrap';

  const eyebrow = document.createElement('p');
  eyebrow.className = 'query-multi-value-viewer__eyebrow';
  eyebrow.textContent = eyebrowText || valueCountLabel;

  const title = document.createElement('h3');
  title.id = 'query-multi-value-viewer-title';
  title.className = 'query-multi-value-viewer__title';
  title.textContent = field;

  titleWrap.append(eyebrow, title);

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'query-multi-value-viewer__close';
  closeButton.setAttribute('aria-label', 'Close value viewer');
  closeButton.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M5 5l10 10M15 5L5 15" /></svg>';

  header.append(titleWrap, closeButton);

  const list = document.createElement('ol');
  list.className = 'query-multi-value-viewer__list';
  values.forEach((item, index) => {
    const row = document.createElement('li');
    row.className = 'query-multi-value-viewer__item';

    const number = document.createElement('span');
    number.className = 'query-multi-value-viewer__number';
    number.textContent = String(index + 1);

    const value = document.createElement('span');
    value.className = 'query-multi-value-viewer__value';
    value.textContent = item;

    row.append(number, value);
    list.appendChild(row);
  });

  const footer = document.createElement('footer');
  footer.className = 'query-multi-value-viewer__footer';

  const copyButton = document.createElement('button');
  copyButton.type = 'button';
  copyButton.className = 'query-multi-value-viewer__copy';
  copyButton.textContent = copyLabel;
  copyButton.addEventListener('click', async event => {
    event.preventDefault();
    event.stopPropagation();
    await ClipboardUtils.copy(copyText, {
      errorMessage: values.length === 1 ? 'Failed to copy value.' : 'Failed to copy values.',
      successMessage: values.length === 1 ? 'Value copied.' : `${values.length} values copied.`
    });
  });

  footer.appendChild(copyButton);
  dialog.append(header, list, footer);
  shell.append(backdrop, dialog);
  document.body.appendChild(shell);
  document.body.classList.add('multi-value-viewer-open');

  const cleanup = () => {
    shell.remove();
    document.body.classList.remove('multi-value-viewer-open');
    document.removeEventListener('keydown', handleKeydown);
    activeMultiValueViewerCleanup = null;
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

  activeMultiValueViewerCleanup = cleanup;
  backdrop.addEventListener('click', cleanup);
  closeButton.addEventListener('click', cleanup);
  document.addEventListener('keydown', handleKeydown);
  dialog.focus({ preventScroll: true });
}

function closeActiveMultiValueViewer() {
  if (typeof activeMultiValueViewerCleanup === 'function') {
    activeMultiValueViewerCleanup();
  }
}

export {
  getMultiValueItems,
  renderMultiValueCell,
  renderTruncatedValueCell
};
