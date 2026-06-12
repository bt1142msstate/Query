import { getMultiValueTableSummary } from '../virtual-table/splitColumnExpansion.js';

const SPLIT_COLUMNS_PREFERENCE_STORAGE_KEY = 'query-project.split-columns-mode';

function getPreferenceStorage() {
  try {
    return globalThis.window?.localStorage || globalThis.localStorage || null;
  } catch {
    return null;
  }
}

function readStoredSplitPreference() {
  const value = getPreferenceStorage()?.getItem?.(SPLIT_COLUMNS_PREFERENCE_STORAGE_KEY);
  return value === 'split' || value === 'true';
}

function writeStoredSplitPreference(active) {
  try {
    getPreferenceStorage()?.setItem?.(
      SPLIT_COLUMNS_PREFERENCE_STORAGE_KEY,
      active ? 'split' : 'stacked'
    );
  } catch {
    // Storage may be blocked in private browsing or embedded contexts.
  }
}

function createSplitColumnsToggleUi({ services, showToastMessage }) {
  let splitMultiValues = false;
  let splitEligibleSummaryCache = {
    rawData: null,
    summary: null
  };

  function getSplitEligibleSummary() {
    const rawData = services.getRawTableData();
    if (splitEligibleSummaryCache.rawData === rawData && splitEligibleSummaryCache.summary) {
      return splitEligibleSummaryCache.summary;
    }

    const summary = getMultiValueTableSummary(rawData);
    splitEligibleSummaryCache = { rawData, summary };
    return summary;
  }

  function buildSplitToggleTooltipHtml(active, summary) {
    const title = active ? 'Multi-Value Export: Split Columns' : 'Multi-Value Export: Stacked Cells';
    const stateLine = active
      ? 'Multi-value fields are preferred as numbered columns when split-capable results are loaded.'
      : 'Multi-value fields are preferred as stacked values inside one cell.';
    const actionLine = summary.eligible
      ? (active ? 'Click to compact them back into one cell per field.' : 'Click to expand them into separate numbered columns.')
      : (active
          ? 'Click to prefer stacked cells instead. This preference will apply when split-capable results are loaded.'
          : 'Click to prefer split columns instead. This preference will apply when split-capable results are loaded.');
    const statsLine = summary.eligible
      ? `${summary.columnCount} column${summary.columnCount === 1 ? '' : 's'} can change layout${summary.valueCount > 0 ? `, affecting ${summary.valueCount} extra value${summary.valueCount === 1 ? '' : 's'}` : ''}.`
      : 'Current results do not contain multi-value or repeated-entry fields.';

    return `<div class="split-toggle-tooltip"><div class="tt-filter-container"><div class="tt-filter-title" style="color: #93c5fd; display: flex; align-items: center; gap: 6px;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="18" rx="1"></rect><rect x="14" y="3" width="7" height="18" rx="1"></rect></svg>${title}</div><div style="color: #f8fafc; font-size: 0.95rem; line-height: 1.4; padding-top: 2px;">${stateLine}</div><div style="color: #cbd5e1; font-size: 0.84rem; line-height: 1.45; padding-top: 8px;">${actionLine}</div><div style="color: #94a3b8; font-size: 0.8rem; line-height: 1.45; padding-top: 8px;">${statsLine}</div></div></div>`;
  }

  function applySplitToggleVisualState(toggleBtn, active) {
    const iconStack = document.getElementById('split-toggle-icon-stack');
    const iconCols = document.getElementById('split-toggle-icon-cols');

    toggleBtn.classList.toggle('table-toolbar-btn-active', active);
    toggleBtn.setAttribute(
      'aria-label',
      active ? 'Use stacked cells for multi-value fields' : 'Use split columns for multi-value fields'
    );
    toggleBtn.setAttribute('aria-pressed', active ? 'true' : 'false');
    toggleBtn.dataset.mobileLabel = active ? 'Stack' : 'Split';

    if (active) {
      iconStack && iconStack.classList.add('hidden');
      iconCols && iconCols.classList.remove('hidden');
    } else {
      iconStack && iconStack.classList.remove('hidden');
      iconCols && iconCols.classList.add('hidden');
    }

    toggleBtn.setAttribute('aria-disabled', 'false');
    toggleBtn.classList.remove('split-toggle-disabled');
  }

  function updateSplitColumnsToggleState() {
    const toggleBtn = document.getElementById('split-columns-toggle');
    if (!toggleBtn) return;

    const summary = getSplitEligibleSummary();

    applySplitToggleVisualState(toggleBtn, splitMultiValues);
    toggleBtn.removeAttribute('data-tooltip');
    toggleBtn.setAttribute('data-tooltip-html', buildSplitToggleTooltipHtml(splitMultiValues, summary));
  }

  function setSplitPreference(nextValue, options = {}) {
    splitMultiValues = Boolean(nextValue);
    if (options.persist !== false) {
      writeStoredSplitPreference(splitMultiValues);
    }
    updateSplitColumnsToggleState();
    if (options.syncService !== false) {
      services.setSplitColumnsMode(splitMultiValues);
    }
  }

  function attach() {
    const toggleBtn = document.getElementById('split-columns-toggle');
    if (!toggleBtn) {
      return;
    }

    setSplitPreference(readStoredSplitPreference(), { persist: false, syncService: true });

    toggleBtn.addEventListener('click', () => {
      const nextPreference = !splitMultiValues;
      showToastMessage(
        nextPreference ? 'Multi-value preference set to split columns' : 'Multi-value preference set to stacked cells',
        'info'
      );
      setSplitPreference(nextPreference);
    });
  }

  return Object.freeze({
    attach,
    isActive: () => splitMultiValues,
    resetSplitColumnsToggleUI() {
      setSplitPreference(false, { syncService: false });
    },
    setSplitColumnsToggleUIActive() {
      setSplitPreference(true, { syncService: false });
    },
    updateSplitColumnsToggleState
  });
}

export { SPLIT_COLUMNS_PREFERENCE_STORAGE_KEY, createSplitColumnsToggleUi };
