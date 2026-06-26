import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { createWorkbookBlob } from '../../src/lib/workbook-export/workbookExport.js';
import { parseQueryResultPayload } from '../../src/core/queryResultParser.js';
import { buildResultTableRowsFromObjectRows } from '../../src/core/queryResultRows.js';
import {
  serializeResultCsv,
  serializeResultJson,
  serializeResultJsonl
} from '../../src/core/queryResultSerialization.js';
import { createStreamedQueryResultReader } from '../../src/core/queryStream.js';
import { createVirtualTablePostFilterController } from '../../src/features/table/virtual-table/virtualTablePostFilters.js';

const DEFAULT_API_URL = 'https://mlp.sirsi.net/uhtbin/query_api.pl';
const SUPPORTED_FORMATS = new Set(['csv', 'json', 'jsonl', 'xlsx']);
const MULTI_VALUE_SEPARATOR = '\x1F';

function parseCliArgs(argv = []) {
  const [command = 'help', ...tokens] = argv;
  const options = {};
  const positionals = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token.startsWith('--')) {
      positionals.push(token);
      continue;
    }

    const equalIndex = token.indexOf('=');
    const rawKey = equalIndex >= 0 ? token.slice(2, equalIndex) : token.slice(2);
    const key = rawKey.trim();
    const nextValue = equalIndex >= 0 ? token.slice(equalIndex + 1) : tokens[index + 1];
    const value = equalIndex >= 0 || (nextValue !== undefined && !String(nextValue).startsWith('--'))
      ? nextValue
      : true;
    if (equalIndex < 0 && value !== true) {
      index += 1;
    }

    if (Object.prototype.hasOwnProperty.call(options, key)) {
      options[key] = Array.isArray(options[key]) ? [...options[key], value] : [options[key], value];
    } else {
      options[key] = value;
    }
  }

  return { command, options, positionals };
}

function printUsage(stream = process.stdout) {
  stream.write(`Usage:
  npm run query:fields -- [--api-url URL] [--search text] [--json] [--output fields.json]
  npm run query:run -- --config query.json [--format xlsx|csv|json|jsonl] [--output report.xlsx]
  npm run query:run -- --display "Title,Item Id" --filter "Item Library=MSU-GRANT" --format csv --output report.csv

Environment:
  QUERY_API_URL or LIVE_API_URL can provide the API URL. Defaults to ${DEFAULT_API_URL}

Config shape:
  {
    "name": "Report name",
    "tableName": "Worksheet name",
    "displayFields": ["Item Id", "Title"],
    "filters": [{ "field": "Title", "operator": "=", "value": "*Grant*" }],
    "postFilters": { "Title": { "filters": [{ "cond": "contains", "val": "Grant" }] } },
    "export": { "format": "xlsx", "output": "Reports/report.xlsx" }
  }
`);
}

function normalizeArray(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === false) return [];
  return [value];
}

