/**
 * Shared filter value formatting and list-viewer helpers.
 * Extracted from filterManager.js so value-display behavior is separate from condition editing.
 */
import { ClipboardUtils } from '../core/clipboard.js';
import { showToastMessage } from '../core/toast.js';
import { MoneyUtils } from '../core/utils.js';
import { VisibilityUtils } from '../core/visibility.js';

  function getFilterValueMap(fieldDef) {
    if (!fieldDef || !fieldDef.values || fieldDef.values.length === 0) {
      return new Map();
    }

    if (window.getLiteralToDisplayMap) {
      return window.getLiteralToDisplayMap(fieldDef);
    }

    return typeof fieldDef.values[0] === 'object'
      ? new Map(fieldDef.values.map(value => [value.RawValue, value.Name]))
      : new Map();
  }

  function getFilterDisplayValues(filter, fieldDef) {
    const rawValues = filter && filter.cond && filter.cond.toLowerCase() === 'between'
      ? String(filter.val || '').split('|')
      : String(filter && filter.val || '').split(',');
    const valueMap = getFilterValueMap(fieldDef);
    const fieldName = fieldDef?.name || '';
    const fieldType = window.ValueFormatting?.getFieldType?.(fieldName, { inferMoneyFromName: true }) || '';

    return rawValues
      .map(value => String(value).trim())
      .filter(Boolean)
      .map(value => {
        const mappedValue = valueMap.get(value) || value;
        if (!fieldType || !window.ValueFormatting) {
          return mappedValue;
        }

        if (fieldType === 'money') {
          const numericValue = MoneyUtils.parseNumber(mappedValue);
          return Number.isNaN(numericValue)
            ? mappedValue
            : window.ValueFormatting.formatValueByType(numericValue, fieldType, { fieldName });
        }

        return window.ValueFormatting.formatValueByType(mappedValue, fieldType, {
          fieldName,
          invalidDateValue: 'Never',
          dateFallbackToRaw: true
        });
      });
  }

  function buildListSummaryLabel(values) {
    if (!values || values.length === 0) return '';
    if (values.length === 1) return values[0];
    return `${values[0]}, and ${values.length - 1} more`;
  }

  function shouldUseFilterListViewer(filter, fieldDef) {
    const values = getFilterDisplayValues(filter, fieldDef);
    return Boolean(fieldDef && fieldDef.allowValueList && values.length > 1);
  }

  function ensureFilterListViewer() {
    let backdrop = document.getElementById('filter-list-viewer-backdrop');
    let panel = document.getElementById('filter-list-viewer');

    if (backdrop && panel) {
      return { backdrop, panel };
    }

    backdrop = document.createElement('div');
    backdrop.id = 'filter-list-viewer-backdrop';
    backdrop.className = 'filter-list-viewer-backdrop hidden';

    panel = document.createElement('div');
    panel.id = 'filter-list-viewer';
    panel.className = 'filter-list-viewer hidden';
    panel.innerHTML = `
        <div class="filter-list-viewer-header">
            <div>
                <div id="filter-list-viewer-title" class="filter-list-viewer-title"></div>
                <div id="filter-list-viewer-meta" class="filter-list-viewer-meta"></div>
            </div>
            <div class="filter-list-viewer-actions">
                <button type="button" id="filter-list-viewer-copy" class="filter-list-viewer-icon-btn" aria-label="Copy list" data-tooltip="Copy list">
                    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" fill="none" stroke="currentColor" stroke-width="2"/></svg>
                </button>
                <button type="button" id="filter-list-viewer-download" class="filter-list-viewer-icon-btn" aria-label="Download list" data-tooltip="Download list as text file">
                    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 3v12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M7 10l5 5 5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 21h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
                </button>
                <button type="button" id="filter-list-viewer-close" class="filter-list-viewer-close" aria-label="Close list viewer">
                    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M6 6l12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
                </button>
            </div>
        </div>
        <div id="filter-list-viewer-body" class="filter-list-viewer-body"></div>
    `;

    const closeViewer = () => {
      VisibilityUtils.hide([backdrop, panel], {
        raisedUiKey: 'filter-list-viewer'
      });
    };

    panel._viewerState = {
      values: [],
      filenameBase: 'filter-values'
    };

    backdrop.addEventListener('click', closeViewer);
    panel.querySelector('#filter-list-viewer-close').addEventListener('click', closeViewer);
    ClipboardUtils.bindCopyButton(panel.querySelector('#filter-list-viewer-copy'), () => {
      return (panel._viewerState.values || []).join('\n');
    }, {
      successMessage: 'List copied to clipboard.',
      errorMessage: 'Failed to copy list.',
      emptyMessage: 'No list values are available to copy.'
    });
    panel.querySelector('#filter-list-viewer-download').addEventListener('click', () => {
      const rawText = (panel._viewerState.values || []).join('\n');
      if (!rawText) return;

      const blob = new Blob([rawText], { type: 'text/plain;charset=utf-8' });
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `${panel._viewerState.filenameBase || 'filter-values'}.txt`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(objectUrl);

      showToastMessage('List downloaded.', 'success');
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && VisibilityUtils.isVisible(panel)) {
        closeViewer();
      }
    });

    document.body.appendChild(backdrop);
    document.body.appendChild(panel);
    return { backdrop, panel };
  }

  function openFilterListViewer(filter, fieldDef, options = {}) {
    const values = getFilterDisplayValues(filter, fieldDef);
    if (values.length <= 1) {
      return;
    }

    const { backdrop, panel } = ensureFilterListViewer();
    const titleEl = panel.querySelector('#filter-list-viewer-title');
    const metaEl = panel.querySelector('#filter-list-viewer-meta');
    const bodyEl = panel.querySelector('#filter-list-viewer-body');
    const fieldLabel = options.fieldName || fieldDef?.name || 'Selected Values';
    const operatorLabel = options.operatorLabel || (filter.cond.charAt(0).toUpperCase() + filter.cond.slice(1));
    const filenameBase = String(`${fieldLabel} ${operatorLabel}`)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'filter-values';

    const items = values
      .map(value => `<li class="filter-list-viewer-item">${window.escapeHtml(value)}</li>`)
      .join('');

    titleEl.textContent = `${fieldLabel} ${operatorLabel}`;
    metaEl.textContent = `${values.length} value${values.length === 1 ? '' : 's'}`;
    bodyEl.innerHTML = `<ul class="filter-list-viewer-list">${items}</ul>`;
    panel._viewerState.values = values.slice();
    panel._viewerState.filenameBase = filenameBase;

    VisibilityUtils.show([backdrop, panel], {
      raisedUiKey: 'filter-list-viewer'
    });
  }

  function buildFilterValueLabel(filter, fieldDef, betweenSeparator = ' - ') {
    const isBetween = filter.cond.toLowerCase() === 'between';
    const values = getFilterDisplayValues(filter, fieldDef);

    if (isBetween) {
      return values.join(betweenSeparator);
    }

    if (fieldDef && fieldDef.allowValueList && values.length > 1) {
      return buildListSummaryLabel(values);
    }

    return values.join(', ');
  }

const FilterValueUi = Object.freeze({
  getFilterValueMap,
  getFilterDisplayValues,
  shouldUseFilterListViewer,
  openFilterListViewer,
  buildFilterValueLabel
});

export {
  FilterValueUi,
  buildFilterValueLabel,
  getFilterDisplayValues,
  openFilterListViewer,
  shouldUseFilterListViewer
};
