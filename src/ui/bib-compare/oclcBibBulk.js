import { postJson } from '../../core/backendApi.js';
import { getClientErrorMessage } from '../../core/clientErrorMessages.js';
import { createWorkbookExportComponent } from '../../components/workbook-export/index.js';
import {
  buildBulkEntries,
  buildSpreadsheetEntries,
  inputDataFromRows,
  parseInputFile,
  SPREADSHEET_FIELDS,
  splitPastedValues,
  valuesFromColumn
} from './bibBulkInput.js';
import { isXlsxFile, parseXlsxWorkbook } from './xlsxWorkbookInput.js';
import { bibliographicSource } from './bibSource.js';
import { waitForHydrationRetry } from './hydrationRateLimit.js';
import { estimateHydrationEta, parseHydrationTimestamp } from '../../core/hydrationEta.js';
import { buildBulkReviewWorkbookState } from './bibBulkReviewWorkbook.js';
import {
  downloadableExternalRequests,
  downloadBatchBibRecords,
  retrieveBatchBibRecords
} from './bibBatchDownload.js';

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

function chunkEntries(entries, chunkSize = CHUNK_SIZE) {
  const size = Math.max(1, Number(chunkSize) || CHUNK_SIZE);
  const chunks = [];
  for (let offset = 0; offset < (entries || []).length; offset += size) {
    chunks.push(entries.slice(offset, offset + size));
  }
  return chunks;
}

