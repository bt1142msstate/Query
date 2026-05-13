import { BackendApi } from '../core/backendApi.js';
import { escapeHtml } from '../core/html.js';
import { readStreamedQueryText } from '../core/queryStream.js';

let loadState = null;

function getActiveQueryId() {
  return loadState?.queryId || null;
}

function getRowDetail() {
  if (!loadState || loadState.rowsLoaded <= 0) {
    return 'Waiting for rows...';
  }
  return `${loadState.rowsLoaded.toLocaleString()} ${loadState.rowsLoaded === 1 ? 'row' : 'rows'} received`;
}

function updateDom() {
  const progressEl = document.querySelector('[data-history-result-load-progress]');
  if (!progressEl || !loadState) return;
  progressEl.querySelector('[data-history-result-load-title]').textContent = loadState.title;
  progressEl.querySelector('[data-history-result-load-detail]').textContent = getRowDetail();
}

function start(query, options = {}) {
  loadState = {
    queryId: query?.id || '',
    rowsLoaded: 0,
    title: query?.running ? 'Loading partial results' : 'Loading saved results',
    queryName: query?.name || query?.id || 'Selected query'
  };
  options.render?.();
  updateDom();
}

function updateRowsLoaded(rowsLoaded) {
  if (!loadState) return;
  loadState.rowsLoaded = Math.max(0, Number(rowsLoaded) || 0);
  updateDom();
}

function clear(options = {}) {
  if (!loadState) return;
  loadState = null;
  options.render?.();
}

function render() {
  if (!loadState) return '';
  const safeTitle = escapeHtml(loadState.title);
  const safeName = escapeHtml(loadState.queryName);
  const safeDetail = escapeHtml(getRowDetail());

  return `
    <div class="history-result-load-progress" data-history-result-load-progress role="status" aria-live="polite">
      <div class="history-result-load-copy">
        <span class="history-result-load-kicker">Results load</span>
        <strong data-history-result-load-title>${safeTitle}</strong>
        <span>${safeName}</span>
      </div>
      <div class="history-result-load-meter">
        <span data-history-result-load-detail>${safeDetail}</span>
        <div class="history-result-load-track" aria-hidden="true"><span></span></div>
      </div>
    </div>
  `;
}

async function fetchResults(queryId) {
  const response = await BackendApi.request({ action: 'get_results', query_id: queryId });
  const contentType = response.headers.get('Content-Type') || '';

  if (contentType.includes('application/json')) {
    const data = await BackendApi.parseJsonResponse(response);
    throw BackendApi.buildHttpError(response, {
      ...data,
      error: data?.error || 'Results are not available yet.'
    });
  }

  if (!response.ok) {
    const text = await response.text();
    throw BackendApi.buildHttpError(response, { error: text });
  }

  const streamedPayload = await readStreamedQueryText(response, {
    onProgress: updateRowsLoaded
  });
  updateRowsLoaded(streamedPayload.lines?.length || 0);
  return { response, ...streamedPayload };
}

const HistoryResultProgress = Object.freeze({
  clear,
  fetchResults,
  getActiveQueryId,
  render,
  start,
  updateRowsLoaded
});

export { HistoryResultProgress };
