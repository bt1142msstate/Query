import assert from 'node:assert/strict';
import {
  normalizeResultValue,
  parseQueryResultPayload
} from '../../../src/core/queryResultParser.js';
import test from 'node:test';

test('query result parser', async () => {
  assert.deepEqual(normalizeResultValue(['One', 'Two']), ['One', 'Two']);
  assert.deepEqual(normalizeResultValue({ values: ['A', 'B'] }), ['A', 'B']);
  assert.equal(normalizeResultValue(null), '');
  assert.equal(normalizeResultValue(123), '123');

  assert.throws(
    () => parseQueryResultPayload({ streamedLines: ['128450|6|1|A history'] }),
    /JSONL row events/u
  );

  assert.deepEqual(parseQueryResultPayload({
    jsonPayload: {
      columns: ['Title', 'Public Note'],
      rows: [
        { Title: 'First', 'Public Note': ['Note one', 'Note two'] },
        { Title: 'Second', 'Public Note': { values: ['A', 'B'] } }
      ]
    },
    displayedFields: ['Title', 'Public Note']
  }), {
    headers: ['Title', 'Public Note'],
    objectRows: [
      { Title: 'First', 'Public Note': ['Note one', 'Note two'] },
      { Title: 'Second', 'Public Note': ['A', 'B'] }
    ],
    source: 'jsonl'
  });

  assert.deepEqual(parseQueryResultPayload({
    jsonPayload: {
      fields: [{ name: 'Title' }, { name: 'MARC 590$a' }],
      data: [
        ['First', ['Local one', 'Local two']]
      ]
    },
    displayedFields: []
  }), {
    headers: ['Title', 'MARC 590$a'],
    objectRows: [
      { Title: 'First', 'MARC 590$a': ['Local one', 'Local two'] }
    ],
    source: 'jsonl'
  });

  assert.deepEqual(parseQueryResultPayload({
    jsonPayload: {
      columns: [
        { key: 'public_note', label: 'Public Note' },
        { key: 'title', label: 'Title' }
      ],
      rows: [
        { title: 'Aliased title', public_note: ['Alias one', 'Alias two'] }
      ]
    },
    displayedFields: ['Title', 'Public Note']
  }), {
    headers: ['Title', 'Public Note'],
    objectRows: [
      { Title: 'Aliased title', 'Public Note': ['Alias one', 'Alias two'] }
    ],
    source: 'jsonl'
  });

  assert.deepEqual(parseQueryResultPayload({
    jsonPayload: {
      columns: [
        { key: 'public_note', label: 'Public Note' },
        { key: 'title', label: 'Title' }
      ],
      rows: [
        [['Ordered note'], 'Ordered title']
      ]
    },
    displayedFields: ['Title', 'Public Note']
  }), {
    headers: ['Title', 'Public Note'],
    objectRows: [
      { Title: 'Ordered title', 'Public Note': 'Ordered note' }
    ],
    source: 'jsonl'
  });

  assert.deepEqual(parseQueryResultPayload({
    jsonPayload: [
      { Title: 'Bare array row', Count: 3 }
    ],
    displayedFields: []
  }), {
    headers: ['Title', 'Count'],
    objectRows: [
      { Title: 'Bare array row', Count: '3' }
    ],
    source: 'jsonl'
  });
});
