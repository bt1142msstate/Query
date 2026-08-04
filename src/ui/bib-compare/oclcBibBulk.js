import { postJson } from '../../core/backendApi.js';
import { createWorkbookExportComponent } from '../../components/workbook-export/index.js';
import {
  buildBulkEntries,
  parseInputFile,
  splitPastedValues,
  valuesFromColumn
} from './bibBulkInput.js';

const MAX_ENTRIES = 500;
const CHUNK_SIZE = 1;
const bulkWorkbookExporter = createWorkbookExportComponent();
const STATUS_LABELS = {
  resolved: 'Matched',
  review: 'Review',
  not_found: 'Not found',
  failed: 'Failed'
};

const REVIEW_FIELDS = [
  'Input',
  'Lookup Type',
  'Status',
  'Local Record Key',
  'Local Title',
  'Local Creator',
  'Local Edition',
  'Local Publication',
  'Local Physical Description',
  'Local ISBN',
  'WorldCat OCLC Number',
  'WorldCat Title',
  'WorldCat Creator',
  'WorldCat Edition',
  'WorldCat Publication',
  'WorldCat Physical Description',
  'WorldCat ISBN',
  'Local MARC Tags',
  'WorldCat MARC Tags',
  'Changed MARC Tags',
  'Local-only MARC Tags',
  'WorldCat-only MARC Tags',
  'Selection Method',
  'Exact Edition Candidates',
  'Selected Utility Score',
  'Encoding Level',
  'Authentication Codes',
  'Core Elements Present',
  'Utility Score Breakdown',
  'Match Confidence',
  'Title Match',
  'Creator Match',
  'Edition Match',
  'Publication Year Match',
  'Physical Description Match',
  'Exact Edition Verified',
  'Local 521 Count',
  'Local 526 Count',
  'WorldCat 521 Count',
  'WorldCat 526 Count',
  'Identity Conflict',
  'Review Note'
];

function yesNo(value) {
  if (value === undefined || value === null) return '';
  return value ? 'Yes' : 'No';
}

function joinValues(values) {
  return Array.isArray(values) ? values.filter(Boolean).join('; ') : (values || '');
}

function formatTagCounts(counts) {
  if (!counts || typeof counts !== 'object') return '';
  return Object.entries(counts)
    .filter(([tag, count]) => /^\d{3}$/u.test(tag) && Number(count) > 0)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([tag, count]) => `${tag} (${Number(count).toLocaleString()})`)
    .join('; ');
}

function formatScoreParts(parts) {
  if (!parts || typeof parts !== 'object') return '';
  return Object.entries(parts)
    .filter(([, points]) => Number.isFinite(Number(points)))
    .map(([name, points]) => `${name.replaceAll('_', ' ')}: ${Number(points)}`)
    .join('; ');
}

function bulkResultToWorkbookRow(result) {
  const local = result.local || {};
  const worldcat = result.worldcat || {};
  const selection = result.selection || {};
  const match = result.match || {};
  const review = result.review || {};
  const fieldSummary = result.field_summary || {};
  const differenceTags = fieldSummary.difference_tags || {};
  const utility = selection.utility || {};
  return [
    result.original || result.input || '',
    String(result.lookup_type || '').replaceAll('_', ' '),
    STATUS_LABELS[result.status] || result.status || 'Review',
    local.catalog_key || '',
    local.title || '',
    local.creator || '',
    local.edition || '',
    local.publication || '',
    local.physical_description || '',
    joinValues(local.isbn),
    worldcat.oclc_number || selection.oclc_number || '',
    worldcat.title || '',
    worldcat.creator || '',
    worldcat.edition || '',
    worldcat.publication || '',
    worldcat.physical_description || '',
    joinValues(worldcat.isbn),
    formatTagCounts(fieldSummary.local_tags),
    formatTagCounts(fieldSummary.worldcat_tags),
    formatTagCounts(differenceTags.changed),
    formatTagCounts(differenceTags.local_only),
    formatTagCounts(differenceTags.worldcat_only),
    selection.method || '',
    selection.exact_candidate_count ?? '',
    utility.score ?? '',
    utility.encoding_level || '',
    joinValues(utility.authentication_codes),
    joinValues(utility.core_elements),
    formatScoreParts(utility.parts),
    match.confidence || '',
    yesNo(match.title_match),
    yesNo(match.creator_match),
    yesNo(match.edition_match),
    yesNo(match.publication_year_match),
    yesNo(match.physical_description_match),
    yesNo(review.hydration_ready),
    review.local_521_count ?? '',
    review.local_526_count ?? '',
    review.worldcat_521_count ?? '',
    review.worldcat_526_count ?? '',
    yesNo(review.identity_conflict),
    result.reason || ''
  ];
}

