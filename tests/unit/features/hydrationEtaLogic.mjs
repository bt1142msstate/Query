import assert from 'node:assert/strict';
import test from 'node:test';
import {
  estimateHydrationEta,
  formatHydrationRemaining,
  parseHydrationTimestamp
} from '../../../src/core/hydrationEta.js';

test('hydration ETA waits for a completed batch and estimates from observed throughput', () => {
  const startedAt = Date.UTC(2026, 7, 11, 20, 0, 0);
  assert.equal(estimateHydrationEta({ completed: 0, total: 100, startedAt, now: startedAt + 10000 }).state, 'estimating');

  const estimate = estimateHydrationEta({ completed: 25, total: 100, startedAt, now: startedAt + 60000 });
  assert.equal(estimate.state, 'estimated');
  assert.equal(estimate.remainingMs, 180000);
  assert.match(estimate.text, /^ETA: about 3 min remaining · around /u);
});

test('hydration ETA handles completion, invalid totals, and server timestamps', () => {
  assert.equal(parseHydrationTimestamp('2026-08-11 15:30:00'), new Date('2026-08-11T15:30:00').getTime());
  assert.equal(estimateHydrationEta({ completed: 10, total: 10, startedAt: 1, now: 2 }).state, 'complete');
  assert.equal(estimateHydrationEta({ completed: 1, total: 0, startedAt: 1, now: 2 }).text, '');
  assert.equal(formatHydrationRemaining(30000), 'under 1 min');
  assert.equal(formatHydrationRemaining(7500000), 'about 2 hr 5 min');
});
