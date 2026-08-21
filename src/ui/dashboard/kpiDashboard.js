import { BackendApi } from '../../core/backendApi.js';
import { appServices } from '../../core/appServices.js';
import { getClientErrorMessage } from '../../core/clientErrorMessages.js';
import { ALL_LIBRARY_SYSTEMS_LABEL, buildLibraryScopeGroups, systemCodeForLibraryScope } from '../../core/libraryScopes.js';
import { onDOMReady } from '../../core/domReady.js';
import { libraryDashboardHasData, normalizeLibraryDashboard } from './libraryDashboardModel.js';
import { downloadLibraryDashboardCsv } from './libraryDashboardExport.js';
import { normalizeDashboardRuns, summarizeDashboardRuns } from './kpiDashboardModel.js';
import { renderLibraryDashboard } from './libraryDashboardView.js';
import { renderDashboard as renderOperationsDashboard } from './kpiDashboardView.js';

let currentView = 'overview';
let libraryData = null;
let operationRuns = [];
let loading = false;
let pendingLoad = false;
let pendingForce = false;
const AUTO_REFRESH_MS = 5 * 60 * 1000;

function getElements() {
  return {
    content: document.getElementById('kpi-dashboard-content'),
    empty: document.getElementById('kpi-dashboard-empty'),
    error: document.getElementById('kpi-dashboard-error'),
    errorMessage: document.getElementById('kpi-dashboard-error-message'),
    export: document.getElementById('kpi-dashboard-export'),
    itemType: document.getElementById('kpi-dashboard-item-type'),
    library: document.getElementById('kpi-dashboard-library'),
    loading: document.getElementById('kpi-dashboard-loading'),
    refresh: document.getElementById('kpi-dashboard-refresh'),
    tabs: [...document.querySelectorAll('[data-kpi-view]')],
    toolbar: document.querySelector('.kpi-dashboard-toolbar'),
    period: document.getElementById('kpi-dashboard-window')
  };
}

function setVisible(element, visible) {
  element?.classList.toggle('hidden', !visible);
}

function replaceOptions(select, baseLabel, options, selected) {
  if (!select) return;
  const normalized = options.map(option => typeof option === 'string'
    ? { value: option, label: option }
    : { value: option.value ?? option.code, label: option.label ?? option.name ?? option.code });
  select.replaceChildren(new Option(baseLabel, 'all'), ...normalized.map(option => new Option(option.label, option.value)));
  select.value = normalized.some(option => option.value === selected) ? selected : 'all';
}

function replaceLibraryOptions(select, systems, libraries, selected) {
  if (!select) return;
  const groups = buildLibraryScopeGroups(systems, libraries);
  const options = groups.flatMap(group => group.options);
  const all = new Option(ALL_LIBRARY_SYSTEMS_LABEL, 'all');
  select.replaceChildren(all, ...groups.map(group => {
    const element = document.createElement('optgroup');
    element.label = group.label;
    element.append(...group.options.map(option => new Option(option.label, option.value)));
    return element;
  }));
  select.value = options.some(option => option.value === selected) ? selected : 'all';
}

function syncFilterOptions(elements) {
  if (!libraryData) return;
  replaceLibraryOptions(
    elements.library,
    libraryData.filters.systems,
    libraryData.filters.libraries,
    elements.library?.value || 'all'
  );
  replaceOptions(elements.itemType, 'All item types', libraryData.filters.itemTypes, elements.itemType?.value || 'all');
  syncPeriodOptions(elements);
}

function syncPeriodOptions(elements) {
  if (!elements.period || !libraryData) return;
  const selected = elements.period.value || '365';
  const library = elements.library?.value || 'all';
  const system = systemCodeForLibraryScope(library);
  const rolling = [
    { value: '90', label: 'Last 90 days' },
    { value: '365', label: 'Last 12 months' },
    { value: '730', label: 'Last 24 months' }
  ];
  const fiscal = Array.isArray(libraryData.filters.fiscalPeriodsBySystem?.[system])
    ? libraryData.filters.fiscalPeriodsBySystem[system] : [];
  const calendar = Array.isArray(libraryData.filters.calendarPeriods) ? libraryData.filters.calendarPeriods : [];
  const groups = [
    { label: 'Rolling periods', options: rolling },
    { label: 'Calendar years', options: calendar },
    { label: 'Fiscal years', options: fiscal }
  ].filter(group => group.options.length > 0);
  const options = groups.flatMap(group => group.options);
  elements.period.replaceChildren(...groups.map(group => {
    const element = document.createElement('optgroup');
    element.label = group.label;
    element.append(...group.options.map(option => new Option(option.label, option.value)));
    return element;
  }));
  elements.period.value = options.some(option => option.value === selected) ? selected : '365';
}

function syncViewChrome(elements) {
  elements.tabs.forEach(tab => {
    const selected = tab.dataset.kpiView === currentView;
    tab.setAttribute('aria-selected', selected ? 'true' : 'false');
    tab.tabIndex = selected ? 0 : -1;
  });
  elements.toolbar?.classList.toggle('hidden', currentView === 'operations');
  if (elements.itemType) {
    elements.itemType.disabled = currentView === 'patrons';
    if (currentView === 'patrons') elements.itemType.title = 'Item type does not apply to patron aggregates.';
    else elements.itemType.removeAttribute('title');
  }
}

