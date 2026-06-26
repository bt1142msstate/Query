import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  applyPostFilters,
  buildRunPayload,
  normalizePostFilters,
  parseCliArgs,
  parseFilterArgument,
  parsePostFilterArgument,
  runResultsCommand,
  runQuery,
  runTemplatesCommand
} from '../../../scripts/lib/queryCli.mjs';

const jsonlHeaders = { 'Content-Type': 'application/x-ndjson; charset=utf-8' };

test('query CLI parses flags and builds backend run payloads', () => {
  const parsed = parseCliArgs([
    'run',
    '--config',
    'report.json',
    '--filter',
    'Item Library=MSU-GRANT',
    '--filter=Bill Count:greater:2',
    '--display',
    'Item Id,Title'
  ]);

  assert.equal(parsed.command, 'run');
  assert.equal(parsed.options.config, 'report.json');
  assert.deepEqual(parsed.options.filter, ['Item Library=MSU-GRANT', 'Bill Count:greater:2']);

  assert.deepEqual(parseFilterArgument('Item Type=["BOOK","PAMPHLET"]'), {
    field: 'Item Type',
    operator: '=',
    value: ['BOOK', 'PAMPHLET']
  });
  assert.deepEqual(parseFilterArgument('Bill Count:greater:2'), {
    field: 'Bill Count',
    operator: 'greater',
    value: '2'
  });

  const payload = buildRunPayload(
    { name: 'Config Name', filters: [{ field: 'Format', operator: '=', value: 'MARC' }] },
    parsed.options
  );
  assert.equal(payload.action, 'run');
  assert.equal(payload.result_format, 'jsonl');
  assert.equal(payload.name, 'Config Name');
  assert.deepEqual(payload.display_fields, ['Item Id', 'Title']);
  assert.deepEqual(payload.filters, [
    { field: 'Format', operator: '=', value: 'MARC' },
    { field: 'Item Library', operator: '=', value: 'MSU-GRANT' },
    { field: 'Bill Count', operator: '>', value: '2' }
  ]);
});

test('query CLI builds UI-config payloads through shared query payload helpers', () => {
  const payload = buildRunPayload({
    name: 'Template Config',
    ui_config: {
      DesiredColumnOrder: ['Title', 'Record Date'],
      Filters: [
        { FieldName: 'Title', FieldOperator: 'Contains', Values: ['Grant'] },
        { FieldName: 'Record Date', FieldOperator: 'Between', Values: ['1/2/2026', '1/5/2026'] }
      ]
    }
  });

  assert.deepEqual(payload.display_fields, ['Title', 'Record Date']);
  assert.deepEqual(payload.filters, [
    { field: 'Title', operator: '=', value: '*Grant*' },
    { field: 'Record Date', operator: '>=', value: '1/2/2026' },
    { field: 'Record Date', operator: '<=', value: '1/5/2026' }
  ]);
});

test('query CLI uses the shared JSONL parser to preserve requested display order', async () => {
  const originalFetch = globalThis.fetch;
  const payload = {
    display_fields: ['Item Id', 'Title', 'MARC 590']
  };

  globalThis.fetch = async () => new Response([
    JSON.stringify({ type: 'meta', version: 1, format: 'jsonl', query_id: 'query-1', columns: ['MARC 590', 'Item Id', 'Title'] }),
    JSON.stringify({ type: 'row', values: [['$a Local note'], '322', 'Grant title'] }),
    JSON.stringify({ type: 'done', rows: 1 })
  ].join('\n'), { headers: jsonlHeaders });

  try {
    const result = await runQuery('https://example.test/query', payload);
    assert.deepEqual(result.columns, ['Item Id', 'Title', 'MARC 590']);
    assert.deepEqual(result.rows, [['322', 'Grant title', '$a Local note']]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('query CLI applies the same post-filter shape used by the table', () => {
  const configFilters = {
    Title: {
      logic: 'all',
      filters: [{ cond: 'contains', val: 'grant' }]
    }
  };
  const cliFilter = parsePostFilterArgument('Public Note:has_multiple_values:');
  const postFilters = normalizePostFilters(configFilters, [cliFilter]);

  const rows = [
    ['Grant Alpha', ['One', 'Two']],
    ['Grant Beta', 'Only'],
    ['Other', ['One', 'Two']]
  ];
  const filtered = applyPostFilters(rows, ['Title', 'Public Note'], postFilters, new Map([
    ['Title', 'string'],
    ['Public Note', 'string']
  ]));

  assert.deepEqual(filtered, [
    ['Grant Alpha', ['One', 'Two']]
  ]);
});

test('query CLI exports saved results through the shared result parser path', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];

  globalThis.fetch = async (_apiUrl, init = {}) => {
    const payload = JSON.parse(init.body || '{}');
    requests.push(payload);
    if (payload.action === 'get_fields') {
      return Response.json({ fields: [{ name: 'Title', type: 'string' }] });
    }
    assert.equal(payload.action, 'get_results');
    assert.equal(payload.query_id, 'query-123');
    return new Response([
      JSON.stringify({ type: 'meta', version: 1, format: 'jsonl', query_id: 'query-123', columns: ['Title'] }),
      JSON.stringify({ type: 'row', values: ['Saved title'] }),
      JSON.stringify({ type: 'done', rows: 1 })
    ].join('\n'), { headers: jsonlHeaders });
  };

  const outputPath = join(tmpdir(), `query-cli-saved-result-${Date.now()}.json`);
  try {
    const result = await runResultsCommand({
      'api-url': 'https://example.test/query',
      'query-id': 'query-123',
      format: 'json',
      output: outputPath
    });
    assert.equal(result.rows, 1);
    assert.deepEqual(requests.map(request => request.action), ['get_fields', 'get_results']);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(outputPath, { force: true });
  }
});

test('query CLI lists templates through the shared template repository', async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (_apiUrl, init = {}) => {
    const payload = JSON.parse(init.body || '{}');
    assert.equal(payload.action, 'list_templates');
    return Response.json({
      templates: [
        { id: 'template-1', name: 'Saved Query', pinned: true, categories: [{ id: 'cat-1', name: 'Reports' }] }
      ]
    });
  };

  const outputPath = join(tmpdir(), `query-cli-templates-${Date.now()}.json`);
  try {
    const result = await runTemplatesCommand({
      'api-url': 'https://example.test/query',
      json: true,
      output: outputPath
    });
    assert.equal(result.count, 1);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(outputPath, { force: true });
  }
});
