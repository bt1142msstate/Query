import { BackendApi } from '../core/backendApi.js';
import { getSession } from '../core/authSession.js';
import { QueryChangeManager, QueryStateReaders } from '../core/queryState.js';
import { QueryStateSubscriptions } from '../core/queryStateSubscriptions.js';
import { buildBackendQueryPayload } from '../features/filters/queryPayload.js';
import { estimateColdStartQueryPlan, mergeQueryPlanEstimate, queryPlanSignature } from '../core/queryPlanEstimate.js';
import {
  areFilterFieldOrdersEqual,
  buildPlannedFilterFieldOrder,
  getActiveFilterFieldNames
} from '../core/queryPlanOrdering.js';
import {
  setSmartFilterOrderingPreference,
  shouldUseSmartFilterOrdering
} from '../core/queryPreferences.js';
import { buildOrderExplanation } from '../core/queryPlanOrderExplanation.js';

const PLAN_DEBOUNCE_MS = 350;
const AGGREGATE_TTL_MS = 15 * 60 * 1000;
let timer = null;
let revision = 0;
let planController = null;
let aggregateCache = null;
let aggregateCachedAt = 0;
let aggregatePromise = null;
let cachedPlan = null;

function syncSmartOrderingToggle() {
  const toggle = document.getElementById('planning-badge');
  if (!toggle) return;
  const enabled = shouldUseSmartFilterOrdering();
  toggle.dataset.enabled = enabled ? 'true' : 'false';
  toggle.setAttribute('aria-pressed', enabled ? 'true' : 'false');
  toggle.setAttribute('aria-label', `Smart filter ordering ${enabled ? 'on' : 'off'}. Click to ${enabled ? 'preserve the displayed filter order' : 'automatically use the fastest safe filter order'}.`);
  toggle.title = enabled
    ? 'Smart ordering is on. Query meaning stays the same; the lowest-cost valid Sirsi route runs first.'
    : 'Smart ordering is off. Filters run in the order shown.';
  const state = toggle.querySelector('[data-smart-query-state]');
  if (state) state.textContent = enabled ? 'On' : 'Off';
}

function initializeSmartOrderingToggle() {
  const toggle = document.getElementById('planning-badge');
  if (!toggle || toggle.dataset.bound === 'true') return;
  toggle.dataset.bound = 'true';
  toggle.addEventListener('click', () => {
    setSmartFilterOrderingPreference(!shouldUseSmartFilterOrdering());
    cachedPlan = null;
    syncSmartOrderingToggle();
    scheduleQueryPlanPreview();
  });
  syncSmartOrderingToggle();
}

function applySmartFilterOrder(plan) {
  if (!shouldUseSmartFilterOrdering()) return false;
  const activeFilters = QueryStateReaders.getActiveFilters();
  const currentOrder = getActiveFilterFieldNames(activeFilters);
  const plannedOrder = buildPlannedFilterFieldOrder(plan, activeFilters);
  if (plannedOrder.length < 2 || areFilterFieldOrdersEqual(currentOrder, plannedOrder)) {
    return false;
  }

  return QueryChangeManager.reorderFilterGroups(plannedOrder, {
    source: 'QueryPlanPreview.applySmartFilterOrder',
    toast: false
  }) === true;
}

function previewElements() {
  return [...document.querySelectorAll('[data-query-plan-preview]')];
}

function compactEta(text) {
  return text.replace(/^(ETA · Likely \d+–\d+\+? (?:sec|min)).*$/u, '$1');
}

function formatSeconds(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds)) return 'Unavailable';
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))} sec`;
  return `${Math.max(1, Math.round(seconds / 60))} min`;
}

function formatCount(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.round(number)).toLocaleString() : 'Unavailable';
}

function formatBytes(value) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes)) return 'Unavailable';
  if (bytes < 1024 * 1024) return `${Math.max(0, Math.round(bytes / 1024)).toLocaleString()} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

function appendMetric(grid, label, value) {
  const metric = document.createElement('div');
  metric.className = 'query-plan-details-metric';
  const small = document.createElement('small');
  small.textContent = label;
  const strong = document.createElement('strong');
  strong.textContent = value;
  metric.append(small, strong);
  grid.append(metric);
}

function appendOrderExplanation(panel, plan) {
  const explanation = buildOrderExplanation(plan);
  if (!explanation) return;

  const section = document.createElement('section');
  section.className = 'query-plan-order-explanation';
  const heading = document.createElement('h3');
  heading.className = 'query-plan-order-explanation-title';
  heading.textContent = explanation.title;
  const summary = document.createElement('p');
  summary.textContent = explanation.summary;
  section.append(heading, summary);
  if (explanation.items.length) {
    const list = document.createElement('ol');
    explanation.items.forEach(item => {
      const row = document.createElement('li');
      const field = document.createElement('strong');
      field.textContent = item.field;
      const detail = document.createElement('span');
      detail.textContent = item.detail;
      row.append(field, detail);
      list.append(row);
    });
    section.append(list);
  }
  panel.append(section);
}

