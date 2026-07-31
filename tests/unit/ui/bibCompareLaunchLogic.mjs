import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizeFieldName,
  resolveBibCompareLookup
} from '../../../src/ui/bib-compare/bibCompareLaunch.js';

test('bibliographic comparison lookup prefers a catalog key anywhere in the row', () => {
  assert.deepEqual(
    resolveBibCompareLookup(
      ['Title', 'Item ID', 'Catalog Key'],
      ['A title', '32276003001044', '923278']
    ),
    {
      hint: 'Catalog 923278',
      lookupType: 'catalog_key',
      query: '923278'
    }
  );
});

test('bibliographic comparison lookup falls back to item ID then title', () => {
  assert.deepEqual(
    resolveBibCompareLookup(['Title', 'Item ID'], ['A title', '32276003001044']),
    {
      hint: 'Item 32276003001044',
      lookupType: 'item_id',
      query: '32276003001044'
    }
  );
  assert.deepEqual(
    resolveBibCompareLookup(['Author', 'Title'], ['Pratchett, Terry.', 'A hat full of sky']),
    {
      hint: 'A hat full of sky',
      lookupType: 'title',
      query: 'A hat full of sky'
    }
  );
});

test('bibliographic comparison lookup ignores unsupported or empty row fields', () => {
  assert.equal(resolveBibCompareLookup(['Author', 'Call Number'], ['An author', 'FIC']), null);
  assert.equal(resolveBibCompareLookup(['Catalog Key'], ['']), null);
  assert.equal(normalizeFieldName('Catalog Key (ID)'), 'catalogkeyid');
});
