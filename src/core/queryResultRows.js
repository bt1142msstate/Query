import { cloneResultCellValue, normalizeResultCellValue } from './resultCellValues.js';

function normalizeResultHeader(header) {
  return String(header || '').trim();
}

function normalizeResultHeaders(headers) {
  return Array.isArray(headers)
    ? headers.map(normalizeResultHeader).filter(Boolean)
    : [];
}

function normalizeResultTableCell(value) {
  return cloneResultCellValue(normalizeResultCellValue(value));
}

function buildResultTableRowsFromObjectRows(headers, objectRows) {
  const normalizedHeaders = normalizeResultHeaders(headers);
  const rows = Array.isArray(objectRows) ? objectRows : [];
  return rows.map(row => normalizedHeaders.map(header => normalizeResultTableCell(row?.[header])));
}

function buildResultObjectRowsFromTableRows(headers, rows) {
  const normalizedHeaders = normalizeResultHeaders(headers);
  const tableRows = Array.isArray(rows) ? rows : [];
  return tableRows.map(row => Object.fromEntries(
    normalizedHeaders.map((header, index) => [header, normalizeResultTableCell(row?.[index])])
  ));
}

function normalizeResultTableRows(headers, rows, objectRows) {
  const normalizedHeaders = normalizeResultHeaders(headers);
  const sourceRows = Array.isArray(rows)
    ? rows
    : buildResultTableRowsFromObjectRows(normalizedHeaders, objectRows);
  return sourceRows.map(row => {
    const cells = Array.isArray(row) ? row : [];
    return normalizedHeaders.map((_, index) => normalizeResultTableCell(cells[index]));
  });
}

export {
  buildResultObjectRowsFromTableRows,
  buildResultTableRowsFromObjectRows,
  normalizeResultHeaders,
  normalizeResultTableCell,
  normalizeResultTableRows
};