function render() {
  const elements = getElements();
  if (!elements.content) return;
  syncViewChrome(elements);
  const operations = currentView === 'operations';
  const hasData = operations ? operationRuns.length > 0 : libraryDashboardHasData(libraryData);
  setVisible(elements.empty, !loading && !hasData);
  setVisible(elements.content, !loading && hasData);
  if (!hasData) return;
  if (operations) {
    const now = Date.now();
    const summary = summarizeDashboardRuns(operationRuns, { range: '30', kind: 'all', staff: 'all', now });
    elements.content.innerHTML = renderOperationsDashboard(summary, {
      range: '30', now, refreshedAt: now, isSampleData: Boolean(libraryData?.isSampleData)
    });
  } else {
    elements.content.innerHTML = renderLibraryDashboard(libraryData, currentView);
  }
}

function requestPayload(elements) {
  const reportingPeriod = elements.period?.value || '365';
  return {
    action: 'library_dashboard',
    library: elements.library?.value || 'all',
    item_type: elements.itemType?.value || 'all',
    active_window_days: /^\d+$/.test(reportingPeriod) ? Number(reportingPeriod) : 365,
    reporting_period: reportingPeriod
  };
}

async function loadOperations() {
  const { data } = await BackendApi.postJson({ action: 'status', dashboard: true }, { notifyOnRateLimit: true });
  operationRuns = normalizeDashboardRuns(data);
}

async function loadLibraryDashboard({ force = false } = {}) {
  const elements = getElements();
  const { data } = await BackendApi.postJson({ ...requestPayload(elements), force_refresh: Boolean(force) }, { notifyOnRateLimit: true });
  libraryData = normalizeLibraryDashboard(data);
  syncFilterOptions(elements);
}

async function loadDashboard({ force = false } = {}) {
  if (loading) {
    pendingLoad = true;
    pendingForce = pendingForce || Boolean(force);
    return;
  }
  const elements = getElements();
  loading = true;
  elements.refresh?.setAttribute('aria-busy', 'true');
  if (elements.refresh) elements.refresh.disabled = true;
  setVisible(elements.loading, true);
  setVisible(elements.error, false);
  setVisible(elements.empty, false);
  setVisible(elements.content, false);
  try {
    if (currentView === 'operations') await loadOperations();
    else await loadLibraryDashboard({ force });
    loading = false;
    render();
  } catch (error) {
    const message = getClientErrorMessage(error, { fallback: 'The dashboard could not be loaded. Try refreshing it.' });
    if (elements.errorMessage) elements.errorMessage.textContent = message;
    setVisible(elements.error, true);
  } finally {
    loading = false;
    elements.refresh?.removeAttribute('aria-busy');
    if (elements.refresh) elements.refresh.disabled = false;
    setVisible(elements.loading, false);
    if (pendingLoad) {
      const forceNextLoad = pendingForce;
      pendingLoad = false;
      pendingForce = false;
      void loadDashboard({ force: forceNextLoad });
    }
  }
}

function openOpportunityQuery(button) {
  let payload;
  try { payload = JSON.parse(button.dataset.kpiQuery || '{}'); } catch (_) { return; }
  const config = {
    id: `dashboard-${Date.now()}`,
    name: payload.name || 'Dashboard follow-up',
    jsonConfig: {
      Filters: payload.filters || [],
      DesiredColumnOrder: payload.display_fields || []
    }
  };
  if (appServices.applyHistoryQueryConfig(config) !== false) {
    appServices.closeModalPanel?.('kpi-dashboard-panel');
  }
}

onDOMReady(() => {
  const elements = getElements();
  elements.refresh?.addEventListener('click', () => loadDashboard({ force: true }));
  elements.export?.addEventListener('click', () => {
    if (libraryData && currentView !== 'operations') downloadLibraryDashboardCsv(libraryData, currentView);
  });
  elements.library?.addEventListener('change', () => {
    syncPeriodOptions(getElements());
    loadDashboard();
  });
  [elements.itemType, elements.period].forEach(control => control?.addEventListener('change', () => loadDashboard()));
  elements.tabs.forEach(tab => tab.addEventListener('click', () => {
    currentView = tab.dataset.kpiView || 'overview';
    syncViewChrome(getElements());
    if ((currentView === 'operations' && !operationRuns.length) || (currentView !== 'operations' && !libraryData)) loadDashboard();
    else render();
  }));
  elements.content?.addEventListener('click', event => {
    const button = event.target.closest('[data-kpi-query]');
    if (button) openOpportunityQuery(button);
  });
  window.addEventListener('query-dashboard:open', () => loadDashboard());
  window.setInterval(() => {
    const panel = document.getElementById('kpi-dashboard-panel');
    if (panel && !panel.classList.contains('hidden') && currentView !== 'operations') loadDashboard();
  }, AUTO_REFRESH_MS);
});

export { loadDashboard };
