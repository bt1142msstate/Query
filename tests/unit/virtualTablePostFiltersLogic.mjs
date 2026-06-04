import assert from 'node:assert/strict';

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

const { createVirtualTablePostFilterController } = await import('../../table/virtual-table/virtualTablePostFilters.js');

let displayedFields = ['Title', 'Bill Count', 'Branch'];
const baseViewData = {
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
assert.deepEqual(controller.getFilteredRows(), baseViewData.rows);

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

console.log('Virtual table post-filter logic tests passed');
