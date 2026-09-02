import test from 'node:test';
import assert from 'node:assert/strict';

import { buildDemoQueryPlan } from '../../../src/core/mockQueryPlanning.js';

test('sample planner visibly demonstrates deterministic smart ordering and manual preservation', () => {
  const filters = [
    { field: 'Due Date', operator: '>', value: '20260101' },
    { field: 'Status', operator: '=', value: 'Available' },
    { field: 'Branch', operator: '=', value: 'Central' }
  ];
  const smartPlan = buildDemoQueryPlan({ filters }).data;
  assert.deepEqual(smartPlan.order.map(entry => entry.field), ['Branch', 'Status', 'Due Date']);
  assert.equal(smartPlan.changed, true);

  const manualPlan = buildDemoQueryPlan({ filters, smart_query_enabled: false }).data;
  assert.deepEqual(manualPlan.order.map(entry => entry.field), ['Due Date', 'Status', 'Branch']);
  assert.equal(manualPlan.changed, false);
});
