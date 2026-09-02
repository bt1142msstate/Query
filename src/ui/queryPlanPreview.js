import { BackendApi } from '../core/backendApi.js';
import { getSession } from '../core/authSession.js';
import { QueryStateReaders } from '../core/queryState.js';
import { QueryStateSubscriptions } from '../core/queryStateSubscriptions.js';
import { buildBackendQueryPayload } from '../features/filters/queryPayload.js';
import { estimateColdStartQueryPlan, mergeQueryPlanEstimate, queryPlanSignature } from '../core/queryPlanEstimate.js';

const PLAN_DEBOUNCE_MS = 350;
const AGGREGATE_TTL_MS = 15 * 60 * 1000;
let timer = null;
let revision = 0;
let planController = null;
let aggregateCache = null;
let aggregateCachedAt = 0;
let aggregatePromise = null;
let cachedPlan = null;

function previewElements() {
  return [...document.querySelectorAll('[data-query-plan-preview]')];
}

function compactEta(text) {
  return text.replace(/^(ETA · Likely \d+–\d+\+? (?:sec|min)).*$/u, '$1');
}

function renderPreview(state, text, detail = '') {
  previewElements().forEach(element => {
    element.hidden = false;
    element.dataset.state = state;
    const label = element.querySelector('[data-query-plan-preview-label]') || element;
    label.textContent = element.hasAttribute('data-query-plan-preview-compact')
      ? compactEta(text)
      : text;
    element.title = detail || text;
  });
  const formRun = document.querySelector('#form-mode-run');
  if (formRun) {
    const compact = compactEta(text).replace(/^ETA · Likely /u, '');
    formRun.textContent = state === 'waiting' ? 'Run Form' : `Run · ${compact}`;
    formRun.setAttribute('aria-label', state === 'waiting' ? 'Run form' : `Run form. Estimated time ${compact}`);
    formRun.title = detail || text;
  }
}

function cachePlan(payload, plan, backendReady = false) {
  cachedPlan = { signature: queryPlanSignature(payload), plan, backendReady };
  return plan;
}

function getCachedQueryPlan(payload, options = {}) {
  if (cachedPlan?.signature !== queryPlanSignature(payload)) return null;
  return options.requireBackend && !cachedPlan.backendReady ? null : cachedPlan.plan;
}

async function getAggregateSnapshot() {
  if (aggregateCache && Date.now() - aggregateCachedAt < AGGREGATE_TTL_MS) return aggregateCache;
  if (aggregatePromise) return aggregatePromise;
  aggregatePromise = BackendApi.postJson({
    action: 'library_dashboard', library: 'all', item_type: 'all', active_window_days: 365, reporting_period: '365'
  }, { timeoutMs: 5000, notifyOnRateLimit: false })
    .then(response => {
      aggregateCache = response.data || null;
      aggregateCachedAt = Date.now();
      return aggregateCache;
    })
    .finally(() => { aggregatePromise = null; });
  return aggregatePromise;
}

async function refreshPreview(payload, requestRevision, signal) {
  const [planResult, aggregateResult] = await Promise.allSettled([
    BackendApi.postJson({ ...payload, action: 'query_plan' }, { timeoutMs: 3000, notifyOnRateLimit: false, signal }),
    getAggregateSnapshot()
  ]);
  if (requestRevision !== revision) return;
  const backendPlan = planResult.status === 'fulfilled'
    ? planResult.value.data?.data || planResult.value.data || null
    : null;
  const aggregate = aggregateResult.status === 'fulfilled' ? aggregateResult.value : aggregateCache;
  const plan = cachePlan(payload, mergeQueryPlanEstimate(payload, backendPlan, aggregate), planResult.status === 'fulfilled');
  renderPreview('ready', `ETA · ${plan.eta.label}`, plan.explanation);
}

function scheduleQueryPlanPreview() {
  clearTimeout(timer);
  planController?.abort();
  planController = null;
  revision += 1;
  const requestRevision = revision;
  if (!getSession() || QueryStateReaders.getLifecycleState().queryRunning) {
    renderPreview('waiting', 'ETA · available when the form is ready');
    return;
  }
  const payload = buildBackendQueryPayload();
  if (!payload.display_fields?.length) {
    cachedPlan = null;
    renderPreview('waiting', 'ETA · add a display field');
    return;
  }
  const immediate = cachePlan(payload, estimateColdStartQueryPlan(payload, aggregateCache));
  renderPreview('estimating', `ETA · ${immediate.eta.label}`, 'Refining with the current collection aggregate and backend filter plan.');
  timer = setTimeout(() => {
    planController = new AbortController();
    void refreshPreview(payload, requestRevision, planController.signal);
  }, PLAN_DEBOUNCE_MS);
}

QueryStateSubscriptions.subscribe(scheduleQueryPlanPreview, { displayedFields: true, activeFilters: true });
window.addEventListener('query-auth:changed', scheduleQueryPlanPreview);
window.addEventListener('query-app:ready', scheduleQueryPlanPreview);

export { getCachedQueryPlan, scheduleQueryPlanPreview };
