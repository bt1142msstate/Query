import assert from 'node:assert/strict';
import test from 'node:test';

import { buildExpandedMultiValueTable } from '../../src/features/table/virtual-table/splitColumnExpansion.js';
import {
  buildDisplayedFieldMove,
  getPostFilterActionFieldsForTable,
  getSplitFieldColumnIndexes,
  getSplitFieldGroupIndices,
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
  assert.deepEqual(getSplitFieldGroupIndices('Public Note 2', split.headers, split), [1, 2]);
  assert.deepEqual(getSplitFieldGroupIndices('Public Note 2', compact.headers, compact), []);
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

test('displayed field moves keep explicit split column groups together', () => {
  const compact = {
    headers: ['Title', 'Public Note', 'Branch', 'Status'],
    rows: [
      ['Alpha', 'First note\x1FSecond note', 'Main', 'Open'],
      ['Beta', 'Only note', 'East', 'Closed']
    ],
    columnMap: new Map([
      ['Title', 0],
      ['Public Note', 1],
      ['Branch', 2],
      ['Status', 3]
    ])
  };
  const split = buildExpandedMultiValueTable(compact);

  assert.deepEqual(
    buildDisplayedFieldMove(
      ['Title', 'Public Note 1', 'Public Note 2', 'Branch', 'Status'],
      2,
      3,
      split
    ),
    {
      changed: true,
      fields: ['Title', 'Branch', 'Public Note 1', 'Public Note 2', 'Status'],
      groupIndices: [1, 2],
      insertAt: 2,
      isGroupMove: true,
      movedFields: ['Public Note 1', 'Public Note 2']
    }
  );

  assert.deepEqual(
    buildDisplayedFieldMove(
      ['Title', 'Branch', 'Public Note 1', 'Public Note 2', 'Status'],
      3,
      1,
      split
    ).fields,
    ['Title', 'Public Note 1', 'Public Note 2', 'Branch', 'Status']
  );

  assert.deepEqual(
    buildDisplayedFieldMove(
      ['Title', 'Public Note 1', 'Public Note 2', 'Branch', 'Status'],
      2,
      1,
      split
    ),
    {
      changed: false,
      fields: ['Title', 'Public Note 1', 'Public Note 2', 'Branch', 'Status'],
      groupIndices: [1, 2],
      insertAt: -1,
      isGroupMove: true,
      movedFields: ['Public Note 1', 'Public Note 2']
    }
  );

  assert.deepEqual(
    buildDisplayedFieldMove(
      ['Title', 'Branch', 'Status'],
      0,
      2,
      split
    ).fields,
    ['Branch', 'Status', 'Title']
  );
});
