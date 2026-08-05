import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAuxiliaryPayload,
  buildEntries,
  findAvailableLookupField,
  getBibliographicLookupFields,
  validateEntryCount,
  valuesFromLookupColumn
} from '../../../src/ui/bib-compare/currentQueryHydration.js';

const definitions = [
  { name: 'Fallback title', recordLookupType: 'title', recordLookupPriority: 3, recordLookupScope: 'bibliographic' },
  { name: 'Bib identifier', recordLookupType: 'catalog_key', recordLookupPriority: 1, recordLookupScope: 'bibliographic' },
  { name: 'Unrelated', recordLookupType: 'item_id', recordLookupPriority: 0, recordLookupScope: 'user' }
];

test('uses the highest-priority backend-designated lookup field available in the table', () => {
  assert.deepEqual(getBibliographicLookupFields(definitions).map(field => field.name), [
    'Bib identifier',
    'Fallback title'
  ]);
  assert.equal(findAvailableLookupField({ columnMap: new Map([['Fallback title', 0]]) }, definitions)?.name, 'Fallback title');
});

test('extracts and deduplicates scalar and multi-value identifiers', () => {
  const definition = definitions[1];
  const values = valuesFromLookupColumn({
    columnMap: new Map([['Bib identifier', 0]]),
    rows: [['101'], [['101', '102']], [' 103 '], ['']]
  }, definition);
  assert.deepEqual(values, ['101', '102', '103']);
  assert.deepEqual(buildEntries(values, definition), [
    { lookup_type: 'catalog_key', query: '101', original: '101' },
    { lookup_type: 'catalog_key', query: '102', original: '102' },
    { lookup_type: 'catalog_key', query: '103', original: '103' }
  ]);
});

test('auxiliary query preserves executed filters and adds the missing lookup field', () => {
  const payload = buildAuxiliaryPayload({
    queryState: {
      displayedFields: ['Display field'],
      activeFilters: { Filter: { filters: [{ cond: 'equals', val: 'value' }] } }
    },
    lookupField: definitions[1],
    rowLimit: 41
  });
  assert.equal(payload.action, 'run');
  assert.equal(payload.max_rows, 41);
  assert.deepEqual(payload.display_fields, ['Display field', 'Bib identifier']);
  assert.equal(payload.filters.length, 1);
});

test('rejects empty current-query sources and accepts large complete results', () => {
  assert.throws(() => validateEntryCount([]), /no records/i);
  const largeResult = Array.from({ length: 1500 }, (_, index) => index);
  assert.equal(validateEntryCount(largeResult), largeResult);
});