function normalizeDisplayFields(value) {
  if (Array.isArray(value)) return value.map(item => String(item || '').trim()).filter(Boolean);
  return String(value || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function parseJsonMaybe(value) {
  const text = String(value || '').trim();
  if (!text || !/^[{[]/u.test(text)) return undefined;
  return JSON.parse(text);
}

function parseFilterArgument(raw) {
  const parsed = parseJsonMaybe(raw);
  if (parsed) return parsed;

  const text = String(raw || '').trim();
  const colonParts = text.split(':');
  if (colonParts.length >= 3) {
    const [field, operator, ...valueParts] = colonParts;
    return {
      field: field.trim(),
      operator: operator.trim() || '=',
      value: parseListValue(valueParts.join(':'))
    };
  }

  const equalIndex = text.indexOf('=');
  if (equalIndex > 0) {
    return {
      field: text.slice(0, equalIndex).trim(),
      operator: '=',
      value: parseListValue(text.slice(equalIndex + 1))
    };
  }

  throw new Error(`Invalid --filter value "${raw}". Use "Field=Value", "Field:operator:Value", or JSON.`);
}

function parsePostFilterArgument(raw) {
  const parsed = parseJsonMaybe(raw);
  if (parsed) return parsed;

  const text = String(raw || '').trim();
  const [field, cond, ...valueParts] = text.split(':');
  if (!field || !cond) {
    throw new Error(`Invalid --post-filter value "${raw}". Use "Field:condition:Value" or JSON.`);
  }
  return {
    field: field.trim(),
    logic: 'all',
    filters: [{ cond: cond.trim(), val: valueParts.join(':').trim() }]
  };
}

function parseListValue(value) {
  const text = String(value || '').trim();
  const parsed = parseJsonMaybe(text);
  if (parsed !== undefined) return parsed;
  if (text.includes(',')) {
    return text.split(',').map(item => item.trim()).filter(Boolean);
  }
  return text;
}

function normalizePostFilters(configPostFilters, cliPostFilters = []) {
  const normalized = {};

  if (configPostFilters && typeof configPostFilters === 'object' && !Array.isArray(configPostFilters)) {
    Object.entries(configPostFilters).forEach(([field, value]) => {
      if (!field || !value) return;
      normalized[field] = {
        logic: value.logic || 'all',
        filters: Array.isArray(value.filters) ? value.filters : []
      };
    });
  }

  cliPostFilters.forEach(entry => {
    if (!entry || typeof entry !== 'object') return;
    const field = String(entry.field || '').trim();
    if (!field) return;
    const existing = normalized[field] || { logic: entry.logic || 'all', filters: [] };
    normalized[field] = {
      logic: entry.logic || existing.logic || 'all',
      filters: [...(existing.filters || []), ...(Array.isArray(entry.filters) ? entry.filters : [])]
    };
  });

  return normalized;
}

async function readConfig(path) {
  if (!path) return {};
  return JSON.parse(await readFile(resolve(path), 'utf8'));
}

function getApiUrl(config = {}, options = {}) {
  return String(
    options['api-url']
    || options.apiUrl
    || config.apiUrl
    || config.api_url
    || process.env.QUERY_API_URL
    || process.env.LIVE_API_URL
    || DEFAULT_API_URL
  ).trim();
}

function normalizeFormat(config = {}, options = {}) {
  const format = String(options.format || config.export?.format || config.format || 'xlsx').trim().toLowerCase();
  if (!SUPPORTED_FORMATS.has(format)) {
    throw new Error(`Unsupported format "${format}". Use one of: ${Array.from(SUPPORTED_FORMATS).join(', ')}`);
  }
  return format;
}

function getOutputPath(config = {}, options = {}, format = 'xlsx') {
  const output = options.output || config.export?.output || config.output;
  if (output) return resolve(String(output));
  const tableName = String(config.tableName || config.table_name || config.name || 'query-results')
    .replace(/[^a-z0-9]+/giu, '-')
    .replace(/^-|-$/gu, '')
    || 'query-results';
  return resolve(`${tableName}.${format}`);
}

function buildRunPayload(config = {}, options = {}) {
  const payload = {
    ...(config.payload && typeof config.payload === 'object' ? config.payload : {}),
    action: 'run',
    result_format: 'jsonl'
  };

  const displayFields = normalizeDisplayFields(
    options.display
    || options['display-fields']
    || config.displayFields
    || config.display_fields
    || payload.display_fields
  );
  if (displayFields.length) payload.display_fields = displayFields;

  const filters = [
    ...normalizeArray(config.filters),
    ...normalizeArray(options.filter).map(parseFilterArgument)
  ];
  if (filters.length) payload.filters = filters;

  const name = options.name || config.name || payload.name;
  if (name) payload.name = String(name);

  if (config.limit !== undefined || options.limit !== undefined) {
    payload.limit = Number(options.limit || config.limit);
  }
  if (config.maxRows !== undefined || config.max_rows !== undefined || options['max-rows'] !== undefined) {
    payload.max_rows = Number(options['max-rows'] || config.maxRows || config.max_rows);
  }

  return payload;
}

async function postJson(apiUrl, payload) {
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`API request failed with HTTP ${response.status}: ${text.slice(0, 500)}`);
  }
  return JSON.parse(text);
}

async function runQuery(apiUrl, payload, options = {}) {
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Query failed with HTTP ${response.status}: ${errorText.slice(0, 500)}`);
  }

  const readStreamedQueryResult = createStreamedQueryResultReader();
  const streamedPayload = await readStreamedQueryResult(response, {
    onProgress: (rowCount, detail = {}) => {
      if (!options.verbose || !detail.progress) return;
      const progress = detail.progress.progress || detail.progress;
      process.stderr.write(`progress: ${progress.label || progress.stage || 'running'} ${rowCount}\\n`);
    }
  });
  if (streamedPayload.streamError) {
    throw streamedPayload.streamError;
  }

  const parsedResults = parseQueryResultPayload({
    response,
    jsonPayload: streamedPayload.jsonPayload,
    displayedFields: payload.display_fields || payload.displayFields || [],
    fallbackColumns: payload.display_fields || payload.displayFields || []
  });
  const meta = streamedPayload.jsonlEvents.find(event => event.type === 'meta') || {};
  const done = [...streamedPayload.jsonlEvents].reverse().find(event => event.type === 'done') || {};
  return {
    columns: parsedResults.headers,
    contentType: response.headers.get('content-type') || '',
    done,
    events: streamedPayload.jsonlEvents,
    meta,
    rawText: streamedPayload.text,
    rows: buildResultTableRowsFromObjectRows(parsedResults.headers, parsedResults.objectRows)
  };
}

function getPostFilterFieldTypeMap(fields = []) {
  return new Map(fields.map(field => [field.name, normalizeFieldType(field.type)]));
}

function normalizeFieldType(type) {
  const normalized = String(type || 'string').toLowerCase();
  if (['integer', 'number'].includes(normalized)) return 'number';
  if (['currency', 'money'].includes(normalized)) return 'money';
  if (normalized === 'date') return 'date';
  if (normalized === 'boolean') return 'boolean';
  return 'string';
}

async function getFieldDefinitions(apiUrl, options = {}) {
  if (options.skipFields) return [];
  const payload = await postJson(apiUrl, { action: 'get_fields' });
  return Array.isArray(payload) ? payload : (Array.isArray(payload.fields) ? payload.fields : []);
}

function applyPostFilters(rows, columns, postFilters, fieldTypes) {
  const entries = Object.entries(postFilters || {}).filter(([, value]) => Array.isArray(value?.filters) && value.filters.length);
  if (!entries.length) return rows;

  const columnMap = new Map(columns.map((field, index) => [field, index]));
  const controller = createVirtualTablePostFilterController({
    getBaseViewData: () => ({ columnMap, headers: columns, rows }),
    getDisplayedFields: () => columns,
    getFieldType: field => fieldTypes.get(field) || 'string'
  });
  controller.assign(postFilters);
  return controller.getFilteredRows();
}

function createSourceData(columns, rows, fieldTypes) {
  return {
    dataRows: rows.map(row => row.map(value => Array.isArray(value) ? value.join(MULTI_VALUE_SEPARATOR) : value)),
    displayedFields: columns,
    fieldTypeMap: new Map(columns.map(field => [field, fieldTypes.get(field) || 'string'])),
    virtualData: {
      columnMap: new Map(columns.map((field, index) => [field, index]))
    }
  };
}

function buildRunDetailsRows({ apiUrl, config, done, fieldCount, format, outputPath, payload, rowCount }) {
  const filters = Array.isArray(payload.filters) ? payload.filters : [];
  return [
    ['CLI Export', 'Name', String(payload.name || config.name || config.tableName || 'Query export')],
    ['CLI Export', 'Generated', new Date().toLocaleString()],
    ['CLI Export', 'Format', format],
    ['CLI Export', 'Output', outputPath],
    ['Source', 'API URL', apiUrl],
    ['Query', 'Rows Exported', String(rowCount)],
    ['Query', 'Done Event Rows', String(done?.rows ?? '')],
    ['Query', 'Displayed Fields', String(fieldCount)],
    ['Query', 'Filters', filters.map((filter, index) => `${index + 1}. ${filter.field} ${filter.operator || '='} ${formatFilterValue(filter.value)}`).join('\n') || '(none)']
  ];
}

function formatFilterValue(value) {
  if (Array.isArray(value)) return value.join(', ');
  if (value && typeof value === 'object') return JSON.stringify(value);
  return String(value ?? '');
}

async function writeXlsx({ apiUrl, columns, config, done, fieldTypes, format, outputPath, payload, rows }) {
  const sourceData = createSourceData(columns, rows, fieldTypes);
  const runDetailsRows = config.export?.includeRunDetails === false
    ? []
    : buildRunDetailsRows({
      apiUrl,
      config,
      done,
      fieldCount: columns.length,
      format,
      outputPath,
      payload,
      rowCount: rows.length
    });
  const { blob } = await createWorkbookBlob({
    config: { mode: 'single', runDetailsRows },
    state: {
      groupingCandidates: [],
      rowCount: rows.length,
      sourceData,
      tableName: config.tableName || config.table_name || payload.name || 'Query Export'
    }
  });
  await writeFile(outputPath, Buffer.from(await blob.arrayBuffer()));
}

async function writeOutput({ apiUrl, columns, config, done, fieldTypes, format, outputPath, payload, rows }) {
  await mkdir(dirname(outputPath), { recursive: true });
  if (format === 'xlsx') {
    await writeXlsx({ apiUrl, columns, config, done, fieldTypes, format, outputPath, payload, rows });
    return;
  }

  const metadata = {
    queryId: done.query_id || payload.query_id,
    request: payload
  };
  const text = format === 'csv'
    ? serializeResultCsv(columns, rows)
    : (format === 'json'
      ? serializeResultJson(columns, rows, metadata)
      : serializeResultJsonl(columns, rows, metadata));
  await writeFile(outputPath, text);
}

function summarizeFields(fields, search = '') {
  const normalizedSearch = String(search || '').trim().toLowerCase();
  return fields
    .filter(field => {
      if (!normalizedSearch) return true;
      return `${field.name || ''} ${field.category || ''} ${field.desc || ''}`.toLowerCase().includes(normalizedSearch);
    })
    .map(field => ({
      name: field.name,
      type: field.type,
      category: field.category,
      filters: Array.isArray(field.filters) ? field.filters.join(', ') : '',
      multiValue: Boolean(field.multiValue || field.returnsMultiple)
    }));
}

function formatFieldTable(fields) {
  const headers = ['Name', 'Type', 'Category', 'Filters', 'Multi'];
  const rows = fields.map(field => [
    field.name || '',
    field.type || '',
    field.category || '',
    field.filters || '',
    field.multiValue ? 'yes' : ''
  ]);
  const widths = headers.map((header, index) => Math.min(42, Math.max(
    header.length,
    ...rows.map(row => String(row[index] || '').length)
  )));
  const renderRow = row => row.map((cell, index) => String(cell || '').slice(0, widths[index]).padEnd(widths[index])).join('  ').trimEnd();
  return `${renderRow(headers)}\n${renderRow(widths.map(width => '-'.repeat(width)))}\n${rows.map(renderRow).join('\n')}\n`;
}

async function runFieldsCommand(options = {}) {
  const apiUrl = getApiUrl({}, options);
  const fields = await getFieldDefinitions(apiUrl);
  const summarized = summarizeFields(fields, options.search);
  const outputPath = options.output ? resolve(String(options.output)) : '';
  const output = options.json
    ? `${JSON.stringify({ apiUrl, fields: summarized }, null, 2)}\n`
    : formatFieldTable(summarized);
  if (outputPath) {
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, output);
  } else {
    process.stdout.write(output);
  }
  return { apiUrl, count: summarized.length, outputPath };
}

async function runRunCommand(options = {}) {
  const config = await readConfig(options.config);
  const apiUrl = getApiUrl(config, options);
  const format = normalizeFormat(config, options);
  const outputPath = getOutputPath(config, options, format);
  const payload = buildRunPayload(config, options);
  const cliPostFilters = normalizeArray(options['post-filter']).map(parsePostFilterArgument);
  const postFilters = normalizePostFilters(config.postFilters || config.post_filters, cliPostFilters);
  config.postFilters = postFilters;

  const fields = await getFieldDefinitions(apiUrl, { skipFields: format !== 'xlsx' && !Object.keys(postFilters).length });
  const fieldTypes = getPostFilterFieldTypeMap(fields);
  const result = await runQuery(apiUrl, payload, { verbose: Boolean(options.verbose) });
  if (!result.columns.length) {
    throw new Error('Query stream did not include meta.columns.');
  }
  const rows = applyPostFilters(result.rows, result.columns, postFilters, fieldTypes);
  await writeOutput({
    apiUrl,
    columns: result.columns,
    config,
    done: result.done,
    fieldTypes,
    format,
    outputPath,
    payload,
    rows
  });
  return {
    backendColumns: Array.isArray(result.meta.columns) ? result.meta.columns.map(String) : [],
    columns: result.columns,
    contentType: result.contentType,
    outputPath,
    rows: rows.length
  };
}

async function main(argv = process.argv.slice(2)) {
  const { command, options } = parseCliArgs(argv);
  if (command === 'help' || options.help) {
    printUsage();
    return { command: 'help' };
  }
  if (command === 'fields') {
    const result = await runFieldsCommand(options);
    if (result.outputPath) {
      process.stdout.write(`Wrote ${result.count} field(s) to ${result.outputPath}\n`);
    }
    return result;
  }
  if (command === 'run') {
    const result = await runRunCommand(options);
    process.stdout.write(`Wrote ${result.rows.toLocaleString()} row(s) to ${result.outputPath}\n`);
    return result;
  }
  throw new Error(`Unknown command "${command}". Run npm run query:cli -- help.`);
}

export {
  DEFAULT_API_URL,
  applyPostFilters,
  buildRunPayload,
  getApiUrl,
  main,
  normalizePostFilters,
  parseCliArgs,
  parseFilterArgument,
  parsePostFilterArgument,
  runFieldsCommand,
  runQuery,
  runRunCommand
};
