import assert from 'node:assert/strict';
import test from 'node:test';
import { estimateColdStartQueryPlan, mergeQueryPlanEstimate, queryPlanSignature } from '../../../src/core/queryPlanEstimate.js';

const aggregate = {
  collection: { items: 3_000_000 },
  library_breakdown: [{ label: 'MSU-MAIN', items: 120_000 }],
  item_type_breakdown: [{ label: 'EBOOK', items: 50_000 }],
  home_location_breakdown: [{ label: 'OFFSITE', items: 8_000 }]
};

test('cold-start ETA uses exact aggregate counts without comparable query history', () => {
  const plan = estimateColdStartQueryPlan({
    display_fields: ['Title', 'Item Id'],
    filters: [
      { field: 'Item Library', operator: '=', value: 'MSU-MAIN' },
      { field: 'Home Location', operator: '=', value: 'OFFSITE' }
    ]
  }, aggregate);
  assert.equal(plan.eta.available, true);
  assert.equal(plan.eta.requires_comparable_history, false);
  assert.equal(plan.eta.sample_size, 0);
  assert.equal(plan.eta.estimated_candidates, 8000);
  assert.match(plan.eta.label, /current collection aggregate and exact policy totals/u);
});

test('cold-start ETA remains available before the live aggregate arrives', () => {
  const plan = estimateColdStartQueryPlan({ display_fields: ['Title'], filters: [] });
  assert.equal(plan.eta.available, true);
  assert.equal(plan.aggregate_basis.available, false);
  assert.match(plan.eta.label, /cold-start system-size and field-cost model/u);
});

test('unavailable backend history cannot suppress the aggregate ETA', () => {
  const plan = mergeQueryPlanEstimate({
    display_fields: ['Title'], filters: [{ field: 'Item Type', operator: '=', value: 'EBOOK' }]
  }, { changed: true, order: [{ field: 'Item Type' }], eta: { available: false, sample_size: 0 } }, aggregate);
  assert.equal(plan.changed, true);
  assert.equal(plan.order[0].field, 'Item Type');
  assert.equal(plan.eta.available, true);
  assert.equal(plan.eta.estimated_candidates, 50000);
});

test('a calibrated backend estimate replaces the immediate cold-start band', () => {
  const plan = mergeQueryPlanEstimate({
    display_fields: ['Title'], filters: [{ field: 'Item Type', operator: '=', value: 'EBOOK' }]
  }, {
    changed: false,
    eta: { available: true, method: 'aggregate_calibrated_history', lower_seconds: 4.2, upper_seconds: 12.8, sample_size: 38 },
    aggregate_basis: { available: true, label: 'Current private collection aggregates' }
  }, aggregate);
  assert.deepEqual(plan.eta.range_seconds, [4, 13]);
  assert.match(plan.eta.label, /^Likely 4–13 sec/u);
  assert.equal(plan.eta.requires_comparable_history, false);
  assert.equal(plan.aggregate_basis.label, 'Current private collection aggregates');
});

test('plan signatures ignore run names but change with query meaning', () => {
  const left = { name: 'One', display_fields: ['Title'], filters: [] };
  const renamed = { ...left, name: 'Two' };
  const changed = { ...left, filters: [{ field: 'Item Type', operator: '=', value: 'BOOK' }] };
  assert.equal(queryPlanSignature(left), queryPlanSignature(renamed));
  assert.notEqual(queryPlanSignature(left), queryPlanSignature(changed));
  assert.notEqual(queryPlanSignature(left), queryPlanSignature({ ...left, smart_query_enabled: false }));
});
