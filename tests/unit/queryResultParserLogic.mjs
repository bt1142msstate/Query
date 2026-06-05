import assert from 'node:assert/strict';
import {
  MULTI_VALUE_SEPARATOR,
  normalizeResultValue,
  parseQueryResultPayload
} from '../../src/core/queryResultParser.js';
import { registerDataFormatterFieldDefinitions } from '../../src/core/formatting/dataFormatters.js';
import test from 'node:test';

test('query result parser', async () => {
  const parserFieldDefs = new Map([
    ['Item Key', { name: 'Item Key', parts: 3 }]
  ]);

  registerDataFormatterFieldDefinitions(() => parserFieldDefs);

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
    displayedFields: ['Item Key', 'Title']
  }), {
    headers: ['Item Key', 'Title'],
    objectRows: [{ 'Item Key': '128450|6|1', Title: 'A history' }],
    source: 'pipe'
  });

  assert.deepEqual(parseQueryResultPayload({
    response: createResponse({ 'X-Raw-Columns': 'Catalog Key|Item Key|Item Id|Call Number|Title|Public Note' }),
    streamedLines: ['11240|11240|44|1|32278012457739  |PR1 .C3 NO.73 2011|Cahiers victoriens & edouardiens|Located on the first floor'],
    displayedFields: ['Catalog Key', 'Item Key', 'Item Id', 'Call Number', 'Title', 'Public Note']
  }), {
    headers: ['Catalog Key', 'Item Key', 'Item Id', 'Call Number', 'Title', 'Public Note'],
    objectRows: [{
      'Catalog Key': '11240',
      'Item Key': '11240|44|1',
      'Item Id': '32278012457739  ',
      'Call Number': 'PR1 .C3 NO.73 2011',
      Title: 'Cahiers victoriens & edouardiens',
      'Public Note': 'Located on the first floor'
    }],
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
});
