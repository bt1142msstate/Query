import assert from 'node:assert/strict';
import {
  MULTI_VALUE_SEPARATOR,
  normalizeResultValue,
  parseQueryResultPayload
} from '../../core/queryResultParser.js';

function createResponse(headers = {}) {
  const normalized = new Map(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
  return {
    headers: {
      get(name) {
        return normalized.get(String(name).toLowerCase()) || null;
      }
    }
  };
}

assert.equal(normalizeResultValue(['One', 'Two']), `One${MULTI_VALUE_SEPARATOR}Two`);
assert.equal(normalizeResultValue({ values: ['A', 'B'] }), `A${MULTI_VALUE_SEPARATOR}B`);
assert.equal(normalizeResultValue(null), '');
assert.equal(normalizeResultValue(123), '123');

assert.deepEqual(parseQueryResultPayload({
  response: createResponse({ 'X-Raw-Columns': 'Item Key|Title' }),
  streamedLines: ['128450|6|1|A history'],
  displayedFields: ['Item Key', 'Title'],
  parsePipeRow: (line, columns) => {
    const parts = line.split('|');
    return {
      [columns[0]]: parts.slice(0, 3).join('|'),
      [columns[1]]: parts[3]
    };
  }
}), {
  headers: ['Item Key', 'Title'],
  objectRows: [{ 'Item Key': '128450|6|1', Title: 'A history' }],
  source: 'pipe'
});

assert.deepEqual(parseQueryResultPayload({
  response: createResponse({ 'Content-Type': 'application/json' }),
  text: JSON.stringify({
    columns: ['Title', 'Public Note'],
    rows: [
      { Title: 'First', 'Public Note': ['Note one', 'Note two'] },
      { Title: 'Second', 'Public Note': { values: ['A', 'B'] } }
    ]
  }),
  displayedFields: ['Title', 'Public Note']
}), {
  headers: ['Title', 'Public Note'],
  objectRows: [
    { Title: 'First', 'Public Note': `Note one${MULTI_VALUE_SEPARATOR}Note two` },
    { Title: 'Second', 'Public Note': `A${MULTI_VALUE_SEPARATOR}B` }
  ],
  source: 'json'
});

assert.deepEqual(parseQueryResultPayload({
  response: createResponse({ 'Content-Type': 'application/json' }),
  text: JSON.stringify({
    fields: [{ name: 'Title' }, { name: 'MARC 590$a' }],
    data: [
      ['First', ['Local one', 'Local two']]
    ]
  }),
  displayedFields: []
}), {
  headers: ['Title', 'MARC 590$a'],
  objectRows: [
    { Title: 'First', 'MARC 590$a': `Local one${MULTI_VALUE_SEPARATOR}Local two` }
  ],
  source: 'json'
});

assert.deepEqual(parseQueryResultPayload({
  response: createResponse({ 'Content-Type': 'application/json' }),
  text: JSON.stringify({
    columns: [
      { key: 'public_note', label: 'Public Note' },
      { key: 'title', label: 'Title' }
    ],
    rows: [
      { title: 'Aliased title', public_note: ['Alias one', 'Alias two'] }
    ]
  }),
  displayedFields: ['Title', 'Public Note']
}), {
  headers: ['Title', 'Public Note'],
  objectRows: [
    { Title: 'Aliased title', 'Public Note': `Alias one${MULTI_VALUE_SEPARATOR}Alias two` }
  ],
  source: 'json'
});

assert.deepEqual(parseQueryResultPayload({
  response: createResponse({ 'Content-Type': 'application/json' }),
  text: JSON.stringify({
    columns: [
      { key: 'public_note', label: 'Public Note' },
      { key: 'title', label: 'Title' }
    ],
    rows: [
      [['Ordered note'], 'Ordered title']
    ]
  }),
  displayedFields: ['Title', 'Public Note']
}), {
  headers: ['Title', 'Public Note'],
  objectRows: [
    { Title: 'Ordered title', 'Public Note': 'Ordered note' }
  ],
  source: 'json'
});

assert.deepEqual(parseQueryResultPayload({
  response: createResponse({ 'Content-Type': 'application/json' }),
  text: JSON.stringify([
    { Title: 'Bare array row', Count: 3 }
  ]),
  displayedFields: []
}), {
  headers: ['Title', 'Count'],
  objectRows: [
    { Title: 'Bare array row', Count: '3' }
  ],
  source: 'json'
});

console.log('Query result parser logic tests passed');
