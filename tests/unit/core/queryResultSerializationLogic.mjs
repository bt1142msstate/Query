import assert from 'node:assert/strict';
import test from 'node:test';
import {
  serializeResultCsv,
  serializeResultJson,
  serializeResultJsonl
} from '../../../src/core/queryResultSerialization.js';

test('query result serializers preserve multi-value cells across export formats', () => {
  const columns = ['Title', 'Public Note'];
  const rows = [
    ['Alpha', ['One', 'Two']],
    ['Beta', 'Only']
  ];

  assert.match(serializeResultCsv(columns, rows), /"1\. One\n2\. Two"/u);
  assert.deepEqual(JSON.parse(serializeResultJson(columns, rows)).rows[0], {
    Title: 'Alpha',
    'Public Note': ['One', 'Two']
  });

  const jsonl = serializeResultJsonl(columns, rows, { queryId: 'query-1' })
    .trim()
    .split('\n')
    .map(line => JSON.parse(line));
  assert.equal(jsonl[0].type, 'meta');
  assert.equal(jsonl[1].type, 'row');
  assert.deepEqual(jsonl[1].values[1], ['One', 'Two']);
  assert.deepEqual(jsonl.at(-1), { type: 'done', rows: 2 });
});
