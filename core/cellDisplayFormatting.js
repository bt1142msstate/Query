import { MoneyUtils } from './moneyUtils.js';
import { ValueFormatting } from './valueFormatting.js';

function formatCellDisplay(raw, field) {
  if (raw == null) return '';
  if (typeof raw === 'string' && raw.includes('\x1F')) {
    return raw.split('\x1F').filter(value => value.trim()).join(', ');
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

const CellDisplayFormatting = Object.freeze({ formatCellDisplay });

export { CellDisplayFormatting, formatCellDisplay };
