import assert from 'node:assert/strict';
import test from 'node:test';
import { createWorkbookBlob } from '../../../src/lib/workbook-export/workbookExport.js';
import { buildBulkReviewWorkbookState } from '../../../src/ui/bib-compare/oclcBibBulk.js';

test('bulk WorldCat review workbook includes identity and audience evidence', async () => {
  const state = buildBulkReviewWorkbookState([{
    input: '9780060586607',
    lookup_type: 'isbn',
    status: 'resolved',
    local: {
      catalog_key: '923278',
      title: 'A hat full of sky /',
      creator: 'Pratchett, Terry.',
      isbn: ['9780060586607']
    },
    worldcat: {
      oclc_number: '54005706',
      title: 'A hat full of sky /',
      physical_description: '278 pages ; 20 cm',
      isbn: ['9780060586607']
    },
    selection: { method: 'unique_exact_edition' },
    match: {
      confidence: 'strong',
      title_match: 1,
      creator_match: 1,
      edition_match: 1,
      publication_year_match: 1,
      physical_description_match: 1
    },
    review: {
      hydration_ready: 1,
      local_521_count: 0,
      local_526_count: 0,
      worldcat_521_count: 1,
      worldcat_526_count: 2,
      identity_conflict: 0
    }
  }]);

  assert.equal(state.rowCount, 1);
  assert.equal(state.sourceData.dataRows[0][0], '9780060586607');
  assert.equal(state.sourceData.dataRows[0][24], 'Yes');
  assert.equal(state.sourceData.dataRows[0][28], 2);

  const { blob, filename } = await createWorkbookBlob({
    config: { mode: 'single', runDetailsRows: [] },
    helpers: { progress: { update() {} }, async yieldToBrowser() {} },
    state
  });
  const workbookText = new TextDecoder().decode(await blob.arrayBuffer());
  assert.equal(filename, 'WorldCat-Bulk-Review.xlsx');
  assert.match(workbookText, /Exact Edition Verified/u);
  assert.match(workbookText, /WorldCat 526 Count/u);
  assert.match(workbookText, /278 pages ; 20 cm/u);
});
