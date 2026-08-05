import assert from 'node:assert/strict';
import test from 'node:test';
import { createWorkbookBlob } from '../../../src/lib/workbook-export/workbookExport.js';
import { buildBulkResolvePayload, buildBulkReviewWorkbookState } from '../../../src/ui/bib-compare/oclcBibBulk.js';

test('bulk WorldCat requests carry selected hydration fields without mutating entries', () => {
  const entries = [{ lookup_type: 'isbn', query: '9780060586607', original: '978-0-06-058660-7' }];
  assert.deepEqual(buildBulkResolvePayload(entries, ['521', '526']), {
    action: 'resolve_oclc_bibs_bulk',
    entries: [{ lookup_type: 'isbn', query: '9780060586607' }],
    target_tags: ['521', '526']
  });
  assert.equal(entries[0].original, '978-0-06-058660-7');
});

test('bulk hydration review workbook includes identity and generic MARC evidence', async () => {
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
    selection: {
      method: 'best_exact_edition_record',
      exact_candidate_count: 2,
      utility: {
        score: 91,
        encoding_level: 'blank (full)',
        authentication_codes: ['pcc'],
        core_elements: ['title', 'creator', 'subject access'],
        parts: { encoding_completeness: 30, authenticated_cataloging: 20 }
      }
    },
    match: {
      confidence: 'strong',
      title_match: 1,
      creator_match: 1,
      edition_match: 1,
      publication_year_match: 1,
      physical_description_match: 1
    },
    field_summary: {
      local_tags: { '001': 1, '245': 1 },
      worldcat_tags: { '001': 1, '245': 1, '505': 1, '650': 3 },
      difference_tags: {
        changed: { '245': 1 },
        worldcat_only: { '505': 1, '650': 3 }
      }
    },
    review: {
      hydration_ready: 1,
      local_521_count: 0,
      local_526_count: 0,
      worldcat_521_count: 1,
      worldcat_526_count: 2,
      identity_conflict: 0,
      advice: 'recommended',
      overall_score: 96,
      identity_score: 95,
      target_field_score: 100,
      mode: 'selected_fields',
      requested_tags: ['521', '526'],
      missing_tags: [],
      blocked_tags: [],
      scoring_version: '1.0'
    }
  }]);

  assert.equal(state.rowCount, 1);
  assert.equal(state.sourceData.dataRows[0][0], '9780060586607');
  const valueFor = field => state.sourceData.dataRows[0][state.sourceData.displayedFields.indexOf(field)];
  assert.equal(valueFor('Exact Edition Verified'), 'Yes');
  assert.equal(valueFor('Exact Edition Candidates'), 2);
  assert.equal(valueFor('Selected Utility Score'), 91);
  assert.equal(valueFor('Authentication Codes'), 'pcc');
  assert.equal(valueFor('Utility Score Breakdown'), 'encoding completeness: 30; authenticated cataloging: 20');
  assert.equal(valueFor('Source 526 Count'), 2);
  assert.equal(valueFor('Hydration Advice'), 'recommended');
  assert.equal(valueFor('Overall Confidence'), 96);
  assert.equal(valueFor('Requested Fields'), '521; 526');
  assert.equal(valueFor('Confidence Policy Version'), '1.0');
  assert.equal(valueFor('Source-only MARC Tags'), '505 (1); 650 (3)');

  const { blob, filename } = await createWorkbookBlob({
    config: { mode: 'single', runDetailsRows: [] },
    helpers: { progress: { update() {} }, async yieldToBrowser() {} },
    state
  });
  const workbookText = new TextDecoder().decode(await blob.arrayBuffer());
  assert.equal(filename, 'Hydration-Review.xlsx');
  assert.match(workbookText, /Exact Edition Verified/u);
  assert.match(workbookText, /Selected Utility Score/u);
  assert.match(workbookText, /best_exact_edition_record/u);
  assert.match(workbookText, /Source 526 Count/u);
  assert.match(workbookText, /Source-only MARC Tags/u);
  assert.match(workbookText, /Hydration Advice/u);
  assert.match(workbookText, /Requested Fields/u);
  assert.match(workbookText, /505 \(1\); 650 \(3\)/u);
  assert.match(workbookText, /278 pages ; 20 cm/u);
});
