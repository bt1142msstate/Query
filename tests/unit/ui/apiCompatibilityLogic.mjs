import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildCompatibilityRunPayload,
  parseJsonlEvents,
  runApiCompatibilityCheck,
  selectCompatibilityDisplayFields,
  summarizeCompatibilityChecks,
  validateJsonlEvents
} from '../../../src/ui/apiCompatibility.js';

test('api compatibility selects compact diagnostic display fields', () => {
  const fields = [
    { name: 'Buildable', builder: { inputs: [] } },
    { name: 'Title' },
    { name: 'Notes', desc: 'Returns multi-value data' },
    { name: 'Branch' }
  ];

  assert.deepEqual(selectCompatibilityDisplayFields(fields), ['Notes']);
  assert.deepEqual(selectCompatibilityDisplayFields(fields, { maxFields: 3 }), ['Notes', 'Branch', 'Title']);
  assert.deepEqual(buildCompatibilityRunPayload(fields), {
    action: 'run',
    compatibility_check: true,
    display_fields: ['Notes'],
    filters: [],
    limit: 5,
    max_rows: 5,
    name: 'API compatibility check',
    result_format: 'jsonl'
  });
});

test('api compatibility prefers cheap key fields over expensive multi-value fields', () => {
  const fields = [
    {
      name: 'Public Note',
      multiValue: true,
      performanceWarning: { level: 'warning', message: 'Requires enrichment.' }
    },
    { name: 'Author' },
    { name: 'Item Key' },
    { name: 'Title' }
  ];

  assert.deepEqual(selectCompatibilityDisplayFields(fields), ['Item Key']);
  assert.deepEqual(selectCompatibilityDisplayFields(fields, { maxFields: 3 }), ['Item Key', 'Author', 'Title']);
});

test('api compatibility validates canonical JSONL event order and multi-value arrays', () => {
  const { errors, events } = parseJsonlEvents([
    JSON.stringify({ type: 'meta', version: 1, format: 'jsonl', columns: ['Notes', 'Title'] }),
    JSON.stringify({ type: 'row', values: [['A', 'B'], 'Example'] }),
    JSON.stringify({ type: 'done', rows: 1 })
  ].join('\n'));

  assert.deepEqual(errors, []);
  const checks = validateJsonlEvents(events);
  assert.deepEqual(checks.map(check => [check.id, check.status]), [
    ['jsonl-stream', 'supported'],
    ['jsonl-order', 'supported'],
    ['multi-values', 'supported']
  ]);
});

test('api compatibility reports malformed and truncated streams clearly', () => {
  const invalidChecks = validateJsonlEvents([
    { type: 'row', values: ['late'] },
    { type: 'done', rows: 1 }
  ]);
  assert.deepEqual(invalidChecks.map(check => check.status), ['failed', 'failed', 'warning']);

  const truncatedChecks = validateJsonlEvents([
    { type: 'meta', version: 1, format: 'jsonl', columns: ['Title'] },
    { type: 'row', values: ['Example'] }
  ], { truncated: true });
  assert.deepEqual(truncatedChecks.map(check => check.status), ['supported', 'warning', 'warning']);
});

test('api compatibility ignores only the final partial line when a sample is truncated', () => {
  const { errors, events, ignoredTruncatedLine } = parseJsonlEvents([
    JSON.stringify({ type: 'meta', version: 1, format: 'jsonl', columns: ['Title'] }),
    JSON.stringify({ type: 'row', values: ['Example'] }),
    '{"type":"row","values":["partial'
  ].join('\n'), { truncated: true });

  assert.deepEqual(errors, []);
  assert.equal(ignoredTruncatedLine, true);
  assert.deepEqual(events.map(event => event.type), ['meta', 'row']);

  const checks = validateJsonlEvents(events, { truncated: true, ignoredTruncatedLine });
  assert.deepEqual(checks.map(check => [check.id, check.status]), [
    ['jsonl-stream', 'supported'],
    ['jsonl-order', 'warning'],
    ['multi-values', 'warning']
  ]);
});

test('api compatibility treats query-id-required optional actions as recognized', async () => {
  const originalFetch = globalThis.fetch;
  const payloads = [];

  globalThis.fetch = async (_url, options) => {
    const payload = JSON.parse(options.body);
    payloads.push(payload);

    if (payload.action === 'get_fields') {
      return new Response(JSON.stringify({ fields: [{ name: 'Title' }] }), { status: 200 });
    }

    if (payload.action === 'run') {
      return new Response([
        JSON.stringify({ type: 'meta', version: 1, format: 'jsonl', columns: ['Title'] }),
        JSON.stringify({ type: 'row', values: ['Example'] }),
        JSON.stringify({ type: 'done', rows: 1 })
      ].join('\n'), { status: 200 });
    }

    if (payload.action === 'cancel') {
      return new Response(JSON.stringify({ error: 'Query not found' }), { status: 200 });
    }

    if (payload.action === 'get_results') {
      return new Response(JSON.stringify({ error: 'JSONL result file not found for query ID' }), { status: 200 });
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };

  try {
    const result = await runApiCompatibilityCheck('https://example.test/query-api');
    const byId = new Map(result.checks.map(check => [check.id, check]));

    assert.equal(byId.get('optional-cancel').status, 'supported');
    assert.equal(byId.get('optional-get_results').status, 'supported');
    assert.equal(
      byId.get('optional-cancel').detail,
      'Endpoint recognized the action; a real query id is needed for a live workflow check.'
    );
    assert.equal(payloads.find(payload => payload.action === 'cancel').query_id, 'query_0_0000');
    assert.equal(payloads.find(payload => payload.action === 'get_results').query_id, 'query_0_0000');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('api compatibility summary tracks supported, warning, missing, and failed checks', () => {
  const summary = summarizeCompatibilityChecks([
    { status: 'supported' },
    { status: 'supported' },
    { status: 'warning' },
    { status: 'missing' },
    { status: 'failed' }
  ]);

  assert.equal(summary.supported, 2);
  assert.equal(summary.warning, 1);
  assert.equal(summary.missing, 1);
  assert.equal(summary.failed, 1);
  assert.equal(summary.total, 5);
  assert.equal(summary.worstStatus, 'failed');
});
