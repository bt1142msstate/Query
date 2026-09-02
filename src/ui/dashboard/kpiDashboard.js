import { BackendApi } from '../../core/backendApi.js';
import { appServices } from '../../core/appServices.js';
import { getClientErrorMessage } from '../../core/clientErrorMessages.js';
import { ALL_LIBRARY_SYSTEMS_LABEL, buildLibraryScopeSelectorValues, summarizeLibraryScopeSelection, systemCodeForLibraryScope } from '../../core/libraryScopes.js';
import { onDOMReady } from '../../core/domReady.js';
import { toast } from '../../core/toast.js';
import { SelectorControls } from '../controls/selectorControls.js';
import { libraryDashboardHasData, normalizeLibraryDashboard } from './libraryDashboardModel.js';
import { downloadLibraryDashboardCsv } from './libraryDashboardExport.js';
import { normalizeDashboardRuns, summarizeDashboardRuns } from './kpiDashboardModel.js';
import { renderLibraryDashboard } from './libraryDashboardView.js';
import { renderDashboard as renderOperationsDashboard } from './kpiDashboardView.js';
import { createReportingPeriodPicker } from './reportingPeriodPicker.js';

let currentView = 'overview';
let libraryData = null;
let operationRuns = [];
let loading = false;
let pendingLoad = false;
let pendingForce = false;
let periodComparison = 'previous';
const scopeHistory = [];
const AUTO_REFRESH_MS = 5 * 60 * 1000;

function getElements() {
  return {
    content: document.getElementById('kpi-dashboard-content'),
    empty: document.getElementById('kpi-dashboard-empty'),
    error: document.getElementById('kpi-dashboard-error'),
    errorMessage: document.getElementById('kpi-dashboard-error-message'),
    export: document.getElementById('kpi-dashboard-export'),
    itemType: document.getElementById('kpi-dashboard-item-type'),
    itemTypeFilter: document.querySelector('.kpi-dashboard-item-type-filter'),
    library: document.getElementById('kpi-dashboard-library'),
    loading: document.getElementById('kpi-dashboard-loading'),
    refresh: document.getElementById('kpi-dashboard-refresh'),
    shell: document.getElementById('kpi-dashboard-shell'),
    tabs: [...document.querySelectorAll('[data-kpi-view]')],
    toolbar: document.querySelector('.kpi-dashboard-toolbar'),
    period: document.getElementById('kpi-dashboard-window')
  };
}

function setVisible(element, visible) {
  element?.classList.toggle('hidden', !visible);
}

function selectedLibraryScopes(control) {
  return control?.getSelectedValues?.() || [];
}

function selectedItemTypes(control) {
  return control?.getSelectedValues?.() || [];
}

function replaceLibraryOptions(container, systems, libraries, selected) {
  if (!container) return;
  const values = buildLibraryScopeSelectorValues(systems, libraries);
  const available = new Set(values.map(option => option.RawValue));
  const validSelection = (Array.isArray(selected) ? selected : []).filter(value => available.has(value));
  const signature = JSON.stringify(values.map(option => [option.RawValue, option.Display, option.Group]));
  if (container.dataset.optionsSignature === signature && container.getSelectedValues) {
    container.setSelectedValues(validSelection);
    return;
  }

  container.querySelector('.form-mode-popup-list-control')?._cleanupPopup?.();
  const selector = SelectorControls.createGroupedSelector(values, true, validSelection, {
    enableGrouping: true,
    allSelectionLabel: ALL_LIBRARY_SYSTEMS_LABEL,
    allSelectionDescription: 'Include every library system.',
    groupSelectionLabel: 'Entire system',
    groupSelectionDescription: 'Select every library in this system.',
    containerId: null
  });
  selector.getSelectedDisplayValues = () => summarizeLibraryScopeSelection(
    selector.getSelectedValues(), systems, libraries
  );
  const popup = SelectorControls.createPopupListControl(
    selector,
    'Library or system',
    ALL_LIBRARY_SYSTEMS_LABEL
  );
  container.replaceChildren(popup);
  container.dataset.optionsSignature = signature;
  container.getSelectedValues = () => popup.getSelectedValues();
  container.setSelectedValues = valuesToSet => popup.setSelectedValues(valuesToSet);
  container.setDisabled = (disabled, description) => popup.setDisabled(disabled, description);
}

