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
