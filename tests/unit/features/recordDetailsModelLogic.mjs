import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildRecordDetailsModel,
  buildRecordDetailsModelFromResponse,
  flattenRecordValue,
  inferRecordKind,
  normalizeRecordFieldName,
  resolveRecordDetailsLookup
} from '../../../src/features/table/recordDetailsModel.js';

test('record details classifies item rows and preserves all returned fields', () => {
  const model = buildRecordDetailsModel({
    headers: ['Title', 'Catalog Key', 'Item ID', 'Public Note', 'Staff Note'],
    row: ['A title', '923278', '32276003001044', ['First', 'Second'], ''],
    displayedFields: ['Title', 'Item ID']
  });

  assert.equal(model.kind.key, 'item');
  assert.equal(model.kind.label, 'Item record');
  assert.equal(model.title, 'A title');
  assert.equal(model.totalCount, 5);
  assert.equal(model.nonEmptyCount, 4);
  assert.deepEqual(model.identifiers.map(field => field.name), ['Catalog Key', 'Item ID']);
  assert.deepEqual(model.fields[3].values, ['First', 'Second']);
  assert.equal(model.fields[4].isEmpty, true);
  assert.equal(model.fields[0].isDisplayed, true);
  assert.equal(model.fields[1].isDisplayed, false);
  assert.match(model.copyText, /Public Note: First \| Second/u);
  assert.match(model.copyText, /Staff Note: \(blank\)/u);
});

test('record details distinguishes bib, call number, patron, and generic rows', () => {
  assert.equal(inferRecordKind(['Catalog Key', 'Title']).key, 'bibliographic');
  assert.equal(inferRecordKind(['Call Number Key', 'Call Number']).key, 'call_number');
  assert.equal(inferRecordKind(['User ID', 'User Name']).key, 'user');
  assert.equal(inferRecordKind(['Title', 'Author']).key, 'result');
});

test('record details normalizes aliases and safely flattens multi-value data', () => {
  assert.equal(normalizeRecordFieldName('Catalog Key (ID)'), 'catalogkeyid');
  assert.deepEqual(flattenRecordValue(['One', ['Two', 3], null]), ['One', 'Two', '3', '']);
  assert.deepEqual(flattenRecordValue({ status: 'available' }), ['{"status":"available"}']);
});

test('record details selects the strongest exact identifier for an on-demand lookup', () => {
  assert.deepEqual(
    resolveRecordDetailsLookup(
      ['Catalog Key', 'Item ID', 'Item Key'],
      ['923278', '32276003001044', '448812']
    ),
    { lookupType: 'item_key', lookupValue: '448812' }
  );
  assert.deepEqual(
    resolveRecordDetailsLookup(['Title', 'Catalog Key'], ['A title', '923278']),
    { lookupType: 'catalog_key', lookupValue: '923278' }
  );
  assert.equal(resolveRecordDetailsLookup(['Title'], ['A title']), null);
});

test('record details builds a complete model from the backend field response', () => {
  const model = buildRecordDetailsModelFromResponse({
    kind: { key: 'item', label: 'Item record' },
    source_row_count: 1,
    fields: [
      { name: 'Title', category: 'Catalog', description: 'Title statement', values: ['A title'] },
      { name: 'Item Id', category: 'Item', description: 'Barcode', values: ['32276003001044'] },
      { name: 'Staff Note', category: 'Item', description: 'Private note', values: [''] }
    ]
  }, ['Title']);

  assert.equal(model.kind.key, 'item');
  assert.equal(model.totalCount, 3);
  assert.equal(model.nonEmptyCount, 2);
  assert.equal(model.fields[0].category, 'Catalog');
  assert.equal(model.fields[0].description, 'Title statement');
  assert.equal(model.fields[0].isDisplayed, true);
  assert.equal(model.fields[2].isEmpty, true);
  assert.match(model.scopeText, /Loaded all 3 fields available/u);
});
