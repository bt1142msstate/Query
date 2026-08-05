import assert from 'node:assert/strict';
import test from 'node:test';

import {
  fieldEvidenceDownloadReady,
  fieldEvidenceStatus,
  fieldEvidenceSummary
} from '../../../src/ui/bib-compare/fieldEvidenceReview.js';

test('field evidence labels remain plain and conservative', () => {
  assert.equal(fieldEvidenceStatus('strong').label, 'Strong evidence');
  assert.equal(fieldEvidenceStatus('supported').label, 'Supported');
  assert.equal(fieldEvidenceStatus('conflicting').label, 'Conflicting');
  assert.equal(fieldEvidenceStatus('unknown').label, 'Needs review');
});

test('field evidence summary reports every material decision', () => {
  const summary = fieldEvidenceSummary({
    fields: [
      { status: 'strong' },
      { status: 'strong' },
      { status: 'needs_review' },
      { status: 'already_present' }
    ]
  });
  assert.equal(summary, '2 strong evidence; 1 needs review; 1 already present');
});

test('candidate readiness requires an applicable backend-approved review', () => {
  assert.equal(fieldEvidenceDownloadReady(null), false);
  assert.equal(fieldEvidenceDownloadReady({ applicable: 0, ready_for_candidate_download: 1 }), false);
  assert.equal(fieldEvidenceDownloadReady({ applicable: 1, ready_for_candidate_download: 0 }), false);
  assert.equal(fieldEvidenceDownloadReady({ applicable: 1, ready_for_candidate_download: 1 }), true);
});
