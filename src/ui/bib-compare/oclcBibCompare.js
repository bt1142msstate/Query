import { postJson } from '../../core/backendApi.js';
import { getSession } from '../../core/authSession.js';
import { showToastMessage } from '../../core/toast.js';
import {
  comparisonStatusLabel,
  fieldLines,
  filterComparisonRows,
  formatIdentifierList,
  matchConfidenceLabel,
  searchInputMetadata,
  summaryValue
} from './bibCompareFormat.js';
import {
  downloadBibRecord,
  FORMATS
} from './bibRecordDownload.js';
import { createBulkController, initializeBulkForm } from './oclcBibBulk.js';

const FILTERS = [
  { id: 'differences', label: 'Differences', count: 'differences' },
  { id: 'all', label: 'All fields', count: 'all' },
  { id: 'local_only', label: 'Local only', count: 'local_only' },
  { id: 'worldcat_only', label: 'WorldCat only', count: 'worldcat_only' },
  { id: 'same', label: 'Same', count: 'same' }
];

const state = {
  initialized: false,
  workspace: null,
  searchResults: [],
  selectedCatalogKey: '',
  comparison: null,
  filter: 'differences',
  mode: 'single',
  bulkController: null,
  searchRequest: 0,
  compareRequest: 0
};

function createElement(tagName, className, text) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function workspaceMarkup() {
  return `
    <div class="bib-compare-shell">
      <header class="bib-compare-header">
        <div class="bib-compare-heading">
          <span class="bib-compare-eyebrow">Catalog review</span>
          <h1>WorldCat Bib Compare</h1>
          <p>Compare a Symphony bibliographic record with its OCLC WorldCat record.</p>
        </div>
        <div class="bib-compare-header-actions">
          <span class="bib-compare-readonly">Read only</span>
          <button class="bib-compare-icon-button" type="button" data-bib-close aria-label="Close WorldCat Bib Compare" title="Close">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>
      </header>

      <div class="bib-compare-layout">
        <aside class="bib-compare-search" aria-label="Find a local bibliographic record">
          <div class="bib-compare-mode" role="group" aria-label="Comparison mode">
            <button type="button" class="is-active" data-bib-mode="single" aria-pressed="true">Single</button>
            <button type="button" data-bib-mode="bulk" aria-pressed="false">Bulk</button>
          </div>
          <form class="bib-compare-search-form" data-bib-search-form data-bib-single-form>
            <div class="bib-compare-form-heading">
              <h2>Find local record</h2>
              <p>Search the live Symphony catalog first.</p>
            </div>
            <label class="bib-compare-label" for="bib-lookup-type">Search by</label>
            <select id="bib-lookup-type" data-bib-lookup-type>
              <option value="title">Title</option>
              <option value="catalog_key">Catalog key</option>
              <option value="item_id">Item ID</option>
              <option value="isbn">ISBN</option>
            </select>
            <label class="bib-compare-label" data-bib-query-label for="bib-lookup-query">Title</label>
            <div class="bib-compare-search-input-row">
              <input id="bib-lookup-query" data-bib-query autocomplete="off" placeholder="Enter title words" required maxlength="300">
              <button class="bib-compare-primary-button" type="submit">
                <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.8-3.8"/></svg>
                <span>Search</span>
              </button>
            </div>
          </form>
          <form class="bib-compare-search-form hidden" data-bib-bulk-form>
            <div class="bib-compare-form-heading">
              <h2>Match a list</h2>
              <p>Paste one value per line or import a text, CSV, or TSV file.</p>
            </div>
            <label class="bib-compare-label" for="bib-bulk-type">Values are</label>
            <select id="bib-bulk-type" data-bib-bulk-type>
              <option value="auto">Auto detect</option>
              <option value="catalog_key">Catalog keys</option>
              <option value="item_id">Item IDs or barcodes</option>
              <option value="isbn">ISBNs</option>
              <option value="title">Titles</option>
            </select>
            <label class="bib-compare-label" for="bib-bulk-values">Values</label>
            <textarea id="bib-bulk-values" data-bib-bulk-values rows="9" placeholder="One value per line" required></textarea>
            <div class="bib-bulk-file-row">
              <label class="bib-bulk-file-button" for="bib-bulk-file">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4M7.5 8.5 12 4l4.5 4.5M5 20h14"/></svg>
                <span>Import file</span>
              </label>
              <input class="sr-only" id="bib-bulk-file" data-bib-bulk-file type="file" accept=".txt,.csv,.tsv,text/plain,text/csv,text/tab-separated-values">
              <label class="bib-bulk-column hidden" data-bib-file-column-wrap>
                <span>Column</span>
                <select data-bib-file-column></select>
              </label>
            </div>
            <button class="bib-compare-primary-button" type="submit">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 7h12M8 12h12M8 17h12M4 7h.01M4 12h.01M4 17h.01"/></svg>
              <span>Match records</span>
            </button>
          </form>
          <div class="bib-compare-search-status" data-bib-search-status role="status" aria-live="polite">
            Search by title, catalog key, or item ID.
          </div>
          <div class="bib-compare-result-list" data-bib-results aria-label="Local record matches"></div>
        </aside>

        <main class="bib-compare-main">
          <section class="bib-compare-empty" data-bib-empty>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v16H6.5A2.5 2.5 0 0 0 4 21.5zM20 5.5A2.5 2.5 0 0 0 17.5 3H13v16h4.5a2.5 2.5 0 0 1 2.5 2.5z"/></svg>
            <h2>Select a local record</h2>
            <p>The comparison will use its MARC 035 OCLC number when available, then show every matching and different field.</p>
          </section>

          <section class="bib-compare-content hidden" data-bib-content aria-live="polite">
            <div class="bib-compare-progress hidden" data-bib-progress role="status">
              <span class="bib-compare-spinner" aria-hidden="true"></span>
              <span data-bib-progress-text>Loading records...</span>
            </div>

            <div class="bib-compare-record-summaries" data-bib-summaries></div>

            <section class="bib-compare-match-band hidden" data-bib-match-band>
              <div>
                <span class="bib-compare-match-chip" data-bib-match-chip>Review match</span>
                <strong data-bib-match-title>Record match</strong>
              </div>
              <p data-bib-match-reason></p>
            </section>

            <section class="bib-compare-candidate-band hidden" data-bib-candidate-band>
              <div>
                <h2>Choose a WorldCat record</h2>
                <p>The local record does not identify one unambiguous WorldCat match.</p>
              </div>
              <div class="bib-compare-candidate-controls">
                <select data-bib-candidate-select aria-label="WorldCat candidate"></select>
                <form class="bib-compare-oclc-form" data-bib-oclc-form>
                  <input data-bib-oclc-input inputmode="numeric" pattern="[0-9]{1,15}" maxlength="15" placeholder="OCLC number" aria-label="OCLC number">
                  <button type="submit">Compare</button>
                </form>
              </div>
            </section>

            <section class="bib-compare-fields hidden" data-bib-fields>
              <div class="bib-compare-fields-toolbar">
                <div>
                  <h2>MARC fields</h2>
                  <p data-bib-field-summary></p>
                </div>
                <div class="bib-compare-filter-group" data-bib-filters role="group" aria-label="Filter MARC field comparison"></div>
              </div>
              <div class="bib-compare-field-header" aria-hidden="true">
                <span>Tag</span>
                <span>Symphony</span>
                <span>WorldCat</span>
                <span>Status</span>
              </div>
              <div class="bib-compare-field-list" data-bib-field-list></div>
            </section>
          </section>
        </main>
      </div>
    </div>
  `;
}

