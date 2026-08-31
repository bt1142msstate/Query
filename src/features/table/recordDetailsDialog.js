import { ClipboardUtils } from '../../core/clipboard.js';

let activeDialog = null;

function element(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function closeActiveRecordDetails() {
  if (!activeDialog) return false;
  if (activeDialog.open) activeDialog.close();
  else activeDialog.remove();
  activeDialog = null;
  return true;
}

function buildIdentifierStrip(record) {
  const strip = element('div', 'record-details-identifiers');
  if (!record.identifiers.length) {
    strip.appendChild(element('span', 'record-details-identifier record-details-identifier--muted', 'No record identifier was returned'));
    return strip;
  }
  record.identifiers.forEach(field => {
    const chip = element('span', 'record-details-identifier');
    chip.append(element('small', '', field.identifierLabel || field.name), element('strong', '', field.values.join(', ')));
    strip.appendChild(chip);
  });
  return strip;
}

function buildFieldRow(field) {
  const row = element('div', 'record-details-field');
  row.dataset.recordDetailsField = '';
  row.dataset.searchText = `${field.name} ${field.values.join(' ')}`.toLocaleLowerCase();
  row.dataset.blank = field.isEmpty ? 'true' : 'false';
  if (field.isIdentifier) row.dataset.identifier = 'true';
  const term = element('dt', 'record-details-field__name', field.name);
  if (field.isDisplayed) term.appendChild(element('span', 'record-details-field__badge', 'In table'));
  const description = element('dd', 'record-details-field__value');
  if (field.isEmpty) description.appendChild(element('em', 'record-details-field__blank', 'Blank'));
  else field.values.forEach(value => description.appendChild(element('span', 'record-details-value', value)));
  row.append(term, description);
  return row;
}

function openRecordDetails({ record, trigger = null, bibLookup = null, onOpenBib = null } = {}) {
  if (!record?.fields?.length) return false;
  closeActiveRecordDetails();
  const dialog = element('dialog', 'record-details-dialog');
  dialog.setAttribute('aria-labelledby', 'record-details-title');
  const shell = element('div', 'record-details-shell');
  const header = element('header', 'record-details-header');
  const headingGroup = element('div', 'record-details-heading');
  const title = element('h2', 'record-details-title', record.title);
  title.id = 'record-details-title';
  headingGroup.append(element('span', 'record-details-eyebrow', record.kind.label), title);
  const closeButton = element('button', 'record-details-close', 'Close');
  closeButton.type = 'button';
  closeButton.setAttribute('aria-label', 'Close record details');
  closeButton.addEventListener('click', () => dialog.close());
  header.append(headingGroup, closeButton);

  const summary = element('section', 'record-details-summary');
  summary.append(
    buildIdentifierStrip(record),
    element('p', 'record-details-scope', `Showing all ${record.totalCount.toLocaleString()} fields returned for this row; ${record.nonEmptyCount.toLocaleString()} contain data.`)
  );
  const toolbar = element('div', 'record-details-toolbar');
  const searchLabel = element('label', 'record-details-search');
  searchLabel.appendChild(element('span', 'sr-only', 'Search record fields'));
  const search = element('input', 'record-details-search__input');
  search.type = 'search';
  search.placeholder = 'Search fields or values';
  search.autocomplete = 'off';
  searchLabel.appendChild(search);
  const blankLabel = element('label', 'record-details-blank-toggle');
  const blankToggle = element('input');
  blankToggle.type = 'checkbox';
  blankToggle.checked = true;
  blankLabel.append(blankToggle, element('span', '', 'Show blank fields'));
  const visibleStatus = element('span', 'record-details-visible-status');
  visibleStatus.setAttribute('aria-live', 'polite');
  toolbar.append(searchLabel, blankLabel, visibleStatus);

  const list = element('dl', 'record-details-fields');
  record.fields.forEach(field => list.appendChild(buildFieldRow(field)));
  const empty = element('p', 'record-details-empty', 'No fields match this search.');
  empty.hidden = true;
  function applyFilter() {
    const query = search.value.trim().toLocaleLowerCase();
    let visible = 0;
    list.querySelectorAll('[data-record-details-field]').forEach(row => {
      const matchesQuery = !query || row.dataset.searchText.includes(query);
      const matchesBlank = blankToggle.checked || row.dataset.blank !== 'true';
      row.hidden = !(matchesQuery && matchesBlank);
      if (!row.hidden) visible += 1;
    });
    visibleStatus.textContent = `${visible.toLocaleString()} of ${record.totalCount.toLocaleString()} fields`;
    empty.hidden = visible !== 0;
  }
  search.addEventListener('input', applyFilter);
  blankToggle.addEventListener('change', applyFilter);

  const footer = element('footer', 'record-details-footer');
  const actions = element('div', 'record-details-actions');
  const copyButton = element('button', 'record-details-button record-details-button--secondary', 'Copy all fields');
  copyButton.type = 'button';
  copyButton.addEventListener('click', () => ClipboardUtils.copy(record.copyText, { successMessage: `${record.kind.label} details copied` }));
  actions.appendChild(copyButton);
  if (bibLookup && typeof onOpenBib === 'function') {
    const bibButton = element('button', 'record-details-button record-details-button--primary', 'Open full bib in Hydration');
    bibButton.type = 'button';
    bibButton.addEventListener('click', () => {
      dialog.close();
      window.requestAnimationFrame(() => onOpenBib(bibLookup));
    });
    actions.appendChild(bibButton);
  }
  footer.append(element('p', 'record-details-footer__note', 'This view is read-only and does not change Symphony.'), actions);
  shell.append(header, summary, toolbar, list, empty, footer);
  dialog.appendChild(shell);
  document.body.appendChild(dialog);
  activeDialog = dialog;
  dialog.addEventListener('close', () => {
    if (activeDialog === dialog) activeDialog = null;
    dialog.remove();
    trigger?.focus?.({ preventScroll: true });
  }, { once: true });
  dialog.showModal();
  applyFilter();
  window.requestAnimationFrame(() => search.focus({ preventScroll: true }));
  return true;
}

export { closeActiveRecordDetails, openRecordDetails };