function buildBulkReviewWorkbookState(results) {
  const rows = (results || []).map(bulkResultToWorkbookRow);
  const columnMap = new Map(REVIEW_FIELDS.map((field, index) => [field, index]));
  return {
    groupingCandidates: [],
    rowCount: rows.length,
    sourceData: {
      dataRows: rows,
      displayedFields: [...REVIEW_FIELDS],
      fieldTypeMap: new Map(REVIEW_FIELDS.map(field => [
        field,
        field.endsWith(' Count') ? 'number' : 'string'
      ])),
      virtualData: { columnMap }
    },
    tableName: 'WorldCat Bulk Review'
  };
}

function chunkEntries(entries, chunkSize = CHUNK_SIZE) {
  const size = Math.max(1, Number(chunkSize) || CHUNK_SIZE);
  const chunks = [];
  for (let offset = 0; offset < (entries || []).length; offset += size) {
    chunks.push(entries.slice(offset, offset + size));
  }
  return chunks;
}

function createElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function bulkMarkup() {
  return `
    <section class="bib-bulk-panel hidden" data-bib-bulk-panel>
      <header class="bib-bulk-header">
        <div>
          <span class="bib-compare-eyebrow">Batch review</span>
          <h2>Bulk WorldCat matches</h2>
          <p>Strong matches resolve automatically. Ambiguous records remain available for review.</p>
        </div>
        <div class="bib-bulk-actions">
          <button class="bib-bulk-download hidden" type="button" data-bib-bulk-download>Download Excel</button>
          <button class="bib-bulk-cancel hidden" type="button" data-bib-bulk-cancel>Cancel</button>
        </div>
      </header>
      <div class="bib-bulk-progress hidden" data-bib-bulk-progress role="status" aria-live="polite">
        <div><span data-bib-bulk-progress-text>Preparing records...</span><strong data-bib-bulk-progress-count>0 / 0</strong></div>
        <progress data-bib-bulk-progress-bar value="0" max="1"></progress>
      </div>
      <div class="bib-bulk-stats" data-bib-bulk-stats></div>
      <div class="bib-bulk-results" data-bib-bulk-results></div>
    </section>
  `;
}

function statusCounts(results) {
  return results.reduce((counts, result) => {
    counts[result.status] = (counts[result.status] || 0) + 1;
    return counts;
  }, { resolved: 0, review: 0, not_found: 0, failed: 0 });
}

