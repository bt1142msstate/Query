import { ValueFormatting } from '../../../core/formatting/valueFormatting.js';
import { isNoValuePostFilterOperator, normalizeNoValuePostFilterOperator } from './postFilterLogic.js';

function formatPostFilterValue(filter, fieldName, options = {}) {
  const type = typeof options.getFieldType === 'function'
    ? options.getFieldType(fieldName)
    : ValueFormatting.getFieldType(fieldName);
  const isBlankValue = typeof options.isBlankValue === 'function'
    ? options.isBlankValue
    : value => String(value || '') === String(options.blankValue || '');
  const cond = normalizeNoValuePostFilterOperator(filter?.cond);
  const rawValue = String(filter?.val || '');

  if (isNoValuePostFilterOperator(cond)) {
    return '';
  }

  if (Array.isArray(filter?.vals) && filter.vals.length > 0) {
    const labels = filter.vals.map(value => isBlankValue(value)
      ? '(Blank values)'
      : formatPostFilterValue({ cond: 'equals', val: value }, fieldName, options));

    if (labels.length <= 2) {
      return labels.join(', ');
    }

    return `${labels[0]}, ${labels[1]} and ${labels.length - 2} more`;
  }

  if (isBlankValue(rawValue)) {
    return '(Blank values)';
  }

  if (cond === 'between') {
    const [left, right] = rawValue.split('|');
    const formatBound = value => ValueFormatting.formatValueByType(String(value || ''), type, {
      fieldName,
      dateFallbackToRaw: true
    });
    return `${formatBound(left)} - ${formatBound(right)}`;
  }

  return ValueFormatting.formatValueByType(rawValue, type, {
    fieldName,
    dateFallbackToRaw: true
  });
}

export { formatPostFilterValue };
