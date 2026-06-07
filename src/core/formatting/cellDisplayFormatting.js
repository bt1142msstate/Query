import { MoneyUtils } from './moneyUtils.js';
import { ValueFormatting } from './valueFormatting.js';
import { getNonBlankCellValueParts } from '../resultCellValues.js';

function getMultiValueDisplayValues(raw) {
  return getNonBlankCellValueParts(raw);
}

function formatCellDisplay(raw, field, options = {}) {
  if (raw == null) return '';
  const multiValueParts = getMultiValueDisplayValues(raw);
  if (multiValueParts.length > 1) {
    const separator = options.multiValueSeparator ?? ', ';
    return multiValueParts.join(separator);
  }

  const value = String(raw);
  if (value === '' || value === '\u2014') return value;

  const type = ValueFormatting.getFieldType?.(field, { inferMoneyFromName: true });
  if (!type) return value;

  if (type === 'date') {
    return ValueFormatting.formatValueByType(value, type, { invalidDateValue: 'Never' });
  }

  if (type === 'money') {
    const numericValue = MoneyUtils.parseNumber(value);
    if (!Number.isNaN(numericValue)) {
      return ValueFormatting.formatValueByType(numericValue, type, { fieldName: field });
    }
  }

  if (type === 'number') {
    const numericValue = Number.parseFloat(value.replace(/,/g, ''));
    if (!Number.isNaN(numericValue)) {
      return ValueFormatting.formatValueByType(numericValue, type, { fieldName: field });
    }
  }

  return value;
}

const CellDisplayFormatting = Object.freeze({
  formatCellDisplay,
  getMultiValueDisplayValues
});

export {
  CellDisplayFormatting,
  formatCellDisplay,
  getMultiValueDisplayValues
};
