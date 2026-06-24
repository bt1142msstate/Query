import assert from 'node:assert/strict';
import test from 'node:test';

import { buildNextActiveFiltersForEditor } from '../../../src/ui/filter-editor/queryFilterEditor.js';

test('query filter editor replaces one indexed filter without dropping sibling filters', () => {
  const activeFilters = {
    Title: {
      filters: [
        { cond: 'contains', val: 'old' },
        { cond: 'equals', val: 'keep' }
      ]
    }
  };

  const nextFilters = buildNextActiveFiltersForEditor(activeFilters, 'Title', 0, {
    operator: 'starts',
    values: ['New']
  });

  assert.deepEqual(nextFilters.Title.filters, [
    { cond: 'starts', val: 'New' },
    { cond: 'equals', val: 'keep' }
  ]);
});

test('query filter editor appends new filters when no valid index is supplied', () => {
  const nextFilters = buildNextActiveFiltersForEditor({
    Title: { filters: [{ cond: 'contains', val: 'old' }] }
  }, 'Title', -1, {
    operator: 'equals',
    values: ['new']
  });

  assert.deepEqual(nextFilters.Title.filters, [
    { cond: 'contains', val: 'old' },
    { cond: 'equals', val: 'new' }
  ]);
});

test('query filter editor removes only the indexed filter when values are cleared', () => {
  const nextFilters = buildNextActiveFiltersForEditor({
    Title: {
      filters: [
        { cond: 'contains', val: 'old' },
        { cond: 'equals', val: 'keep' }
      ]
    }
  }, 'Title', 0, {
    operator: 'contains',
    values: []
  });

  assert.deepEqual(nextFilters.Title.filters, [
    { cond: 'equals', val: 'keep' }
  ]);
});

test('query filter editor deletes the field entry when the last filter is cleared', () => {
  const nextFilters = buildNextActiveFiltersForEditor({
    Title: { filters: [{ cond: 'contains', val: 'old' }] }
  }, 'Title', 0, {
    operator: 'contains',
    values: []
  });

  assert.deepEqual(nextFilters, {});
});

test('query filter editor formats between values with the query delimiter', () => {
  const nextFilters = buildNextActiveFiltersForEditor({}, 'Created Date', -1, {
    operator: 'between',
    values: ['1/1/2024', '12/31/2024']
  });

  assert.deepEqual(nextFilters['Created Date'].filters, [
    { cond: 'between', val: '1/1/2024|12/31/2024' }
  ]);
});
