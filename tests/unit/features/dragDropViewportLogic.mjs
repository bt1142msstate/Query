import assert from 'node:assert/strict';
import {
  getClosestVisibleHeaderByX,
  getDropIndicatorViewportRect,
  getDragScrollContainer,
  getOutsideDropViewportOptions,
  getVisibleHeaderTargets,
  isPointerNearDropViewport,
  isPointerWithinDropViewport
} from '../../../src/lib/drag-drop/dragDropViewport.js';
import test from 'node:test';

test('drag drop viewport', async () => {
  function createNode({ rect, parent = null, headers = [] } = {}) {
    return {
      parent,
      headers,
      closest(selector) {
        return selector.includes('.overflow-x-auto') || selector.includes('#table-container') ? this.parent : null;
      },
      getBoundingClientRect() {
        return rect;
      },
      querySelectorAll(selector) {
        return selector === 'thead th[data-col-index]' ? this.headers : [];
      }
    };
  }

  const scrollContainer = createNode({
    rect: { left: 10, right: 210, top: 20, bottom: 120, width: 200, height: 100 }
  });
  const headers = [
    createNode({ rect: { left: -80, right: -20, top: 20, bottom: 60, width: 60, height: 40 } }),
    createNode({ rect: { left: 20, right: 80, top: 20, bottom: 60, width: 60, height: 40 } }),
    createNode({ rect: { left: 100, right: 160, top: 20, bottom: 60, width: 60, height: 40 } }),
    createNode({ rect: { left: 240, right: 300, top: 20, bottom: 60, width: 60, height: 40 } })
  ];
  const table = createNode({
    rect: { left: 0, right: 400, top: 15, bottom: 180, width: 400, height: 165 },
    parent: scrollContainer,
    headers
  });

  assert.equal(getDragScrollContainer(table), scrollContainer);
  assert.equal(getDropIndicatorViewportRect(table), scrollContainer.getBoundingClientRect());
  assert.equal(isPointerWithinDropViewport(table, 100, 50), true);
  assert.equal(isPointerWithinDropViewport(table, 250, 50), false);
  assert.equal(isPointerNearDropViewport(table, 250, 50), true);
  assert.equal(isPointerNearDropViewport(table, 100, -120), true);
  assert.equal(isPointerNearDropViewport(table, 500, 50), false);
  assert.deepEqual(getVisibleHeaderTargets(table), [headers[1], headers[2]]);
  assert.equal(getClosestVisibleHeaderByX(table, 125), headers[2]);

  const tableWithoutScroll = createNode({
    rect: { left: 0, right: 100, top: 0, bottom: 80, width: 100, height: 80 },
    headers: [headers[0]]
  });
  assert.equal(getDragScrollContainer(tableWithoutScroll), null);
  assert.equal(getDropIndicatorViewportRect(tableWithoutScroll), tableWithoutScroll.getBoundingClientRect());
  assert.deepEqual(getVisibleHeaderTargets(tableWithoutScroll), [headers[0]]);

  const tableContainer = createNode({
    rect: { left: 0, right: 240, top: 0, bottom: 100, width: 240, height: 100 }
  });
  const tableWithIdContainer = {
    parent: tableContainer,
    closest(selector) {
      return selector.includes('#table-container') ? this.parent : null;
    },
    getBoundingClientRect() {
      return { left: 0, right: 480, top: 0, bottom: 100, width: 480, height: 100 };
    },
    querySelectorAll() {
      return [];
    }
  };
  assert.equal(getDragScrollContainer(tableWithIdContainer), tableContainer);

  assert.deepEqual(getOutsideDropViewportOptions({ innerWidth: 375, innerHeight: 720 }), {
    horizontalTolerance: 640,
    verticalTolerance: 324
  });
  assert.deepEqual(getOutsideDropViewportOptions({ innerWidth: 1440, innerHeight: 1600 }), {
    horizontalTolerance: 1440,
    verticalTolerance: 520
  });
});