function buildBulkResolvePayload(entries, targetTags = [], persistence = {}, mode = 'local') {
  const spreadsheetMode = mode === 'spreadsheet';
  return {
    action: spreadsheetMode ? 'resolve_spreadsheet_bibs_bulk' : 'resolve_oclc_bibs_bulk',
    entries: spreadsheetMode
      ? (entries || []).map(({ metadata }) => ({ metadata }))
      : (entries || []).map(({ lookup_type, query }) => ({ lookup_type, query })),
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
          <span class="bib-compare-eyebrow">List review</span>
          <h2>List review</h2>
          <p>Each item is matched to Symphony, then checked against WorldCat or an exact Library of Congress record.</p>
        </div>
        <div class="bib-bulk-actions">
          <button class="bib-bulk-download" type="button" data-bib-bulk-marc disabled data-tooltip="Available for recommended matches">Download MARC</button>
          <button class="bib-bulk-download" type="button" data-bib-bulk-marcxml disabled data-tooltip="Available for recommended matches">Download MARCXML</button>
          <button class="bib-bulk-download" type="button" data-bib-bulk-download disabled data-tooltip="Available after at least one record has been reviewed">Download Excel review</button>
          <button class="bib-bulk-cancel hidden" type="button" data-bib-bulk-cancel>Cancel</button>
        </div>
      </header>
      <div class="bib-bulk-start" data-bib-bulk-empty>
        <h3>Start with a list</h3>
        <p>Paste values, import a file, or use the current query. Records needing review will appear first.</p>
      </div>
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
  const emptyState = workspace.querySelector('[data-bib-bulk-empty]');
  const cancelButton = workspace.querySelector('[data-bib-bulk-cancel]');
  const downloadButton = workspace.querySelector('[data-bib-bulk-download]');
  const marcButton = workspace.querySelector('[data-bib-bulk-marc]');
  const marcxmlButton = workspace.querySelector('[data-bib-bulk-marcxml]');
  let requestId = 0;
  let results = [];
  let activeResultFilter = 'all';
  let activeRunId = '';
  let activeRequestController = null;
  let activeTotal = 0;
  let activeStartedAt = null;
  let progressSnapshot = { completed: 0, total: 0 };
  let progressEtaTimer = null;
  let activeInputMode = 'local';

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
        createElement('span', '', result.lookup_type === 'spreadsheet'
          ? `Spreadsheet evidence: ${result.input_metadata?.row_label || result.original || result.input}`
          : `${result.lookup_type.replaceAll('_', ' ')}: ${result.original || result.input}`)
      );
      const local = createElement('div', 'bib-bulk-result-local');
      const advice = String(result.review?.advice || '').replaceAll('_', ' ');
      const confidence = Number.isFinite(Number(result.review?.overall_score))
        ? ` · ${Number(result.review.overall_score)}/100${advice ? ` ${advice}` : ''}`
        : '';
      const source = bibliographicSource(result);
      local.append(
        createElement('span', '', result.lookup_type === 'spreadsheet'
          ? 'Matched directly from spreadsheet metadata'
          : (result.local?.catalog_key ? `Catalog ${result.local.catalog_key}` : 'No single local record')),
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
    const downloadableCount = downloadableExternalRequests(results).length;
    marcButton.disabled = downloadableCount === 0;
    marcxmlButton.disabled = downloadableCount === 0;
    for (const button of [marcButton, marcxmlButton]) {
      button.setAttribute('data-tooltip', downloadableCount
        ? `Download ${downloadableCount.toLocaleString()} recommended matched record${downloadableCount === 1 ? '' : 's'}`
        : 'No recommended matches are available yet');
    }
    downloadButton.setAttribute(
      'data-tooltip',
      results.length ? 'Download the completed hydration review as Excel' : 'Available after at least one record has been reviewed'
    );
    emptyState?.classList.toggle('hidden', results.length > 0 || progressSnapshot.total > 0);
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
    emptyState?.classList.toggle('hidden', total > 0 || results.length > 0);
  }

  async function run(entries, options = {}) {
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
    activeInputMode = options.mode === 'spreadsheet' ? 'spreadsheet' : 'local';
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
        source_description: activeInputMode === 'spreadsheet'
          ? 'Spreadsheet cataloging review'
          : 'Bulk hydration review'
      });
      activeRunId = data.run_id || '';
      if (!activeRunId) throw new Error('The saved Hydration run did not return an identifier.');
      activeStartedAt = parseHydrationTimestamp(data.metadata?.start_time) || activeStartedAt;
      setProgress(0, entries.length, 'Resolving OCLC and Library of Congress records...');
    } catch (error) {
      setSearchStatus(getClientErrorMessage(error, { fallback: 'The Hydration run could not be saved. Try again.' }), 'error');
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
            }, activeInputMode),
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
          const message = getClientErrorMessage(error, { fallback: 'This batch could not be resolved. Try it again.' });
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
      setSearchStatus(getClientErrorMessage(error, { fallback: 'The saved Hydration run could not be loaded. Try again.' }), 'error');
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
      setSearchStatus(getClientErrorMessage(error, { fallback: 'The Hydration run could not be canceled. Refresh and try again.' }), 'error');
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
      setSearchStatus(getClientErrorMessage(error, { fallback: 'The review workbook could not be created. Try again.' }), 'error');
    } finally {
      downloadButton.disabled = false;
    }
  });
  async function downloadMarcBatch(format, button) {
    if (button.disabled) return;
    for (const candidate of [marcButton, marcxmlButton, downloadButton]) candidate.disabled = true;
    try {
      const total = downloadableExternalRequests(results).length;
      setProgress(0, total, `Preparing ${format === 'marcxml' ? 'MARCXML' : 'MARC'} records...`);
      const batch = await retrieveBatchBibRecords(results, {
        onProgress: ({ completed, total: batchTotal }) => setProgress(
          completed,
          batchTotal,
          'Retrieving selected external records...'
        )
      });
      downloadBatchBibRecords(batch.records, format);
      const suffix = batch.failures.length
        ? ` ${batch.failures.length.toLocaleString()} record(s) could not be retrieved.`
        : '';
      setSearchStatus(
        `${batch.records.length.toLocaleString()} matched record(s) downloaded.${suffix}`,
        batch.failures.length ? 'warning' : 'success'
      );
    } catch (error) {
      setSearchStatus(getClientErrorMessage(error, { fallback: 'The MARC download could not be created. Try again.' }), 'error');
    } finally {
      renderResults();
      setProgress(results.length, results.length, 'Download preparation finished.');
    }
  }
  marcButton.addEventListener('click', () => downloadMarcBatch('marc', marcButton));
  marcxmlButton.addEventListener('click', () => downloadMarcBatch('marcxml', marcxmlButton));
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
  const sheetSelect = workspace.querySelector('[data-bib-file-sheet]');
  const columnSelect = workspace.querySelector('[data-bib-file-column]');
  const sourceSelect = workspace.querySelector('[data-bib-bulk-source]');
  const mappingPanel = workspace.querySelector('[data-bib-spreadsheet-mapping]');
  const mappingList = workspace.querySelector('[data-bib-spreadsheet-mapping-list]');
  const rowCount = workspace.querySelector('[data-bib-spreadsheet-row-count]');
  const submitLabel = workspace.querySelector('[data-bib-bulk-submit-label]');
  let fileData = null;
  let workbookData = null;
  let spreadsheetMappings = {};
  let workflowSelectedByUser = false;

  function spreadsheetMode() {
    return sourceSelect.value === 'spreadsheet';
  }

  function syncInputMode() {
    const spreadsheet = spreadsheetMode();
    workspace.querySelectorAll('[data-bib-local-input]').forEach(element => {
      element.classList.toggle('hidden', spreadsheet);
    });
    mappingPanel.classList.toggle('hidden', !spreadsheet || !fileData);
    workspace.querySelector('[data-bib-file-column-wrap]')?.classList.toggle(
      'hidden',
      spreadsheet || (fileData?.columns.length || 0) < 2
    );
    submitLabel.textContent = spreadsheet ? 'Review spreadsheet rows' : 'Review records';
  }

  function renderSpreadsheetMappings() {
    mappingList.replaceChildren();
    spreadsheetMappings = {};
    for (const column of fileData?.columns || []) {
      const mappingRow = document.createElement('label');
      mappingRow.className = 'bib-spreadsheet-mapping-row';
      const name = document.createElement('span');
      name.textContent = column.label;
      const select = document.createElement('select');
      select.dataset.columnIndex = String(column.index);
      for (const field of SPREADSHEET_FIELDS) {
        const option = document.createElement('option');
        option.value = field.value;
        option.textContent = field.label;
        select.appendChild(option);
      }
      select.value = column.spreadsheetField || '';
      spreadsheetMappings[column.index] = select.value;
      select.addEventListener('change', () => {
        spreadsheetMappings[column.index] = select.value;
      });
      mappingRow.append(name, select);
      mappingList.appendChild(mappingRow);
    }
    rowCount.textContent = `${(fileData?.rows.length || 0).toLocaleString()} data rows`;
  }

  function applyFileColumn() {
    if (!fileData) return;
    const values = valuesFromColumn(fileData, Number(columnSelect.value || 0));
    textarea.value = values.join('\n');
    const column = fileData.columns[Number(columnSelect.value || 0)];
    setSearchStatus(`${values.length.toLocaleString()} values imported from ${column?.label || 'the selected column'}.`, 'success');
  }

  function applyParsedFileData() {
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
    renderSpreadsheetMappings();
    if (!workflowSelectedByUser && fileData.columns.filter(column => column.spreadsheetField).length >= 2) {
      sourceSelect.value = 'spreadsheet';
    }
    syncInputMode();
    if (spreadsheetMode()) {
      setSearchStatus(`${fileData.rows.length.toLocaleString()} spreadsheet rows loaded. Review the column mapping, then match.`, 'success');
    } else {
      applyFileColumn();
    }
  }

  function applyWorkbookSheet() {
    if (!workbookData) return;
    const sheet = workbookData.sheets[Number(sheetSelect.value || 0)];
    fileData = inputDataFromRows(sheet?.rows || []);
    applyParsedFileData();
  }

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    workflowSelectedByUser = false;
    setSearchStatus(`Reading ${file.name}...`, 'empty');
    try {
      workbookData = isXlsxFile(file) ? await parseXlsxWorkbook(await file.arrayBuffer()) : null;
      sheetSelect.replaceChildren();
      if (workbookData) {
        workbookData.sheets.forEach((sheet, index) => {
          const option = document.createElement('option');
          option.value = String(index);
          option.textContent = sheet.name;
          sheetSelect.appendChild(option);
        });
        workspace.querySelector('[data-bib-file-sheet-wrap]')?.classList.toggle('hidden', workbookData.sheets.length < 2);
        applyWorkbookSheet();
      } else {
        workspace.querySelector('[data-bib-file-sheet-wrap]')?.classList.add('hidden');
        fileData = parseInputFile(await file.text(), file.name);
        applyParsedFileData();
      }
    } catch (error) {
      fileData = null;
      workbookData = null;
      textarea.value = '';
      workspace.querySelector('[data-bib-file-sheet-wrap]')?.classList.add('hidden');
      workspace.querySelector('[data-bib-file-column-wrap]')?.classList.add('hidden');
      setSearchStatus(getClientErrorMessage(error, { fallback: 'The selected file could not be imported. Check the file and try again.' }), 'error');
    } finally {
      fileInput.value = '';
    }
  });
  sheetSelect.addEventListener('change', applyWorkbookSheet);
  columnSelect.addEventListener('change', applyFileColumn);
  sourceSelect.addEventListener('change', () => {
    workflowSelectedByUser = true;
    syncInputMode();
    if (!spreadsheetMode() && fileData) applyFileColumn();
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (spreadsheetMode()) {
      if (!fileData) {
        setSearchStatus('Import an Excel, CSV, or TSV file before matching spreadsheet rows.', 'error');
        return;
      }
      const entries = buildSpreadsheetEntries(fileData, spreadsheetMappings);
      if (!entries.length) {
        setSearchStatus('Map a title or standard identifier column before matching.', 'error');
        return;
      }
      controller.run(entries, { mode: 'spreadsheet' });
      return;
    }
    const entries = buildBulkEntries(splitPastedValues(textarea.value), typeSelect.value);
    if (!entries.length) {
      setSearchStatus('Paste values or choose a text, CSV, TSV, or Excel file first.', 'error');
      textarea.focus();
      return;
    }
    controller.run(entries, { mode: 'local' });
  });
  syncInputMode();
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
