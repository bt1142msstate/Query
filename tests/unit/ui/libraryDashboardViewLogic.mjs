import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeLibraryDashboard } from '../../../src/ui/dashboard/libraryDashboardModel.js';
import { renderLibraryDashboard } from '../../../src/ui/dashboard/libraryDashboardView.js';

test('overview never presents placeholder zeroes as verified period demand', () => {
  const dashboard = normalizeLibraryDashboard({
    collection: { items: 120 },
    library_breakdown: [{ label: 'Main', checkouts: 0 }],
    item_type_breakdown: [{ label: 'BOOK', checkouts: 0 }]
  });

  const html = renderLibraryDashboard(dashboard, 'overview');
  assert.equal((html.match(/Period circulation data is not available for this scope\./g) || []).length, 3);
  assert.doesNotMatch(html, /kpi-ranking__label[^>]*>Main</);
  assert.doesNotMatch(html, /kpi-ranking__label[^>]*>BOOK</);
});

test('overview renders demand rankings when the transaction aggregate is available', () => {
  const dashboard = normalizeLibraryDashboard({
    circulation: { checkouts: 45, renewals: 10 },
    collection: { items: 120 },
    library_breakdown: [{ label: 'Main', checkouts: 30 }],
    item_type_breakdown: [{ label: 'BOOK', checkouts: 25 }]
  });

  const html = renderLibraryDashboard(dashboard, 'overview');
  assert.match(html, /kpi-ranking__label[^>]*>Main</);
  assert.match(html, /kpi-ranking__label[^>]*>BOOK</);
});

test('demand rankings put the highest period activity first', () => {
  const dashboard = normalizeLibraryDashboard({
    circulation: { checkouts: 45, period_label: 'Recent 90 days' },
    collection: { items: 120 },
    library_breakdown: [
      { label: 'Lower', checkouts: 5 },
      { label: 'Higher', checkouts: 40 }
    ]
  });

  const html = renderLibraryDashboard(dashboard, 'overview');
  assert.ok(html.indexOf('>Higher</span>') < html.indexOf('>Lower</span>'));
  assert.match(html, /Recent 90 days/);
});

test('dashboard intro names the selected aggregate scope when labels are absent', () => {
  const dashboard = normalizeLibraryDashboard({
    scope: { library: 'MSU-GRANT', item_type: 'BOOK', active_window_days: 90 },
    collection: { items: 17_916 }
  });

  const html = renderLibraryDashboard(dashboard, 'overview');
  assert.match(html, /<strong>MSU-GRANT<\/strong>/);
  assert.match(html, /<small>BOOK<\/small>/);
  assert.doesNotMatch(html, /<strong>All MLP libraries<\/strong>/);
});

test('dashboard intro distinguishes hourly circulation freshness from full-rebuild sources', () => {
  const dashboard = normalizeLibraryDashboard({
    generated_at: '2026-08-24T22:46:41Z',
    source_status: {
      transactions: { status: 'complete', completed_at: '2026-08-24T22:46:40Z' },
      items: { status: 'reused', completed_at: '2026-08-24T08:10:00Z' },
      patrons: { status: 'reused', completed_at: '2026-08-24T08:10:00Z' }
    },
    collection: { items: 120 }
  });

  const html = renderLibraryDashboard(dashboard, 'overview');
  assert.match(html, /<strong>Circulation<\/strong> updated Aug 24, 2026/);
  assert.match(html, /<strong>Collection and patrons<\/strong> updated Aug 24, 2026/);
  assert.doesNotMatch(html, /<span>Updated/);
});

test('dashboard intro keeps collection and patron timestamps separate when they differ', () => {
  const dashboard = normalizeLibraryDashboard({
    generated_at: '2026-08-24T22:46:41Z',
    source_status: {
      items: { completed_at: '2026-08-24T08:10:00Z' },
      patrons: { completed_at: '2026-08-23T08:10:00Z' }
    },
    collection: { items: 120 }
  });

  const html = renderLibraryDashboard(dashboard, 'overview');
  assert.match(html, /<strong>Collection<\/strong> updated Aug 24, 2026/);
  assert.match(html, /<strong>Patrons<\/strong> updated Aug 23, 2026/);
});

test('collection and patron views label unavailable or non-applicable dimensions plainly', () => {
  const dashboard = normalizeLibraryDashboard({
    scope: { library: 'MSU-GRANT', item_type: 'BOOK', active_window_days: 90 },
    collection: { items: 17_916 }
  });

  const collectionHtml = renderLibraryDashboard(dashboard, 'collection');
  assert.match(collectionHtml, /Distinct-title aggregate not available/);
  assert.doesNotMatch(collectionHtml, />0 distinct titles</);

  const patronHtml = renderLibraryDashboard(dashboard, 'patrons');
  assert.match(patronHtml, /Item type does not apply to patrons/);
});

test('named circulation periods keep collection and patron activity windows explicit', () => {
  const dashboard = normalizeLibraryDashboard({
    scope: { library: 'system:MSU', item_type: 'all', active_window_days: 365 },
    circulation: { checkouts: 45, period_label: 'FY 2027 to date' },
    collection: { items: 120, used_recently: 30, recent_use_rate: 0.25 },
    patrons: { total: 100, active: 20, active_rate: 0.2, new: 5, new_period_label: 'Registered in the last 365 days' }
  });

  const overview = renderLibraryDashboard(dashboard, 'overview');
  assert.match(overview, /FY 2027 to date/);
  assert.match(overview, /Last 12 months · 30 items with recorded use/);
  assert.match(overview, /Last 12 months · 20% of current patrons/);
  assert.doesNotMatch(overview, /used in the selected window/);
});

test('patron breakdowns state coverage and dashboard source gaps remain visible', () => {
  const dashboard = normalizeLibraryDashboard({
    scope: { active_window_days: 365 },
    circulation: { checkouts: 10 },
    collection: { items: 20 },
    patrons: { total: 100, active: 10, active_rate: 0.1, new: 2 },
    patron_profile_breakdown: [
      { label: 'Adult', patrons: 70 },
      { label: 'Other / suppressed', patrons: 20 }
    ],
    privacy: { suppression_threshold: 10 }
  });

  const patronHtml = renderLibraryDashboard(dashboard, 'patrons');
  assert.match(patronHtml, /Coverage: 90 of 100 patrons \(90%\)/);
  assert.match(patronHtml, /10 patrons are missing, invalid, or suppressed/);

  const overviewHtml = renderLibraryDashboard(dashboard, 'overview');
  assert.match(overviewHtml, /Library service coverage/);
  assert.match(overviewHtml, /4 connected · 7 need a source/);
  assert.match(overviewHtml, /Electronic resources/);
});
