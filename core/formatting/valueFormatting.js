import { formatDisplayValue } from './dateValues.js';
import { MoneyUtils } from './moneyUtils.js';
import { getBaseFieldName } from '../queryState.js';
import { fieldDefs } from '../../filters/fieldDefs.js';

function getFieldDefinition(fieldName) {
  if (!fieldDefs) {
    return null;
  }

  const normalizedField = String(fieldName || '').trim();
  if (!normalizedField) {
    return null;
  }

  let fieldDef = fieldDefs.get(normalizedField);
  if (fieldDef) {
    return fieldDef;
  }

  const baseField = getBaseFieldName(normalizedField);
  fieldDef = fieldDefs.get(baseField);
  return fieldDef || null;
}

function getFieldType(fieldName, options = {}) {
  const { inferMoneyFromName = false } = options;
  const fieldDef = getFieldDefinition(fieldName);
  if (fieldDef?.type) {
    return fieldDef.type;
  }

  if (inferMoneyFromName) {
    const lower = String(fieldName || '').toLowerCase();
    if (lower.includes('price') || lower.includes('cost') || lower.includes('amount')) {
      return 'money';
    }
  }

  return 'string';
}

function getNumberFormat(fieldName) {
  const fieldDef = getFieldDefinition(fieldName);
  const explicitFormat = String(fieldDef?.numberFormat || fieldDef?.numericFormat || '').trim().toLowerCase();
  if (explicitFormat) {
    return explicitFormat;
  }

  if (fieldDef?.type === 'money') {
    return 'currency';
  }

  if (fieldDef?.type === 'number') {
    return 'integer';
  }

  return '';
}

function formatDateDisplay(rawValue, options = {}) {
  const {
    invalidValue = 'Never',
    fallbackToRaw = false
  } = options;

  return formatDisplayValue(rawValue, {
    fallbackToRaw,
    invalidValue
  });
}

function parseStandardNumber(rawValue) {
  if (typeof rawValue === 'number') {
    return rawValue;
  }

  return Number.parseFloat(String(rawValue || '').replace(/,/g, ''));
}

function formatNumberDisplay(rawValue, options = {}) {
  const numericValue = parseStandardNumber(rawValue);
  if (Number.isNaN(numericValue)) {
    return '';
  }

  const numberFormat = String(options.numberFormat || '').trim().toLowerCase();

  if (numberFormat === 'year') {
    return numericValue.toLocaleString('en-US', {
      maximumFractionDigits: 0,
      useGrouping: false
    });
  }

  if (numberFormat === 'integer' || (numberFormat !== 'decimal' && Number.isInteger(numericValue))) {
    return numericValue.toLocaleString('en-US', {
      maximumFractionDigits: 0
    });
  }

  return numericValue.toLocaleString('en-US', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2
  });
}

function formatDelimitedValue(rawValue, joiner = ' | ') {
  if (typeof rawValue !== 'string' || !rawValue.includes('\x1F')) {
    return String(rawValue ?? '');
  }

  return rawValue
    .split('\x1F')
    .map(value => value.trim())
    .filter(Boolean)
    .join(joiner);
}

function formatValueByType(rawValue, type, options = {}) {
  const normalizedType = String(type || 'string').toLowerCase();
  const {
    fieldName = '',
    numberFormat = '',
    invalidDateValue = 'Never',
    dateFallbackToRaw = false,
    delimitedJoiner = ' | '
  } = options;

  if (rawValue === undefined || rawValue === null) {
    return '';
  }

  if (normalizedType === 'date') {
    return formatDateDisplay(rawValue, {
      fallbackToRaw: dateFallbackToRaw,
      invalidValue: invalidDateValue
    });
  }

  if (normalizedType === 'money') {
    const displayValue = MoneyUtils.formatDisplayValue(rawValue);
    return displayValue || String(rawValue);
  }

  if (normalizedType === 'number') {
    return formatNumberDisplay(rawValue, {
      numberFormat: numberFormat || getNumberFormat(fieldName)
    });
  }

  return formatDelimitedValue(rawValue, delimitedJoiner);
}

const ValueFormatting = Object.freeze({
  formatDateDisplay,
  formatDelimitedValue,
  formatNumberDisplay,
  formatValueByType,
  getFieldDefinition,
  getFieldType,
  getNumberFormat
});

export {
  ValueFormatting,
  formatDateDisplay,
  formatDelimitedValue,
  formatNumberDisplay,
  formatValueByType,
  getFieldDefinition,
  getFieldType,
  getNumberFormat
};
