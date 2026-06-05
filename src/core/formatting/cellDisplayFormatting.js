import { MoneyUtils } from './moneyUtils.js';
import { ValueFormatting } from './valueFormatting.js';

function getMultiValueDisplayValues(raw) {
  if (typeof raw !== 'string' || !raw.includes('\x1F')) {
    return [];
  }

  return raw
    .split('\x1F')
    .map(value => value.trim())
    .filter(Boolean);
}

function formatCellDisplay(raw, field, options = {}) {
  if (raw == null) return '';
  const multiValueParts = getMultiValueDisplayValues(raw);
  if (multiValueParts.length > 0) {
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
