import { formatDisplayValue, parseDateValue } from '../../core/formatting/dateValues.js';
import { MoneyUtils } from '../../core/formatting/moneyUtils.js';
import { getCellValueParts, hasMultipleCellValues } from '../../core/resultCellValues.js';

const SHEET_NAME_LIMIT = 31;
const MAX_GROUPED_SHEETS = 100;
const DEFAULT_GROUPING_ROW_BATCH = 5000;
const SERIALIZED_MULTI_VALUE_SEPARATOR = '\x1F';
const SIMPLE_NUMBER_PATTERN = /^-?\d+(?:\.\d+)?$/u;

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

function parseCompactWorkbookDate(raw) {
  if (typeof raw !== 'string') {
    return null;
  }
  const text = raw.trim();
  if (text.length !== 8 && text.length !== 12 && text.length !== 14) {
    return null;
  }
  for (let index = 0; index < 8; index += 1) {
    const code = text.charCodeAt(index);
    if (code < 48 || code > 57) {
      return null;
    }
  }
  const year = Number(text.slice(0, 4));
  const month = Number(text.slice(4, 6));
  const day = Number(text.slice(6, 8));
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
    ? date
    : null;
}

function parseWorkbookDateValue(raw) {
  if (raw instanceof Date) {
    return Number.isNaN(raw.getTime()) ? null : new Date(raw.getTime());
  }
  return parseCompactWorkbookDate(raw) || parseDateValue(raw);
}

function parseWorkbookNumber(raw, type) {
  if (typeof raw === 'number') {
    return raw;
  }
  const text = String(raw ?? '').trim();
  if (SIMPLE_NUMBER_PATTERN.test(text)) {
    return Number(text);
  }
  return type === 'money'
    ? MoneyUtils.parseNumber(raw)
    : parseFloat(text.replace(/,/g, ''));
}

function mayHaveMultipleCellValues(raw) {
  if (Array.isArray(raw)) {
    return true;
  }
  if (raw && typeof raw === 'object') {
    return Array.isArray(raw.values) || Object.prototype.hasOwnProperty.call(raw, 'value');
  }
  return typeof raw === 'string' && raw.includes(SERIALIZED_MULTI_VALUE_SEPARATOR);
}

function formatWorkbookListItem(value) {
  if (value instanceof Date) {
    return formatDisplayValue(value, { fallbackToRaw: true, invalidValue: 'Never' });
  }
  if (typeof value === 'boolean') {
    return value ? 'True' : 'False';
  }
  return String(value ?? '').trim();
}

function formatNumberedWorkbookList(values) {
  const items = (Array.isArray(values) ? values : [])
    .map(formatWorkbookListItem)
    .filter(Boolean);
  return items.map((value, index) => `${index + 1}. ${value}`).join('\n');
}

function getCellExportValue(raw, type) {
  if (raw === undefined || raw === null) return '';

  if (mayHaveMultipleCellValues(raw) && hasMultipleCellValues(raw)) {
    const values = getCellValueParts(raw)
      .map(value => getCellExportValue(value, type))
      .filter(value => value !== '');
    return formatNumberedWorkbookList(values);
  }

  if (type === 'date') {
    const dt = parseWorkbookDateValue(raw);
    return dt !== null ? dt : 'Never';
  }

  if (type === 'number' || type === 'money') {
    const n = parseWorkbookNumber(raw, type);
    return isNaN(n) ? '' : n;
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

function createGroupingTrackers(sourceData) {
  return sourceData.displayedFields.map((field, index) => ({
    active: true,
    colIndex: sourceData.virtualData.columnMap.get(field),
    counts: new Map(),
    field,
    index,
    type: sourceData.fieldTypeMap.get(field)
  }));
}

function updateGroupingTrackers(trackers, row) {
  trackers.forEach(tracker => {
    if (!tracker.active) {
      return;
    }

    const raw = tracker.colIndex !== undefined ? row[tracker.colIndex] : undefined;
    const displayValue = getGroupingDisplayValue(getCellExportValue(raw, tracker.type));
    tracker.counts.set(displayValue, (tracker.counts.get(displayValue) || 0) + 1);

    if (tracker.counts.size > MAX_GROUPED_SHEETS) {
      tracker.active = false;
      tracker.counts.clear();
    }
  });
}

function finalizeGroupingCandidates(trackers) {
  const candidates = trackers
    .filter(tracker => tracker.active && tracker.counts.size > 1 && tracker.counts.size <= MAX_GROUPED_SHEETS)
    .map(tracker => ({
      counts: tracker.counts,
      distinctCount: tracker.counts.size,
      field: tracker.field,
      index: tracker.index
    }));

  candidates.sort((left, right) => {
    if (left.distinctCount !== right.distinctCount) {
      return left.distinctCount - right.distinctCount;
    }

    return left.field.localeCompare(right.field);
  });

  return candidates;
}

function buildGroupingCandidates(sourceData) {
  const trackers = createGroupingTrackers(sourceData);
  sourceData.dataRows.forEach(row => updateGroupingTrackers(trackers, row));
  return finalizeGroupingCandidates(trackers);
}

async function buildGroupingCandidatesAsync(sourceData, options = {}) {
  const trackers = createGroupingTrackers(sourceData);
  const rows = sourceData.dataRows;
  const rowBatch = Math.max(1, Number(options.rowBatch) || DEFAULT_GROUPING_ROW_BATCH);
  const shouldContinue = typeof options.shouldContinue === 'function'
    ? options.shouldContinue
    : null;
  const yieldToBrowser = typeof options.yieldToBrowser === 'function'
    ? options.yieldToBrowser
    : null;

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    if (shouldContinue && !shouldContinue()) {
      return [];
    }
    updateGroupingTrackers(trackers, rows[rowIndex]);
    if (yieldToBrowser && rowIndex > 0 && rowIndex % rowBatch === 0) {
      await yieldToBrowser();
      if (shouldContinue && !shouldContinue()) {
        return [];
      }
    }
  }

  return finalizeGroupingCandidates(trackers);
}

export {
  SHEET_NAME_LIMIT,
  buildExportRows,
  buildGroupingCandidates,
  buildGroupingCandidatesAsync,
  getCellExportValue,
  getGroupingDisplayValue,
  getUniqueSheetName,
  normalizeSheetName
};
