import assert from 'node:assert/strict';
import test from 'node:test';

import {
  filterAndSortHydrationResults,
  formatHydrationMatchRate,
  hydrationResultGroup,
  hydrationReviewCount
} from '../../../src/ui/bib-compare/oclcBibBulk.js';

const RESULTS = [
  { id: 'matched-first', status: 'resolved' },
  { id: 'failed', status: 'failed' },
  { id: 'review-second', status: 'review' },
  { id: 'missing', status: 'not_found' },
  { id: 'review-first', status: 'review' },
  { id: 'matched-second', status: 'resolved' }
];

test('hydration review grouping treats every non-matched result as needing review', () => {
  assert.equal(hydrationResultGroup({ status: 'resolved' }), 'matched');
  assert.equal(hydrationResultGroup({ status: 'review' }), 'review');
  assert.equal(hydrationResultGroup({ status: 'not_found' }), 'review');
  assert.equal(hydrationResultGroup({ status: 'failed' }), 'review');
});

test('hydration results put review work before automatic matches without mutating input order', () => {
  assert.deepEqual(
    filterAndSortHydrationResults(RESULTS).map(result => result.id),
    ['review-second', 'review-first', 'missing', 'failed', 'matched-first', 'matched-second']
  );
  assert.deepEqual(RESULTS.map(result => result.id), [
    'matched-first', 'failed', 'review-second', 'missing', 'review-first', 'matched-second'
  ]);
});

test('hydration result filters expose review work, automatic matches, or all records', () => {
  assert.deepEqual(
    filterAndSortHydrationResults(RESULTS, 'review').map(result => result.id),
    ['review-second', 'review-first', 'missing', 'failed']
  );
  assert.deepEqual(
    filterAndSortHydrationResults(RESULTS, 'matched').map(result => result.id),
    ['matched-first', 'matched-second']
  );
  assert.equal(filterAndSortHydrationResults(RESULTS, 'unknown').length, RESULTS.length);
});

test('hydration match rate reports automatic matches as a percentage of completed records', () => {
  assert.equal(formatHydrationMatchRate([]), '0%');
  assert.equal(formatHydrationMatchRate([{ status: 'resolved' }, { status: 'review' }, { status: 'not_found' }]), '33.3%');
  assert.equal(formatHydrationMatchRate([{ status: 'resolved' }, { status: 'resolved' }]), '100%');
});

test('hydration review count includes unresolved, missing, and failed records', () => {
  assert.equal(hydrationReviewCount({ resolved: 4, review: 2, not_found: 3, failed: 1 }), 6);
});
