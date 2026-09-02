import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { replaceFieldDefinitions } from '../../src/core/fieldDefs.js';
import { createWorkbookBlob } from '../../src/lib/workbook-export/workbookExport.js';
import {
  buildGroupingCandidates,
  getCellExportValue,
  getGroupingDisplayValue
} from '../../src/lib/workbook-export/workbookExportData.js';
import { parseQueryResultPayload } from '../../src/core/queryResultParser.js';
import { buildResultTableRowsFromObjectRows } from '../../src/core/queryResultRows.js';
import {
  serializeResultCsv,
  serializeResultJson,
  serializeResultJsonl
} from '../../src/core/queryResultSerialization.js';
import { createStreamedQueryResultReader } from '../../src/core/queryStream.js';
import { buildBackendQueryPayloadFromConfig } from '../../src/features/filters/queryPayload.js';
import { createVirtualTablePostFilterController } from '../../src/features/table/virtual-table/virtualTablePostFilters.js';
import { collapseDuplicateProjectedRows } from '../../src/lib/virtual-table/virtualTableDuplicateCollapse.js';
import { sortRowsByColumn } from '../../src/lib/virtual-table/tableSort.js';
import { createQueryTemplateRepository } from '../../src/features/templates/data/queryTemplateRepository.js';
import { normalizeTemplate } from '../../src/features/templates/data/queryTemplateModels.js';
import { runApiCompatibilityCheck } from '../../src/ui/apiCompatibility.js';
import {
  clearCliSession,
  getCliAuthorizationHeaders,
  getCliSession,
  readSecretFromStdin,
  saveCliSession
} from './queryCliAuth.mjs';
import { pairCliSession } from './queryCliPairing.mjs';

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
  npm run query:login -- --username USERNAME --password-stdin
  npm run query:pair -- [--browser-url https://mlp.sirsi.net/query/]
  npm run query:whoami -- [--api-url URL]
  npm run query:logout -- [--api-url URL]
  npm run query:api -- --action ACTION [--payload request.json|-] [--set key=value] [--output response.json]
  npm run query:compat -- [--api-url URL] [--json]
  npm run query:status -- [--api-url URL] [--json]
  npm run query:dashboard -- [--library CODE | --libraries CODE,CODE] [--item-type CODE] [--active-window-days 90|365|730] [--reporting-period PERIOD] [--output dashboard.json]
  npm run query:plan -- --config query.json [--output plan.json]
  npm run query:cancel -- --query-id QUERY_ID
  npm run query:results -- --query-id QUERY_ID [--format xlsx|csv|json|jsonl] [--output results.xlsx] [--include-duplicates]
  npm run query:templates -- [--json]
  npm run query:run -- --config query.json [--format xlsx|csv|json|jsonl] [--output report.xlsx]
  npm run query:run -- --display "Title,Item Id" --filter "Item Library=MSU-GRANT" --format csv --output report.csv

Environment:
  QUERY_API_URL or LIVE_API_URL can provide the API URL. Defaults to ${DEFAULT_API_URL}
  QUERY_SESSION_TOKEN can provide an approved ephemeral session without storing it.

Config shape:
  {
    "name": "Report name",
    "tableName": "Worksheet name",
    "displayFields": ["Item Id", "Title"],
    "filters": [{ "field": "Title", "operator": "=", "value": "*Grant*" }],
    "postFilters": { "Title": { "filters": [{ "cond": "contains", "val": "Grant" }] } },
    "export": {
      "format": "xlsx",
      "output": "Reports/report.xlsx",
      "groupField": "Item Library",
      "includeOverviewSheet": true
    }
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
  const payload = config.payload && typeof config.payload === 'object'
    ? { ...config.payload }
    : {};

  const displayFields = normalizeDisplayFields(
    options.display
    || options['display-fields']
    || config.displayFields
    || config.display_fields
    || payload.display_fields
  );

  const filters = [
    ...normalizeArray(payload.filters),
    ...normalizeArray(config.filters),
    ...normalizeArray(options.filter).map(parseFilterArgument)
  ];
  delete payload.filters;
  delete payload.display_fields;
  delete payload.displayFields;

  const name = options.name || config.name || payload.name;
  if (name) payload.name = String(name);

  if (config.limit !== undefined || options.limit !== undefined) {
    payload.limit = Number(options.limit || config.limit);
  }
  if (config.maxRows !== undefined || config.max_rows !== undefined || options['max-rows'] !== undefined) {
    payload.max_rows = Number(options['max-rows'] || config.maxRows || config.max_rows);
  }

  return buildBackendQueryPayloadFromConfig({
    ...config,
    displayFields: displayFields.length ? displayFields : config.displayFields,
    filters,
    payload
  }, {
    displayFields: displayFields.length ? displayFields : undefined,
    name
  });
}

async function postJson(apiUrl, payload, options = {}) {
  const authorizationHeaders = options.auth === false
    ? {}
    : await getCliAuthorizationHeaders(apiUrl, options);
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authorizationHeaders },
    body: JSON.stringify(payload)
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`API request failed with HTTP ${response.status}: ${text.slice(0, 500)}`);
  }
  return JSON.parse(text);
}

