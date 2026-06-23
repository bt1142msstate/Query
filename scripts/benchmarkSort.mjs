import { performance } from 'node:perf_hooks';
import { parsePipeDelimitedRow } from '../src/core/formatting/dataFormatters.js';
import { parseQueryResultPayload } from '../src/core/queryResultParser.js';
import { buildExpandedMultiValueTable } from '../src/lib/virtual-table/splitColumnExpansion.js';
import { sortRowsByColumn } from '../src/lib/virtual-table/tableSort.js';

const DEFAULT_API_URL = 'https://mlp.sirsi.net/uhtbin/query_api.pl';
const args = new Set(process.argv.slice(2));
const rowCount = readNumberArg('--rows', 1_000_000);
const targetMs = readNumberArg('--target-ms', 300);
const historyLimit = readNumberArg('--history-limit', 2);
const useHistory = args.has('--history');

function readNumberArg(name, fallback) {
  const prefix = `${name}=`;
  const arg = process.argv.find(value => value.startsWith(prefix));
  if (!arg) return fallback;
  const parsed = Number(arg.slice(prefix.length));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function createSyntheticRows(count) {
  return Array.from({ length: count }, (_, index) => [
    `Title ${String(count - index).padStart(7, '0')}`,
    index % 7 === 0 ? 'Alpha\x1FBeta\x1FGamma' : 'Solo',
    String((count - index) % 1_000_000),
    String(20240101 + (index % 28))
  ]);
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)] || 0;
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function timeSort(label, createRows, colIndex, type, direction = 'asc', runs = 5) {
  const elapsed = [];
  let sortedSample = '';

  for (let runIndex = 0; runIndex < runs; runIndex += 1) {
    const rows = createRows();
    const started = performance.now();
    sortRowsByColumn(rows, colIndex, type, direction);
    const elapsedMs = performance.now() - started;
    elapsed.push(elapsedMs);
    sortedSample = rows[0]?.[colIndex] ?? '';
  }

  const medianMs = median(elapsed);
  return {
    elapsedMs: elapsed.map(round),
    label,
    medianMs: round(medianMs),
    sortedSample,
    targetMs,
    withinTarget: medianMs < targetMs
  };
}

function runSyntheticBenchmarks() {
  const rawHeaders = ['Title', 'Public Note', 'Bill Count', 'Due Date'];
  const results = [
    timeSort(
      'synthetic raw string 1m',
      () => createSyntheticRows(rowCount),
      0,
      'string'
    ),
    timeSort(
      'synthetic raw number 1m',
      () => createSyntheticRows(rowCount),
      2,
      'number'
    ),
    timeSort(
      'synthetic lazy split string 1m',
      () => {
        const rawTableData = {
          headers: rawHeaders,
          rows: createSyntheticRows(rowCount),
          columnMap: new Map(rawHeaders.map((field, index) => [field, index]))
        };
        const split = buildExpandedMultiValueTable(rawTableData, { lazyRows: true });
        return split.rows;
      },
      2,
      'string'
    )
  ];

  return {
    kind: 'synthetic',
    rowCount,
    targetMs,
    results
  };
}

async function postJson(payload) {
  const response = await fetch(DEFAULT_API_URL, {
    body: JSON.stringify(payload),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST'
  });
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text };
  }
  if (!response.ok) {
    throw new Error(data?.error || `Server error: ${response.status} ${response.statusText}`);
  }
  return data;
}

async function postResultPayload(queryId) {
  const response = await fetch(DEFAULT_API_URL, {
    body: JSON.stringify({ action: 'get_results', query_id: queryId }),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST'
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || `Server error: ${response.status} ${response.statusText}`);
  }
  return { response, text };
}

function extractDisplayedFields(queryInfo) {
  const request = queryInfo?.request || {};
  const uiConfig = request.ui_config || request.uiConfig || {};
  return [
    uiConfig.DesiredColumnOrder,
    uiConfig.displayedFields,
    request.displayed_fields,
    request.displayedFields,
    request.columns,
    request.fields
  ].find(Array.isArray) || [];
}

