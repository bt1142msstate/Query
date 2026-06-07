import { normalizeResultCellValue as normalizeResultValue } from './resultCellValues.js';

function normalizeColumnName(column) {
  if (typeof column === 'string') return column;
  if (!column || typeof column !== 'object') return '';
  return String(
    column.name
    ?? column.label
    ?? column.fieldName
    ?? column.field
    ?? column.id
    ?? column.key
    ?? ''
  );
}

function getColumnAliases(column) {
  if (typeof column === 'string') return [column];
  if (!column || typeof column !== 'object') return [];

  return [
    column.name,
    column.label,
    column.fieldName,
    column.field,
    column.id,
    column.key,
    column.source,
    column.sourceName,
    column.output,
    column.column
  ]
    .filter(value => value !== undefined && value !== null && String(value).trim() !== '')
    .map(value => String(value));
}

function normalizeColumnDescriptor(column) {
  const header = normalizeColumnName(column);
  const aliases = getColumnAliases(column);
  if (header && !aliases.includes(header)) {
    aliases.unshift(header);
  }
  return { header, aliases };
}

function normalizeColumnDescriptors(columns) {
  return Array.isArray(columns)
    ? columns.map(normalizeColumnDescriptor).filter(descriptor => descriptor.header)
    : [];
}

function normalizeColumns(columns) {
  return normalizeColumnDescriptors(columns).map(descriptor => descriptor.header);
}

function getPayloadRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  return payload.rows
    || payload.results
    || payload.data
    || payload.items
    || payload.records
    || [];
}

function getPayloadColumnDescriptors(payload, rows) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return normalizeColumnDescriptors(inferColumnsFromRows(rows));
  }

  return normalizeColumnDescriptors(
    payload.columns
    || payload.headers
    || payload.fields
    || payload.rawColumns
    || payload.columnOrder
  );
}

function inferColumnsFromRows(rows) {
  const seen = new Set();
  const columns = [];
  rows.forEach(row => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return;
    Object.keys(row).forEach(key => {
      if (seen.has(key)) return;
      seen.add(key);
      columns.push(key);
    });
  });
  return columns;
}

function createCaseInsensitiveLookup(row) {
  const lookup = new Map();
  Object.keys(row).forEach(key => {
    lookup.set(String(key).toLowerCase(), key);
  });
  return lookup;
}

function getObjectRowValue(row, candidates) {
  const source = row && typeof row.values === 'object' && !Array.isArray(row.values)
    ? row.values
    : row;

  const keys = (Array.isArray(candidates) ? candidates : [candidates])
    .filter(value => value !== undefined && value !== null && String(value).trim() !== '')
    .map(value => String(value));

  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      return source[key];
    }
  }

  const lookup = createCaseInsensitiveLookup(source);
  for (const key of keys) {
    const matchedKey = lookup.get(String(key).toLowerCase());
    if (matchedKey) return source[matchedKey];
  }

  return undefined;
}

function getHeaderAliases(header, index, columnDescriptors) {
  const normalizedHeader = String(header || '').toLowerCase();
  const matchedDescriptor = columnDescriptors.find(descriptor => {
    return descriptor.aliases.some(alias => alias.toLowerCase() === normalizedHeader);
  });
  const descriptor = matchedDescriptor || columnDescriptors[index];
  const aliases = [header, ...(descriptor?.aliases || [])]
    .filter(value => value !== undefined && value !== null && String(value).trim() !== '')
    .map(value => String(value));
  return Array.from(new Set(aliases));
}

function findColumnIndexForHeader(header, fallbackIndex, columnDescriptors) {
  if (!columnDescriptors.length) return fallbackIndex;
  const normalizedHeader = String(header || '').toLowerCase();
  const matchedIndex = columnDescriptors.findIndex(descriptor => {
    return descriptor.aliases.some(alias => alias.toLowerCase() === normalizedHeader);
  });
  return matchedIndex === -1 ? fallbackIndex : matchedIndex;
}

function mapJsonRowToObject(row, headers, columnDescriptors) {
  if (Array.isArray(row)) {
    const mapped = {};
    headers.forEach((header, index) => {
      const sourceIndex = findColumnIndexForHeader(header, index, columnDescriptors);
      mapped[header] = normalizeResultValue(row[sourceIndex]);
    });
    return mapped;
  }

  if (row && typeof row === 'object') {
    const mapped = {};
    headers.forEach((header, index) => {
      mapped[header] = normalizeResultValue(getObjectRowValue(row, getHeaderAliases(header, index, columnDescriptors)));
    });
    return mapped;
  }

  const mapped = {};
  headers.forEach((header, index) => {
    mapped[header] = index === 0 ? normalizeResultValue(row) : '';
  });
  return mapped;
}

function parseJsonResultPayload(payload, options = {}) {
  const rows = getPayloadRows(payload);
  const payloadColumnDescriptors = getPayloadColumnDescriptors(payload, rows);
  const payloadColumns = payloadColumnDescriptors.map(descriptor => descriptor.header);
  const fallbackColumns = normalizeColumns(options.fallbackColumns);
  const displayedColumns = normalizeColumns(options.displayedFields);
  const headers = displayedColumns.length
    ? displayedColumns
    : (payloadColumns.length ? payloadColumns : fallbackColumns);
  const sourceColumnDescriptors = payloadColumnDescriptors.length
    ? payloadColumnDescriptors
    : normalizeColumnDescriptors(headers);

  return {
    headers,
    objectRows: Array.isArray(rows)
      ? rows.map(row => mapJsonRowToObject(row, headers, sourceColumnDescriptors))
      : [],
    source: 'jsonl'
  };
}

function isJsonResultPayload(payload) {
  if (Array.isArray(payload)) return true;
  if (!payload || typeof payload !== 'object') return false;
  return Array.isArray(payload.rows)
    || Array.isArray(payload.results)
    || Array.isArray(payload.data)
    || Array.isArray(payload.items)
    || Array.isArray(payload.records);
}

function parseQueryResultPayload(options = {}) {
  const {
    displayedFields = [],
    fallbackColumns = []
  } = options;
  const jsonPayload = options.jsonPayload;
  if (isJsonResultPayload(jsonPayload)) {
    return parseJsonResultPayload(jsonPayload, { displayedFields, fallbackColumns });
  }

  throw new Error('Query results must be streamed as JSONL row events.');
}

function hasResultRowsPayload(payload) {
  return isJsonResultPayload(payload);
}

export {
  hasResultRowsPayload,
  normalizeResultValue,
  parseQueryResultPayload
};