function ensureWorkspace() {
  if (state.workspace) return state.workspace;
  const dialog = document.createElement('dialog');
  dialog.id = 'bib-compare-workspace';
  dialog.className = 'bib-compare-workspace';
  dialog.setAttribute('aria-label', 'WorldCat bibliographic record comparison');
  dialog.innerHTML = workspaceMarkup();
  document.body.appendChild(dialog);
  state.workspace = dialog;
  bindWorkspaceEvents(dialog);
  state.bulkController = createBulkController({
    workspace: dialog,
    openComparison: catalogKey => {
      setMode('single');
      loadComparison(catalogKey);
    },
    setSearchStatus,
    showToastMessage
  });
  initializeBulkForm({ workspace: dialog, controller: state.bulkController, setSearchStatus });
  renderFilterButtons();
  return dialog;
}

function setMode(mode) {
  state.mode = mode === 'bulk' ? 'bulk' : 'single';
  query('[data-bib-single-form]')?.classList.toggle('hidden', state.mode !== 'single');
  query('[data-bib-bulk-form]')?.classList.toggle('hidden', state.mode !== 'bulk');
  query('[data-bib-empty]')?.classList.toggle('hidden', state.mode === 'bulk' || Boolean(state.comparison));
  query('[data-bib-content]')?.classList.toggle('hidden', state.mode === 'bulk' || !state.comparison);
  state.bulkController?.setVisible(state.mode === 'bulk');
  state.workspace?.querySelectorAll('[data-bib-mode]').forEach(button => {
    const active = button.dataset.bibMode === state.mode;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  setSearchStatus(state.mode === 'bulk'
    ? 'Auto detect supports catalog keys, item IDs, ISBNs, and titles.'
    : 'Search by title, catalog key, item ID, or ISBN.');
}

function query(selector) {
  return state.workspace?.querySelector(selector) || null;
}

function setBusy(message = '') {
  const progress = query('[data-bib-progress]');
  const text = query('[data-bib-progress-text]');
  progress?.classList.toggle('hidden', !message);
  if (text) text.textContent = message;
}

function setSearchStatus(message, tone = '') {
  const status = query('[data-bib-search-status]');
  if (!status) return;
  status.textContent = message;
  status.dataset.tone = tone;
}

function updateSearchInput() {
  const type = query('[data-bib-lookup-type]')?.value || 'title';
  const metadata = searchInputMetadata(type);
  const input = query('[data-bib-query]');
  const label = query('[data-bib-query-label]');
  if (label) label.textContent = metadata.label;
  if (input) {
    input.placeholder = metadata.placeholder;
    input.inputMode = metadata.inputMode;
    input.pattern = type === 'catalog_key'
      ? '[0-9]{1,12}'
      : (type === 'item_id'
          ? '[A-Za-z0-9_.-]{1,128}'
          : (type === 'isbn' ? '(?:[0-9Xx][ -]?){10,17}' : ''));
  }
}

function renderSearchResults() {
  const container = query('[data-bib-results]');
  if (!container) return;
  container.replaceChildren();
  state.searchResults.forEach(result => {
    const button = createElement('button', 'bib-compare-result');
    button.type = 'button';
    button.dataset.catalogKey = result.catalog_key;
    button.classList.toggle('is-selected', result.catalog_key === state.selectedCatalogKey);

    const title = createElement('strong', 'bib-compare-result-title', summaryValue(result.title, 'Untitled record'));
    const creator = createElement('span', 'bib-compare-result-creator', summaryValue(result.creator, 'Creator not present'));
    const identifiers = createElement('span', 'bib-compare-result-identifiers');
    identifiers.textContent = `Catalog ${result.catalog_key}${result.oclc_number ? `  |  OCLC ${result.oclc_number}` : ''}`;
    button.append(title, creator, identifiers);
    container.appendChild(button);
  });
}

function summaryRow(label, value) {
  const row = createElement('div', 'bib-compare-summary-row');
  row.append(
    createElement('dt', '', label),
    createElement('dd', '', summaryValue(value))
  );
  return row;
}

function buildDownloadMenu(record, summary, source) {
  const menu = createElement('details', 'bib-compare-download-menu');
  const trigger = createElement('summary', 'bib-compare-download-trigger');
  trigger.setAttribute('aria-label', `Download ${source === 'local' ? 'Symphony' : 'WorldCat'} bibliographic record`);
  trigger.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3v12M7.5 10.5 12 15l4.5-4.5M5 20h14"/>
    </svg>
    <span>Download</span>
  `;
  const options = createElement('div', 'bib-compare-download-options');
  options.setAttribute('role', 'menu');
  Object.entries(FORMATS).forEach(([format, metadata]) => {
    const button = createElement('button', '', metadata.label);
    button.type = 'button';
    button.dataset.bibDownload = format;
    button.dataset.bibSource = source;
    button.setAttribute('role', 'menuitem');
    options.appendChild(button);
  });
  menu.append(trigger, options);
  menu._bibRecord = record;
  menu._bibSummary = summary;
  return menu;
}

function buildSummaryPanel(title, summary, source, record) {
  const panel = createElement('article', `bib-compare-summary-panel bib-compare-summary-panel--${source}`);
  const heading = createElement('div', 'bib-compare-summary-heading');
  const headingText = createElement('div', 'bib-compare-summary-heading-text');
  headingText.append(
    createElement('span', 'bib-compare-source-label', source === 'local' ? 'Symphony' : 'OCLC WorldCat'),
    createElement('h2', '', title)
  );
  heading.append(headingText, buildDownloadMenu(record, summary, source));
  const list = createElement('dl', 'bib-compare-summary-list');
  list.append(
    summaryRow(source === 'local' ? 'Catalog key' : 'OCLC number', source === 'local' ? summary?.catalog_key : summary?.oclc_number),
    summaryRow('Creator', summary?.creator),
    summaryRow('Edition', summary?.edition),
    summaryRow('Publication', summary?.publication),
    summaryRow('Physical description', summary?.physical_description),
    summaryRow('ISBN', formatIdentifierList(summary?.isbn)),
    summaryRow('ISSN', formatIdentifierList(summary?.issn))
  );
  panel.append(heading, list);
  return panel;
}

function renderSummaries(payload) {
  const container = query('[data-bib-summaries]');
  if (!container) return;
  container.replaceChildren();
  const local = payload?.local?.summary || {};
  container.appendChild(buildSummaryPanel(
    summaryValue(local.title, 'Untitled local record'),
    local,
    'local',
    payload?.local?.record
  ));
  if (payload?.worldcat?.summary) {
    const worldcat = payload.worldcat.summary;
    container.appendChild(buildSummaryPanel(
      summaryValue(worldcat.title, 'Untitled WorldCat record'),
      worldcat,
      'worldcat',
      payload?.worldcat?.record
    ));
  } else {
    const waiting = createElement('article', 'bib-compare-summary-panel bib-compare-summary-panel--waiting');
    waiting.append(
      createElement('span', 'bib-compare-source-label', 'OCLC WorldCat'),
      createElement('h2', '', 'Match needed'),
      createElement('p', '', 'Choose a candidate or enter an OCLC number to load the WorldCat record.')
    );
    container.appendChild(waiting);
  }
}

function renderMatch(payload) {
  const band = query('[data-bib-match-band]');
  if (!band) return;
  const match = payload?.match;
  band.classList.toggle('hidden', !match);
  if (!match) return;
  band.dataset.confidence = match.confidence || 'review';
  query('[data-bib-match-chip]').textContent = matchConfidenceLabel(match.confidence);
  query('[data-bib-match-title]').textContent = match.title_match
    ? 'Record identity aligns'
    : 'Record identity needs review';
  const review = payload?.review;
  const enrichment = review
    ? ` WorldCat fields: ${Number(review.worldcat_521_count || 0)} audience (521), ${Number(review.worldcat_526_count || 0)} reading-program (526). ${review.hydration_ready ? 'Exact-edition checks align.' : 'Review exact-edition evidence before hydration.'}`
    : '';
  query('[data-bib-match-reason]').textContent = `${match.reason || ''}${enrichment}`;
}

function candidateOption(candidate) {
  const option = document.createElement('option');
  option.value = candidate.oclc_number || '';
  const parts = [
    `OCLC ${candidate.oclc_number || 'unknown'}`,
    candidate.title,
    candidate.creator,
    candidate.date,
    candidate.edition,
    candidate.specific_format || candidate.format,
    formatIdentifierList(candidate.isbn) === 'Not present' ? '' : `ISBN ${formatIdentifierList(candidate.isbn)}`
  ].map(value => String(value || '').trim()).filter(Boolean);
  option.textContent = parts.join(' | ');
  return option;
}

function renderCandidates(payload) {
  const band = query('[data-bib-candidate-band]');
  const select = query('[data-bib-candidate-select]');
  const candidates = Array.isArray(payload?.candidates) ? payload.candidates : [];
  const selected = payload?.selection?.oclc_number || '';
  const shouldShow = Boolean(payload?.needs_selection || candidates.length);
  band?.classList.toggle('hidden', !shouldShow);
  if (!select || !shouldShow) return;

  select.replaceChildren();
  const prompt = document.createElement('option');
  prompt.value = '';
  prompt.textContent = candidates.length
    ? 'Select a WorldCat candidate'
    : 'No automatic candidates found';
  select.appendChild(prompt);
  candidates.forEach(candidate => select.appendChild(candidateOption(candidate)));
  if (selected && Array.from(select.options).some(option => option.value === selected)) {
    select.value = selected;
  }
}

function renderFilterButtons() {
  const container = query('[data-bib-filters]');
  if (!container) return;
  container.replaceChildren();
  const counts = state.comparison?.comparison?.counts || {};
  FILTERS.forEach(filter => {
    const button = createElement('button', 'bib-compare-filter');
    button.type = 'button';
    button.dataset.bibFilter = filter.id;
    button.classList.toggle('is-active', state.filter === filter.id);
    button.setAttribute('aria-pressed', String(state.filter === filter.id));
    const count = Number(counts[filter.count] || 0);
    button.append(
      createElement('span', '', filter.label),
      createElement('strong', '', String(count))
    );
    container.appendChild(button);
  });
}

function fieldCell(field, side) {
  const cell = createElement('div', `bib-compare-field-value bib-compare-field-value--${side}`);
  const lines = fieldLines(field);
  if (!lines.length) {
    cell.classList.add('is-empty');
    cell.textContent = 'Not present';
    return cell;
  }
  lines.forEach((line, index) => {
    const element = createElement(index === 0 ? 'strong' : 'span', '', line);
    cell.appendChild(element);
  });
  return cell;
}

function renderFieldRows() {
  const list = query('[data-bib-field-list]');
  const summary = query('[data-bib-field-summary]');
  if (!list) return;
  list.replaceChildren();
  const comparison = state.comparison?.comparison || {};
  const rows = filterComparisonRows(comparison.rows, state.filter);
  const counts = comparison.counts || {};
  if (summary) {
    summary.textContent = `${Number(counts.differences || 0).toLocaleString()} differences across ${Number(counts.all || 0).toLocaleString()} aligned fields.`;
  }

  rows.forEach(row => {
    const item = createElement('article', 'bib-compare-field-row');
    item.dataset.status = row.status || 'review';
    const tag = createElement('div', 'bib-compare-field-tag');
    tag.append(
      createElement('strong', '', row.tag || '---'),
      createElement('span', '', comparisonStatusLabel(row.status))
    );
    const status = createElement('span', 'bib-compare-field-status', comparisonStatusLabel(row.status));
    item.append(
      tag,
      fieldCell(row.local, 'local'),
      fieldCell(row.worldcat, 'worldcat'),
      status
    );
    list.appendChild(item);
  });

  if (!rows.length) {
    const empty = createElement('div', 'bib-compare-field-list-empty');
    empty.textContent = 'No fields match this filter.';
    list.appendChild(empty);
  }
}

function renderComparison(payload) {
  state.comparison = payload;
  query('[data-bib-empty]')?.classList.add('hidden');
  query('[data-bib-content]')?.classList.remove('hidden');
  renderSummaries(payload);
  renderMatch(payload);
  renderCandidates(payload);
  const hasComparison = Boolean(payload?.comparison?.rows);
  query('[data-bib-fields]')?.classList.toggle('hidden', !hasComparison);
  renderFilterButtons();
  if (hasComparison) renderFieldRows();
}

async function loadComparison(catalogKey, oclcNumber = '') {
  const requestId = ++state.compareRequest;
  state.selectedCatalogKey = String(catalogKey || '');
  renderSearchResults();
  setBusy('Loading the Symphony and WorldCat records...');
  query('[data-bib-empty]')?.classList.add('hidden');
  query('[data-bib-content]')?.classList.remove('hidden');
  try {
    const { data } = await postJson({
      action: 'compare_oclc_bib',
      catalog_key: state.selectedCatalogKey,
      ...(oclcNumber ? { oclc_number: String(oclcNumber) } : {})
    }, { timeoutMs: 45000 });
    if (requestId !== state.compareRequest) return;
    state.filter = 'differences';
    renderComparison(data);
  } catch (error) {
    if (requestId !== state.compareRequest) return;
    showToastMessage(error.message || 'The records could not be compared.', 'error');
    setSearchStatus(error.message || 'The records could not be compared.', 'error');
    query('[data-bib-empty]')?.classList.remove('hidden');
    query('[data-bib-content]')?.classList.add('hidden');
  } finally {
    if (requestId === state.compareRequest) setBusy('');
  }
}

async function runSearch() {
  const form = query('[data-bib-search-form]');
  const lookupType = query('[data-bib-lookup-type]')?.value || 'title';
  const input = query('[data-bib-query]');
  const searchQuery = String(input?.value || '').trim();
  if (!form?.reportValidity() || !searchQuery) return;

  const requestId = ++state.searchRequest;
  const submit = form.querySelector('[type="submit"]');
  if (submit) submit.disabled = true;
  setSearchStatus('Searching the live Symphony catalog...');
  try {
    const { data } = await postJson({
      action: 'search_bibs',
      lookup_type: lookupType,
      query: searchQuery,
      limit: 20
    }, { timeoutMs: 35000 });
    if (requestId !== state.searchRequest) return;
    state.searchResults = Array.isArray(data.results) ? data.results : [];
    state.selectedCatalogKey = '';
    renderSearchResults();
    if (!state.searchResults.length) {
      setSearchStatus('No matching local bibliographic records were found.', 'empty');
      return;
    }
    const suffix = data.truncated ? ' The list is limited to the first 20 matches.' : '';
    setSearchStatus(`${state.searchResults.length} local record${state.searchResults.length === 1 ? '' : 's'} found.${suffix}`, 'success');
    if (state.searchResults.length === 1) {
      loadComparison(state.searchResults[0].catalog_key);
    }
  } catch (error) {
    if (requestId !== state.searchRequest) return;
    state.searchResults = [];
    renderSearchResults();
    setSearchStatus(error.message || 'The catalog search failed.', 'error');
  } finally {
    if (submit) submit.disabled = false;
  }
}

function closeWorkspace() {
  if (!state.workspace?.open) return;
  state.workspace.close();
}

function openWorkspace() {
  if (!getSession()) {
    document.getElementById('auth-session-button')?.click();
    showToastMessage('Sign in before comparing bibliographic records.', 'info');
    return false;
  }
  const workspace = ensureWorkspace();
  if (!workspace.open) workspace.showModal();
  document.body.classList.add('bib-compare-open');
  query('[data-bib-query]')?.focus();
  return true;
}

function openForLookup(lookup = {}) {
  const lookupType = ['catalog_key', 'item_id', 'isbn', 'title'].includes(lookup.lookupType)
    ? lookup.lookupType
    : '';
  const lookupQuery = String(lookup.query || '').trim();
  if (!lookupType || !lookupQuery || !openWorkspace()) return false;

  const lookupSelect = query('[data-bib-lookup-type]');
  const lookupInput = query('[data-bib-query]');
  if (lookupSelect) lookupSelect.value = lookupType;
  updateSearchInput();
  if (lookupInput) lookupInput.value = lookupQuery;

  if (lookupType === 'catalog_key') {
    setSearchStatus(`Opening catalog record ${lookupQuery}...`);
    loadComparison(lookupQuery);
  } else {
    runSearch();
  }
  return true;
}

function bindWorkspaceEvents(workspace) {
  workspace.querySelector('[data-bib-close]')?.addEventListener('click', closeWorkspace);
  workspace.addEventListener('close', () => {
    document.body.classList.remove('bib-compare-open');
  });
  workspace.addEventListener('cancel', event => {
    event.preventDefault();
    closeWorkspace();
  });
  workspace.querySelector('[data-bib-lookup-type]')?.addEventListener('change', updateSearchInput);
  workspace.querySelector('.bib-compare-mode')?.addEventListener('click', event => {
    const button = event.target.closest?.('[data-bib-mode]');
    if (button) setMode(button.dataset.bibMode);
  });
  workspace.querySelector('[data-bib-search-form]')?.addEventListener('submit', event => {
    event.preventDefault();
    runSearch();
  });
  workspace.querySelector('[data-bib-results]')?.addEventListener('click', event => {
    const result = event.target.closest?.('[data-catalog-key]');
    if (result?.dataset.catalogKey) loadComparison(result.dataset.catalogKey);
  });
  workspace.querySelector('[data-bib-candidate-select]')?.addEventListener('change', event => {
    const oclcNumber = event.target.value;
    if (oclcNumber && state.selectedCatalogKey) {
      loadComparison(state.selectedCatalogKey, oclcNumber);
    }
  });
  workspace.querySelector('[data-bib-oclc-form]')?.addEventListener('submit', event => {
    event.preventDefault();
    const input = workspace.querySelector('[data-bib-oclc-input]');
    if (!input?.reportValidity() || !input.value || !state.selectedCatalogKey) return;
    loadComparison(state.selectedCatalogKey, input.value);
  });
  workspace.querySelector('[data-bib-filters]')?.addEventListener('click', event => {
    const button = event.target.closest?.('[data-bib-filter]');
    if (!button) return;
    state.filter = button.dataset.bibFilter;
    renderFilterButtons();
    renderFieldRows();
  });
  workspace.querySelector('[data-bib-summaries]')?.addEventListener('click', event => {
    const button = event.target.closest?.('[data-bib-download]');
    if (!button) return;
    const menu = button.closest('.bib-compare-download-menu');
    try {
      const filename = downloadBibRecord({
        record: menu?._bibRecord,
        summary: menu?._bibSummary,
        source: button.dataset.bibSource,
        format: button.dataset.bibDownload
      });
      if (menu) menu.open = false;
      showToastMessage(`${filename} downloaded.`, 'success');
    } catch (error) {
      showToastMessage(error.message || 'The bibliographic record could not be downloaded.', 'error');
    }
  });
  workspace.addEventListener('click', event => {
    workspace.querySelectorAll('.bib-compare-download-menu[open]').forEach(menu => {
      if (!menu.contains(event.target)) menu.open = false;
    });
  });
}

function initialize() {
  if (state.initialized) return;
  state.initialized = true;
  document.getElementById('toggle-bib-compare')?.addEventListener('click', openWorkspace);
}

const OclcBibCompare = Object.freeze({
  initialize,
  open: openWorkspace,
  openForLookup,
  close: closeWorkspace
});

export { OclcBibCompare };
