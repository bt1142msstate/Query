import assert from 'node:assert/strict';
import test from 'node:test';
import { singleReviewResult, tagCounts } from '../../../src/ui/bib-compare/singleHydrationWorkbook.js';

test('single hydration review becomes the same workbook row shape as bulk review', () => {
  const result = singleReviewResult({
    local: {
      summary: { catalog_key: '123', title: 'Local title' },
      record: { fields: [{ tag: '245' }, { tag: '521' }] }
    },
    worldcat: {
      summary: { oclc_number: '456', title: 'WorldCat title' },
      record: { fields: [{ tag: '245' }, { tag: '521' }, { tag: '526' }] }
    },
    review: { recommended: true },
    comparison: { rows: [{ tag: '526', status: 'worldcat_only' }] }
  });
  assert.equal(result.status, 'resolved');
  assert.deepEqual(result.field_summary.local_tags, { 245: 1, 521: 1 });
  assert.deepEqual(result.field_summary.difference_tags.worldcat_only, { 526: 1 });
});

test('tag inventory ignores non-MARC values', () => {
  assert.deepEqual(tagCounts({ fields: [{ tag: 'LDR' }, { tag: '945' }, { tag: '' }] }), { 945: 1 });
});
