import { formatDisplayValue, parseDateValue } from '../../core/dateValues.js';
import { MoneyUtils } from '../../core/moneyUtils.js';

const SHEET_NAME_LIMIT = 31;
const MAX_GROUPED_SHEETS = 100;

function normalizeSheetName(name) {
  const cleaned = String(name || 'Sheet')
    .replace(/[\\/?*\[\]:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return (cleaned || 'Sheet').slice(0, SHEET_NAME_LIMIT);
}

function getUniqueSheetName(baseName, usedNames) {
  const normalizedBase = normalizeSheetName(baseName);
  if (!usedNames.has(normalizedBase)) {
    usedNames.add(normalizedBase);
    return normalizedBase;
  }

  let suffix = 2;
  while (suffix < 1000) {
    const suffixText = ` (${suffix})`;
    const truncatedBase = normalizedBase.slice(0, SHEET_NAME_LIMIT - suffixText.length).trim() || 'Sheet';
    const candidate = `${truncatedBase}${suffixText}`;
    if (!usedNames.has(candidate)) {
      usedNames.add(candidate);
      return candidate;
    }
    suffix += 1;
  }

  return normalizedBase;
}

function getCellExportValue(raw, type) {
  if (raw === undefined || raw === null) return '';

  if (type === 'date') {
    const dt = parseDateValue(raw);
    return dt !== null ? dt : 'Never';
  }

  if (type === 'number' || type === 'money') {
    const n = type === 'money'
      ? MoneyUtils.parseNumber(raw)
      : (typeof raw === 'number' ? raw : parseFloat(String(raw).replace(/,/g, '')));
    return isNaN(n) ? '' : n;
  }

  if (typeof raw === 'string' && raw.includes('\x1F')) {
    return raw.split('\x1F').join('\n');
  }

  return raw;
}

function getGroupingDisplayValue(rawValue) {
  if (rawValue === undefined || rawValue === null || rawValue === '') {
    return 'Blank';
  }

  if (rawValue instanceof Date) {
    return formatDisplayValue(rawValue, { fallbackToRaw: true, invalidValue: 'Blank' });
  }

  if (typeof rawValue === 'boolean') {
    return rawValue ? 'True' : 'False';
  }

  const text = String(rawValue).replace(/\n+/g, ' / ').trim();
  return text || 'Blank';
}

function buildExportRows(sourceData) {
  return sourceData.dataRows.map(row => {
    const values = sourceData.displayedFields.map(field => {
      const colIndex = sourceData.virtualData.columnMap.get(field);
      const raw = colIndex !== undefined ? row[colIndex] : undefined;
      const type = sourceData.fieldTypeMap.get(field);
      return getCellExportValue(raw, type);
    });

    return {
      values,
      rawRow: row
    };
  });
}

function buildGroupingCandidates(sourceData) {
  const candidates = sourceData.displayedFields.map((field, index) => {
    const counts = new Map();
    const colIndex = sourceData.virtualData.columnMap.get(field);
    const type = sourceData.fieldTypeMap.get(field);

    sourceData.dataRows.forEach(row => {
      const raw = colIndex !== undefined ? row[colIndex] : undefined;
      const displayValue = getGroupingDisplayValue(getCellExportValue(raw, type));
      counts.set(displayValue, (counts.get(displayValue) || 0) + 1);
    });

    return {
      field,
      index,
      distinctCount: counts.size,
      counts
    };
  }).filter(candidate => candidate.distinctCount > 1 && candidate.distinctCount <= MAX_GROUPED_SHEETS);

  candidates.sort((left, right) => {
    if (left.distinctCount !== right.distinctCount) {
      return left.distinctCount - right.distinctCount;
    }

    return left.field.localeCompare(right.field);
  });

  return candidates;
}

export {
  MAX_GROUPED_SHEETS,
  SHEET_NAME_LIMIT,
  buildExportRows,
  buildGroupingCandidates,
  getCellExportValue,
  getGroupingDisplayValue,
  getUniqueSheetName,
  normalizeSheetName
};
