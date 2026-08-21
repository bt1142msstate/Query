import assert from 'node:assert/strict';
import test from 'node:test';

import {
  classifyRunStatus,
  filterDashboardRuns,
  getDashboardStaffOptions,
  normalizeDashboardRuns,
  summarizeDashboardRuns
} from '../../../src/ui/dashboard/kpiDashboardModel.js';

const now = Date.parse('2026-08-21T18:00:00Z');
const runs = normalizeDashboardRuns({
  queries: {
    q1: { name: 'Items by library', created_by: 'anita', status: 'complete', start_time: '2026-08-20T12:00:00Z', end_time: '2026-08-20T12:02:00Z', row_count: 1200 },
    q2: { name: 'Items by library', created_by: 'brandon', status: 'failed', start_time: '2026-08-19T12:00:00Z', end_time: '2026-08-19T12:01:00Z', row_count: 0 },
    q3: { name: 'Hydration review', created_by: 'anita', kind: 'hydration', status: 'hydration_complete', start_time: '2026-08-18T12:00:00Z', end_time: '2026-08-18T12:03:00Z', hydration_completed: 8, hydration_counts: { resolved: 6, review: 1, not_found: 1 } },
    q4: { name: 'Old report', created_by: 'brandon', status: 'complete', start_time: '2026-05-01T12:00:00Z', end_time: '2026-05-01T12:10:00Z', row_count: 500 }
  }
});

test('dashboard status classification uses stable user-facing buckets', () => {
  assert.equal(classifyRunStatus('hydration_running'), 'running');
  assert.equal(classifyRunStatus('complete'), 'complete');
  assert.equal(classifyRunStatus('cancelled'), 'canceled');
  assert.equal(classifyRunStatus('command_failed'), 'failed');
});

test('dashboard filtering combines date, kind, and staff scope', () => {
  assert.deepEqual(filterDashboardRuns(runs, { now, range: '30', kind: 'hydration', staff: 'anita' }).map(run => run.id), ['q3']);
  assert.equal(filterDashboardRuns(runs, { now, range: '30', kind: 'all', staff: 'all' }).length, 3);
  assert.equal(filterDashboardRuns(runs, { now, range: 'all', kind: 'all', staff: 'all' }).length, 4);
});

test('dashboard summary reconciles cards, charts, and rankings', () => {
  const summary = summarizeDashboardRuns(runs, { now, range: '30', kind: 'all', staff: 'all' });
  assert.equal(summary.totalRuns, 3);
  assert.equal(summary.totalRows, 1208);
  assert.equal(summary.completionRate, 2 / 3);
  assert.equal(summary.medianDurationSeconds, 120);
  assert.deepEqual(summary.statusCounts, { complete: 2, running: 0, failed: 1, canceled: 0 });
  assert.deepEqual(summary.topReports[0], { label: 'Items by library', value: 2 });
  assert.deepEqual(summary.hydration, { resolved: 6, review: 1, not_found: 1, failed: 0 });
  assert.equal(summary.trend.buckets.reduce((sum, bucket) => sum + bucket.total, 0), 3);
});

test('dashboard exposes sorted staff filter choices', () => {
  assert.deepEqual(getDashboardStaffOptions(runs), ['anita', 'brandon']);
});