function renderPlanDetails(plan = null) {
  const panel = document.getElementById('query-plan-details');
  if (!panel) return;
  panel.replaceChildren();
  if (!plan?.eta?.available) {
    panel.classList.add('hidden');
    document.getElementById('query-plan-preview')?.setAttribute('aria-expanded', 'false');
    return;
  }
  const header = document.createElement('div');
  header.className = 'query-plan-details-header';
  const title = document.createElement('strong');
  title.textContent = 'Estimate details';
  const confidence = document.createElement('span');
  confidence.className = 'query-plan-details-confidence';
  confidence.textContent = `${plan.eta.confidence || 'low'} confidence`;
  header.append(title, confidence);
  const grid = document.createElement('div');
  grid.className = 'query-plan-details-grid';
  appendMetric(grid, 'Likely (P50)', formatSeconds(plan.eta.p50_seconds ?? plan.eta.median_seconds));
  appendMetric(grid, 'Usually within (P80)', formatSeconds(plan.eta.p80_seconds ?? plan.eta.upper_seconds));
  appendMetric(grid, 'Slower case (P90)', formatSeconds(plan.eta.p90_seconds));
  appendMetric(grid, 'Candidate rows', formatCount(plan.eta.expected_candidates ?? plan.eta.estimated_candidates));
  appendMetric(grid, 'Records scanned', formatCount(plan.eta.expected_scanned_records));
  appendMetric(grid, 'Expected output', `${formatCount(plan.eta.expected_output_rows)} · ${formatBytes(plan.eta.expected_output_bytes)}`);
  const basis = document.createElement('p');
  basis.className = 'query-plan-details-basis';
  const route = Array.isArray(plan.route?.selected) ? plan.route.selected.join(' → ') : '';
  basis.textContent = [plan.eta.basis, route ? `Route: ${route}` : '', plan.explanation].filter(Boolean).join(' · ');
  panel.append(header, grid, basis);
  appendOrderExplanation(panel, plan);
  const stages = Array.isArray(plan.eta.stages) ? plan.eta.stages : [];
  if (stages.length) {
    const stageList = document.createElement('div');
    stageList.className = 'query-plan-details-stages';
    stages.forEach(stage => {
      const row = document.createElement('div');
      row.className = 'query-plan-details-stage';
      const label = document.createElement('span');
      label.textContent = stage.label || stage.id || 'Stage';
      const duration = document.createElement('span');
      duration.textContent = formatSeconds(stage.p50_seconds);
      row.append(label, duration);
      stageList.append(row);
    });
    panel.append(stageList);
  }
  (Array.isArray(plan.eta.warnings) ? plan.eta.warnings : []).forEach(message => {
    const warning = document.createElement('p');
    warning.className = 'query-plan-details-warning';
    warning.textContent = message;
    panel.append(warning);
  });
}

function renderPreview(state, text, detail = '', plan = null) {
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
  if (plan) renderPlanDetails(plan);
  else if (state === 'waiting') renderPlanDetails();
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
    BackendApi.postJson({ ...payload, action: 'query_plan' }, { timeoutMs: 7000, notifyOnRateLimit: false, signal }),
    getAggregateSnapshot()
  ]);
  if (requestRevision !== revision) return;
  const backendPlan = planResult.status === 'fulfilled'
    ? planResult.value.data?.data || planResult.value.data || null
    : null;
  const aggregate = aggregateResult.status === 'fulfilled' ? aggregateResult.value : aggregateCache;
  const plan = mergeQueryPlanEstimate(payload, backendPlan, aggregate);
  const orderChanged = planResult.status === 'fulfilled' && applySmartFilterOrder(plan);
  const effectivePayload = orderChanged ? buildBackendQueryPayload() : payload;
  cachePlan(effectivePayload, plan, planResult.status === 'fulfilled');
  renderPreview('ready', `ETA · ${plan.eta.label}`, plan.explanation, plan);
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
  renderPreview('estimating', `ETA · ${immediate.eta.label}`, 'Refining with the current collection aggregate and backend filter plan.', immediate);
  timer = setTimeout(() => {
    planController = new AbortController();
    void refreshPreview(payload, requestRevision, planController.signal);
  }, PLAN_DEBOUNCE_MS);
}

QueryStateSubscriptions.subscribe(event => {
  if (event?.meta?.source === 'QueryPlanPreview.applySmartFilterOrder') return;
  scheduleQueryPlanPreview();
}, { displayedFields: true, activeFilters: true });
window.addEventListener('query-auth:changed', scheduleQueryPlanPreview);
window.addEventListener('query-app:ready', scheduleQueryPlanPreview);
window.addEventListener('query-smart-ordering:changed', syncSmartOrderingToggle);
initializeSmartOrderingToggle();

const previewButton = document.getElementById('query-plan-preview');
const detailsPanel = document.getElementById('query-plan-details');
previewButton?.addEventListener('click', event => {
  event.stopPropagation();
  if (!cachedPlan?.plan?.eta?.available || !detailsPanel) return;
  const opening = detailsPanel.classList.contains('hidden');
  detailsPanel.classList.toggle('hidden', !opening);
  previewButton.setAttribute('aria-expanded', opening ? 'true' : 'false');
});
document.addEventListener('click', event => {
  if (!detailsPanel || detailsPanel.classList.contains('hidden')) return;
  if (detailsPanel.contains(event.target) || previewButton?.contains(event.target)) return;
  detailsPanel.classList.add('hidden');
  previewButton?.setAttribute('aria-expanded', 'false');
});
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape' || !detailsPanel || detailsPanel.classList.contains('hidden')) return;
  detailsPanel.classList.add('hidden');
  previewButton?.setAttribute('aria-expanded', 'false');
  previewButton?.focus();
});

export { getCachedQueryPlan, initializeSmartOrderingToggle, scheduleQueryPlanPreview, syncSmartOrderingToggle };
