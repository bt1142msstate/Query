import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildRecordDetailsQueryPayload,
  buildRecordDetailsResponseFromQuery,
  getCompleteRecordFieldDefinitions
} from '../../../src/features/table/recordDetailsApi.js';

const definitions = [
  { name: 'Title', category: 'Catalog', desc: 'Title statement' },
  { name: 'Item Identifier', category: 'Item', desc: 'Barcode', recordLookupType: 'item_id' },
  { name: 'Staff Note', category: 'Item', desc: 'Staff-only note' },
  { name: 'MARC Field', category: 'MARC', builder: { inputs: [] } },
  { name: 'Unavailable A', category: 'Item', recordDetailsAvailable: false },
  { name: 'Unavailable B', category: 'Item', recordDetailsAvailable: 0 }
];

test('record detail fallback requests every concrete valid field for an exact item', () => {
  assert.deepEqual(getCompleteRecordFieldDefinitions(definitions).map(field => field.name), [
    'Title', 'Item Identifier', 'Staff Note'
  ]);
  assert.deepEqual(buildRecordDetailsQueryPayload({
    lookupType: 'item_id',
    lookupValue: '33222109838913'
  }, definitions), {
    action: 'run',
    name: 'Record details',
    result_format: 'jsonl',
    display_fields: ['Title', 'Item Identifier', 'Staff Note'],
    filters: [{ field: 'Item Identifier', operator: '=', value: '33222109838913' }],
    max_rows: 2
  });
});

test('record detail fallback converts a streamed row into the complete dialog response', () => {
  const response = buildRecordDetailsResponseFromQuery({
    jsonPayload: {
      columns: ['Title', 'Item Identifier', 'Staff Note'],
      rows: [['A title', '33222109838913', ['First', 'Second']]]
    }
  }, { lookupType: 'item_id', lookupValue: '33222109838913' }, definitions);

  assert.equal(response.kind.key, 'item');
  assert.equal(response.source_row_count, 1);
  assert.deepEqual(response.fields[2], {
    name: 'Staff Note',
    category: 'Item',
    description: 'Staff-only note',
    values: ['First', 'Second']
  });
});
