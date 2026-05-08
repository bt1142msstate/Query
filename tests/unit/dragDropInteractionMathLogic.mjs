import assert from 'node:assert/strict';
import {
  calculateAutoScrollStep,
  calculateHeaderActionLayout,
  getAutoScrollIntent,
  getHeaderInsertPositionFromRects
} from '../../table/drag-drop/dragDropInteractionMath.js';

assert.deepEqual(calculateHeaderActionLayout({
  containerWidth: 180,
  labelWidth: 120,
  sortWidth: 16,
  actionsWidth: 50,
  actionsVisible: true
}), {
  stackActions: true,
  balanceSpace: 26,
  sideBalance: 68,
  availableInlineWidth: 44
});

assert.deepEqual(calculateHeaderActionLayout({
  containerWidth: 300,
  labelWidth: 120,
  sortWidth: 16,
  actionsWidth: 50,
  actionsVisible: true
}), {
  stackActions: false,
  balanceSpace: 68,
  sideBalance: 68,
  availableInlineWidth: 164
});

const headerRects = [
  { left: 100, right: 200, top: 10, bottom: 40 },
  { left: 220, right: 320, top: 12, bottom: 45 },
  { left: 340, right: 440, top: 9, bottom: 39 }
];

assert.deepEqual(getHeaderInsertPositionFromRects(headerRects, 96), {
  insertAt: 0,
  boundaryX: 100,
  top: 9,
  height: 31
});

assert.deepEqual(getHeaderInsertPositionFromRects(headerRects, 211), {
  insertAt: 1,
  boundaryX: 210,
  top: 10,
  height: 35
});

assert.deepEqual(getHeaderInsertPositionFromRects(headerRects, 438), {
  insertAt: 3,
  boundaryX: 440,
  top: 9,
  height: 31
});

assert.equal(getHeaderInsertPositionFromRects(headerRects, 500), null);

const containerRect = { left: 0, right: 300, top: 20, bottom: 140 };

assert.deepEqual(getAutoScrollIntent({
  pointerX: 20,
  pointerY: 60,
  containerRect,
  scrollLeft: 50,
  scrollWidth: 800,
  clientWidth: 300
}), {
  direction: 'left',
  outside: false,
  maxScrollLeft: 500
});

assert.deepEqual(getAutoScrollIntent({
  pointerX: 280,
  pointerY: 60,
  containerRect,
  scrollLeft: 50,
  scrollWidth: 800,
  clientWidth: 300
}), {
  direction: 'right',
  outside: false,
  maxScrollLeft: 500
});

assert.deepEqual(getAutoScrollIntent({
  pointerX: 20,
  pointerY: 10,
  containerRect,
  scrollLeft: 50,
  scrollWidth: 800,
  clientWidth: 300
}), {
  direction: null,
  outside: true,
  maxScrollLeft: 500
});

assert.deepEqual(calculateAutoScrollStep({
  direction: 'left',
  pointerX: 20,
  containerRect,
  scrollLeft: 50,
  scrollWidth: 800,
  clientWidth: 300
}), {
  proximity: 70,
  intensity: 70 / 90,
  scrollAmount: 10,
  nextScrollLeft: 40,
  changed: true,
  maxScrollLeft: 500
});

assert.deepEqual(calculateAutoScrollStep({
  direction: 'right',
  pointerX: 280,
  containerRect,
  scrollLeft: 496,
  scrollWidth: 800,
  clientWidth: 300
}), {
  proximity: 70,
  intensity: 70 / 90,
  scrollAmount: 10,
  nextScrollLeft: 500,
  changed: true,
  maxScrollLeft: 500
});

console.log('Drag/drop interaction math logic tests passed');
