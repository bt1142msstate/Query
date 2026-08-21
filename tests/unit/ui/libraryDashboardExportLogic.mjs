import assert from 'node:assert/strict';
import test from 'node:test';
import { buildLibraryDashboardExportRows } from '../../../src/ui/dashboard/libraryDashboardExport.js';

test('dashboard CSV rows include scope, comparisons, breakdowns, and sources', () => {
  const rows = buildLibraryDashboardExportRows({
    generatedAt: '2026-08-21T12:00:00Z',
    scope: { library: 'MSU', item_type: 'BOOK', active_window_days: 365 },
    circulation: { checkouts: 100, previous_checkouts: 80, checkout_change: 20, period_label: 'Recent 365 days' },
    collection: { items: 50 },
    patrons: { total: 20 },
    circulationTrend: [{ label: 'Aug 2026', checkouts: 10, renewals: 4 }],
    libraryBreakdown: [], itemTypeBreakdown: [], patronGeoBreakdown: [{ label: '397xx', patrons: 12 }],
    sources: [{ label: 'Transactions', detail: 'Verified aggregate' }], notes: []
  }, 'overview');
  assert.deepEqual(rows[0], ['Section', 'Label', 'Metric', 'Value']);
  assert.ok(rows.some(row => row[0] === 'circulation' && row[2] === 'previous_checkouts' && row[3] === 80));
  assert.ok(rows.some(row => row[0] === 'Patron ZIP3' && row[1] === '397xx' && row[3] === 12));
  assert.ok(rows.some(row => row[0] === 'Source' && row[1] === 'Transactions'));
});

test('patron export omits collection metrics', () => {
  const rows = buildLibraryDashboardExportRows({
    scope: {}, circulation: {}, collection: { items: 50 }, patrons: { total: 20 },
    patronLibraryBreakdown: [], patronProfileBreakdown: [], patronAgeBands: [], patronGeoBreakdown: [],
    sources: [], notes: []
  }, 'patrons');
  assert.equal(rows.some(row => row[0] === 'collection'), false);
});
