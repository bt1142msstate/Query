import { postJson } from '../../core/backendApi.js';
import { getSession } from '../../core/authSession.js';
import { showToastMessage } from '../../core/toast.js';
import { comparisonStatusLabel, fieldLines, filterComparisonRows, formatIdentifierList, matchConfidenceLabel, searchInputMetadata, summaryValue } from './bibCompareFormat.js';
import { buildHydratedBibRecord, downloadBibRecord, FORMATS } from './bibRecordDownload.js';
import { createBulkController, initializeBulkForm } from './oclcBibBulk.js';
import { fieldEvidenceDownloadReady, renderFieldEvidenceReview } from './fieldEvidenceReview.js';
import { createHydrationRankingGuide, hydrationRankingGuideMarkup } from './hydrationRankingGuide.js';
import { createMarcTagInfo } from './marcTagInfo.js';
import { bindSingleHydrationExcel } from './singleHydrationWorkbook.js';
import { createCurrentQueryHydrationSource, currentQuerySourceMarkup } from './currentQueryHydration.js';
import { BIB_COMPARISON_FILTERS as FILTERS, bibliographicSource } from './bibSource.js';
import { installHydrationHistoryBridge } from './hydrationHistoryBridge.js';
const state = {
  initialized: false,
  workspace: null,
  searchResults: [],
  selectedCatalogKey: '',
  comparison: null,
  filter: 'differences',
  mode: 'single',
  bulkController: null,
  targetMode: 'all',
  targetTags: [],
  targetPlanValid: true,
  targetTimer: null,
  rankingGuide: null,
  currentQuerySource: null,
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
          <span class="bib-compare-eyebrow">Bibliographic record enrichment</span>
          <h1>Hydration</h1>
          <p>Check OCLC first, then use an exact Library of Congress fallback when available.</p>
        </div>
        <div class="bib-compare-header-actions">
          <span class="bib-compare-readonly">Read only</span>
          <button class="bib-compare-icon-button" type="button" data-bib-close aria-label="Close Hydration" title="Close">
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
            ${currentQuerySourceMarkup()}
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
          <section class="bib-compare-hydration-plan" aria-labelledby="bib-hydration-heading">
            <div class="bib-compare-form-heading bib-compare-plan-heading">
              <h2 id="bib-hydration-heading">Hydration plan</h2>
              <button type="button" class="bib-compare-ranking-button" data-bib-ranking-open>
                <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.8 9a2.3 2.3 0 0 1 4.4.9c0 1.8-2.2 2-2.2 3.6M12 17.4h.01"/></svg>
                <span>How ranking works</span>
              </button>
            </div>
            <div class="bib-compare-segmented" role="radiogroup" aria-label="Hydration field scope">
              <label>
                <input type="radio" name="bib-hydration-mode" value="all" data-bib-target-mode checked>
                <span>All eligible fields</span>
              </label>
              <label>
                <input type="radio" name="bib-hydration-mode" value="selected" data-bib-target-mode>
                <span>Selected fields</span>
              </label>
            </div>
            <div class="bib-compare-target-entry hidden" data-bib-target-entry>
              <label class="bib-compare-label" for="bib-target-tags">Requested MARC fields</label>
              <input id="bib-target-tags" data-bib-target-tags inputmode="numeric" autocomplete="off" maxlength="199" placeholder="521, 526">
              <p data-bib-target-status role="status" aria-live="polite"></p>
            </div>
          </section>
          <div class="bib-compare-search-status" data-bib-search-status role="status" aria-live="polite">
            Search by title, catalog key, or item ID.
          </div>
          <div class="bib-compare-result-list" data-bib-results aria-label="Local record matches"></div>
        </aside>

        <main class="bib-compare-main">
          <section class="bib-compare-empty" data-bib-empty>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v16H6.5A2.5 2.5 0 0 0 4 21.5zM20 5.5A2.5 2.5 0 0 0 17.5 3H13v16h4.5a2.5 2.5 0 0 1 2.5 2.5z"/></svg>
            <h2>Select a local record</h2>
            <p>OCLC is primary. If it has no acceptable match, an exact MARC 010 Library of Congress record can be used.</p>
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

            <section class="bib-compare-confidence hidden" data-bib-confidence>
              <div class="bib-compare-confidence-heading">
                <div>
                  <span class="bib-compare-advice" data-bib-advice>Review</span>
                  <h2>Hydration confidence</h2>
                </div>
                <p data-bib-confidence-reason></p>
              </div>
              <div class="bib-compare-score-grid">
                <div><span>Overall</span><strong data-bib-overall-score>--</strong></div>
                <div><span>Record identity</span><strong data-bib-identity-score>--</strong></div>
                <div><span>Requested fields</span><strong data-bib-target-score>--</strong></div>
              </div>
              <p class="bib-compare-score-note">Transparent policy score, not a statistical probability.</p>
              <div class="bib-compare-target-results" data-bib-target-results></div>
              <section class="bib-field-evidence-review hidden" data-bib-field-evidence></section>
              <div class="bib-compare-hydrated-download">
                <button type="button" data-bib-excel-download disabled>
                  <span>Download Excel review</span>
                </button>
                <button type="button" data-bib-hydrated-download disabled>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0 4.5-4.5M12 15l-4.5-4.5M5 20h14"/></svg>
                  <span>Download hydrated bib</span>
                </button>
                <p data-bib-hydrated-download-status>This read-only candidate never changes Symphony.</p>
              </div>
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
                <span data-bib-source-column>External source</span>
                <span>Status</span>
              </div>
              <div class="bib-compare-field-list" data-bib-field-list></div>
            </section>
          </section>
        </main>
      </div>

      ${hydrationRankingGuideMarkup()}
    </div>
  `;
}
function ensureWorkspace() {
  if (state.workspace) return state.workspace;
  const dialog = document.createElement('dialog');
  dialog.id = 'bib-compare-workspace';
  dialog.className = 'bib-compare-workspace';
  dialog.setAttribute('aria-label', 'Bibliographic record hydration');
  dialog.innerHTML = workspaceMarkup();
  document.body.appendChild(dialog);
  state.workspace = dialog;
  state.rankingGuide = createHydrationRankingGuide(dialog);
  bindWorkspaceEvents(dialog);
  state.bulkController = createBulkController({
    workspace: dialog,
    getTargetTags: () => {
      updateTargetPlan({ reload: false });
      return state.targetPlanValid
        ? (state.targetMode === 'selected' ? state.targetTags : [])
        : null;
    },
    openComparison: catalogKey => {
      setMode('single');
      loadComparison(catalogKey);
    },
    setSearchStatus,
    showToastMessage
  });
  state.currentQuerySource = createCurrentQueryHydrationSource({
    workspace: dialog,
    controller: state.bulkController,
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
  if (state.mode === 'bulk') state.currentQuerySource?.refresh();
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

function buildDownloadMenu(record, summary, source, sourceLabel = '', downloadSource = source) {
  const menu = createElement('details', 'bib-compare-download-menu');
  const trigger = createElement('summary', 'bib-compare-download-trigger');
  trigger.setAttribute('aria-label', `Download ${source === 'local' ? 'Symphony' : sourceLabel || 'external'} bibliographic record`);
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
    button.dataset.bibSource = downloadSource;
    button.setAttribute('role', 'menuitem');
    options.appendChild(button);
  });
  menu.append(trigger, options);
  menu._bibRecord = record;
  menu._bibSummary = summary;
  return menu;
}

function buildSummaryPanel(title, summary, source, record, sourceMetadata = null) {
  const panel = createElement('article', `bib-compare-summary-panel bib-compare-summary-panel--${source}`);
  const heading = createElement('div', 'bib-compare-summary-heading');
  const headingText = createElement('div', 'bib-compare-summary-heading-text');
  headingText.append(
    createElement('span', 'bib-compare-source-label', source === 'local' ? 'Symphony' : sourceMetadata?.label || 'External source'),
    createElement('h2', '', title)
  );
  heading.append(headingText, buildDownloadMenu(record, summary, source, sourceMetadata?.label, sourceMetadata?.code || source));
  const list = createElement('dl', 'bib-compare-summary-list');
  list.append(
    summaryRow(source === 'local' ? 'Catalog key' : sourceMetadata?.identifierLabel || 'Source identifier', source === 'local' ? summary?.catalog_key : sourceMetadata?.identifier),
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
  const source = bibliographicSource(payload);
  if (source.record?.summary) {
    const worldcat = source.record.summary;
    container.appendChild(buildSummaryPanel(
      summaryValue(worldcat.title, `Untitled ${source.label} record`),
      worldcat,
      'worldcat',
      source.record?.record,
      source
    ));
  } else {
    const waiting = createElement('article', 'bib-compare-summary-panel bib-compare-summary-panel--waiting');
    waiting.append(
      createElement('span', 'bib-compare-source-label', 'OCLC WorldCat primary'),
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
  const source = bibliographicSource(payload);
  const enrichment = review
    ? ` ${source.shortLabel} fields: ${Number(review.source_521_count ?? review.worldcat_521_count ?? 0)} audience (521), ${Number(review.source_526_count ?? review.worldcat_526_count ?? 0)} reading-program (526). ${review.hydration_ready ? 'Exact-edition checks align.' : 'Review exact-edition evidence before hydration.'}`
    : '';
  query('[data-bib-match-reason]').textContent = `${match.reason || ''}${enrichment}`;
}

function adviceLabel(advice) {
  return {
    recommended: 'Recommended',
    review: 'Review first',
    do_not_hydrate: 'Do not hydrate'
  }[advice] || 'Review first';
}

function renderHydrationConfidence(payload) {
  const panel = query('[data-bib-confidence]');
  const assessment = payload?.review;
  const source = bibliographicSource(payload);
  panel?.classList.toggle('hidden', !assessment?.scoring_version);
  if (!panel || !assessment?.scoring_version) return;
  panel.dataset.advice = assessment.advice || 'review';
  query('[data-bib-advice]').textContent = adviceLabel(assessment.advice);
  query('[data-bib-confidence-reason]').textContent = assessment.reason || '';
  query('[data-bib-overall-score]').textContent = `${Number(assessment.overall_score || 0)}/100`;
  query('[data-bib-identity-score]').textContent = `${Number(assessment.identity_score || 0)}/100`;
  query('[data-bib-target-score]').textContent = assessment.mode === 'all_fields'
    ? 'General'
    : `${Number(assessment.target_field_score || 0)}/100`;

  const results = query('[data-bib-target-results]');
  results?.replaceChildren();
  (assessment.fields || []).forEach(field => {
    const item = createElement('span', 'bib-compare-target-result');
    item.dataset.status = field.hydration_allowed ? 'available' : (field.available ? 'blocked' : 'missing');
    const stateLabel = field.hydration_allowed ? 'available' : (field.available ? 'blocked' : 'missing');
    item.textContent = `${field.tag} ${field.label || 'Bibliographic Field'}: ${stateLabel}`;
    item.tabIndex = 0;
    item.setAttribute('data-tooltip', `${field.tag} - ${field.label || 'Bibliographic Field'}. ${field.description || ''}`.trim());
    item.setAttribute('data-tooltip-intent', 'instant');
    results?.appendChild(item);
  });
  renderFieldEvidenceReview(query('[data-bib-field-evidence]'), assessment.field_evidence);

  const downloadButton = query('[data-bib-hydrated-download]');
  const downloadStatus = query('[data-bib-hydrated-download-status]');
  const approvedTags = (assessment.fields || [])
    .filter(field => field.hydration_allowed)
    .map(field => String(field.tag || ''))
    .filter(tag => /^\d{3}$/u.test(tag));
  const isSelectedPlan = assessment.mode === 'selected_fields';
  const canDownload = assessment.advice === 'recommended'
    && isSelectedPlan
    && approvedTags.length > 0
    && fieldEvidenceDownloadReady(assessment.field_evidence)
    && Boolean(payload?.local?.record?.fields?.length)
    && Boolean(source.record?.record?.fields?.length);
  if (downloadButton) {
    downloadButton.disabled = !canDownload;
    downloadButton.dataset.bibHydrationTags = canDownload ? approvedTags.join(',') : '';
  }
  if (downloadStatus) {
    downloadStatus.textContent = canDownload
      ? `Builds a read-only candidate using approved ${source.label} ${approvedTags.join(', ')} fields. Nothing is sent to Symphony.`
      : !isSelectedPlan
        ? 'Choose Selected fields to create a bounded candidate. Nothing is sent to Symphony.'
        : assessment.advice !== 'recommended'
          ? 'A candidate is available only when the selected-field assessment is Recommended.'
          : !fieldEvidenceDownloadReady(assessment.field_evidence)
            ? 'Field evidence requires review before a hydrated candidate can be downloaded.'
          : 'The complete local and external records are required before a candidate can be downloaded.';
  }
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
    tag.appendChild(createMarcTagInfo(row));
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
  const source = bibliographicSource(payload);
  const sourceColumn = query('[data-bib-source-column]');
  if (sourceColumn) sourceColumn.textContent = source.shortLabel;
  query('[data-bib-empty]')?.classList.add('hidden');
  query('[data-bib-content]')?.classList.remove('hidden');
  renderSummaries(payload);
  renderMatch(payload);
  renderHydrationConfidence(payload);
  renderCandidates(payload);
  const hasComparison = Boolean(payload?.comparison?.rows);
  query('[data-bib-fields]')?.classList.toggle('hidden', !hasComparison);
  renderFilterButtons();
  if (hasComparison) renderFieldRows();
  const excelButton = query('[data-bib-excel-download]');
  if (excelButton) excelButton.disabled = !payload?.local?.summary;
}

async function loadComparison(catalogKey, oclcNumber = '') {
  updateTargetPlan({ reload: false });
  if (!state.targetPlanValid) {
    setSearchStatus('Enter at least one valid three-digit MARC field for the hydration plan.', 'error');
    return;
  }
  const requestId = ++state.compareRequest;
  state.selectedCatalogKey = String(catalogKey || '');
  renderSearchResults();
  setBusy('Loading Symphony, OCLC, and fallback records...');
  query('[data-bib-empty]')?.classList.add('hidden');
  query('[data-bib-content]')?.classList.remove('hidden');
  try {
    const { data } = await postJson({
      action: 'compare_oclc_bib',
      catalog_key: state.selectedCatalogKey,
      ...(state.targetMode === 'selected' ? { target_tags: state.targetTags } : {}),
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

function parsedTargetTags(value) {
  const tokens = String(value || '').split(/[\s,;]+/u).map(token => token.trim()).filter(Boolean);
  if (!tokens.length) return { tags: [], error: '' };
  if (tokens.some(token => !/^\d{3}$/u.test(token))) {
    return { tags: [], error: 'Each field must be a three-digit MARC tag.' };
  }
  return { tags: [...new Set(tokens)].slice(0, 50), error: '' };
}

function updateTargetPlan({ reload = true } = {}) {
  const selectedMode = query('[data-bib-target-mode]:checked')?.value || 'all';
  state.targetMode = selectedMode;
  query('[data-bib-target-entry]')?.classList.toggle('hidden', selectedMode !== 'selected');
  const status = query('[data-bib-target-status]');
  if (selectedMode === 'all') {
    state.targetTags = [];
    state.targetPlanValid = true;
    if (status) status.textContent = '';
  } else {
    const parsed = parsedTargetTags(query('[data-bib-target-tags]')?.value);
    if (status) {
      status.textContent = parsed.error || (parsed.tags.length ? `${parsed.tags.length} field${parsed.tags.length === 1 ? '' : 's'} selected` : 'Enter at least one field.');
      status.dataset.tone = parsed.error || !parsed.tags.length ? 'error' : '';
    }
    state.targetPlanValid = !parsed.error && parsed.tags.length > 0;
    if (!state.targetPlanValid) {
      state.targetTags = [];
      return;
    }
    state.targetTags = parsed.tags;
  }
  if (reload && state.selectedCatalogKey) loadComparison(state.selectedCatalogKey);
}

function scheduleTargetPlanUpdate() {
  clearTimeout(state.targetTimer);
  state.targetTimer = setTimeout(() => updateTargetPlan(), 450);
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
  state.rankingGuide?.close();
  state.workspace.close();
}

function openWorkspace() {
  if (!getSession()) {
    document.getElementById('auth-session-button')?.click();
    showToastMessage('Sign in before using Hydration.', 'info');
    return false;
  }
  const workspace = ensureWorkspace();
  state.currentQuerySource?.refresh();
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
    if (state.rankingGuide?.close()) return;
    closeWorkspace();
  });
  workspace.querySelector('[data-bib-lookup-type]')?.addEventListener('change', updateSearchInput);
  workspace.querySelector('.bib-compare-mode')?.addEventListener('click', event => {
    const button = event.target.closest?.('[data-bib-mode]');
    if (button) setMode(button.dataset.bibMode);
  });
  workspace.querySelectorAll('[data-bib-target-mode]').forEach(input => {
    input.addEventListener('change', () => updateTargetPlan());
  });
  workspace.querySelector('[data-bib-target-tags]')?.addEventListener('input', scheduleTargetPlanUpdate);
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
  workspace.querySelector('[data-bib-hydrated-download]')?.addEventListener('click', event => {
    const button = event.currentTarget;
    const tags = String(button.dataset.bibHydrationTags || '').split(',').filter(Boolean);
    try {
      const record = buildHydratedBibRecord({
        localRecord: state.comparison?.local?.record,
        worldcatRecord: bibliographicSource(state.comparison).record?.record,
        tags
      });
      const filename = downloadBibRecord({
        record,
        summary: state.comparison?.local?.summary,
        source: 'hydrated',
        format: 'marc'
      });
      showToastMessage(`${filename} downloaded for review. No catalog changes were made.`, 'success');
    } catch (error) {
      showToastMessage(error.message || 'The hydration candidate could not be downloaded.', 'error');
    }
  });
  bindSingleHydrationExcel({ workspace, getPayload: () => state.comparison, notify: showToastMessage });
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
  installHydrationHistoryBridge({ openWorkspace, setMode, getController: () => state.bulkController });
}

const OclcBibCompare = Object.freeze({
  initialize,
  open: openWorkspace,
  openForLookup,
  close: closeWorkspace
});

export { OclcBibCompare };