function parseHistoryResultTable({ queryInfo, response, text }) {
  const contentType = response.headers.get('Content-Type') || '';
  const rawColumns = (response.headers.get('X-Raw-Columns') || '')
    .split('|')
    .map(column => column.trim())
    .filter(Boolean);
  const displayedFields = extractDisplayedFields(queryInfo);

  if (contentType.includes('application/json')) {
    const jsonPayload = JSON.parse(text || '{}');
    const parsed = parseQueryResultPayload({
      displayedFields,
      fallbackColumns: rawColumns,
      jsonPayload,
      response,
      text
    });
    const headers = parsed.headers;
    return {
      headers,
      rows: parsed.objectRows.map(row => headers.map(header => row[header] ?? ''))
    };
  }

  const headers = rawColumns.length ? rawColumns : displayedFields;
  const lines = String(text || '').split(/\r?\n/u).filter(line => line.trim().length > 0);
  return {
    headers,
    rows: lines.map(line => {
      const row = parsePipeDelimitedRow(line, headers);
      return headers.map(header => row[header] ?? '');
    })
  };
}

function buildColumnMap(headers) {
  return new Map(headers.map((header, index) => [header, index]));
}

function findMultiValueColumnIndex(rows, headers) {
  for (let columnIndex = 0; columnIndex < headers.length; columnIndex += 1) {
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
      if (typeof rows[rowIndex]?.[columnIndex] === 'string' && rows[rowIndex][columnIndex].includes('\x1F')) {
        return columnIndex;
      }
    }
  }
  return -1;
}

function timeSingleSort(rows, colIndex, type = 'string') {
  const sortableRows = rows.slice();
  const started = performance.now();
  sortRowsByColumn(sortableRows, colIndex, type, 'asc');
  return {
    elapsedMs: round(performance.now() - started),
    sample: sortableRows[0]?.[colIndex] ?? ''
  };
}

async function runHistoryBenchmarks() {
  const statusPayload = await postJson({ action: 'status' });
  const queries = Object.entries(statusPayload?.queries || {})
    .map(([id, info]) => ({ id, ...(info || {}) }))
    .filter(query => query.status === 'complete' && Number(query.row_count) > 0)
    .sort((left, right) => Number(right.row_count || 0) - Number(left.row_count || 0))
    .slice(0, historyLimit);

  const results = [];
  for (const query of queries) {
    const fetchStarted = performance.now();
    const payload = await postResultPayload(query.id);
    const fetchMs = performance.now() - fetchStarted;
    const parseStarted = performance.now();
    const table = parseHistoryResultTable({
      queryInfo: query,
      response: payload.response,
      text: payload.text
    });
    const parseMs = performance.now() - parseStarted;
    const firstSort = table.headers.length
      ? timeSingleSort(table.rows, 0, 'string')
      : { elapsedMs: 0, sample: '' };
    const multiValueColumnIndex = findMultiValueColumnIndex(table.rows, table.headers);
    let splitSort = null;

    if (multiValueColumnIndex !== -1) {
      const rawTableData = {
        headers: table.headers,
        rows: table.rows,
        columnMap: buildColumnMap(table.headers)
      };
      const split = buildExpandedMultiValueTable(rawTableData, { lazyRows: true });
      const parentField = table.headers[multiValueColumnIndex];
      const splitChildren = split.splitColumnGroups.get(parentField) || [];
      const splitField = splitChildren[Math.min(1, splitChildren.length - 1)] || splitChildren[0];
      const splitColIndex = split.columnMap.get(splitField);
      const started = performance.now();
      sortRowsByColumn(split.rows, splitColIndex, 'string', 'asc');
      splitSort = {
        elapsedMs: round(performance.now() - started),
        field: splitField,
        sample: split.rows[0]?.[splitColIndex] ?? ''
      };
    }

    results.push({
      columns: table.headers,
      fetchMs: round(fetchMs),
      firstFieldSort: {
        ...firstSort,
        field: table.headers[0] || ''
      },
      id: query.id,
      name: query.name || query.id,
      parseMs: round(parseMs),
      reportedRows: Number(query.row_count || 0),
      rowCount: table.rows.length,
      splitSort
    });
  }

  return {
    kind: 'history',
    queryCount: results.length,
    results,
    targetMs
  };
}

const report = useHistory ? await runHistoryBenchmarks() : runSyntheticBenchmarks();
console.log(JSON.stringify(report, null, 2));

const measuredResults = report.results.flatMap(result => {
  if (report.kind === 'history') {
    return [result.firstFieldSort, result.splitSort].filter(Boolean);
  }
  return [result];
});

if (measuredResults.some(result => Number(result.medianMs ?? result.elapsedMs) >= targetMs)) {
  process.exitCode = 1;
}
