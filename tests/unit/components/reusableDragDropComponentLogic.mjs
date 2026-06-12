import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateAutoScrollStep,
  createColumnDragDropComponent,
  getHeaderInsertPositionFromRects
} from '../../../src/components/index.js';

function createSplitTableData() {
  return {
    columnMap: new Map([
      ['Title', 0],
      ['Public Note 1', 1],
      ['Public Note 2', 2],
      ['Branch', 3]
    ]),
    splitColumnGroups: new Map([
      ['Public Note', ['Public Note 1', 'Public Note 2']]
    ]),
    splitColumnParent: new Map([
      ['Public Note 1', 'Public Note'],
      ['Public Note 2', 'Public Note']
    ]),
    splitColumnSourceMap: new Map([
      ['Public Note', 1]
    ])
  };
}

test('reusable drag drop component moves split column groups together', () => {
  const changes = [];
  const dragDrop = createColumnDragDropComponent({
    displayedFields: ['Title', 'Public Note 1', 'Public Note 2', 'Branch'],
    tableData: createSplitTableData(),
    onFieldsChange(fields, result) {
      changes.push({ fields, result });
    }
  });

  assert.deepEqual(dragDrop.startDrag({ field: 'Public Note 1' }), {
    field: 'Public Note 1',
    groupIndices: [1, 2],
    index: 1
  });

  assert.deepEqual(dragDrop.getDropPreview({
    clientX: 390,
    colIndex: 3,
    columnRect: { left: 300, right: 400, width: 100 },
    viewportRect: { left: 0, right: 500, top: 20, height: 240 },
    scrollX: 5,
    scrollY: 10
  }), {
    visible: true,
    insertAt: 4,
    width: 4,
    height: 240,
    left: 403,
    top: 30
  });

  const result = dragDrop.dropAt(3);
  assert.equal(result.changed, true);
  assert.deepEqual(result.movedFields, ['Public Note 1', 'Public Note 2']);
  assert.deepEqual(dragDrop.displayedFields, ['Title', 'Branch', 'Public Note 1', 'Public Note 2']);
  assert.deepEqual(changes.map(change => change.fields), [
    ['Title', 'Branch', 'Public Note 1', 'Public Note 2']
  ]);
  assert.equal(dragDrop.activeDrag, null);
});

test('reusable drag drop component supports host-driven previews and scrolling math', () => {
  const dragDrop = createColumnDragDropComponent({
    displayedFields: ['Title', 'Author', 'Branch']
  });

  assert.deepEqual(dragDrop.previewMove(2, 0), {
    changed: true,
    fields: ['Branch', 'Title', 'Author'],
    groupIndices: [2],
    insertAt: 0,
    isGroupMove: false,
    movedFields: ['Branch']
  });
  assert.deepEqual(dragDrop.displayedFields, ['Title', 'Author', 'Branch']);

  assert.deepEqual(dragDrop.moveField(2, 0).fields, ['Branch', 'Title', 'Author']);
  assert.deepEqual(dragDrop.displayedFields, ['Branch', 'Title', 'Author']);

  const headerRects = [
    { left: 0, right: 100, top: 10, bottom: 40 },
    { left: 120, right: 220, top: 10, bottom: 40 }
  ];
  assert.deepEqual(dragDrop.getHeaderInsertPreview(headerRects, 110), {
    insertAt: 1,
    boundaryX: 110,
    top: 10,
    height: 30
  });
  assert.deepEqual(getHeaderInsertPositionFromRects(headerRects, 110), dragDrop.getHeaderInsertPreview(headerRects, 110));

  const autoScrollInput = {
    direction: 'right',
    pointerX: 290,
    containerRect: { left: 0, right: 300, top: 0, bottom: 120 },
    scrollLeft: 10,
    scrollWidth: 900,
    clientWidth: 300
  };
  assert.deepEqual(dragDrop.calculateAutoScrollStep(autoScrollInput), calculateAutoScrollStep(autoScrollInput));
});
