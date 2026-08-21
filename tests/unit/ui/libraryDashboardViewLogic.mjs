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
