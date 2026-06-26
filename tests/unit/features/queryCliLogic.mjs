import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyPostFilters,
  buildRunPayload,
  normalizePostFilters,
  parseCliArgs,
  parseFilterArgument,
  parsePostFilterArgument,
  runQuery
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
    { field: 'Bill Count', operator: 'greater', value: '2' }
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
