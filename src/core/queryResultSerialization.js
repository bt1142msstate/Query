import { buildResultObjectRowsFromTableRows } from './queryResultRows.js';
import { normalizeResultCellValue } from './resultCellValues.js';

function serializeResultCellForText(value, separator = '\n') {
  if (Array.isArray(value)) {
    const parts = value.map(item => String(item ?? '').trim()).filter(Boolean);
    if (parts.length <= 1) return parts[0] || '';
    return parts.map((item, index) => `${index + 1}. ${item}`).join(separator);
  }

  if (value && typeof value === 'object') {
    return serializeResultCellForText(normalizeResultCellValue(value), separator);
  }

  return String(value ?? '');
}

function serializeResultCsv(columns, rows) {
  const escapeCsv = value => {
    const text = serializeResultCellForText(value);
    return /[",\n\r]/u.test(text) ? `"${text.replace(/"/gu, '""')}"` : text;
  };
  return [
    columns.map(escapeCsv).join(','),
    ...rows.map(row => row.map(escapeCsv).join(','))
  ].join('\n') + '\n';
}

function serializeResultJson(columns, rows, metadata = {}) {
  return `${JSON.stringify({
    ...metadata,
    columns,
    rowCount: rows.length,
    rows: buildResultObjectRowsFromTableRows(columns, rows)
  }, null, 2)}\n`;
}

function serializeResultJsonl(columns, rows, metadata = {}) {
  const queryId = metadata.queryId || metadata.query_id || `cli-${Date.now()}`;
  const lines = [
    JSON.stringify({ type: 'meta', version: 1, format: 'jsonl', query_id: queryId, columns }),
    ...rows.map(row => JSON.stringify({ type: 'row', values: row })),
    JSON.stringify({ type: 'done', rows: rows.length })
  ];
  return `${lines.join('\n')}\n`;
}

export {
  serializeResultCellForText,
  serializeResultCsv,
  serializeResultJson,
  serializeResultJsonl
};
