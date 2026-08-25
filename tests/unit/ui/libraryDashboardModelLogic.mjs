import assert from 'node:assert/strict';
import test from 'node:test';
import { libraryDashboardHasData, normalizeLibraryDashboard } from '../../../src/ui/dashboard/libraryDashboardModel.js';

test('library dashboard normalizes aggregate groups and filter metadata', () => {
  const dashboard = normalizeLibraryDashboard({
    schema_version: 1,
    collection: { items: '120', titles: 90 },
    circulation: { checkouts: '45', period_label: 'Recent 90 days', coverage_complete: true },
    patrons: { total: 32 },
    source_status: { items: { status: 'reused', completed_at: '2026-08-25T07:49:57Z' } },
    service_coverage: [{ id: 'visits', connected: true }],
    library_breakdown: [{ label: 'Main', checkouts: '30' }],
    filters: {
      systems: [{ value: 'system:MAIN', label: 'Main System' }],
      libraries: [{ value: 'MAIN', label: 'Main' }],
      item_types: ['BOOK'],
      calendar_periods: [{ value: 'cy:2026', label: 'Calendar Year 2026 to date' }]
    }
  });
  assert.equal(dashboard.collection.items, 120);
  assert.equal(dashboard.circulation.checkouts, 45);
  assert.equal(dashboard.circulation.period_label, 'Recent 90 days');
  assert.equal(dashboard.circulation.coverage_complete, true);
  assert.equal(dashboard.libraryBreakdown[0].checkouts, 30);
  assert.equal(dashboard.filters.libraries[0].value, 'MAIN');
  assert.equal(dashboard.filters.systems[0].value, 'system:MAIN');
  assert.equal(dashboard.filters.calendarPeriods[0].value, 'cy:2026');
  assert.deepEqual(dashboard.serviceCoverage, [{ id: 'visits', connected: true }]);
  assert.equal(dashboard.sourceStatus.items.completed_at, '2026-08-25T07:49:57Z');
  assert.deepEqual(dashboard.availability, { circulation: true, collection: true, patrons: true });
  assert.equal(libraryDashboardHasData(dashboard), true);
});

test('library dashboard treats malformed or empty payloads as an empty safe view', () => {
  const dashboard = normalizeLibraryDashboard(null);
  assert.equal(dashboard.collection.items, undefined);
  assert.equal(dashboard.circulationTrend.length, 0);
  assert.deepEqual(dashboard.availability, { circulation: false, collection: false, patrons: false });
  assert.equal(libraryDashboardHasData(dashboard), false);
});

test('library dashboard preserves privacy and methodology without exposing row data', () => {
  const dashboard = normalizeLibraryDashboard({
    patrons: { total: 10 },
    privacy: { suppression_threshold: 10 },
    sources: [{ label: 'Patrons', detail: 'Aggregated only.' }],
    notes: ['No patron identifiers are returned.']
  });
  assert.equal(dashboard.privacy.suppression_threshold, 10);
  assert.equal(dashboard.sources[0].label, 'Patrons');
  assert.deepEqual(Object.keys(dashboard).includes('rows'), false);
});