function getResultDisplayFields(payload, options = {}) {
  return normalizeDisplayFields(
    options.displayFields
    || options.display
    || payload.display_fields
    || payload.displayFields
  );
}

async function runQuery(apiUrl, payload, options = {}) {
  const authorizationHeaders = await getCliAuthorizationHeaders(apiUrl, options);
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authorizationHeaders },
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
    displayedFields: getResultDisplayFields(payload, options),
    fallbackColumns: getResultDisplayFields(payload, options)
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
  const payload = await postJson(apiUrl, { action: 'get_fields' }, options);
  return Array.isArray(payload) ? payload : (Array.isArray(payload.fields) ? payload.fields : []);
}

async function loadCliFieldDefinitions(apiUrl, options = {}) {
  const fields = await getFieldDefinitions(apiUrl, options);
  replaceFieldDefinitions(fields, { restoreDynamicFields: false });
  return fields;
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

function shouldCollapseDuplicateRows(config = {}, options = {}) {
  if (options['include-duplicates'] === true || options.includeDuplicates === true) return false;
  const configured = config.export?.collapseDuplicateRows
    ?? config.export?.collapse_duplicate_rows
    ?? config.collapseDuplicateRows
    ?? config.collapse_duplicate_rows;
  return configured !== false;
}

function collapseRowsForExport(rows, columns, config = {}, options = {}) {
  if (!shouldCollapseDuplicateRows(config, options)) return rows;
  return collapseDuplicateProjectedRows({
    rows,
    displayedFields: columns,
    columnMap: new Map(columns.map((field, index) => [field, index]))
  }).rows;
}

function sortRowsForExport(rows, columns, fieldTypes, config = {}) {
  const criteria = normalizeArray(config.export?.sort || config.sort)
    .map(value => {
      if (typeof value === 'string') {
        const [field, direction = 'asc'] = value.split(':');
        return { field: field.trim(), direction: direction.trim().toLowerCase() };
      }
      return {
        field: String(value?.field || '').trim(),
        direction: String(value?.direction || 'asc').trim().toLowerCase()
      };
    })
    .filter(value => value.field);
  if (!criteria.length) return rows;

  const sortedRows = [...rows];
  [...criteria].reverse().forEach(({ field, direction }) => {
    const columnIndex = columns.indexOf(field);
    if (columnIndex < 0) throw new Error(`Export sort field "${field}" is not one of the exported columns.`);
    sortRowsByColumn(sortedRows, columnIndex, fieldTypes.get(field) || 'string', direction === 'desc' ? 'desc' : 'asc');
  });
  return sortedRows;
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

function formatPostFilterSummary(postFilters = {}) {
  return Object.entries(postFilters)
    .map(([field, value]) => {
      const joiner = String(value?.logic || 'all').toLowerCase() === 'any' ? ' OR ' : ' AND ';
      const filters = normalizeArray(value?.filters).map(filter => {
        const condition = String(filter?.cond || '').replace(/_/gu, ' ').trim();
        const values = normalizeArray(filter?.vals ?? filter?.val).filter(item => item !== '').join(', ');
        return values ? `${condition}: ${values}` : condition;
      }).filter(Boolean);
      return filters.length ? `${field}: ${filters.join(joiner)}` : '';
    })
    .filter(Boolean)
    .join('\n');
}

function buildRunDetailsRows({ apiUrl, config, done, fieldCount, format, outputPath, payload, postFilteredRowCount, rowCount }) {
  const filters = Array.isArray(payload.filters) && payload.filters.length
    ? payload.filters
    : normalizeArray(config.filters);
  const duplicateRowsCollapsed = Math.max(0, Number(postFilteredRowCount || 0) - Number(rowCount || 0));
  const rows = [
    ['CLI Export', 'Name', String(payload.name || config.name || config.tableName || 'Query export')],
    ['CLI Export', 'Generated', new Date().toLocaleString()],
    ['CLI Export', 'Format', format],
    ['CLI Export', 'Output', outputPath],
    ['Source', 'API URL', apiUrl],
    ['Query', 'Rows Exported', String(rowCount)],
    ['Query', 'Raw Result Rows', String(done?.rows ?? '')],
    ['Query', 'Rows Matching Post Filters', String(postFilteredRowCount ?? rowCount)],
    ['Query', 'Duplicate Rows Collapsed', String(duplicateRowsCollapsed)],
    ['Query', 'Displayed Fields', String(fieldCount)],
    ['Query', 'Filters', filters.map((filter, index) => `${index + 1}. ${filter.field} ${filter.operator || '='} ${formatFilterValue(filter.value)}`).join('\n') || '(none)']
  ];
  const postFilterSummary = formatPostFilterSummary(config.postFilters || config.post_filters);
  if (postFilterSummary) rows.push(['Query', 'Post Filters', postFilterSummary]);
  return rows;
}

function formatFilterValue(value) {
  if (Array.isArray(value)) return value.join(', ');
  if (value && typeof value === 'object') return JSON.stringify(value);
  return String(value ?? '');
}

async function writeXlsx({ apiUrl, columns, config, done, fieldTypes, format, outputPath, payload, postFilteredRowCount, rows }) {
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
      postFilteredRowCount,
      rowCount: rows.length
    });
  const groupField = String(config.export?.groupField || config.export?.group_field || '').trim();
  const grouped = Boolean(groupField);
  if (grouped && !columns.includes(groupField)) {
    throw new Error(`Excel grouping field "${groupField}" is not one of the exported columns.`);
  }
  let groupingCandidates = grouped ? buildGroupingCandidates(sourceData) : [];
  const configuredGroupValues = normalizeArray(config.export?.groupValues || config.export?.group_values)
    .map(getGroupingDisplayValue)
    .filter(Boolean);
  if (grouped && configuredGroupValues.length) {
    const fieldIndex = columns.indexOf(groupField);
    const columnIndex = sourceData.virtualData.columnMap.get(groupField);
    const counts = new Map(configuredGroupValues.map(value => [value, 0]));
    rows.forEach(row => {
      const label = getGroupingDisplayValue(getCellExportValue(row[columnIndex], fieldTypes.get(groupField)));
      counts.set(label, (counts.get(label) || 0) + 1);
    });
    groupingCandidates = [{ counts, distinctCount: counts.size, field: groupField, index: fieldIndex }];
  }
  const { blob } = await createWorkbookBlob({
    config: {
      groupField,
      includeMasterSheet: Boolean(config.export?.includeMasterSheet ?? config.export?.include_master_sheet),
      includeOverviewSheet: Boolean(config.export?.includeOverviewSheet ?? config.export?.include_overview_sheet),
      mode: grouped ? 'grouped' : 'single',
      runDetailsRows
    },
    state: {
      groupingCandidates,
      rowCount: rows.length,
      sourceData,
      tableName: config.tableName || config.table_name || payload.name || 'Query Export'
    }
  });
  await writeFile(outputPath, Buffer.from(await blob.arrayBuffer()));
}

