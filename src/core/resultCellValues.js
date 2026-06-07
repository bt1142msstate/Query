const SERIALIZED_MULTI_VALUE_SEPARATOR = '\x1F';

function normalizeResultScalar(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  return JSON.stringify(value);
}

function normalizeResultCellValue(value) {
  if (Array.isArray(value)) {
    const parts = value
      .flatMap(item => getCellValueParts(item))
      .map(item => normalizeResultScalar(item))
      .filter(item => item !== '');
    return parts.length <= 1 ? (parts[0] || '') : parts;
  }

  if (value && typeof value === 'object') {
    if (Array.isArray(value.values)) {
      return normalizeResultCellValue(value.values);
    }
    if (Object.prototype.hasOwnProperty.call(value, 'value')) {
      return normalizeResultCellValue(value.value);
    }
  }

  return normalizeResultScalar(value);
}

function getCellValueParts(value) {
  if (Array.isArray(value)) {
    return value
      .flatMap(item => getCellValueParts(item))
      .map(item => normalizeResultScalar(item));
  }

  if (value && typeof value === 'object') {
    if (Array.isArray(value.values)) {
      return getCellValueParts(value.values);
    }
    if (Object.prototype.hasOwnProperty.call(value, 'value')) {
      return getCellValueParts(value.value);
    }
  }

  if (typeof value === 'string' && value.includes(SERIALIZED_MULTI_VALUE_SEPARATOR)) {
    return value.split(SERIALIZED_MULTI_VALUE_SEPARATOR).map(item => item.trim());
  }

  return [normalizeResultScalar(value)];
}

function getNonBlankCellValueParts(value) {
  return getCellValueParts(value)
    .map(item => String(item ?? '').trim())
    .filter(Boolean);
}

function isBlankCellValue(value) {
  if (value === undefined || value === null) {
    return true;
  }

  const parts = getCellValueParts(value);
  return parts.length === 0 || parts.every(part => String(part ?? '').trim() === '');
}

function hasMultipleCellValues(value) {
  return getNonBlankCellValueParts(value).length > 1;
}

function formatCellValueForText(value, separator = '\n') {
  const parts = getCellValueParts(value);
  if (parts.length <= 1) {
    return String(parts[0] ?? '');
  }

  return parts
    .map(part => String(part ?? '').trim())
    .filter(Boolean)
    .join(separator);
}

function cloneResultCellValue(value) {
  return Array.isArray(value) ? value.map(item => cloneResultCellValue(item)) : value;
}

export {
  cloneResultCellValue,
  formatCellValueForText,
  getCellValueParts,
  getNonBlankCellValueParts,
  hasMultipleCellValues,
  isBlankCellValue,
  normalizeResultCellValue,
  normalizeResultScalar
};
