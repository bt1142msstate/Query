import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildBulkEntries,
  detectLookupType,
  inputDataFromRows,
  isValidIsbn,
  parseInputFile,
  valuesFromColumn
} from '../../../src/ui/bib-compare/bibBulkInput.js';
import { columnIndexFromReference, isXlsxFile } from '../../../src/ui/bib-compare/xlsxWorkbookInput.js';
import { chunkEntries } from '../../../src/ui/bib-compare/oclcBibBulk.js';

test('bulk input detects and normalizes ISBNs without confusing catalog keys', () => {
  assert.equal(isValidIsbn('978-0-06-058660-7'), true);
  assert.equal(detectLookupType('978-0-06-058660-7'), 'isbn');
  assert.equal(detectLookupType('923278'), 'catalog_key');
  assert.equal(detectLookupType('32276003001044'), 'item_id');
  assert.equal(detectLookupType('A hat full of sky'), 'title');
});

test('bulk entries preserve original values and remove duplicates', () => {
  const entries = buildBulkEntries([
    '978-0-06-058660-7',
    '9780060586607',
    '923278'
  ]);
  assert.equal(entries.length, 2);
  assert.deepEqual(entries[0], {
    lookup_type: 'isbn',
    query: '9780060586607',
    original: '978-0-06-058660-7'
  });
});

test('CSV imports expose recognized columns and quoted values', () => {
  const file = parseInputFile('Title,ISBN\n"A title, with comma",9780060586607\nSecond,9780439388801\n', 'records.csv');
  assert.deepEqual(file.columns.map(column => column.type), ['title', 'isbn']);
  assert.deepEqual(valuesFromColumn(file, 0), ['A title, with comma', 'Second']);
  assert.deepEqual(valuesFromColumn(file, 1), ['9780060586607', '9780439388801']);
});

test('large mixed lists are deduplicated and split into bounded requests', () => {
  const values = Array.from({ length: 500 }, (_, index) => String(100000 + index));
  values.push('100000', '100001');
  const entries = buildBulkEntries(values, 'catalog_key');
  const chunks = chunkEntries(entries);
  assert.equal(entries.length, 500);
  assert.equal(chunks.length, 20);
  assert.ok(chunks.every(chunk => chunk.length === 25));
  assert.deepEqual(chunks.flat(), entries);
});

test('file parser preserves quoted line breaks and supports headerless text', () => {
  const csv = parseInputFile('Title,ISBN\n"A title\nwith subtitle",9780060586607\n', 'records.csv');
  assert.deepEqual(valuesFromColumn(csv, 0), ['A title\nwith subtitle']);
  const text = parseInputFile('923278\n923279\n', 'keys.txt');
  assert.deepEqual(valuesFromColumn(text, 0), ['923278', '923279']);
});

test('Excel input helpers recognize workbooks, sparse columns, and typed headers', () => {
  assert.equal(isXlsxFile({ name: 'records.xlsx', type: '' }), true);
  assert.equal(isXlsxFile({ name: 'records.csv', type: 'text/csv' }), false);
  assert.equal(columnIndexFromReference('A2'), 0);
  assert.equal(columnIndexFromReference('AA1048576'), 26);
  const data = inputDataFromRows([
    ['Title', 'ISBN', '', 'Catalog Key'],
    ['A Hat Full of Sky', '9780060586607', '', '923278']
  ]);
  assert.deepEqual(data.columns.map(column => column.type), ['title', 'isbn', '', 'catalog_key']);
  assert.deepEqual(valuesFromColumn(data, 3), ['923278']);
});
