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
  assert.ok(html.indexOf('>Higher</button>') < html.indexOf('>Lower</button>'));
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

test('dashboard intro shows each source timestamp and identifies the delayed source plainly', () => {
  const dashboard = normalizeLibraryDashboard({
    generated_at: '2026-08-25T12:17:05Z',
    scope: { library: 'all', item_type: 'all', active_window_days: 365 },
    collection: { items: 120 },
    circulation: { checkouts: 45 },
    patrons: { total: 32 },
    source_status: {
      transactions: { completed_at: '2026-08-25T12:17:05Z' },
      items: { completed_at: '2026-08-25T07:49:57Z' },
      patrons: { completed_at: '2026-08-25T07:50:13Z' }
    },
    freshness: {
      stale: true,
      sources: {
        transactions: { stale: false },
        items: { stale: true },
        patrons: { stale: false }
      }
    }
  });

  const html = renderLibraryDashboard(dashboard, 'overview');
  assert.match(html, /Circulation<\/strong> updated/);
  assert.match(html, /Collection<\/strong> updated[^<]*behind schedule/);
  assert.match(html, /Patrons<\/strong> updated/);
  assert.match(html, /One or more source refreshes are behind schedule/);
});

test('collection and patron views label unavailable or non-applicable dimensions plainly', () => {
  const dashboard = normalizeLibraryDashboard({
    scope: { library: 'MSU-GRANT', item_type: 'BOOK', active_window_days: 90 },
    collection: { items: 17_916 },
    patrons: { total: 100, active: 12, active_rate: 0.12, new: 4 }
  });

  const collectionHtml = renderLibraryDashboard(dashboard, 'collection');
  assert.match(collectionHtml, /Distinct-title aggregate not available/);
  assert.doesNotMatch(collectionHtml, />0 distinct titles</);

  const patronHtml = renderLibraryDashboard(dashboard, 'patrons');
  assert.match(patronHtml, /Item type does not apply to patrons/);

  const overviewHtml = renderLibraryDashboard(dashboard, 'overview');
  assert.equal((overviewHtml.match(/item type does not apply/g) || []).length, 3);
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

test('patron view explains eligibility, reconciles source records, and protects small branch totals', () => {
  const dashboard = normalizeLibraryDashboard({
    patrons: {
      total: 80, records_total: 100, expired: 15, expiration_unknown: 5,
      never_expires: 10, expired_with_charges: 2, eligibility_rate: 0.8,
      active: 20, active_rate: 0.25, new: 4,
      eligibility_label: 'Expiration is today or later, or privileges never expire'
    },
    metric_definitions: {
      current_patrons: { calculation: 'Unexpired or NEVER.', source: 'Patron snapshot', grain: 'Patron account', time_basis: 'Snapshot' }
    },
    system_breakdown: [{ label: 'MLP', branches: 1, patron_suppressed: true, items: 5 }],
    library_breakdown: [{ label: 'TINY', system: 'MLP', patron_suppressed: true, items: 5 }]
  });
  const html = renderLibraryDashboard(dashboard, 'patrons');
  assert.match(html, /Account eligibility reconciliation/);
  assert.match(html, /All patron records/);
  assert.match(html, />100</);
  assert.match(html, /Unknown expiration/);
  assert.match(html, /How calculated/);
  assert.match(html, /System and branch totals/);
  assert.match(html, /Suppressed/);
  assert.match(html, /not presented as current-patron geography/);
});

test('dashboard breakdowns expose reversible system, branch, and item-type drill-downs', () => {
  const dashboard = normalizeLibraryDashboard({
    circulation: { checkouts: 45 },
    collection: { items: 120 },
    patrons: { total: 32 },
    system_breakdown: [{ label: 'MSU', branches: 2, items: 120 }],
    library_breakdown: [{ label: 'MSU-MAIN', system: 'MSU', items: 100, checkouts: 40 }],
    item_type_breakdown: [{ label: 'BOOK', items: 90, checkouts: 35 }],
    patron_library_breakdown: [{ label: 'MSU-MAIN', patrons: 30 }]
  });
  dashboard.canGoBack = true;

  const html = renderLibraryDashboard(dashboard, 'overview');
  assert.match(html, /data-kpi-scope-kind="system" data-kpi-scope-value="MSU">View system/);
  assert.match(html, /data-kpi-scope-kind="branch" data-kpi-scope-value="MSU-MAIN">View branch/);
  assert.match(html, /data-kpi-scope-kind="item-type" data-kpi-scope-value="BOOK">BOOK/);
  assert.match(html, /data-kpi-back-scope/);
  assert.match(html, /Back to previous dashboard scope/);
});

test('director views surface circulation, patron, inventory, risk, and stewardship measures', () => {
  const dashboard = normalizeLibraryDashboard({
    circulation: { checkouts: 80, renewals: 20, activity: 100, period_label: 'Recent 365 days' },
    collection: {
      items: 200, titles: 150, used_recently: 75, recent_use_rate: 0.375,
      inventory_coverage: 0.8, inventoried: 160, inventoried_last_365_days: 60,
      unavailable_items: 25, unavailable_rate: 0.125, missing_lost_items: 10,
      in_transit_items: 5, price_coverage: 0.9, total_value: 4000
    },
    patrons: { total: 50, active: 25, new: 8 },
    system_breakdown: [{ label: 'MSU', branches: 1, items: 200, titles: 150, checkouts: 80, renewals: 20, holds: 4, inventoried: 160, missing_lost_items: 10, unavailable_items: 25, in_transit_items: 5, total_value: 4000, patron_records: 80, patrons: 50, active_patrons: 25, expired_patrons: 25, expiration_unknown: 5 }],
    library_breakdown: [{ label: 'MSU-MAIN', system: 'MSU', items: 200 }]
  });

  const overview = renderLibraryDashboard(dashboard, 'overview');
  assert.match(overview, /Total circulation/);
  assert.match(overview, />100</);
  assert.match(overview, /Current patrons/);
  assert.match(overview, /Turnover/);

  const collection = renderLibraryDashboard(dashboard, 'collection');
  assert.match(collection, /Inventory and availability health/);
  assert.match(collection, /Inventory coverage/);
  assert.match(collection, /Inventoried recently/);
  assert.match(collection, /Missing or lost/);
  assert.match(collection, /Collection value/);

  const patrons = renderLibraryDashboard(dashboard, 'patrons');
  assert.match(patrons, /All patron records/);
  assert.match(patrons, /Unknown expiry/);
});
