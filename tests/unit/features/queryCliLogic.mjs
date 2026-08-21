import assert from 'node:assert/strict';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import test from 'node:test';
import {
  applyPostFilters,
  buildRunPayload,
  collapseRowsForExport,
  normalizePostFilters,
  parseCliArgs,
  parseFilterArgument,
  parsePostFilterArgument,
  runApiCommand,
  runDashboardCommand,
  runLoginCommand,
  runPlanCommand,
  runResultsCommand,
  runQuery,
  runRunCommand,
  runTemplatesCommand,
  sortRowsForExport
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

test('query CLI collapses duplicate visible rows by default with an opt-out', () => {
  const rows = [
    ['One for the Money', 'Evanovich, Janet', 'LILS-LEE'],
    ['One for the Money', 'Evanovich, Janet', 'LILS-LEE'],
    ['Two for the Dough', 'Evanovich, Janet', 'LILS-LEE']
  ];
  const columns = ['Title', 'Author', 'Item Library'];

  assert.deepEqual(collapseRowsForExport(rows, columns), [rows[0], rows[2]]);
  assert.equal(collapseRowsForExport(rows, columns, {}, { 'include-duplicates': true }).length, 3);
  assert.equal(collapseRowsForExport(rows, columns, { export: { collapseDuplicateRows: false } }).length, 3);
});

test('query CLI applies stable multi-field export sorting', () => {
  const rows = [
    ['Two for the Dough', 'Evanovich, Janet'],
    ['The 5th Horseman', 'Patterson, James'],
    ['One for the Money', 'Evanovich, Janet']
  ];
  assert.deepEqual(sortRowsForExport(rows, ['Title', 'Author'], new Map(), {
    export: { sort: [{ field: 'Author' }, { field: 'Title' }] }
  }), [rows[2], rows[0], rows[1]]);
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

test('query CLI applies an approved session to report requests', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (_apiUrl, init = {}) => {
    requests.push(init);
    return new Response([
      JSON.stringify({ type: 'meta', version: 1, format: 'jsonl', columns: ['Title'] }),
      JSON.stringify({ type: 'done', rows: 0 })
    ].join('\n'), { headers: jsonlHeaders });
  };
  try {
    await runQuery('https://example.test/query', { action: 'run', display_fields: ['Title'] }, {
      sessionStore: {
        read: async () => ({ token: 'test-session-token' })
      }
    });
    assert.equal(requests[0].headers['X-Query-Session'], 'test-session-token');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('query CLI sign-in stores the returned session without printing the token', async () => {
  const originalFetch = globalThis.fetch;
  let storedSession;
  globalThis.fetch = async (_apiUrl, init = {}) => {
    const payload = JSON.parse(init.body || '{}');
    assert.deepEqual(payload, { action: 'login', username: 'bt1142', password: 'not-logged' });
    assert.equal(init.headers['X-Query-Session'], undefined);
    return Response.json({ token: 'opaque-session-token', username: 'bt1142', role: 'admin' });
  };
  try {
    const result = await runLoginCommand({
      'api-url': 'https://example.test/query',
      'password-stdin': true,
      stdin: Readable.from(['not-logged\n']),
      username: 'bt1142',
      sessionStore: {
        write: async (_apiUrl, session) => {
          storedSession = session;
          return session;
        }
      }
    });
    assert.equal(result.username, 'bt1142');
    assert.equal(storedSession.token, 'opaque-session-token');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('generic API command reaches newer backend actions with JSON payloads and auth', async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (_apiUrl, init = {}) => {
    request = init;
    return Response.json({ run_id: 'hydration-1', status: 'running' });
  };
  const outputPath = join(tmpdir(), `query-cli-api-${Date.now()}.json`);
  try {
    const result = await runApiCommand({
      action: 'start_hydration_run',
      output: outputPath,
      set: ['name="CLI review"', 'records=[{"title":"Example"}]'],
      'api-url': 'https://example.test/query',
      sessionStore: {
        read: async () => ({ token: 'test-session-token' })
      }
    });
    assert.equal(result.action, 'start_hydration_run');
    assert.equal(request.headers['X-Query-Session'], 'test-session-token');
    assert.deepEqual(JSON.parse(request.body), {
      action: 'start_hydration_run',
      name: 'CLI review',
      records: [{ title: 'Example' }]
    });
    assert.deepEqual(JSON.parse(await readFile(outputPath, 'utf8')), {
      run_id: 'hydration-1',
      status: 'running'
    });
  } finally {
    globalThis.fetch = originalFetch;
    await rm(outputPath, { force: true });
  }
});

test('dashboard CLI requests the same scoped aggregate used by the interface', async () => {
  const originalFetch = globalThis.fetch;
  let payload;
  globalThis.fetch = async (_apiUrl, init = {}) => {
    payload = JSON.parse(init.body || '{}');
    return Response.json({ schema_version: 1, collection: { items: 12 } });
  };
  const outputPath = join(tmpdir(), `query-cli-dashboard-${Date.now()}.json`);
  try {
    const result = await runDashboardCommand({
      library: 'system:MSU',
      'item-type': 'EBOOK',
      'active-window-days': '90',
      'reporting-period': 'fy:MSU:2027',
      output: outputPath,
      'api-url': 'https://example.test/query',
      sessionStore: { read: async () => ({ token: 'test-session-token' }) }
    });
    assert.deepEqual(payload, {
      action: 'library_dashboard',
      library: 'system:MSU',
      item_type: 'EBOOK',
      active_window_days: 90,
      reporting_period: 'fy:MSU:2027',
      force_refresh: false
    });
    assert.equal(result.schemaVersion, 1);
    assert.equal(JSON.parse(await readFile(outputPath, 'utf8')).collection.items, 12);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(outputPath, { force: true });
  }
});

test('smart-plan CLI sends the same query payload without running it', async () => {
  const originalFetch = globalThis.fetch;
  let payload;
  const outputPath = join(tmpdir(), `query-cli-plan-${Date.now()}.json`);
  globalThis.fetch = async (_apiUrl, init = {}) => {
    payload = JSON.parse(init.body || '{}');
    return Response.json({ strategy: 'selective_first_v1', changed: true, eta: { available: false } });
  };
  try {
    const result = await runPlanCommand({
      display: 'Title,Item Id',
      filter: ['Title=*history*', 'Catalog Key=12345'],
      output: outputPath,
      'api-url': 'https://example.test/query',
      sessionStore: { read: async () => ({ token: 'test-session-token' }) }
    });
    assert.equal(payload.action, 'query_plan');
    assert.deepEqual(payload.display_fields, ['Title', 'Item Id']);
    assert.equal(payload.filters.some(filter => filter.field === 'Catalog Key'), true);
    assert.equal(result.changed, true);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(outputPath, { force: true });
  }
});

test('query CLI can split Excel output into sheets by an exported field', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_apiUrl, init = {}) => {
    const payload = JSON.parse(init.body || '{}');
    if (payload.action === 'get_fields') {
      return Response.json({
        fields: [
          { name: 'Title', type: 'string' },
          { name: 'Item Library', type: 'string' }
        ]
      });
    }
    assert.equal(payload.action, 'run');
    return new Response([
      JSON.stringify({ type: 'meta', version: 1, format: 'jsonl', columns: ['Title', 'Item Library'] }),
      JSON.stringify({ type: 'row', values: ['One for the money', 'Main Branch'] }),
      JSON.stringify({ type: 'row', values: ['2nd chance', 'East Branch'] }),
      JSON.stringify({ type: 'done', rows: 2 })
    ].join('\n'), { headers: jsonlHeaders });
  };
  const outputPath = join(tmpdir(), `query-cli-grouped-${Date.now()}.xlsx`);
  const configPath = join(tmpdir(), `query-cli-grouped-${Date.now()}.json`);
  try {
    await writeFile(configPath, JSON.stringify({
      displayFields: ['Title', 'Item Library'],
      export: {
        format: 'xlsx',
        groupField: 'Item Library',
        groupValues: ['Main Branch', 'East Branch', 'North Branch'],
        includeOverviewSheet: true,
        output: outputPath
      }
    }));
    const result = await runRunCommand({
      'api-url': 'https://example.test/query',
      config: configPath,
      sessionStore: { read: async () => ({ token: 'test-session-token' }) }
    });
    assert.equal(result.rows, 2);
    const workbookText = new TextDecoder().decode(await readFile(outputPath));
    assert.match(workbookText, /Overview/u);
    assert.match(workbookText, /East Branch/u);
    assert.match(workbookText, /Main Branch/u);
    assert.match(workbookText, /North Branch/u);
    assert.match(workbookText, /fitToWidth="1"/u);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(configPath, { force: true });
    await rm(outputPath, { force: true });
  }
});