async function writeOutput({ apiUrl, columns, config, done, fieldTypes, format, outputPath, payload, postFilteredRowCount, rows }) {
  await mkdir(dirname(outputPath), { recursive: true });
  if (format === 'xlsx') {
    await writeXlsx({ apiUrl, columns, config, done, fieldTypes, format, outputPath, payload, postFilteredRowCount, rows });
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

async function writeTextOutput({ outputPath = '', text }) {
  if (outputPath) {
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, text);
  } else {
    process.stdout.write(text);
  }
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
  const fields = await loadCliFieldDefinitions(apiUrl, options);
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

function formatCompatibilityTable(result) {
  const rows = result.checks || [];
  const statusWidth = Math.max(6, ...rows.map(row => String(row.status || '').length));
  const labelWidth = Math.max(5, ...rows.map(row => String(row.label || '').length));
  const lines = rows.map(row => {
    return `${String(row.status || '').padEnd(statusWidth)}  ${String(row.label || '').padEnd(labelWidth)}  ${row.detail || ''}`.trimEnd();
  });
  const summary = result.summary || {};
  return [
    `Compatibility: ${summary.supported || 0} supported, ${summary.warning || 0} warning, ${summary.missing || 0} missing, ${summary.failed || 0} failed`,
    ...lines
  ].join('\n') + '\n';
}

async function runCompatCommand(options = {}) {
  const apiUrl = getApiUrl({}, options);
  const headers = await getCliAuthorizationHeaders(apiUrl, options);
  const result = await runApiCompatibilityCheck(apiUrl, {
    headers,
    limit: Number(options.limit) || undefined,
    maxFields: Number(options['max-fields']) || undefined,
    maxRows: Number(options['max-rows']) || undefined,
    timeoutMs: Number(options.timeout) || undefined
  });
  const outputPath = options.output ? resolve(String(options.output)) : '';
  const output = options.json
    ? `${JSON.stringify({ apiUrl, ...result }, null, 2)}\n`
    : formatCompatibilityTable(result);
  await writeTextOutput({ outputPath, text: output });
  return { apiUrl, outputPath, summary: result.summary };
}

function getQueryId(options = {}, config = {}) {
  const queryId = String(
    options['query-id']
    || options.queryId
    || options.id
    || config.queryId
    || config.query_id
    || config.id
    || ''
  ).trim();
  if (!queryId) {
    throw new Error('A query id is required. Use --query-id QUERY_ID.');
  }
  return queryId;
}

function formatStatusTable(data) {
  const queries = Array.isArray(data?.queries)
    ? data.queries
    : (Array.isArray(data) ? data : []);
  if (!queries.length) {
    return `${JSON.stringify(data, null, 2)}\n`;
  }

  const headers = ['Status', 'Rows', 'Name', 'ID'];
  const rows = queries.map(query => [
    query.status || (query.running ? 'running' : ''),
    query.resultCount ?? query.result_count ?? query.rows ?? '',
    query.name || '',
    query.id || query.query_id || ''
  ]);
  const widths = headers.map((header, index) => Math.min(48, Math.max(
    header.length,
    ...rows.map(row => String(row[index] || '').length)
  )));
  const renderRow = row => row.map((cell, index) => String(cell || '').slice(0, widths[index]).padEnd(widths[index])).join('  ').trimEnd();
  return `${renderRow(headers)}\n${renderRow(widths.map(width => '-'.repeat(width)))}\n${rows.map(renderRow).join('\n')}\n`;
}

async function runStatusCommand(options = {}) {
  const apiUrl = getApiUrl({}, options);
  const data = await postJson(apiUrl, { action: 'status' }, options);
  const outputPath = options.output ? resolve(String(options.output)) : '';
  const output = options.json ? `${JSON.stringify({ apiUrl, data }, null, 2)}\n` : formatStatusTable(data);
  await writeTextOutput({ outputPath, text: output });
  return { apiUrl, outputPath };
}

async function runCancelCommand(options = {}) {
  const apiUrl = getApiUrl({}, options);
  const queryId = getQueryId(options);
  const data = await postJson(apiUrl, { action: 'cancel', id: queryId, query_id: queryId }, options);
  const outputPath = options.output ? resolve(String(options.output)) : '';
  const output = `${JSON.stringify({ apiUrl, queryId, data }, null, 2)}\n`;
  await writeTextOutput({ outputPath, text: output });
  return { apiUrl, outputPath, queryId };
}

async function runResultsCommand(options = {}) {
  const config = await readConfig(options.config);
  const apiUrl = getApiUrl(config, options);
  const format = normalizeFormat(config, options);
  const outputPath = getOutputPath(config, options, format);
  const queryId = getQueryId(options, config);
  const fields = await loadCliFieldDefinitions(apiUrl, options);
  const fieldTypes = getPostFilterFieldTypeMap(fields);
  const displayFields = normalizeDisplayFields(
    options.display
    || options['display-fields']
    || config.displayFields
    || config.display_fields
  );
  const result = await runQuery(apiUrl, {
    action: 'get_results',
    id: queryId,
    query_id: queryId,
    result_format: 'jsonl'
  }, {
    ...options,
    displayFields,
    verbose: Boolean(options.verbose)
  });
  if (!result.columns.length) {
    throw new Error('Saved result stream did not include meta.columns.');
  }
  const cliPostFilters = normalizeArray(options['post-filter']).map(parsePostFilterArgument);
  const postFilters = normalizePostFilters(config.postFilters || config.post_filters, cliPostFilters);
  const postFilteredRows = applyPostFilters(result.rows, result.columns, postFilters, fieldTypes);
  const collapsedRows = collapseRowsForExport(postFilteredRows, result.columns, config, options);
  const rows = sortRowsForExport(collapsedRows, result.columns, fieldTypes, config);
  await writeOutput({
    apiUrl,
    columns: result.columns,
    config,
    done: result.done,
    fieldTypes,
    format,
    outputPath,
    payload: {
      action: 'get_results',
      query_id: queryId
    },
    postFilteredRowCount: postFilteredRows.length,
    rows
  });
  return {
    apiUrl,
    columns: result.columns,
    outputPath,
    queryId,
    rows: rows.length
  };
}

function normalizeTemplateListResponse(data) {
  if (Array.isArray(data)) return data;
  return data?.templates || data?.items || data?.results || [];
}

function formatTemplateTable(templates = []) {
  const normalizedTemplates = templates.map(normalizeTemplate);
  if (!normalizedTemplates.length) {
    return 'No templates found.\n';
  }
  const headers = ['Name', 'Pinned', 'Categories', 'Updated'];
  const rows = normalizedTemplates.map(template => [
    template.name,
    template.pinned ? 'yes' : '',
    (template.categories || []).map(category => category.name).join(', '),
    template.updatedAt || ''
  ]);
  const widths = headers.map((header, index) => Math.min(48, Math.max(
    header.length,
    ...rows.map(row => String(row[index] || '').length)
  )));
  const renderRow = row => row.map((cell, index) => String(cell || '').slice(0, widths[index]).padEnd(widths[index])).join('  ').trimEnd();
  return `${renderRow(headers)}\n${renderRow(widths.map(width => '-'.repeat(width)))}\n${rows.map(renderRow).join('\n')}\n`;
}

async function runTemplatesCommand(options = {}) {
  const apiUrl = getApiUrl({}, options);
  const repository = createQueryTemplateRepository({
    postJson: async payload => ({ data: await postJson(apiUrl, payload, options) })
  });
  const data = await repository.listTemplates();
  const templates = normalizeTemplateListResponse(data);
  const outputPath = options.output ? resolve(String(options.output)) : '';
  const output = options.json
    ? `${JSON.stringify({ apiUrl, templates }, null, 2)}\n`
    : formatTemplateTable(templates);
  await writeTextOutput({ outputPath, text: output });
  return { apiUrl, count: templates.length, outputPath };
}

async function runRunCommand(options = {}) {
  const config = await readConfig(options.config);
  const apiUrl = getApiUrl(config, options);
  const format = normalizeFormat(config, options);
  const outputPath = getOutputPath(config, options, format);
  const fields = await loadCliFieldDefinitions(apiUrl, options);
  const payload = buildRunPayload(config, options);
  const cliPostFilters = normalizeArray(options['post-filter']).map(parsePostFilterArgument);
  const postFilters = normalizePostFilters(config.postFilters || config.post_filters, cliPostFilters);
  config.postFilters = postFilters;

  const fieldTypes = getPostFilterFieldTypeMap(fields);
  const result = await runQuery(apiUrl, payload, { ...options, verbose: Boolean(options.verbose) });
  if (!result.columns.length) {
    throw new Error('Query stream did not include meta.columns.');
  }
  const postFilteredRows = applyPostFilters(result.rows, result.columns, postFilters, fieldTypes);
  const collapsedRows = collapseRowsForExport(postFilteredRows, result.columns, config, options);
  const rows = sortRowsForExport(collapsedRows, result.columns, fieldTypes, config);
  await writeOutput({
    apiUrl,
    columns: result.columns,
    config,
    done: result.done,
    fieldTypes,
    format,
    outputPath,
    payload,
    postFilteredRowCount: postFilteredRows.length,
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

function parseSetArgument(raw) {
  const text = String(raw || '');
  const equalIndex = text.indexOf('=');
  if (equalIndex <= 0) {
    throw new Error(`Invalid --set value "${raw}". Use key=value.`);
  }
  const key = text.slice(0, equalIndex).trim();
  const valueText = text.slice(equalIndex + 1).trim();
  if (!key) throw new Error('A --set key cannot be blank.');
  let value = valueText;
  try {
    value = JSON.parse(valueText);
  } catch (_error) {
    // Plain strings intentionally remain strings.
  }
  return { key, value };
}

async function readStdinText(stream = process.stdin) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks.map(chunk => Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))).toString('utf8');
}

async function buildApiPayload(options = {}) {
  let payload = {};
  if (options.payload) {
    const payloadText = options.payload === '-'
      ? await readStdinText(options.stdin || process.stdin)
      : await readFile(resolve(String(options.payload)), 'utf8');
    payload = JSON.parse(payloadText);
  } else if (options.data) {
    payload = JSON.parse(String(options.data));
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('API payload must be a JSON object.');
  }
  for (const entry of normalizeArray(options.set)) {
    const { key, value } = parseSetArgument(entry);
    payload[key] = value;
  }
  const action = String(options.action || payload.action || '').trim();
  if (!action) throw new Error('An API action is required. Use --action ACTION or include action in --payload.');
  if (action === 'login') {
    throw new Error('Use query:login for sign-in so the session token is never printed or written as API output.');
  }
  return { ...payload, action };
}

async function runApiCommand(options = {}) {
  const apiUrl = getApiUrl({}, options);
  const payload = await buildApiPayload(options);
  const authApiUrl = String(options['auth-api-url'] || options.authApiUrl || apiUrl).trim();
  let requestOrigin;
  let authOrigin;
  try {
    requestOrigin = new URL(apiUrl).origin;
    authOrigin = new URL(authApiUrl).origin;
  } catch (_error) {
    throw new Error('API and authentication URLs must be valid HTTPS URLs.');
  }
  if (!apiUrl.startsWith('https://') || !authApiUrl.startsWith('https://')) {
    throw new Error('API and authentication URLs must use HTTPS.');
  }
  if (requestOrigin !== authOrigin) {
    throw new Error('Refusing to send a Query CLI session to a different origin.');
  }
  const headers = await getCliAuthorizationHeaders(authApiUrl, options);
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      Accept: 'application/json, application/x-ndjson, application/octet-stream;q=0.8, */*;q=0.5',
      'Content-Type': 'application/json',
      ...headers
    },
    body: JSON.stringify(payload)
  });
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!response.ok) {
    throw new Error(`API request failed with HTTP ${response.status}: ${buffer.toString('utf8').slice(0, 500)}`);
  }
  const contentType = response.headers.get('content-type') || '';
  let output = buffer;
  if (!options.raw && /(?:application\/json|\+json)/iu.test(contentType)) {
    output = Buffer.from(`${JSON.stringify(JSON.parse(buffer.toString('utf8') || '{}'), null, 2)}\n`);
  }
  const outputPath = options.output ? resolve(String(options.output)) : '';
  if (outputPath) {
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, output);
  } else {
    process.stdout.write(output);
    if (output.length && output[output.length - 1] !== 10) process.stdout.write('\n');
  }
  return { action: payload.action, apiUrl, authApiUrl, bytes: output.length, contentType, outputPath };
}