function createBulkController({ workspace, openComparison, setSearchStatus, showToastMessage }) {
  const template = document.createElement('template');
  template.innerHTML = bulkMarkup().trim();
  workspace.querySelector('.bib-compare-main').appendChild(template.content);
  const panel = workspace.querySelector('[data-bib-bulk-panel]');
  const resultsElement = workspace.querySelector('[data-bib-bulk-results]');
  const statsElement = workspace.querySelector('[data-bib-bulk-stats]');
  const progress = workspace.querySelector('[data-bib-bulk-progress]');
  const progressText = workspace.querySelector('[data-bib-bulk-progress-text]');
  const progressCount = workspace.querySelector('[data-bib-bulk-progress-count]');
  const progressBar = workspace.querySelector('[data-bib-bulk-progress-bar]');
  const cancelButton = workspace.querySelector('[data-bib-bulk-cancel]');
  const downloadButton = workspace.querySelector('[data-bib-bulk-download]');
  let requestId = 0;
  let results = [];

  function setVisible(visible) {
    panel.classList.toggle('hidden', !visible);
  }

  function renderStats() {
    const counts = statusCounts(results);
    statsElement.replaceChildren();
    Object.entries(STATUS_LABELS).forEach(([status, label]) => {
      const item = createElement('div', 'bib-bulk-stat');
      item.dataset.status = status;
      item.append(createElement('strong', '', String(counts[status])), createElement('span', '', label));
      statsElement.appendChild(item);
    });
  }

  function renderResults() {
    resultsElement.replaceChildren();
    results.forEach(result => {
      const row = createElement('article', 'bib-bulk-result');
      row.dataset.status = result.status;
      const identity = createElement('div', 'bib-bulk-result-identity');
      identity.append(
        createElement('strong', '', result.local?.title || result.original || result.input),
        createElement('span', '', `${result.lookup_type.replaceAll('_', ' ')}: ${result.original || result.input}`)
      );
      const local = createElement('div', 'bib-bulk-result-local');
      local.append(
        createElement('span', '', result.local?.catalog_key ? `Catalog ${result.local.catalog_key}` : 'No single local record'),
        createElement('span', '', result.worldcat?.oclc_number ? `OCLC ${result.worldcat.oclc_number}` : (result.reason || 'Match needs review'))
      );
      const chip = createElement('span', 'bib-bulk-status', STATUS_LABELS[result.status] || 'Review');
      row.append(identity, local, chip);
      if (result.local?.catalog_key) {
        const button = createElement('button', 'bib-bulk-open', result.status === 'resolved' ? 'Compare' : 'Review');
        button.type = 'button';
        button.dataset.catalogKey = result.local.catalog_key;
        row.appendChild(button);
      }
      resultsElement.appendChild(row);
    });
    renderStats();
    downloadButton.classList.toggle('hidden', results.length === 0);
  }

  function setProgress(completed, total, message) {
    const active = completed < total;
    progress.classList.toggle('hidden', !total);
    cancelButton.classList.toggle('hidden', !active);
    progressText.textContent = message;
    progressCount.textContent = `${completed.toLocaleString()} / ${total.toLocaleString()}`;
    progressBar.max = Math.max(1, total);
    progressBar.value = completed;
  }

  async function run(entries) {
    const currentRequest = ++requestId;
    results = [];
    renderResults();
    setVisible(true);
    setProgress(0, entries.length, 'Resolving local and WorldCat records...');
    let completed = 0;
    for (const chunk of chunkEntries(entries)) {
      if (currentRequest !== requestId) return;
      try {
        const { data } = await postJson({
          action: 'resolve_oclc_bibs_bulk',
          entries: chunk.map(({ lookup_type, query }) => ({ lookup_type, query }))
        }, { timeoutMs: 180000 });
        const returned = Array.isArray(data.results) ? data.results : [];
        returned.forEach((result, index) => {
          results.push({ ...result, original: chunk[index]?.original || chunk[index]?.query });
        });
      } catch (error) {
        chunk.forEach(entry => results.push({
          ...entry,
          input: entry.query,
          status: 'failed',
          reason: error.message || 'This batch could not be resolved.'
        }));
      }
      renderResults();
      completed += chunk.length;
      setProgress(completed, entries.length, 'Resolving local and WorldCat records...');
    }
    if (currentRequest !== requestId) return;
    const counts = statusCounts(results);
    setProgress(entries.length, entries.length, `${counts.resolved.toLocaleString()} matched automatically; ${counts.review.toLocaleString()} need review.`);
    cancelButton.classList.add('hidden');
    setSearchStatus(`${entries.length.toLocaleString()} inputs processed. ${counts.resolved.toLocaleString()} matched automatically.`, 'success');
  }

  cancelButton.addEventListener('click', () => {
    requestId += 1;
    cancelButton.classList.add('hidden');
    setSearchStatus('Bulk matching stopped. Completed results are still available.', 'empty');
    showToastMessage('Bulk matching stopped.', 'info');
  });
  downloadButton.addEventListener('click', async () => {
    if (!results.length || downloadButton.disabled) return;
    downloadButton.disabled = true;
    try {
      await bulkWorkbookExporter.download({
        config: {
          mode: 'single',
          runDetailsRows: [
            ['Review', 'Purpose', 'Read-only local and WorldCat bibliographic comparison'],
            ['Review', 'Important', 'Exact-edition evidence does not authorize record changes'],
            ['Review', 'Candidate selection', 'Edition identity is verified first; record usefulness ranks only verified exact-edition candidates'],
            ['Review', 'Usefulness score', 'Encoding completeness, authenticated cataloging, descriptive coverage, access points, notes, and usable field breadth'],
            ['Review', 'Field coverage', 'Tag inventories cover every field; 521 and 526 are only two possible review targets']
          ]
        },
        helpers: {
          progress: { update() {} },
          async yieldToBrowser() {}
        },
        state: buildBulkReviewWorkbookState(results)
      });
      showToastMessage('WorldCat review workbook downloaded.', 'success');
    } catch (error) {
      setSearchStatus(error.message || 'The review workbook could not be created.', 'error');
    } finally {
      downloadButton.disabled = false;
    }
  });
  resultsElement.addEventListener('click', event => {
    const button = event.target.closest?.('[data-catalog-key]');
    if (button?.dataset.catalogKey) openComparison(button.dataset.catalogKey);
  });

  return { run, setVisible };
}

