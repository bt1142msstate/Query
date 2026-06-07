import assert from 'node:assert/strict';
import {
  getDropAnchorLayout,
  shouldHideAnchorBetweenDuplicateColumns,
  shouldHideAnchorForNoOpDrop
} from '../../../src/features/table/drag-drop/dragDropAnchorLayout.js';
import test from 'node:test';

test('drag drop anchor layout', async () => {
  const getBase = field => String(field).replace(/ \d+$/, '');

  assert.equal(
    shouldHideAnchorBetweenDuplicateColumns(['Title', 'Title 2', 'Author'], 1, getBase),
    true
  );
  assert.equal(
    shouldHideAnchorBetweenDuplicateColumns(['Title', 'Author'], 1, getBase),
    false
  );
  assert.equal(
    shouldHideAnchorBetweenDuplicateColumns(['Title', 'Title 2'], 0, getBase),
    false
  );
  assert.equal(shouldHideAnchorForNoOpDrop(1, 1), true);
  assert.equal(shouldHideAnchorForNoOpDrop(2, 1), true);
  assert.equal(shouldHideAnchorForNoOpDrop(0, 1), false);
  assert.equal(shouldHideAnchorForNoOpDrop(3, 1), false);
  assert.equal(shouldHideAnchorForNoOpDrop(1, 1, [1, 2]), true);
  assert.equal(shouldHideAnchorForNoOpDrop(2, 1, [1, 2]), true);
  assert.equal(shouldHideAnchorForNoOpDrop(3, 1, [1, 2]), true);
  assert.equal(shouldHideAnchorForNoOpDrop(4, 1, [1, 2]), false);
  assert.equal(shouldHideAnchorForNoOpDrop(2, 1, [1, 3]), false);

  assert.deepEqual(
    getDropAnchorLayout({
      columnRect: { left: 100, right: 200, width: 100 },
      viewportRect: { left: 50, right: 250, top: 10, height: 300 },
      clientX: 120,
      colIndex: 1,
      displayedFields: ['A', 'B', 'C'],
      getBaseFieldName: getBase,
      scrollX: 5,
      scrollY: 7
    }),
    {
      visible: true,
      insertAt: 1,
      width: 4,
      height: 300,
      left: 103,
      top: 17
    }
  );

  assert.deepEqual(
    getDropAnchorLayout({
      columnRect: { left: 100, right: 200, width: 100 },
      viewportRect: { left: 125, right: 175, top: 10, height: 300 },
      clientX: 190,
      colIndex: 1,
      displayedFields: ['A', 'B', 'C'],
      getBaseFieldName: getBase
    }),
    {
      visible: true,
      insertAt: 2,
      width: 4,
      height: 300,
      left: 173,
      top: 10
    }
  );

  assert.deepEqual(
    getDropAnchorLayout({
      columnRect: { left: 300, right: 400, width: 100 },
      viewportRect: { left: 50, right: 250, top: 10, height: 300 },
      clientX: 320,
      colIndex: 1,
      displayedFields: ['A', 'B', 'C'],
      getBaseFieldName: getBase
    }),
    { visible: false }
  );

  assert.deepEqual(
    getDropAnchorLayout({
      columnRect: { left: 100, right: 200, width: 100 },
      viewportRect: { left: 50, right: 250, top: 10, height: 300 },
      clientX: 120,
      colIndex: 1,
      displayedFields: ['Title', 'Title 2', 'Author'],
      getBaseFieldName: getBase
    }),
    { visible: false, insertAt: 1 }
  );

  assert.deepEqual(
    getDropAnchorLayout({
      columnRect: { left: 100, right: 200, width: 100 },
      viewportRect: { left: 50, right: 250, top: 10, height: 300 },
      clientX: 120,
      colIndex: 1,
      draggedIndex: 1,
      displayedFields: ['A', 'B', 'C'],
      getBaseFieldName: getBase
    }),
    { visible: false, insertAt: 1 }
  );

  assert.deepEqual(
    getDropAnchorLayout({
      columnRect: { left: 200, right: 300, width: 100 },
      viewportRect: { left: 50, right: 350, top: 10, height: 300 },
      clientX: 220,
      colIndex: 2,
      draggedIndex: 1,
      displayedFields: ['A', 'B', 'C'],
      getBaseFieldName: getBase
    }),
    { visible: false, insertAt: 2 }
  );

  assert.deepEqual(
    getDropAnchorLayout({
      columnRect: { left: 300, right: 400, width: 100 },
      viewportRect: { left: 50, right: 450, top: 10, height: 300 },
      clientX: 320,
      colIndex: 3,
      draggedIndex: 1,
      dragGroupIndices: [1, 2],
      displayedFields: ['A', 'B 1', 'B 2', 'C'],
      getBaseFieldName: getBase
    }),
    { visible: false, insertAt: 3 }
  );
});