async function runDashboardCommand(options = {}) {
  const apiUrl = getApiUrl({}, options);
  const libraries = (Array.isArray(options.libraries) ? options.libraries : [options.libraries])
    .filter(value => value !== undefined && value !== null)
    .flatMap(value => String(value).split(','))
    .map(value => value.trim())
    .filter(Boolean);
  const payload = {
    action: 'library_dashboard',
    library: String(options.library || 'all'),
    item_type: String(options['item-type'] || options.itemType || 'all'),
    active_window_days: Number(options['active-window-days'] || options.activeWindowDays || 365),
    reporting_period: String(options['reporting-period'] || options.reportingPeriod || options['active-window-days'] || options.activeWindowDays || 365),
    force_refresh: Boolean(options.refresh)
  };
  if (libraries.length) payload.libraries = [...new Set(libraries)];
  const data = await postJson(apiUrl, payload, options);
  const outputPath = options.output ? resolve(String(options.output)) : '';
  await writeTextOutput({ outputPath, text: `${JSON.stringify(data, null, 2)}\n` });
  return { apiUrl, outputPath, schemaVersion: Number(data.schema_version || 0) };
}

async function runPlanCommand(options = {}) {
  const config = await readConfig(options.config);
  const apiUrl = getApiUrl(config, options);
  const payload = { ...buildRunPayload(config, options), action: 'query_plan' };
  const data = await postJson(apiUrl, payload, options);
  const outputPath = options.output ? resolve(String(options.output)) : '';
  await writeTextOutput({ outputPath, text: `${JSON.stringify(data, null, 2)}\n` });
  return { apiUrl, outputPath, changed: Boolean(data.changed), eta: data.eta || {} };
}

