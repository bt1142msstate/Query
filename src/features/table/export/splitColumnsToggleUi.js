import { getMultiValueTableSummary } from '../virtual-table/splitColumnExpansion.js';

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
      ? 'Values are currently expanded into numbered columns for export.'
      : 'Values are currently kept together inside a single export cell.';
    const actionLine = summary.eligible
      ? (active ? 'Click to compact them back into one cell per field.' : 'Click to expand them into separate numbered columns.')
      : 'No current result columns contain multi-value data to expand or compact.';
    const statsLine = summary.eligible
      ? `${summary.columnCount} column${summary.columnCount === 1 ? '' : 's'} can change layout${summary.valueCount > 0 ? `, affecting ${summary.valueCount} extra value${summary.valueCount === 1 ? '' : 's'}` : ''}.`
      : 'Run or load results that include multi-value or repeated-entry fields.';

    return `<div class="split-toggle-tooltip"><div class="tt-filter-container"><div class="tt-filter-title" style="color: #93c5fd; display: flex; align-items: center; gap: 6px;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="18" rx="1"></rect><rect x="14" y="3" width="7" height="18" rx="1"></rect></svg>${title}</div><div style="color: #f8fafc; font-size: 0.95rem; line-height: 1.4; padding-top: 2px;">${stateLine}</div><div style="color: #cbd5e1; font-size: 0.84rem; line-height: 1.45; padding-top: 8px;">${actionLine}</div><div style="color: #94a3b8; font-size: 0.8rem; line-height: 1.45; padding-top: 8px;">${statsLine}</div></div></div>`;
  }

  function applySplitToggleVisualState(toggleBtn, active, eligible) {
    const iconStack = document.getElementById('split-toggle-icon-stack');
    const iconCols = document.getElementById('split-toggle-icon-cols');

    if (active) {
      toggleBtn.classList.replace('bg-white', 'bg-indigo-100');
      toggleBtn.classList.replace('text-black', 'text-indigo-700');
      iconStack && iconStack.classList.add('hidden');
      iconCols && iconCols.classList.remove('hidden');
    } else {
      toggleBtn.classList.replace('bg-indigo-100', 'bg-white');
      if (!toggleBtn.classList.contains('bg-white')) toggleBtn.classList.add('bg-white');
      toggleBtn.classList.replace('text-indigo-700', 'text-black');
      if (!toggleBtn.classList.contains('text-black')) toggleBtn.classList.add('text-black');
      iconStack && iconStack.classList.remove('hidden');
      iconCols && iconCols.classList.add('hidden');
    }

    toggleBtn.setAttribute('aria-disabled', eligible ? 'false' : 'true');
    toggleBtn.classList.toggle('split-toggle-disabled', !eligible);
  }

  function updateSplitColumnsToggleState() {
    const toggleBtn = document.getElementById('split-columns-toggle');
    if (!toggleBtn) return;

    const summary = getSplitEligibleSummary();
    if (!summary.eligible) {
      splitMultiValues = false;
    }

    applySplitToggleVisualState(toggleBtn, splitMultiValues, summary.eligible);
    toggleBtn.removeAttribute('data-tooltip');
    toggleBtn.setAttribute('data-tooltip-html', buildSplitToggleTooltipHtml(splitMultiValues, summary));
  }

  function attach() {
    const toggleBtn = document.getElementById('split-columns-toggle');
    if (!toggleBtn) {
      return;
    }

    toggleBtn.addEventListener('click', () => {
      const summary = getSplitEligibleSummary();
      if (!summary.eligible) {
        updateSplitColumnsToggleState();
        return;
      }

      splitMultiValues = !splitMultiValues;
      showToastMessage(
        splitMultiValues ? 'Multi-values split into separate columns' : 'Multi-values stacked in one cell',
        'info'
      );
      updateSplitColumnsToggleState();
      services.setSplitColumnsMode(splitMultiValues);
    });

    updateSplitColumnsToggleState();
  }

  return Object.freeze({
    attach,
    isActive: () => splitMultiValues,
    resetSplitColumnsToggleUI() {
      splitMultiValues = false;
      updateSplitColumnsToggleState();
    },
    setSplitColumnsToggleUIActive() {
      splitMultiValues = true;
      updateSplitColumnsToggleState();
    },
    updateSplitColumnsToggleState
  });
}

export { createSplitColumnsToggleUi };
