import assert from 'node:assert/strict';
import test from 'node:test';

import {
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
    isbn: ['9780060586607']
  });
});
