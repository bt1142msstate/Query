import assert from 'node:assert/strict';
import test from 'node:test';

test('virtual table post filters', async () => {
  globalThis.window = globalThis.window || {
    setTimeout,
    clearTimeout
  };

  globalThis.document = globalThis.document || {
    createElement(tagName) {
      if (tagName === 'canvas') {
        return {
          getContext() {
            return {
              font: '',
              measureText(text) {
                return { width: String(text || '').length * 8 };
              }
            };
          }
        };
      }
      return {};
    }
  };

  const {
    createVirtualTablePostFilterController,
    doesCellMatchPostFilter
  } = await import('../../src/features/table/virtual-table/virtualTablePostFilters.js');
  const { buildExpandedMultiValueTable } = await import('../../src/features/table/virtual-table/splitColumnExpansion.js');

  let displayedFields = ['Title', 'Bill Count', 'Branch'];
  let baseViewData = {
    headers: ['Title', 'Bill Count', 'Branch'],
    rows: [
      ['Alpha Guide', '3', 'Main'],
      ['Beta Guide', '1', 'East'],
      ['Alpha Manual', '8', ''],
      ['', '5', 'Main'],
      ['  ', '9', '\x1F'],
      ['Gamma Notes', '10', 'Main\x1FEast']
    ],
    columnMap: new Map([
      ['Title', 0],
      ['Bill Count', 1],
      ['Branch', 2]
    ])
  };

  const controller = createVirtualTablePostFilterController({
    getBaseViewData: () => baseViewData,
    getDisplayedFields: () => displayedFields,
    getFieldType: field => field === 'Bill Count' ? 'number' : 'text'
  });

  controller.assign({
    Title: {
      logic: 'all',
      filters: [{ cond: 'contains', val: 'alpha' }]
    },
    'Bill Count': {
      logic: 'all',
      filters: [{ cond: 'greater', val: '4' }]
    }
  });

  assert.equal(controller.hasActiveFilters(), true);
  assert.deepEqual(controller.getFilteredRows(), [
    ['Alpha Manual', '8', '']
  ]);
  assert.deepEqual(controller.cloneSnapshot(), {
    Title: {
      logic: 'all',
      filters: [{ cond: 'contains', val: 'alpha' }]
    },
    'Bill Count': {
      logic: 'all',
      filters: [{ cond: 'greater', val: '4' }]
    }
  });

  const branchOptions = controller.getFieldOptions('Branch');
  assert.deepEqual(branchOptions, [
    {
      value: controller.blankValue,
      label: '(Blank values)',
      count: 2,
      isBlank: true
    },
    {
      value: 'East',
      label: 'East',
      count: 2,
      isBlank: false
    },
    {
      value: 'Main',
      label: 'Main',
      count: 3,
      isBlank: false
    }
  ]);

  branchOptions[1].label = 'Mutated';
  assert.equal(controller.getFieldOptions('Branch')[1].label, 'East');

  displayedFields = ['Title'];
  controller.sanitizeForCurrentView();
  assert.deepEqual(controller.cloneSnapshot(), {
    Title: {
      logic: 'all',
      filters: [{ cond: 'contains', val: 'alpha' }]
    }
  });

  controller.clear();
  assert.equal(controller.hasActiveFilters(), false);
  assert.equal(controller.getFilteredRows(), baseViewData.rows);
  assert.deepEqual(controller.getFilteredRows(), baseViewData.rows);

  controller.assign({
    Branch: {
      filters: [{ cond: 'contains', val: 'east' }]
    }
  });
  assert.deepEqual(controller.getFilteredRows(), [
    ['Beta Guide', '1', 'East'],
    ['Gamma Notes', '10', 'Main\x1FEast']
  ]);

  controller.assign({
    Branch: {
      filters: [{ cond: 'starts', val: 'ea' }]
    }
  });
  assert.deepEqual(controller.getFilteredRows(), [
    ['Beta Guide', '1', 'East'],
    ['Gamma Notes', '10', 'Main\x1FEast']
  ]);

  controller.assign({
    Branch: {
      filters: [{ cond: 'equals', val: 'Main' }]
    }
  });
  assert.deepEqual(controller.getFilteredRows(), [
    ['Alpha Guide', '3', 'Main'],
    ['', '5', 'Main'],
    ['Gamma Notes', '10', 'Main\x1FEast']
  ]);

  controller.assign({
    Branch: {
      filters: [{ cond: 'equals', val: 'Main', vals: ['Main', 'East'] }]
    }
  });
  assert.deepEqual(controller.getFilteredRows(), [
    ['Alpha Guide', '3', 'Main'],
    ['Beta Guide', '1', 'East'],
    ['', '5', 'Main'],
    ['Gamma Notes', '10', 'Main\x1FEast']
  ]);

  controller.assign({
    Branch: {
      filters: [{ cond: 'does_not_equal', val: 'Main' }]
    }
  });
  assert.deepEqual(controller.getFilteredRows(), [
    ['Beta Guide', '1', 'East'],
    ['Alpha Manual', '8', ''],
    ['  ', '9', '\x1F']
  ]);

  controller.assign({
    Branch: {
      filters: [{ cond: 'does_not_equal', val: 'Main', vals: ['Main', 'East'] }]
    }
  });
  assert.deepEqual(controller.getFilteredRows(), [
    ['Alpha Manual', '8', ''],
    ['  ', '9', '\x1F']
  ]);

  controller.assign({
    Title: {
      filters: [{ cond: 'is_blank' }]
    }
  });
  assert.deepEqual(controller.getFilteredRows(), [
    ['', '5', 'Main'],
    ['  ', '9', '\x1F']
  ]);

  controller.assign({
    Branch: {
      filters: [{ cond: 'has_value' }]
    }
  });
  assert.deepEqual(controller.getFilteredRows(), [
    ['Alpha Guide', '3', 'Main'],
    ['Beta Guide', '1', 'East'],
    ['', '5', 'Main'],
    ['Gamma Notes', '10', 'Main\x1FEast']
  ]);

  controller.assign({
    Branch: {
      filters: [{ cond: 'has_multiple_values' }]
    }
  });
  assert.deepEqual(controller.getFilteredRows(), [
    ['Gamma Notes', '10', 'Main\x1FEast']
  ]);

  controller.assign({
    Branch: {
      filters: [{ cond: 'single_value' }]
    }
  });
  assert.deepEqual(controller.cloneSnapshot(), {
    Branch: {
      logic: 'all',
      filters: [{ cond: 'does_not_have_multiple_values', val: '' }]
    }
  });
  assert.deepEqual(controller.getFilteredRows(), [
    ['Alpha Guide', '3', 'Main'],
    ['Beta Guide', '1', 'East'],
    ['Alpha Manual', '8', ''],
    ['', '5', 'Main'],
    ['  ', '9', '\x1F']
  ]);

  assert.equal(doesCellMatchPostFilter('3\x1F10', 'number', { cond: 'greater', val: '8' }), true);
  assert.equal(doesCellMatchPostFilter('3\x1F10', 'number', { cond: 'does_not_equal', val: '3' }), false);
  assert.equal(doesCellMatchPostFilter('20240101\x1F20250101', 'date', { cond: 'after', val: '20241231' }), true);
  assert.equal(doesCellMatchPostFilter('20240101\x1F20250101', 'date', { cond: 'does_not_equal', val: '20250101' }), false);

  const compactMultiValueData = {
    headers: ['Title', 'Public Note'],
    rows: [
      ['Alpha', 'First note\x1FSecond note'],
      ['Beta', 'First note'],
      ['Gamma', 'Other note\x1FThird note']
    ],
    columnMap: new Map([
      ['Title', 0],
      ['Public Note', 1]
    ])
  };

  baseViewData = compactMultiValueData;
  displayedFields = compactMultiValueData.headers;
  controller.invalidateValueOptionsCache();
  controller.assign({
    'Public Note': {
      filters: [{ cond: 'contains', val: 'second' }]
    }
  });
  assert.deepEqual(controller.getFilteredRows(), [
    ['Alpha', 'First note\x1FSecond note']
  ]);

  const splitMultiValueData = buildExpandedMultiValueTable(compactMultiValueData);
  baseViewData = splitMultiValueData;
  displayedFields = baseViewData.headers;
  controller.invalidateValueOptionsCache();
  controller.sanitizeForCurrentView();
  assert.deepEqual(controller.cloneSnapshot(), {
    'Public Note': {
      logic: 'all',
      filters: [{ cond: 'contains', val: 'second' }]
    }
  });
  assert.deepEqual(controller.getFilteredRows(), [
    ['Alpha', 'First note', 'Second note']
  ]);
  assert.deepEqual(controller.getFieldOptions('Public Note'), [
    {
      value: 'First note',
      label: 'First note',
      count: 2,
      isBlank: false
    },
    {
      value: 'Other note',
      label: 'Other note',
      count: 1,
      isBlank: false
    },
    {
      value: 'Second note',
      label: 'Second note',
      count: 1,
      isBlank: false
    },
    {
      value: 'Third note',
      label: 'Third note',
      count: 1,
      isBlank: false
    }
  ]);

  controller.assign({
    'Public Note 2': {
      filters: [{ cond: 'equals', val: 'Second note' }]
    }
  });
  assert.deepEqual(controller.getFilteredRows(), [
    ['Alpha', 'First note', 'Second note']
  ]);

  baseViewData = compactMultiValueData;
  displayedFields = compactMultiValueData.headers;
  controller.invalidateValueOptionsCache();
  controller.sanitizeForCurrentView();
  assert.deepEqual(controller.cloneSnapshot(), {});

  controller.assign({
    'Public Note 2': {
      filters: [{ cond: 'equals', val: 'Second note' }]
    }
  });
  baseViewData = {
    ...compactMultiValueData,
    splitColumnGroups: splitMultiValueData.splitColumnGroups,
    splitColumnParent: splitMultiValueData.splitColumnParent
  };
  displayedFields = compactMultiValueData.headers;
  controller.invalidateValueOptionsCache();
  controller.sanitizeForCurrentView();
  assert.deepEqual(controller.cloneSnapshot(), {
    'Public Note 2': {
      logic: 'all',
      filters: [{ cond: 'equals', val: 'Second note' }]
    }
  });
  assert.deepEqual(controller.getFilteredRows(), [
    ['Alpha', 'First note\x1FSecond note']
  ]);
});