function initializeBulkForm({ workspace, controller, setSearchStatus }) {
  const form = workspace.querySelector('[data-bib-bulk-form]');
  const textarea = workspace.querySelector('[data-bib-bulk-values]');
  const typeSelect = workspace.querySelector('[data-bib-bulk-type]');
  const fileInput = workspace.querySelector('[data-bib-bulk-file]');
  const columnSelect = workspace.querySelector('[data-bib-file-column]');
  let fileData = null;

  function applyFileColumn() {
    if (!fileData) return;
    const values = valuesFromColumn(fileData, Number(columnSelect.value || 0));
    textarea.value = values.join('\n');
    const column = fileData.columns[Number(columnSelect.value || 0)];
    if (typeSelect.value === 'auto' && column?.type) typeSelect.value = column.type;
    setSearchStatus(`${values.length.toLocaleString()} values imported from ${column?.label || 'the selected column'}.`, 'success');
  }

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    fileData = parseInputFile(await file.text(), file.name);
    columnSelect.replaceChildren();
    fileData.columns.forEach(column => {
      const option = document.createElement('option');
      option.value = String(column.index);
      option.textContent = column.label;
      columnSelect.appendChild(option);
    });
    const preferred = fileData.columns.find(column => column.type === typeSelect.value)
      || fileData.columns.find(column => column.type)
      || fileData.columns[0];
    if (preferred) columnSelect.value = String(preferred.index);
    workspace.querySelector('[data-bib-file-column-wrap]')?.classList.toggle('hidden', fileData.columns.length < 2);
    applyFileColumn();
  });
  columnSelect.addEventListener('change', applyFileColumn);
  form.addEventListener('submit', event => {
    event.preventDefault();
    const entries = buildBulkEntries(splitPastedValues(textarea.value), typeSelect.value);
    if (!entries.length) {
      setSearchStatus('Paste values or choose a text, CSV, or TSV file first.', 'error');
      textarea.focus();
      return;
    }
    if (entries.length > MAX_ENTRIES) {
      setSearchStatus(`Use ${MAX_ENTRIES.toLocaleString()} or fewer unique values at a time.`, 'error');
      return;
    }
    controller.run(entries);
  });
}

export { buildBulkReviewWorkbookState, chunkEntries, createBulkController, initializeBulkForm };
