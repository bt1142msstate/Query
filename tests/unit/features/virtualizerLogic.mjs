import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_FULL_RENDER_ROW_LIMIT,
  DEFAULT_MAX_OVERSCAN_ROWS,
  DEFAULT_OVERSCAN_ROWS,
  DEFAULT_ROW_HEIGHT,
  calculateAdaptiveOverscanRows,
  calculateVirtualRowRange,
  createVirtualRenderPlan,
  shouldVirtualizeRows
} from '../../../src/features/table/virtual-table/virtualizer.js';

test('virtualizer calculates a bounded visible row window with overscan', () => {
  const range = calculateVirtualRowRange({
    rowCount: 1000,
    scrollTop: 4200,
    containerHeight: 462,
    headerHeight: 42,
    rowHeight: 42,
    overscanRows: 5
  });

  assert.equal(range.baseStart, 100);
  assert.equal(range.start, 95);
  assert.equal(range.end, 115);
  assert.equal(range.visibleRows, 10);
  assert.equal(range.renderedRows, 20);
  assert.equal(range.totalHeight, 42000);
});

test('virtualizer clamps stale scroll positions after row counts shrink', () => {
  const range = calculateVirtualRowRange({
    rowCount: 50,
    scrollTop: 100000,
    containerHeight: 252,
    headerHeight: 42,
    rowHeight: 42,
    overscanRows: 3
  });

  assert.equal(range.visibleRows, 5);
  assert.equal(range.baseStart, 45);
  assert.equal(range.start, 42);
  assert.equal(range.end, 50);
  assert.equal(range.scrollTop, range.maxScrollTop);
  assert.equal(range.maxScrollTop, 1890);
});

test('virtualizer renders at least one row for constrained containers', () => {
  const range = calculateVirtualRowRange({
    rowCount: 10,
    scrollTop: 0,
    containerHeight: 24,
    headerHeight: 48,
    rowHeight: 42,
    overscanRows: 0
  });

  assert.equal(range.visibleRows, 1);
  assert.equal(range.start, 0);
  assert.equal(range.end, 1);
});

test('virtual render plan switches between full and virtualized rendering', () => {
  const fullPlan = createVirtualRenderPlan({
    rowCount: DEFAULT_FULL_RENDER_ROW_LIMIT,
    rowHeight: DEFAULT_ROW_HEIGHT,
    overscanRows: DEFAULT_OVERSCAN_ROWS
  });
  assert.equal(fullPlan.virtualized, false);
  assert.equal(fullPlan.start, 0);
  assert.equal(fullPlan.end, DEFAULT_FULL_RENDER_ROW_LIMIT);
  assert.equal(fullPlan.totalHeight, 0);

  const virtualPlan = createVirtualRenderPlan({
    rowCount: DEFAULT_FULL_RENDER_ROW_LIMIT + 1,
    containerHeight: 462,
    headerHeight: 42,
    rowHeight: DEFAULT_ROW_HEIGHT,
    overscanRows: DEFAULT_OVERSCAN_ROWS
  });
  assert.equal(virtualPlan.virtualized, true);
  assert.equal(virtualPlan.end, 20);
  assert.equal(virtualPlan.totalHeight, (DEFAULT_FULL_RENDER_ROW_LIMIT + 1) * DEFAULT_ROW_HEIGHT);
});

test('virtualizer increases overscan for fast scroll jumps without unbounded rendering', () => {
  const adaptiveOverscan = calculateAdaptiveOverscanRows({
    baseOverscanRows: DEFAULT_OVERSCAN_ROWS,
    maxOverscanRows: DEFAULT_MAX_OVERSCAN_ROWS,
    rowHeight: DEFAULT_ROW_HEIGHT,
    scrollDelta: DEFAULT_ROW_HEIGHT * 180,
    visibleRows: 10
  });
  assert.equal(adaptiveOverscan, DEFAULT_MAX_OVERSCAN_ROWS);

  const plan = createVirtualRenderPlan({
    rowCount: 1000000,
    scrollTop: DEFAULT_ROW_HEIGHT * 10000,
    containerHeight: 462,
    headerHeight: 42,
    rowHeight: DEFAULT_ROW_HEIGHT,
    scrollDelta: DEFAULT_ROW_HEIGHT * 180
  });
  assert.equal(plan.overscanRows, DEFAULT_MAX_OVERSCAN_ROWS);
  assert.equal(plan.start, 9928);
  assert.equal(plan.end, 10082);
  assert.equal(plan.renderedRows, 154);
});

test('virtualizer threshold helper treats invalid counts as non-virtualized', () => {
  assert.equal(shouldVirtualizeRows(501, 500), true);
  assert.equal(shouldVirtualizeRows(500, 500), false);
  assert.equal(shouldVirtualizeRows(-1, 500), false);
});