function replaceItemTypeOptions(container, itemTypes, selected) {
  if (!container) return;
  const values = (Array.isArray(itemTypes) ? itemTypes : []).map(option => {
    const value = typeof option === 'string' ? option : option.value ?? option.code;
    const label = typeof option === 'string' ? option : option.label ?? option.name ?? option.code;
    return { Name: label, RawValue: value };
  });
  const available = new Set(values.map(option => option.RawValue));
  const validSelection = (Array.isArray(selected) ? selected : []).filter(value => available.has(value));
  const signature = JSON.stringify(values.map(option => [option.RawValue, option.Name]));
  if (container.dataset.optionsSignature === signature && container.getSelectedValues) {
    container.setSelectedValues(validSelection);
    return;
  }

  container.querySelector('.form-mode-popup-list-control')?._cleanupPopup?.();
  const selector = SelectorControls.createGroupedSelector(values, true, validSelection, {
    enableGrouping: false,
    allSelectionLabel: 'All item types',
    allSelectionDescription: 'Include every item type.',
    containerId: null
  });
  const popup = SelectorControls.createPopupListControl(selector, 'Item type', 'All item types');
  container.replaceChildren(popup);
  container.dataset.optionsSignature = signature;
  container.getSelectedValues = () => popup.getSelectedValues();
  container.setSelectedValues = valuesToSet => popup.setSelectedValues(valuesToSet);
  container.setDisabled = (disabled, description) => popup.setDisabled(disabled, description);
}

function syncFilterOptions(elements) {
  if (!libraryData) return;
  replaceLibraryOptions(
    elements.library,
    libraryData.filters.systems,
    libraryData.filters.libraries,
    selectedLibraryScopes(elements.library)
  );
  replaceItemTypeOptions(elements.itemType, libraryData.filters.itemTypes, selectedItemTypes(elements.itemType));
  syncPeriodOptions(elements);
}

function syncPeriodOptions(elements) {
  if (!elements.period || !libraryData) return;
  const picker = elements.period._reportingPeriodPicker || createReportingPeriodPicker(elements.period, { value: '365' });
  const selectedLibraries = selectedLibraryScopes(elements.library);
  const selectedSystems = new Set(selectedLibraries.map(systemCodeForLibraryScope).filter(Boolean));
  const system = selectedSystems.size === 1 ? [...selectedSystems][0] : '';
  const fiscal = Array.isArray(libraryData.filters.fiscalPeriodsBySystem?.[system])
    ? libraryData.filters.fiscalPeriodsBySystem[system] : [];
  const calendar = Array.isArray(libraryData.filters.calendarPeriods) ? libraryData.filters.calendarPeriods : [];
  picker.setOptions({
    calendar,
    fiscal,
    fiscalAvailable: selectedSystems.size === 1 && fiscal.length > 0,
    fiscalMessage: selectedSystems.size > 1
      ? 'The selected libraries use more than one fiscal calendar.'
      : 'Select a library or an entire system so its fiscal year can be identified.',
    metrics: libraryData.circulation
  });
  periodComparison = picker.comparison;
}

function syncViewChrome(elements) {
  elements.tabs.forEach(tab => {
    const selected = tab.dataset.kpiView === currentView;
    tab.setAttribute('aria-selected', selected ? 'true' : 'false');
    tab.tabIndex = selected ? 0 : -1;
  });
  elements.toolbar?.classList.toggle('hidden', currentView === 'operations');
  elements.toolbar?.classList.toggle('kpi-dashboard-toolbar--patrons', currentView === 'patrons');
  if (elements.itemType) {
    elements.itemType.setDisabled?.(
      currentView === 'patrons',
      currentView === 'patrons' ? 'Item type does not apply to patron aggregates.' : ''
    );
  }
  elements.itemTypeFilter?.classList.toggle('hidden', currentView === 'patrons');
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
    libraryData.scope.comparison_mode = periodComparison;
    libraryData.canGoBack = scopeHistory.length > 0;
    elements.content.innerHTML = renderLibraryDashboard(libraryData, currentView);
  }
}

