import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getCellValueParts,
  hasMultipleCellValues,
  normalizeResultCellValue
} from '../../../src/core/resultCellValues.js';

test('result cell values keep multi-value behavior without treating scalar values as multi-value', () => {
  assert.equal(hasMultipleCellValues('Single value'), false);
  assert.equal(hasMultipleCellValues(' First \x1F \x1F Second '), true);
  assert.equal(hasMultipleCellValues(['Only value']), false);
  assert.equal(hasMultipleCellValues(['First', '', ['Second']]), true);
  assert.equal(hasMultipleCellValues({ values: ['First', 'Second'] }), true);
  assert.equal(hasMultipleCellValues({ value: 'First\x1FSecond' }), true);

  assert.deepEqual(getCellValueParts({ values: ['First', ['Second']] }), ['First', 'Second']);
  assert.deepEqual(normalizeResultCellValue(['First', '', 'Second']), ['First', 'Second']);
});
