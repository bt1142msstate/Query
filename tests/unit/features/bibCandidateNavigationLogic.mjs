import assert from 'node:assert/strict';
import test from 'node:test';

import {
  candidateConfidenceBand,
  candidateScore,
  mergeCandidateRecords,
  selectedCandidateNumber,
  selectedCandidateSummary
} from '../../../src/ui/bib-compare/bibCandidateNavigation.js';

test('candidate navigation retains prior matches and updates repeated metadata', () => {
  const merged = mergeCandidateRecords(
    [
      { oclc_number: '111', title: 'First title' },
      { oclc_number: '222', title: 'Second title' }
    ],
    [{ oclc_number: '222', edition: 'Second edition' }]
  );

  assert.deepEqual(merged.map(candidate => candidate.oclc_number), ['111', '222']);
  assert.equal(merged[1].title, 'Second title');
  assert.equal(merged[1].edition, 'Second edition');
});

test('candidate navigation keeps low-confidence matches and ranks scored records highest', () => {
  const merged = mergeCandidateRecords([
    { oclc_number: '333', title: 'Low match', match_score: 38, match_confidence_band: 'low' },
    { oclc_number: '111', title: 'Strong match', match_score: 91, match_confidence_band: 'high' },
    { oclc_number: '222', title: 'Reviewed match', match_score: 95, overall_score: 84, confidence_band: 'good' }
  ]);

  assert.deepEqual(merged.map(candidate => candidate.oclc_number), ['111', '222', '333']);
  assert.deepEqual(candidateScore(merged[1]), { value: 84, kind: 'overall' });
  assert.equal(candidateConfidenceBand(merged[2]), 'low');
});

test('selected WorldCat record can be reconstructed when a follow-up omits candidates', () => {
  const payload = {
    selection: { oclc_number: '54005706' },
    worldcat: {
      summary: {
        oclc_number: '54005706',
        title: 'A hat full of sky',
        creator: 'Terry Pratchett',
        edition: 'First edition',
        isbn: ['9780060586607']
      }
    },
    candidates: []
  };

  assert.equal(selectedCandidateNumber(payload), '54005706');
  assert.deepEqual(selectedCandidateSummary(payload), {
    oclc_number: '54005706',
    title: 'A hat full of sky',
    creator: 'Terry Pratchett',
    date: '',
    edition: 'First edition',
    specific_format: '',
    isbn: ['9780060586607'],
    overall_score: null,
    identity_score: null,
    confidence_band: '',
    advice: '',
    score_reason: ''
  });
});
