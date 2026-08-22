const ROLLING_PERIODS = [
  { value: '90', label: 'Last 90 days', type: 'rolling' },
  { value: '365', label: 'Last 12 months', type: 'rolling' },
  { value: '730', label: 'Last 24 months', type: 'rolling' }
];

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function compactDate(value) {
  if (!value) return '';
  const text = String(value);
  const match = text.match(/^(\d{4})-?(\d{2})-?(\d{2})$/);
  if (!match) return text;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

function dateSpan(period, metrics) {
  if (period?.date_span) return period.date_span;
  const start = period?.start || metrics?.coverage_start;
  const end = period?.end || metrics?.coverage_end;
  return start && end ? `${compactDate(start)}–${compactDate(end)}` : '';
}

function periodType(value) {
  if (String(value).startsWith('cy:')) return 'calendar';
  if (String(value).startsWith('fy:')) return 'fiscal';
  return 'rolling';
}

function comparisonLabel(type) {
  return type === 'rolling' ? 'Previous period' : 'Same period last year';
}

function normalizePeriod(period, type) {
  return {
    ...period,
    value: String(period?.value || ''),
    label: String(period?.label || period?.value || ''),
    type
  };
}

function createReportingPeriodPicker(container, options = {}) {
  if (!container) return null;
  let state = {
    value: String(options.value || '365'),
    comparison: options.comparison === 'none' ? 'none' : 'previous',
    periods: [],
    fiscalAvailable: false,
    fiscalMessage: 'Choose one library system to use its fiscal calendar.',
    metrics: null,
    open: false,
    draftValue: String(options.value || '365'),
    draftComparison: options.comparison === 'none' ? 'none' : 'previous',
    activeType: periodType(options.value || '365')
  };

  container.innerHTML = `
    <button type="button" class="kpi-period-trigger" aria-haspopup="dialog" aria-expanded="false">
      <span class="kpi-period-trigger__label">Last 12 months</span>
      <small class="kpi-period-trigger__dates"></small>
      <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6 8 4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path></svg>
    </button>
    <div class="kpi-period-popover hidden" role="dialog" aria-modal="false" aria-label="Choose reporting period">
      <div class="kpi-period-popover__heading"><div><strong>Reporting period</strong><span>Choose the time span used throughout this dashboard.</span></div><button type="button" class="kpi-period-close" aria-label="Close reporting period picker">×</button></div>
      <div class="kpi-period-tabs" role="tablist" aria-label="Period type">
        <button type="button" role="tab" data-period-type="rolling">Rolling</button>
        <button type="button" role="tab" data-period-type="calendar">Calendar year</button>
        <button type="button" role="tab" data-period-type="fiscal">Fiscal year</button>
        <button type="button" role="tab" data-period-type="custom">Custom</button>
      </div>
      <div class="kpi-period-options" role="radiogroup" aria-label="Available reporting periods"></div>
      <div class="kpi-period-comparison"><strong>Comparison</strong><div role="radiogroup" aria-label="Comparison period"><button type="button" role="radio" data-comparison="previous"></button><button type="button" role="radio" data-comparison="none">None</button></div></div>
      <div class="kpi-period-summary" aria-live="polite"></div>
      <div class="kpi-period-actions"><button type="button" class="kpi-period-cancel">Cancel</button><button type="button" class="kpi-period-apply">Apply</button></div>
    </div>`;

  const trigger = container.querySelector('.kpi-period-trigger');
  const popover = container.querySelector('.kpi-period-popover');
  const optionsHost = container.querySelector('.kpi-period-options');
  const tabs = [...container.querySelectorAll('[data-period-type]')];
  const comparisonButtons = [...container.querySelectorAll('[data-comparison]')];

  function allPeriods() { return state.periods; }
  function selectedPeriod(value = state.value) {
    return allPeriods().find(period => period.value === value) || ROLLING_PERIODS[1];
  }
  function typePeriods(type) { return allPeriods().filter(period => period.type === type); }

  function summaryText(value = state.draftValue, comparison = state.draftComparison) {
    const period = selectedPeriod(value);
    const span = dateSpan(period, value === state.value ? state.metrics : null);
    const compare = comparison === 'none' ? 'No comparison' : comparisonLabel(period.type);
    return [period.label, span, compare].filter(Boolean).join(' · ');
  }

  function renderTrigger() {
    const period = selectedPeriod();
    trigger.querySelector('.kpi-period-trigger__label').textContent = period.label;
    const details = [dateSpan(period, state.metrics), state.comparison === 'none' ? 'No comparison' : comparisonLabel(period.type)].filter(Boolean).join(' · ');
    const detailsElement = trigger.querySelector('.kpi-period-trigger__dates');
    detailsElement.textContent = details;
    detailsElement.hidden = !details;
  }

  function renderOptions() {
    tabs.forEach(tab => {
      const selected = tab.dataset.periodType === state.activeType;
      tab.setAttribute('aria-selected', selected ? 'true' : 'false');
      tab.tabIndex = selected ? 0 : -1;
    });

    if (state.activeType === 'custom') {
      optionsHost.innerHTML = '<div class="kpi-period-unavailable"><strong>Custom dates are not available yet</strong><p>The dashboard keeps verified aggregate totals—not individual transaction rows. Arbitrary dates will become available only when they can be calculated without weakening privacy or speed.</p></div>';
    } else if (state.activeType === 'fiscal' && !state.fiscalAvailable) {
      optionsHost.innerHTML = `<div class="kpi-period-unavailable"><strong>Choose one library system first</strong><p>${escapeHtml(state.fiscalMessage)}</p></div>`;
    } else {
      const periods = typePeriods(state.activeType);
      optionsHost.innerHTML = periods.map(period => `<button type="button" role="radio" aria-checked="${period.value === state.draftValue}" data-period-value="${escapeHtml(period.value)}"><span>${escapeHtml(period.label)}</span>${dateSpan(period) ? `<small>${escapeHtml(dateSpan(period))}</small>` : ''}</button>`).join('');
    }

    const activePeriod = selectedPeriod(state.draftValue);
    const previousButton = comparisonButtons.find(button => button.dataset.comparison === 'previous');
    previousButton.textContent = comparisonLabel(activePeriod.type);
    comparisonButtons.forEach(button => button.setAttribute('aria-checked', button.dataset.comparison === state.draftComparison ? 'true' : 'false'));
    container.querySelector('.kpi-period-comparison').classList.toggle('hidden', state.activeType === 'custom');
    container.querySelector('.kpi-period-summary').textContent = state.activeType === 'custom' ? '' : summaryText();
    container.querySelector('.kpi-period-apply').disabled = state.activeType === 'custom' || (state.activeType === 'fiscal' && !state.fiscalAvailable);
  }

  function close({ restoreFocus = false } = {}) {
    state.open = false;
    popover.classList.add('hidden');
    trigger.setAttribute('aria-expanded', 'false');
    if (restoreFocus) trigger.focus();
  }

  function open() {
    state.open = true;
    state.draftValue = state.value;
    state.draftComparison = state.comparison;
    state.activeType = periodType(state.value);
    renderOptions();
    popover.classList.remove('hidden');
    trigger.setAttribute('aria-expanded', 'true');
    popover.querySelector('[role="tab"][aria-selected="true"]')?.focus();
  }

  trigger.addEventListener('click', () => state.open ? close() : open());
  container.querySelector('.kpi-period-close').addEventListener('click', () => close({ restoreFocus: true }));
  container.querySelector('.kpi-period-cancel').addEventListener('click', () => close({ restoreFocus: true }));
  tabs.forEach(tab => tab.addEventListener('click', () => {
    state.activeType = tab.dataset.periodType;
    const first = typePeriods(state.activeType)[0];
    if (first) state.draftValue = first.value;
    renderOptions();
  }));
  optionsHost.addEventListener('click', event => {
    const option = event.target.closest('[data-period-value]');
    if (!option) return;
    state.draftValue = option.dataset.periodValue;
    renderOptions();
  });
  comparisonButtons.forEach(button => button.addEventListener('click', () => {
    state.draftComparison = button.dataset.comparison;
    renderOptions();
  }));
  container.querySelector('.kpi-period-apply').addEventListener('click', () => {
    const changed = state.value !== state.draftValue || state.comparison !== state.draftComparison;
    state.value = state.draftValue;
    state.comparison = state.draftComparison;
    state.activeType = periodType(state.value);
    close({ restoreFocus: true });
    renderTrigger();
    if (changed) container.dispatchEvent(new CustomEvent('change', { bubbles: true, detail: { value: state.value, comparison: state.comparison } }));
  });
  document.addEventListener('mousedown', event => {
    if (state.open && !container.contains(event.target)) close();
  });
  document.addEventListener('keydown', event => {
    if (state.open && event.key === 'Escape') { event.preventDefault(); close({ restoreFocus: true }); }
  });

  const api = {
    get value() { return state.value; },
    get comparison() { return state.comparison; },
    setOptions({ calendar = [], fiscal = [], fiscalAvailable = false, fiscalMessage = '', metrics = null } = {}) {
      state.periods = [
        ...ROLLING_PERIODS,
        ...calendar.map(period => normalizePeriod(period, 'calendar')),
        ...fiscal.map(period => normalizePeriod(period, 'fiscal'))
      ];
      state.fiscalAvailable = Boolean(fiscalAvailable);
      state.fiscalMessage = fiscalMessage || state.fiscalMessage;
      state.metrics = metrics;
      if (!state.periods.some(period => period.value === state.value)) {
        state.value = '365';
        state.draftValue = '365';
        state.activeType = 'rolling';
      }
      renderTrigger();
      if (state.open) renderOptions();
    },
    setValue(value, comparison = state.comparison) {
      state.value = String(value || '365');
      state.draftValue = state.value;
      state.comparison = comparison === 'none' ? 'none' : 'previous';
      state.draftComparison = state.comparison;
      state.activeType = periodType(state.value);
      renderTrigger();
    }
  };
  container._reportingPeriodPicker = api;
  api.setOptions();
  return api;
}

export { createReportingPeriodPicker };
