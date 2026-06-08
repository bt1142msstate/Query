import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildCompatibilityRunPayload,
  parseJsonlEvents,
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

  assert.deepEqual(selectCompatibilityDisplayFields(fields), ['Notes', 'Title', 'Branch']);
  assert.deepEqual(buildCompatibilityRunPayload(fields), {
    action: 'run',
    compatibility_check: true,
    display_fields: ['Notes', 'Title', 'Branch'],
    filters: [],
    limit: 5,
    max_rows: 5,
    name: 'API compatibility check',
    result_format: 'jsonl'
  });
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