function requestPayload(elements) {
  const reportingPeriod = elements.period?._reportingPeriodPicker?.value || '365';
  const libraries = selectedLibraryScopes(elements.library);
  const itemTypes = selectedItemTypes(elements.itemType);
  const selectedSystems = new Set(libraries.map(systemCodeForLibraryScope).filter(Boolean));
  const selectedSystem = selectedSystems.size === 1 ? [...selectedSystems][0] : '';
  const systemLibraryCount = selectedSystem
    ? (libraryData?.filters?.libraries || []).filter(option => {
      const value = typeof option === 'string' ? option : option.value ?? option.code;
      return systemCodeForLibraryScope(value) === selectedSystem;
    }).length
    : 0;
  const wholeSystemSelected = libraries.length > 1 && libraries.length === systemLibraryCount;
  const payload = {
    action: 'library_dashboard',
    library: wholeSystemSelected ? `system:${selectedSystem}` : libraries.length === 1 ? libraries[0] : 'all',
    item_type: itemTypes.length === 1 ? itemTypes[0] : 'all',
    // Collection-use and patron snapshots retain rolling activity windows separately
    // from the transaction reporting period. Named calendar/fiscal periods therefore
    // use the documented 12-month activity window until those sources retain exact dates.
    active_window_days: /^\d+$/.test(reportingPeriod) ? Number(reportingPeriod) : 365,
    reporting_period: reportingPeriod
  };
  if (libraries.length > 1 && !wholeSystemSelected) payload.libraries = libraries;
  if (itemTypes.length > 1) payload.item_types = itemTypes;
  return payload;
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

function optionValue(option) {
  return typeof option === 'string' ? option : option?.value ?? option?.code ?? option?.RawValue ?? '';
}

function applyDashboardScope(button) {
  if (!libraryData) return;
  const kind = button.dataset.kpiScopeKind || '';
  const value = button.dataset.kpiScopeValue || '';
  if (!kind || !value) return;
  const elements = getElements();
  const libraries = selectedLibraryScopes(elements.library);
  const itemTypes = selectedItemTypes(elements.itemType);
  let nextLibraries = libraries;
  let nextItemTypes = itemTypes;
  if (kind === 'system') {
    nextLibraries = libraryData.filters.libraries
      .map(optionValue)
      .filter(code => systemCodeForLibraryScope(code) === value);
  } else if (kind === 'branch') {
    nextLibraries = [value];
  } else if (kind === 'item-type') {
    nextItemTypes = [value];
  }
  if (!nextLibraries.length && kind !== 'item-type') return;
  if (JSON.stringify(nextLibraries) === JSON.stringify(libraries)
    && JSON.stringify(nextItemTypes) === JSON.stringify(itemTypes)) return;
  scopeHistory.push({ libraries, itemTypes, view: currentView });
  elements.library?.setSelectedValues?.(nextLibraries);
  elements.itemType?.setSelectedValues?.(nextItemTypes);
  syncPeriodOptions(elements);
  void loadDashboard();
}

function restoreDashboardScope() {
  const previous = scopeHistory.pop();
  if (!previous) return;
  const elements = getElements();
  currentView = previous.view || currentView;
  elements.library?.setSelectedValues?.(previous.libraries || []);
  elements.itemType?.setSelectedValues?.(previous.itemTypes || []);
  syncPeriodOptions(elements);
  syncViewChrome(elements);
  void loadDashboard();
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
  elements.itemType?.addEventListener('change', () => loadDashboard());
  elements.period?.addEventListener('change', event => {
    periodComparison = event.detail?.comparison === 'none' ? 'none' : 'previous';
    const loadedPeriod = libraryData?.scope?.reporting_period;
    if (loadedPeriod && loadedPeriod === event.detail?.value) render();
    else loadDashboard();
  });
  elements.tabs.forEach(tab => tab.addEventListener('click', () => {
    const nextView = tab.dataset.kpiView || 'overview';
    if (nextView !== currentView) elements.shell?.scrollTo({ top: 0, left: 0 });
    currentView = nextView;
    syncViewChrome(getElements());
    if (currentView === 'operations' || !libraryData) loadDashboard();
    else render();
  }));
  elements.tabs.forEach((tab, index) => tab.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const lastIndex = elements.tabs.length - 1;
    const nextIndex = event.key === 'Home' ? 0
      : event.key === 'End' ? lastIndex
        : event.key === 'ArrowRight' ? (index + 1) % elements.tabs.length
          : (index - 1 + elements.tabs.length) % elements.tabs.length;
    elements.tabs[nextIndex].focus();
    elements.tabs[nextIndex].click();
  }));
  elements.content?.addEventListener('click', event => {
    const button = event.target.closest('[data-kpi-query]');
    if (button) openOpportunityQuery(button);
    const scopeButton = event.target.closest('[data-kpi-scope-kind]');
    if (scopeButton) applyDashboardScope(scopeButton);
    if (event.target.closest('[data-kpi-back-scope]')) restoreDashboardScope();
    const jump = event.target.closest('[data-kpi-jump-view]');
    if (jump) {
      const destination = elements.tabs.find(tab => tab.dataset.kpiView === jump.dataset.kpiJumpView);
      destination?.click();
      destination?.focus();
    }
    const scrollControl = event.target.closest('[data-kpi-scroll-target]');
    if (scrollControl) {
      const target = document.getElementById(scrollControl.dataset.kpiScrollTarget || '');
      target?.scrollIntoView({ block: 'start' });
      target?.focus({ preventScroll: true });
    }
  });
  window.addEventListener('query-dashboard:open', () => {
    toast.dismissAll();
    loadDashboard();
  });
  window.setInterval(() => {
    const panel = document.getElementById('kpi-dashboard-panel');
    if (panel && !panel.classList.contains('hidden')) loadDashboard();
  }, AUTO_REFRESH_MS);
});

export { loadDashboard };