async function runLoginCommand(options = {}) {
  const apiUrl = getApiUrl({}, options);
  const username = String(options.username || '').trim();
  if (!username) throw new Error('A username is required. Use --username USERNAME.');
  if (!options['password-stdin']) {
    throw new Error('For safety, passwords are accepted only through --password-stdin.');
  }
  const password = await readSecretFromStdin(options.stdin || process.stdin);
  if (!password) throw new Error('The password read from stdin was blank.');
  const data = await postJson(apiUrl, { action: 'login', username, password }, { ...options, auth: false });
  if (!data.token) throw new Error(data.error || 'Sign in failed.');
  await saveCliSession(apiUrl, data, options);
  const identity = data.display_name || data.username || username;
  process.stdout.write(`Signed in as ${identity}. Session saved in macOS Keychain.\n`);
  return { apiUrl, role: data.role || '', username: data.username || username };
}

async function runPairCommand(options = {}) {
  const apiUrl = getApiUrl({}, options);
  let existingSession = null;
  try {
    existingSession = await getCliSession(apiUrl, options);
  } catch (_error) {
    await clearCliSession(apiUrl, options);
  }
  if (existingSession?.token) {
    try {
      const identity = await postJson(apiUrl, { action: 'whoami' }, options);
      if (identity.authenticated) {
        process.stdout.write(`Already paired as ${identity.display_name || identity.username}.\n`);
        return { apiUrl, alreadyPaired: true, username: identity.username || '' };
      }
    } catch (_error) {
      // An invalid or expired saved session can be replaced by browser pairing.
    }
  }
  process.stdout.write('Opening the Query Website to authorize this CLI session...\n');
  const session = await pairCliSession({
    ...options,
    apiUrl,
    browserUrl: options['browser-url'] || options.browserUrl,
    timeoutMs: Number(options.timeout) > 0 ? Number(options.timeout) * 1000 : undefined
  });
  const identity = session.display_name || session.username;
  process.stdout.write(`Paired as ${identity}. Session saved in macOS Keychain.\n`);
  return { apiUrl, alreadyPaired: false, role: session.role || '', username: session.username || '' };
}

