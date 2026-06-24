/**
 * Shared filter value formatting and list editor helpers.
 * Extracted from filterManager.js so value-display behavior is separate from condition editing.
 */
import { getFieldValueDisplayMap } from '../../core/formatting/fieldValueMaps.js';
import { MoneyUtils } from '../../core/formatting/moneyUtils.js';
import { ValueFormatting } from '../../core/formatting/valueFormatting.js';
import { SelectorControls } from '../../ui/controls/selectorControls.js';

  function getFilterValueMap(fieldDef) {
    return getFieldValueDisplayMap(fieldDef);
  }

  function getFilterDisplayValues(filter, fieldDef) {
    const rawValues = filter && filter.cond && filter.cond.toLowerCase() === 'between'
      ? String(filter.val || '').split('|')
      : String(filter && filter.val || '').split(',');
    const valueMap = getFilterValueMap(fieldDef);
    const fieldName = fieldDef?.name || '';
    const fieldType = ValueFormatting.getFieldType(fieldName, { inferMoneyFromName: true }) || '';

    return rawValues
      .map(value => String(value).trim())
      .filter(Boolean)
      .map(value => {
        const mappedValue = valueMap.get(value) || value;
        if (!fieldType) {
          return mappedValue;
        }

        if (fieldType === 'money') {
          const numericValue = MoneyUtils.parseNumber(mappedValue);
          return Number.isNaN(numericValue)
            ? mappedValue
            : ValueFormatting.formatValueByType(numericValue, fieldType, { fieldName });
        }

        return ValueFormatting.formatValueByType(mappedValue, fieldType, {
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

  function getFilterLiteralValues(filter) {
    const rawValue = String(filter && filter.val || '');
    const delimiter = filter && filter.cond && filter.cond.toLowerCase() === 'between' ? '|' : ',';
    return rawValue
      .split(delimiter)
      .map(value => String(value).trim())
      .filter(Boolean);
  }

  function buildListFilenameBase(fieldLabel, operatorLabel) {
    return String(`${fieldLabel} ${operatorLabel}`)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'filter-values';
  }

  function areFilterListsEqual(left = [], right = []) {
    if (left.length !== right.length) return false;
    return left.every((value, index) => String(value) === String(right[index]));
  }

  function openFilterListEditor(filter, fieldDef, options = {}) {
    const literalValues = getFilterLiteralValues(filter);
    if (literalValues.length <= 1) {
      return null;
    }

    const fieldLabel = options.fieldName || fieldDef?.name || 'Selected Values';
    const operatorLabel = options.operatorLabel || (filter.cond.charAt(0).toUpperCase() + filter.cond.slice(1));
    const filenameBase = buildListFilenameBase(fieldLabel, operatorLabel);
    const listInput = SelectorControls.createListPasteInput(literalValues, {
      containerId: null,
      filenameBase,
      label: `${fieldLabel} ${operatorLabel}`,
      placeholder: options.placeholder || 'Paste one value per line',
      hint: options.hint || 'Paste values one per line, paste comma-separated values, or upload a text/CSV file.'
    });
    const popupControl = SelectorControls.createPopupListControl(
      listInput,
      `${fieldLabel} ${operatorLabel}`,
      options.summaryPlaceholder || `${literalValues.length} values loaded`
    );
    let cleanedUp = false;

    popupControl.classList.add('filter-list-editor-proxy');
    document.body.appendChild(popupControl);

    const cleanup = () => {
      if (cleanedUp) return;
      cleanedUp = true;
      if (typeof popupControl._cleanupPopup === 'function') {
        popupControl._cleanupPopup();
      }
      popupControl.remove();
    };

    popupControl.addEventListener('change', () => {
      const nextValues = typeof popupControl.getSelectedValues === 'function'
        ? popupControl.getSelectedValues()
        : [];
      if (!areFilterListsEqual(literalValues, nextValues) && typeof options.onChange === 'function') {
        options.onChange(nextValues);
      }
      cleanup();
    }, { once: true });

    if (typeof popupControl.openPopup === 'function') {
      popupControl.openPopup();
    }

    return popupControl;
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

export {
  buildFilterValueLabel,
  getFilterDisplayValues,
  getFilterLiteralValues,
  openFilterListEditor,
  shouldUseFilterListViewer
};
