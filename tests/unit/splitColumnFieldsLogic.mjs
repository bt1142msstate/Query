import assert from 'node:assert/strict';
import test from 'node:test';

import { buildExpandedMultiValueTable } from '../../src/features/table/virtual-table/splitColumnExpansion.js';
import {
  getPostFilterActionFieldsForTable,
  getSplitFieldColumnIndexes,
  getSplitFieldParentName,
  getSplitFieldValue,
  isSplitFieldAvailable
} from '../../src/features/table/virtual-table/splitColumnFields.js';

test('split column fields resolve only through explicit metadata', () => {
  const compact = {
    headers: ['Title', 'Public Note', 'Branch'],
    rows: [
      ['Alpha', 'First note\x1FSecond note', 'Main'],
      ['Beta', 'Only note', 'East']
    ],
    columnMap: new Map([
      ['Title', 0],
      ['Public Note', 1],
      ['Branch', 2]
    ])
  };
  const split = buildExpandedMultiValueTable(compact);

  assert.equal(getSplitFieldParentName('Public Note 2', split), 'Public Note');
  assert.equal(getSplitFieldParentName('Public Note 2', compact), 'Public Note 2');
  assert.deepEqual(getSplitFieldColumnIndexes('Public Note', split), [1, 2]);
  assert.deepEqual(getSplitFieldColumnIndexes('Public Note 2', split), [2]);
  assert.deepEqual(getSplitFieldColumnIndexes('Public Note 2', compact), []);
  assert.equal(getSplitFieldValue(split.rows[0], [1, 2]), 'First note\x1FSecond note');
  assert.equal(isSplitFieldAvailable('Public Note', split), true);
  assert.equal(isSplitFieldAvailable('Public Note 2', compact), false);
});

test('post filter action fields collapse split children to parent fields', () => {
  const compact = {
    headers: ['Title', 'Public Note', 'Branch'],
    rows: [
      ['Alpha', 'First note\x1FSecond note', 'Main'],
      ['Beta', 'Only note', 'East']
    ],
    columnMap: new Map([
      ['Title', 0],
      ['Public Note', 1],
      ['Branch', 2]
    ])
  };
  const split = buildExpandedMultiValueTable(compact);

  assert.deepEqual(
    getPostFilterActionFieldsForTable(['Title', 'Public Note 1', 'Public Note 2', 'Branch'], split),
    ['Title', 'Public Note', 'Branch']
  );

  assert.deepEqual(
    getPostFilterActionFieldsForTable(['Title', 'Public Note 2', 'Branch'], compact),
    ['Title', 'Branch']
  );
});
