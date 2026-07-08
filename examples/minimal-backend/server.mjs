#!/usr/bin/env node

import { createServer } from 'node:http';

const PORT = Number(process.env.PORT || 8787);
const API_PATH = process.env.API_PATH || '/query-api';

const fields = [
  {
    name: 'Title',
    label: 'Title',
    type: 'string',
    category: 'Bibliographic',
    desc: 'Example title field',
    filters: ['contains', 'equals', 'starts', 'does_not_equal']
  },
  {
    name: 'Branch',
    label: 'Branch',
    type: 'string',
    category: 'Item',
    desc: 'Example branch or location field',
    filters: ['equals', 'does_not_equal'],
    values: ['Central', 'East', 'West']
  },
  {
    name: 'Status',
    label: 'Status',
    type: 'string',
    category: 'Item',
    desc: 'Example circulation status field',
    filters: ['equals', 'does_not_equal'],
    values: ['Available', 'Checked Out', 'Missing']
  },
  {
    name: 'Due Date',
    label: 'Due Date',
    type: 'date',
    category: 'Item',
    desc: 'Example date field, including Never semantics',
    filters: ['equals', 'before', 'after', 'between', 'never']
  },
  {
    name: 'Public Note',
    label: 'Public Note',
    type: 'string',
    category: 'Notes',
    desc: 'Example multi-value note field',
    filters: ['contains', 'equals', 'does_not_equal'],
    multiValue: true
  },
  {
    name: 'Staff Note',
    label: 'Staff Note',
    type: 'string',
    category: 'Notes',
    desc: 'Example staff-only multi-value note field',
    filters: ['contains', 'equals', 'does_not_equal'],
    multiValue: true,
    sensitive: true,
    requiresAuth: true,
    authorized: true,
    requiredScopes: ['reports:sensitive']
  },
  {
    name: 'Local Metadata Field',
    label: 'Local Metadata Field',
    type: 'string',
    category: 'Dynamic',
    desc: 'Example buildable field. The frontend renders inputs from this metadata.',
    filters: ['contains', 'equals', 'does_not_equal'],
    builder: {
      outputFieldIdTemplate: 'Local Metadata {code}${subfield}',
      displayLabelTemplate: 'Local Metadata {code}${subfield}',
      matchPattern: '^Local Metadata\\s+[A-Z0-9]+(?:\\$[A-Za-z0-9])?$',
      inputs: [
        {
          name: 'code',
          label: 'Field code',
          type: 'text',
          required: true,
          pattern: '^[A-Z0-9]{3,6}$',
          placeholder: '590'
        },
        {
          name: 'subfield',
          label: 'Subfield',
          type: 'text',
          required: false,
          pattern: '^[A-Za-z0-9]?$',
          placeholder: 'a'
        }
      ]
    }
  }
];

const rows = [
  {
    Branch: 'Central',
    'Due Date': 'NEVER',
    'Local Metadata 590$a': ['Local history', 'Special collection'],
    'Public Note': ['Display copy', 'Ask at service desk'],
    'Staff Note': ['Review condition before transfer'],
    Status: 'Available',
    Title: 'A Field Guide to Local History'
  },
  {
    Branch: 'East',
    'Due Date': '2026-07-15',
    'Local Metadata 590$a': ['Donation copy'],
    'Public Note': ['New shelf'],
    'Staff Note': ['Gift plate requested', 'Route to cataloging'],
    Status: 'Checked Out',
    Title: 'Modern Archives Handbook'
  },
  {
    Branch: 'West',
    'Due Date': '2026-06-30',
    'Local Metadata 590$a': [],
    'Public Note': [],
    'Staff Note': [],
    Status: 'Missing',
    Title: 'Digital Records Basics'
  }
];

function corsHeaders(contentType = 'application/json; charset=utf-8') {
  return {
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
    'Content-Type': contentType
  };
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, corsHeaders());
  response.end(JSON.stringify(payload));
}

async function readRequestJson(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }

  const text = Buffer.concat(chunks).toString('utf8');
  if (!text.trim()) {
    return {};
  }

  return JSON.parse(text);
}

function flattenValue(value) {
  if (Array.isArray(value)) {
    return value.map(item => String(item ?? ''));
  }

  if (value === undefined || value === null) {
    return [''];
  }

  return [String(value)];
}

function normalizeComparableValue(value) {
  const rawValue = String(value ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/u.test(rawValue)) {
    return rawValue.replaceAll('-', '');
  }

  return rawValue.toUpperCase() === 'NEVER' ? '00000000' : rawValue;
}

function wildcardToRegExp(value) {
  const escaped = String(value)
    .replace(/[|\\{}()[\]^$+?.]/gu, '\\$&')
    .replaceAll('*', '.*');
  return new RegExp(`^${escaped}$`, 'iu');
}