async function runWhoamiCommand(options = {}) {
  const apiUrl = getApiUrl({}, options);
  const data = await postJson(apiUrl, { action: 'whoami' }, options);
  const outputPath = options.output ? resolve(String(options.output)) : '';
  const output = `${JSON.stringify(data, null, 2)}\n`;
  await writeTextOutput({ outputPath, text: output });
  return { apiUrl, authenticated: Boolean(data.authenticated), outputPath, username: data.username || '' };
}

async function runLogoutCommand(options = {}) {
  const apiUrl = getApiUrl({}, options);
  const session = await getCliSession(apiUrl, options);
  try {
    if (session?.token) await postJson(apiUrl, { action: 'logout' }, options);
  } finally {
    await clearCliSession(apiUrl, options);
  }
  process.stdout.write('Signed out and removed the saved Query CLI session.\n');
  return { apiUrl };
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
  if (command === 'login') return runLoginCommand(options);
  if (command === 'pair') return runPairCommand(options);
  if (command === 'whoami') return runWhoamiCommand(options);
  if (command === 'logout') return runLogoutCommand(options);
  if (command === 'api') {
    const result = await runApiCommand(options);
    if (result.outputPath) process.stdout.write(`Wrote ${result.action} response to ${result.outputPath}\n`);
    return result;
  }
  if (command === 'dashboard') {
    const result = await runDashboardCommand(options);
    if (result.outputPath) process.stdout.write(`Wrote dashboard snapshot to ${result.outputPath}\n`);
    return result;
  }
  if (command === 'plan') {
    const result = await runPlanCommand(options);
    if (result.outputPath) process.stdout.write(`Wrote smart query plan to ${result.outputPath}\n`);
    return result;
  }
  if (command === 'compat') {
    const result = await runCompatCommand(options);
    if (result.outputPath) {
      process.stdout.write(`Wrote compatibility report to ${result.outputPath}\n`);
    }
    return result;
  }
  if (command === 'status') {
    const result = await runStatusCommand(options);
    if (result.outputPath) {
      process.stdout.write(`Wrote query status to ${result.outputPath}\n`);
    }
    return result;
  }
  if (command === 'cancel') {
    const result = await runCancelCommand(options);
    if (result.outputPath) {
      process.stdout.write(`Wrote cancellation response to ${result.outputPath}\n`);
    }
    return result;
  }
  if (command === 'results') {
    const result = await runResultsCommand(options);
    process.stdout.write(`Wrote ${result.rows.toLocaleString()} saved result row(s) to ${result.outputPath}\n`);
    return result;
  }
  if (command === 'templates') {
    const result = await runTemplatesCommand(options);
    if (result.outputPath) {
      process.stdout.write(`Wrote ${result.count} template(s) to ${result.outputPath}\n`);
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
  collapseRowsForExport,
  buildApiPayload,
  buildRunPayload,
  getApiUrl,
  loadCliFieldDefinitions,
  main,
  normalizePostFilters,
  parseCliArgs,
  parseFilterArgument,
  parsePostFilterArgument,
  parseSetArgument,
  runApiCommand,
  runCompatCommand,
  runCancelCommand,
  runDashboardCommand,
  runFieldsCommand,
  runQuery,
  runLoginCommand,
  runLogoutCommand,
  runPairCommand,
  runPlanCommand,
  runResultsCommand,
  runRunCommand,
  runStatusCommand,
  runTemplatesCommand,
  runWhoamiCommand,
  sortRowsForExport
};
