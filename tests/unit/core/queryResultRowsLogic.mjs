import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildResultObjectRowsFromTableRows,
  buildResultTableRowsFromObjectRows,
  normalizeResultTableRows
} from '../../../src/core/queryResultRows.js';

test('query result row helpers convert between object and table rows', () => {
  const headers = ['Title', 'Public Note'];
  const objectRows = [
    { Title: 'Alpha', 'Public Note': { values: ['One', 'Two'] } }
  ];

  assert.deepEqual(buildResultTableRowsFromObjectRows(headers, objectRows), [
    ['Alpha', ['One', 'Two']]
  ]);
  assert.deepEqual(buildResultObjectRowsFromTableRows(headers, [['Beta', ['Only']]]), [
    { Title: 'Beta', 'Public Note': 'Only' }
  ]);
  assert.deepEqual(normalizeResultTableRows(headers, null, objectRows), [
    ['Alpha', ['One', 'Two']]
  ]);
});