function valuesMatch(values, expected) {
  const expectedValues = Array.isArray(expected) ? expected : [expected];

  return expectedValues.some(expectedValue => {
    const expectedText = String(expectedValue ?? '');
    const hasWildcard = expectedText.includes('*');
    const matcher = hasWildcard ? wildcardToRegExp(expectedText) : null;

    return values.some(value => {
      const text = String(value ?? '');
      return hasWildcard
        ? matcher.test(text)
        : text.localeCompare(expectedText, undefined, { sensitivity: 'accent' }) === 0;
    });
  });
}

function compareValues(values, operator, expected) {
  const normalizedExpected = normalizeComparableValue(expected);
  return values.some(value => {
    const normalizedValue = normalizeComparableValue(value);
    switch (operator) {
      case '<':
        return normalizedValue < normalizedExpected;
      case '<=':
        return normalizedValue <= normalizedExpected;
      case '>':
        return normalizedValue > normalizedExpected;
      case '>=':
        return normalizedValue >= normalizedExpected;
      default:
        return false;
    }
  });
}

function rowMatchesFilter(row, filter) {
  const field = filter?.field || filter?.FieldName || '';
  if (!field) {
    return true;
  }

  const operator = String(filter.operator || filter.FieldOperator || '=').trim();
  const expected = filter.value ?? filter.Values?.[0] ?? '';
  const values = flattenValue(row[field]);

  switch (operator) {
    case '=':
    case 'Equals':
      return valuesMatch(values, expected);
    case '!=':
    case 'DoesNotEqual':
      return !valuesMatch(values, expected);
    case '<':
    case '<=':
    case '>':
    case '>=':
      return compareValues(values, operator, expected);
    default:
      return valuesMatch(values, expected);
  }
}

function getRequestedColumns(payload) {
  const requested = Array.isArray(payload.display_fields)
    ? payload.display_fields
    : Array.isArray(payload.displayFields)
      ? payload.displayFields
      : [];
  return requested.length ? requested : ['Title', 'Branch', 'Status', 'Due Date', 'Public Note', 'Staff Note'];
}

function getFilteredRows(payload) {
  const filters = Array.isArray(payload.filters) ? payload.filters : [];
  const limit = Math.max(0, Number(payload.limit || payload.max_rows || rows.length) || rows.length);
  return rows
    .filter(row => filters.every(filter => rowMatchesFilter(row, filter)))
    .slice(0, limit || rows.length);
}

function writeJsonl(response, event) {
  response.write(`${JSON.stringify(event)}\n`);
}

async function handleRun(response, payload) {
  const columns = getRequestedColumns(payload);
  const resultRows = getFilteredRows(payload);
  const queryId = `example-${Date.now()}`;

  response.writeHead(200, {
    ...corsHeaders('application/x-ndjson; charset=utf-8'),
    'X-Query-Id': queryId
  });
  writeJsonl(response, {
    columns,
    format: 'jsonl',
    query_id: queryId,
    type: 'meta',
    version: 1
  });

  for (const row of resultRows) {
    writeJsonl(response, {
      type: 'row',
      values: columns.map(column => row[column] ?? '')
    });
    await new Promise(resolve => setImmediate(resolve));
  }

  writeJsonl(response, {
    rows: resultRows.length,
    type: 'done'
  });
  response.end();
}

async function handleApiRequest(request, response) {
  if (request.method === 'OPTIONS') {
    response.writeHead(204, corsHeaders());
    response.end();
    return;
  }

  if (request.method !== 'POST') {
    sendJson(response, 405, { error: 'Use POST for query API actions.' });
    return;
  }

  let payload;
  try {
    payload = await readRequestJson(request);
  } catch (error) {
    sendJson(response, 400, { error: `Invalid JSON request body: ${error.message}` });
    return;
  }

  switch (payload.action) {
    case 'get_fields':
      sendJson(response, 200, { fields });
      return;
    case 'run':
      await handleRun(response, payload);
      return;
    case 'status':
      sendJson(response, 200, { queries: {} });
      return;
    case 'cancel':
      sendJson(response, 200, { ok: true });
      return;
    case 'list_templates':
      sendJson(response, 200, { categories: [], templates: [] });
      return;
    default:
      sendJson(response, 400, { error: `Unsupported action: ${payload.action || '(missing)'}` });
  }
}

const server = createServer((request, response) => {
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
  if (url.pathname !== API_PATH) {
    sendJson(response, 404, {
      error: `Example API is available at ${API_PATH}.`
    });
    return;
  }

  handleApiRequest(request, response).catch(error => {
    sendJson(response, 500, { error: error.message || 'Example backend error.' });
  });
});

server.listen(PORT, () => {
  console.log(`Minimal query API listening on http://127.0.0.1:${PORT}${API_PATH}`);
});
