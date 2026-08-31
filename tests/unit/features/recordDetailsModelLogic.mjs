import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildRecordDetailsModel,
  flattenRecordValue,
  inferRecordKind,
  normalizeRecordFieldName
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
