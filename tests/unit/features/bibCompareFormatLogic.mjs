import assert from 'node:assert/strict';
import test from 'node:test';

import {
  comparisonStatusLabel,
  fieldLines,
  filterComparisonRows,
  formatIdentifierList,
  matchConfidenceLabel,
  searchInputMetadata,
  summaryValue
} from '../../../src/ui/bib-compare/bibCompareFormat.js';

const rows = [
  { tag: '001', status: 'changed' },
  { tag: '020', status: 'same' },
  { tag: '590', status: 'local_only' },
  { tag: '650', status: 'worldcat_only' }
];

test('bibliographic comparison row filters retain the requested record states', () => {
  assert.deepEqual(filterComparisonRows(rows, 'all'), rows);
  assert.deepEqual(filterComparisonRows(rows, 'differences').map(row => row.tag), ['001', '590', '650']);
  assert.deepEqual(filterComparisonRows(rows, 'same').map(row => row.tag), ['020']);
  assert.deepEqual(filterComparisonRows(rows, 'local_only').map(row => row.tag), ['590']);
  assert.deepEqual(filterComparisonRows(rows, 'worldcat_only').map(row => row.tag), ['650']);
});

test('bibliographic field values are formatted without markup', () => {
  assert.deepEqual(fieldLines({ control: 1, data: 'a923278' }), ['a923278']);
  assert.deepEqual(fieldLines({
    control: 0,
    indicator1: '1',
    indicator2: '2',
    subfields: [
      { code: 'a', value: 'A hat full of sky :' },
      { code: 'b', value: 'a novel /' }
    ]
  }), [
    'Indicators 12',
    '$a A hat full of sky :',
    '$b a novel /'
  ]);
  assert.deepEqual(fieldLines(null), []);
});

test('bibliographic UI labels and fallbacks are concise', () => {
  assert.equal(comparisonStatusLabel('worldcat_only'), 'WorldCat only');
  assert.equal(matchConfidenceLabel('linked'), 'Linked record');
  assert.equal(matchConfidenceLabel('oclc_resolved'), 'OCLC resolved');
  assert.equal(summaryValue(''), 'Not present');
  assert.equal(formatIdentifierList(['9780060586607', '']), '9780060586607');
  assert.equal(searchInputMetadata('catalog_key').inputMode, 'numeric');
});
