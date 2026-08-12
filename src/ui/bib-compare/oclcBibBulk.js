import { postJson } from '../../core/backendApi.js';
import { createWorkbookExportComponent } from '../../components/workbook-export/index.js';
import {
  buildBulkEntries,
  parseInputFile,
  splitPastedValues,
  valuesFromColumn
} from './bibBulkInput.js';
import { fieldEvidenceSummary } from './fieldEvidenceReview.js';
import { bibliographicSource, sourceReviewCount } from './bibSource.js';
import { waitForHydrationRetry } from './hydrationRateLimit.js';
import { estimateHydrationEta, parseHydrationTimestamp } from '../../core/hydrationEta.js';

const CHUNK_SIZE = 25;
const bulkWorkbookExporter = createWorkbookExportComponent();
const STATUS_LABELS = {
  resolved: 'Matched',
  review: 'Review',
  not_found: 'Not found',
  failed: 'Failed'
};
const RESULT_FILTERS = new Set(['all', 'review', 'matched']);
const RESULT_STATUS_PRIORITY = {
  review: 0,
  not_found: 1,
  failed: 2,
  resolved: 3
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
  'Source',
  'Source Role',
  'Source Identifier',
  'Source Title',
  'Source Creator',
  'Source Edition',
  'Source Publication',
  'Source Physical Description',
  'Source ISBN',
  'Local MARC Tags',
  'Source MARC Tags',
  'Changed MARC Tags',
  'Local-only MARC Tags',
  'Source-only MARC Tags',
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
  'Source 521 Count',
  'Source 526 Count',
  'Identity Conflict',
  'Hydration Advice',
  'Overall Confidence',
  'Record Identity Confidence',
  'Requested Field Suitability',
  'Requested Fields',
  'Missing Requested Fields',
  'Blocked Requested Fields',
  'Confidence Policy Version',
  'Field Evidence Summary',
  'Field Evidence Ready',
  'Fields Needing Review',
  'Conflicting Fields',
  'Already-present Fields',
  'Field Evidence Policy Version',
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
  const source = bibliographicSource(result);
  const external = result.external || result.worldcat || {};
  const selection = result.selection || {};
  const match = result.match || {};
  const review = result.review || {};
  const fieldSummary = result.field_summary || {};
  const differenceTags = fieldSummary.difference_tags || {};
  const utility = selection.utility || {};
  const fieldEvidence = review.field_evidence || {};
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
    source.label,
    source.role,
    source.identifier,
    external.title || '',
    external.creator || '',
    external.edition || '',
    external.publication || '',
    external.physical_description || '',
    joinValues(external.isbn),
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
    sourceReviewCount(review, '521'),
    sourceReviewCount(review, '526'),
    yesNo(review.identity_conflict),
    String(review.advice || '').replaceAll('_', ' '),
    review.overall_score ?? '',
    review.identity_score ?? '',
    review.mode === 'all_fields' ? 'General' : (review.target_field_score ?? ''),
    joinValues(review.requested_tags),
    joinValues(review.missing_tags),
    joinValues(review.blocked_tags),
    review.scoring_version || '',
    fieldEvidenceSummary(fieldEvidence),
    yesNo(fieldEvidence.ready_for_candidate_download),
    joinValues(fieldEvidence.needs_review_tags),
    joinValues(fieldEvidence.conflicting_tags),
    joinValues(fieldEvidence.already_present_tags),
    fieldEvidence.version || '',
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
    tableName: 'Hydration Review'
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

function buildBulkResolvePayload(entries, targetTags = [], persistence = {}) {
  return {
    action: 'resolve_oclc_bibs_bulk',
    entries: (entries || []).map(({ lookup_type, query }) => ({ lookup_type, query })),
    ...(targetTags.length ? { target_tags: [...targetTags] } : {}),
    ...(persistence.runId ? { run_id: persistence.runId, batch_id: persistence.batchId } : {})
  };
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
          <h2>Bulk hydration review</h2>
          <p>OCLC is checked first. Exact Library of Congress records are used only as a fallback.</p>
        </div>
        <div class="bib-bulk-actions">
          <button class="bib-bulk-download" type="button" data-bib-bulk-download disabled data-tooltip="Available after at least one record has been reviewed">Download Excel review</button>
          <button class="bib-bulk-cancel hidden" type="button" data-bib-bulk-cancel>Cancel</button>
        </div>
      </header>
      <div class="bib-bulk-progress hidden" data-bib-bulk-progress role="status" aria-live="polite">
        <div><span data-bib-bulk-progress-text>Preparing records...</span><strong data-bib-bulk-progress-count>0 / 0</strong></div>
        <progress data-bib-bulk-progress-bar value="0" max="1"></progress>
        <span class="bib-bulk-progress-eta hidden" data-bib-bulk-progress-eta></span>
      </div>
      <div class="bib-bulk-stats" data-bib-bulk-stats></div>
      <div class="bib-bulk-filterbar hidden" data-bib-bulk-filterbar>
        <span>Show records</span>
        <div class="bib-bulk-filters" role="group" aria-label="Filter hydration results">
          <button type="button" class="is-active" data-bib-bulk-filter="all" aria-pressed="true">
            <span>All</span><strong data-bib-bulk-filter-count="all">0</strong>
          </button>
          <button type="button" data-bib-bulk-filter="review" aria-pressed="false">
            <span>Needs review</span><strong data-bib-bulk-filter-count="review">0</strong>
          </button>
          <button type="button" data-bib-bulk-filter="matched" aria-pressed="false">
            <span>Matched</span><strong data-bib-bulk-filter-count="matched">0</strong>
          </button>
        </div>
      </div>
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

function hydrationReviewCount(counts) {
  return (counts?.review || 0) + (counts?.not_found || 0) + (counts?.failed || 0);
}

function formatHydrationMatchRate(results) {
  const total = results?.length || 0;
  if (!total) return '0%';
  const percentage = (statusCounts(results).resolved / total) * 100;
  const digits = Number.isInteger(percentage) ? 0 : 1;
  return `${percentage.toFixed(digits)}%`;
}

function hydrationResultGroup(result) {
  return result?.status === 'resolved' ? 'matched' : 'review';
}

function filterAndSortHydrationResults(results, filter = 'all') {
  const normalizedFilter = RESULT_FILTERS.has(filter) ? filter : 'all';
  return (results || [])
    .map((result, index) => ({ result, index }))
    .filter(({ result }) => normalizedFilter === 'all' || hydrationResultGroup(result) === normalizedFilter)
    .sort((left, right) => {
      const leftPriority = RESULT_STATUS_PRIORITY[left.result?.status] ?? RESULT_STATUS_PRIORITY.review;
      const rightPriority = RESULT_STATUS_PRIORITY[right.result?.status] ?? RESULT_STATUS_PRIORITY.review;
      return leftPriority - rightPriority || left.index - right.index;
    })
    .map(({ result }) => result);
}

function createBulkController({ workspace, getTargetTags, openComparison, setSearchStatus, showToastMessage }) {
  const template = document.createElement('template');
  template.innerHTML = bulkMarkup().trim();
  workspace.querySelector('.bib-compare-main').appendChild(template.content);
  const panel = workspace.querySelector('[data-bib-bulk-panel]');
  const resultsElement = workspace.querySelector('[data-bib-bulk-results]');
  const statsElement = workspace.querySelector('[data-bib-bulk-stats]');
  const filterbar = workspace.querySelector('[data-bib-bulk-filterbar]');
  const filterButtons = [...workspace.querySelectorAll('[data-bib-bulk-filter]')];
  const progress = workspace.querySelector('[data-bib-bulk-progress]');
  const progressText = workspace.querySelector('[data-bib-bulk-progress-text]');
  const progressCount = workspace.querySelector('[data-bib-bulk-progress-count]');
  const progressBar = workspace.querySelector('[data-bib-bulk-progress-bar]');
  const progressEta = workspace.querySelector('[data-bib-bulk-progress-eta]');
  const cancelButton = workspace.querySelector('[data-bib-bulk-cancel]');
  const downloadButton = workspace.querySelector('[data-bib-bulk-download]');
  let requestId = 0;
  let results = [];
  let activeResultFilter = 'all';
  let activeRunId = '';
  let activeRequestController = null;
  let activeTotal = 0;
  let activeStartedAt = null;
  let progressSnapshot = { completed: 0, total: 0 };
  let progressEtaTimer = null;

  function stopProgressEtaTimer() {
    if (!progressEtaTimer) return;
    clearInterval(progressEtaTimer);
    progressEtaTimer = null;
  }

  function renderProgressEta(active) {
    if (!progressEta) return;
    const estimate = active
      ? estimateHydrationEta({ ...progressSnapshot, startedAt: activeStartedAt })
      : { text: '' };
    progressEta.textContent = estimate.text || '';
    progressEta.classList.toggle('hidden', !estimate.text);
  }

  function syncProgressEtaTimer(active) {
    if (!active) {
      stopProgressEtaTimer();
      return;
    }
    if (!progressEtaTimer) {
      progressEtaTimer = setInterval(() => renderProgressEta(true), 1000);
    }
  }

  async function finishRun(status, error = '') {
    if (!activeRunId) return true;
    const runId = activeRunId;
    try {
      await postJson({
        action: 'finish_hydration_run', run_id: runId, status,
        ...(error ? { error: String(error).slice(0, 500) } : {})
      });
      if (activeRunId === runId) activeRunId = '';
      return true;
    } catch (finishError) {
      console.warn('Hydration history finalization failed', finishError);
      return false;
    }
  }

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
      if (status === 'resolved') {
        item.appendChild(createElement('small', 'bib-bulk-match-rate', `${formatHydrationMatchRate(results)} matched`));
      }
      statsElement.appendChild(item);
    });
  }

  function renderFilters() {
    const counts = statusCounts(results);
    const filterCounts = {
      all: results.length,
      review: hydrationReviewCount(counts),
      matched: counts.resolved
    };
    filterbar.classList.toggle('hidden', results.length === 0);
    filterButtons.forEach(button => {
      const filter = button.dataset.bibBulkFilter;
      const active = filter === activeResultFilter;
      const count = filterCounts[filter] || 0;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
      button.setAttribute('aria-label', `${button.querySelector('span')?.textContent || filter}: ${count.toLocaleString()} records`);
      const countElement = button.querySelector(`[data-bib-bulk-filter-count="${filter}"]`);
      if (countElement) countElement.textContent = count.toLocaleString();
    });
  }

  function renderResults() {
    resultsElement.replaceChildren();
    const visibleResults = filterAndSortHydrationResults(results, activeResultFilter);
    visibleResults.forEach(result => {
      const row = createElement('article', 'bib-bulk-result');
      row.dataset.status = result.status;
      const identity = createElement('div', 'bib-bulk-result-identity');
      identity.append(
        createElement('strong', '', result.local?.title || result.original || result.input),
        createElement('span', '', `${result.lookup_type.replaceAll('_', ' ')}: ${result.original || result.input}`)
      );
      const local = createElement('div', 'bib-bulk-result-local');
      const advice = String(result.review?.advice || '').replaceAll('_', ' ');
      const confidence = Number.isFinite(Number(result.review?.overall_score))
        ? ` · ${Number(result.review.overall_score)}/100${advice ? ` ${advice}` : ''}`
        : '';
      const source = bibliographicSource(result);
      local.append(
        createElement('span', '', result.local?.catalog_key ? `Catalog ${result.local.catalog_key}` : 'No single local record'),
        createElement('span', '', source.identifier ? `${source.identifierLabel} ${source.identifier}${confidence}` : (result.reason || 'Match needs review'))
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
    if (results.length && !visibleResults.length) {
      resultsElement.appendChild(createElement(
        'p',
        'bib-bulk-empty',
        activeResultFilter === 'matched' ? 'No records were matched automatically.' : 'No records need review.'
      ));
    }
    renderStats();
    renderFilters();
    downloadButton.disabled = results.length === 0;
    downloadButton.setAttribute(
      'data-tooltip',
      results.length ? 'Download the completed hydration review as Excel' : 'Available after at least one record has been reviewed'
    );
  }

  function setProgress(completed, total, message) {
    const active = completed < total && Boolean(activeRunId);
    progressSnapshot = { completed, total };
    progress.classList.toggle('hidden', !total);
    cancelButton.classList.toggle('hidden', !active);
    progressText.textContent = message;
    progressCount.textContent = `${completed.toLocaleString()} / ${total.toLocaleString()}`;
    progressBar.max = Math.max(1, total);
    progressBar.value = completed;
    renderProgressEta(active);
    syncProgressEtaTimer(active);
  }

  async function run(entries) {
    const targetTags = getTargetTags?.();
    if (!Array.isArray(targetTags)) {
      setSearchStatus('Enter at least one valid three-digit MARC field for the hydration plan.', 'error');
      return;
    }
    if (activeRunId && !await cancelRun({ notify: false })) {
      setSearchStatus('The previous saved run could not be finalized. Try again before starting another run.', 'error');
      return;
    }
    const currentRequest = ++requestId;
    results = [];
    activeResultFilter = 'all';
    activeTotal = entries.length;
    activeStartedAt = Date.now();
    renderResults();
    setVisible(true);
    setProgress(0, entries.length, 'Resolving OCLC and Library of Congress records...');
    try {
      const { data } = await postJson({
        action: 'start_hydration_run',
        name: `Hydration review - ${new Date().toLocaleString()}`,
        total: entries.length,
        target_tags: targetTags,
        source_description: 'Bulk hydration review'
      });
      activeRunId = data.run_id || '';
      if (!activeRunId) throw new Error('The saved Hydration run did not return an identifier.');
      activeStartedAt = parseHydrationTimestamp(data.metadata?.start_time) || activeStartedAt;
      setProgress(0, entries.length, 'Resolving OCLC and Library of Congress records...');
    } catch (error) {
      setSearchStatus(error.message || 'The Hydration run could not be saved.', 'error');
      return;
    }
    let completed = 0;
    const chunks = chunkEntries(entries);
    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
      const chunk = chunks[chunkIndex];
      if (currentRequest !== requestId) return;
      let chunkComplete = false;
      while (!chunkComplete && currentRequest === requestId) {
        try {
          activeRequestController = new AbortController();
          const { data } = await postJson(
            buildBulkResolvePayload(chunk, targetTags, {
              runId: activeRunId,
              batchId: `batch_${String(chunkIndex).padStart(8, '0')}`
            }),
            { timeoutMs: 600000, notifyOnRateLimit: false, signal: activeRequestController.signal }
          );
          activeRequestController = null;
          const returned = Array.isArray(data.results) ? data.results : [];
          returned.forEach((result, index) => {
            results.push({ ...result, original: chunk[index]?.original || chunk[index]?.query });
          });
          chunkComplete = true;
        } catch (error) {
          activeRequestController = null;
          if (currentRequest !== requestId || error?.name === 'AbortError') return;
          if (error?.isRateLimited) {
            setSearchStatus('Hydration is paused by the request limit. Completed records are preserved.', 'warning');
            const shouldRetry = await waitForHydrationRetry({
              error,
              isCurrent: () => currentRequest === requestId,
              onTick: ({ message }) => setProgress(completed, entries.length, message)
            });
            if (!shouldRetry) return;
            setProgress(completed, entries.length, 'Request limit cleared. Retrying the same records...');
            continue;
          }
          const message = error.message || 'This batch could not be resolved.';
          setSearchStatus(`${message} Completed batches remain available in Shared History.`, 'error');
          cancelButton.classList.add('hidden');
          await finishRun('failed', message);
          setProgress(completed, entries.length, 'Hydration stopped. Completed records were saved.');
          return;
        }
      }
      if (currentRequest !== requestId) return;
      renderResults();
      completed += chunk.length;
      setProgress(completed, entries.length, 'Resolving OCLC and Library of Congress records...');
    }
    if (currentRequest !== requestId) return;
    const counts = statusCounts(results);
    const reviewCount = hydrationReviewCount(counts);
    setProgress(entries.length, entries.length, `${counts.resolved.toLocaleString()} matched automatically; ${reviewCount.toLocaleString()} need review.`);
    cancelButton.classList.add('hidden');
    setSearchStatus(`${entries.length.toLocaleString()} inputs processed. ${counts.resolved.toLocaleString()} matched automatically (${formatHydrationMatchRate(results)}); ${reviewCount.toLocaleString()} need review.`, 'success');
    await finishRun('complete');
  }

  async function loadSavedRun(runId) {
    const currentRequest = ++requestId;
    results = [];
    activeResultFilter = 'all';
    activeRunId = '';
    activeTotal = 0;
    activeStartedAt = null;
    setVisible(true);
    setProgress(0, 1, 'Loading saved Hydration results...');
    let offset = 0;
    let metadata = null;
    try {
      while (currentRequest === requestId) {
        const { data } = await postJson({
          action: 'get_hydration_run', run_id: runId, offset, limit: 1000
        }, { timeoutMs: 60000 });
        metadata = data.metadata || metadata;
        results.push(...(Array.isArray(data.results) ? data.results : []));
        renderResults();
        offset = Number(data.next_offset || results.length);
        const total = Number(data.total || results.length);
        setProgress(results.length, total, 'Loading saved Hydration results...');
        if (!data.has_more) break;
      }
      if (currentRequest !== requestId) return;
      const total = Number(metadata?.hydration_total || results.length);
      const running = metadata?.status === 'hydration_running';
      activeRunId = running ? runId : '';
      activeTotal = total;
      activeStartedAt = parseHydrationTimestamp(metadata?.start_time);
      const counts = statusCounts(results);
      setProgress(results.length, total, `Saved run loaded. ${results.length.toLocaleString()} completed records are available.`);
      cancelButton.classList.toggle('hidden', !running);
      setSearchStatus(`Saved Hydration run loaded. ${counts.resolved.toLocaleString()} matched automatically (${formatHydrationMatchRate(results)}); ${hydrationReviewCount(counts).toLocaleString()} need review.`, 'success');
    } catch (error) {
      setSearchStatus(error.message || 'The saved Hydration run could not be loaded.', 'error');
    }
  }

  async function cancelRun({ notify = true } = {}) {
    const runId = activeRunId;
    if (!runId) return true;
    requestId += 1;
    activeRequestController?.abort();
    activeRequestController = null;
    cancelButton.classList.add('hidden');
    try {
      await postJson({ action: 'cancel_hydration_run', run_id: runId });
      if (activeRunId === runId) activeRunId = '';
      setProgress(results.length, activeTotal, 'Hydration canceled. Completed records were preserved.');
      setSearchStatus('Hydration canceled. Completed results are still available.', 'empty');
      if (notify) showToastMessage('Hydration canceled.', 'info');
      window.dispatchEvent(new CustomEvent('query:hydration-run-canceled', { detail: { runId } }));
      return true;
    } catch (error) {
      setSearchStatus(error.message || 'The Hydration run could not be canceled.', 'error');
      if (activeRunId === runId) cancelButton.classList.remove('hidden');
      return false;
    }
  }

  cancelButton.addEventListener('click', () => cancelRun());
  filterbar.addEventListener('click', event => {
    const button = event.target.closest?.('[data-bib-bulk-filter]');
    const filter = button?.dataset.bibBulkFilter;
    if (!RESULT_FILTERS.has(filter) || filter === activeResultFilter) return;
    activeResultFilter = filter;
    renderResults();
  });
  window.addEventListener('query:hydration-run-canceled', event => {
    if (!activeRunId || event.detail?.runId !== activeRunId) return;
    requestId += 1;
    activeRequestController?.abort();
    activeRequestController = null;
    activeRunId = '';
    cancelButton.classList.add('hidden');
    setProgress(results.length, activeTotal, 'Hydration canceled. Completed records were preserved.');
    setSearchStatus('Hydration canceled. Completed results are still available.', 'empty');
  });
  downloadButton.addEventListener('click', async () => {
    if (!results.length || downloadButton.disabled) return;
    downloadButton.disabled = true;
    try {
      await downloadHydrationReviewWorkbook(results);
      showToastMessage('Hydration review workbook downloaded.', 'success');
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

  return { cancel: cancelRun, loadSavedRun, run, setVisible };
}

async function downloadHydrationReviewWorkbook(results) {
  return bulkWorkbookExporter.download({
    config: {
      mode: 'single',
      runDetailsRows: [
        ['Review', 'Purpose', 'Read-only local and external bibliographic comparison'],
        ['Review', 'Source order', 'OCLC WorldCat primary; exact Library of Congress LCCN fallback'],
        ['Review', 'Important', 'Exact-edition evidence does not authorize record changes'],
        ['Review', 'Candidate selection', 'Edition identity is verified first; record usefulness ranks only verified exact-edition candidates'],
        ['Review', 'Usefulness score', 'Encoding completeness, authenticated cataloging, descriptive coverage, access points, notes, and usable field breadth'],
        ['Review', 'Field coverage', 'Tag inventories cover every field; requested fields are reviewed independently']
      ]
    },
    helpers: {
      progress: { update() {} },
      async yieldToBrowser() {}
    },
    state: buildBulkReviewWorkbookState(results)
  });
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
    controller.run(entries);
  });
}

export {
  buildBulkResolvePayload,
  buildBulkReviewWorkbookState,
  chunkEntries,
  createBulkController,
  downloadHydrationReviewWorkbook,
  filterAndSortHydrationResults,
  formatHydrationMatchRate,
  hydrationResultGroup,
  hydrationReviewCount,
  initializeBulkForm
};
