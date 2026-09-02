import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildOrderExplanation,
  explainEvidence,
  formatEstimatedShare
} from '../../../src/core/queryPlanOrderExplanation.js';

test('formats estimated shares without false precision', () => {
  assert.equal(formatEstimatedShare(0), 'fewer than 0.1% of records');
  assert.equal(formatEstimatedShare(0.00305145), 'about 0.3% of records');
  assert.equal(formatEstimatedShare(0.305145), 'about 31% of records');
  assert.equal(formatEstimatedShare('not available'), '');
});

test('translates planner evidence into plain language', () => {
  assert.match(explainEvidence('bounded record identifiers', 0), /exact record key/u);
  assert.equal(
    explainEvidence('exact private categorical count', 0.305145),
    'Current collection counts estimate that this filter matches about 31% of records.'
  );
  assert.match(explainEvidence('equi-depth private histogram', 0.08), /value distribution/u);
  assert.match(explainEvidence('stratified private sample', 0.12), /representative sample/u);
  assert.match(explainEvidence('conservative wildcard prior'), /Wildcard searches/u);
  assert.match(explainEvidence('unknown future evidence'), /complete route/u);
});

test('builds a planned explanation in order and collapses repeated fields', () => {
  const explanation = buildOrderExplanation({
    order: [
      { field: 'Item Type', planned_position: 3, reason: 'exact private categorical count', estimated_share: 0.68 },
      { field: 'Catalog Key', planned_position: 1, reason: 'bounded record identifiers', estimated_share: 0 },
      { field: 'Publication Year', planned_position: 2, reason: 'equi-depth private histogram', estimated_share: 0.08 },
      { field: 'Publication Year', planned_position: 4, reason: 'equi-depth private histogram', estimated_share: 0.2 }
    ]
  });

  assert.equal(explanation?.title, 'Why this order?');
  assert.match(explanation?.summary || '', /complete valid routes/u);
  assert.deepEqual(explanation?.items.map(item => item.field), [
    'Catalog Key',
    'Publication Year',
    'Item Type'
  ]);
});

test('omits the section when no planner order is available', () => {
  assert.equal(buildOrderExplanation({}), null);
  assert.equal(buildOrderExplanation({ order: [] }), null);
});

test('describes manual order without claiming the planner optimized it', () => {
  const explanation = buildOrderExplanation({
    strategy: 'manual_order_v2',
    order: [{ field: 'Item Type', planned_position: 1 }]
  });
  assert.equal(explanation?.title, 'Manual filter order');
  assert.match(explanation?.summary || '', /order you chose/u);
  assert.deepEqual(explanation?.items, []);
});
