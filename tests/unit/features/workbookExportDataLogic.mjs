import assert from 'node:assert/strict';
import {
  buildExportRows,
  buildGroupingCandidates,
  buildGroupingCandidatesAsync,
  getCellExportValue,
  getGroupingDisplayValue,
  getUniqueSheetName,
  normalizeSheetName
} from '../../../src/features/table/export/workbookExportData.js';
import test from 'node:test';

test('workbook export data', async () => {
  assert.equal(normalizeSheetName('Bad / Name : [x] * ?'), 'Bad Name x');
  assert.equal(normalizeSheetName(''), 'Sheet');
  assert.equal(normalizeSheetName('A very long worksheet name that should be cut down').length, 31);

  {
    const usedNames = new Set();
    assert.equal(getUniqueSheetName('Results', usedNames), 'Results');
    assert.equal(getUniqueSheetName('Results', usedNames), 'Results (2)');
    assert.equal(getUniqueSheetName('Results', usedNames), 'Results (3)');
  }

  assert.equal(getCellExportValue(null, 'string'), '');
  assert.equal(getCellExportValue('20240131', 'date') instanceof Date, true);
  assert.equal(getCellExportValue('NEVER', 'date'), 'Never');
  assert.equal(getCellExportValue('$1,234.50', 'money'), 1234.5);
  assert.equal(getCellExportValue('1,234', 'number'), 1234);
  assert.equal(getCellExportValue('A\x1FB', 'string'), '1. A\n2. B');

  const repeatedPublicNote = 'First public note\x1FSecond public note';
  const repeatedMarc590 = '$a MSU -- Ulysses S. Grant Association.\x1F$a MSU -- Gift of Marcia Ewing-Current.\x1F$a MSU -- Richard Current Collection.\x1F$a DSU-180442';
  assert.equal(getCellExportValue(repeatedPublicNote, 'string'), '1. First public note\n2. Second public note');
  assert.equal(
    getCellExportValue(repeatedMarc590, 'string'),
    '1. $a MSU -- Ulysses S. Grant Association.\n2. $a MSU -- Gift of Marcia Ewing-Current.\n3. $a MSU -- Richard Current Collection.\n4. $a DSU-180442'
  );

  assert.equal(getGroupingDisplayValue(''), 'Blank');
  assert.equal(getGroupingDisplayValue(null), 'Blank');
  assert.equal(getGroupingDisplayValue(true), 'True');
  assert.equal(getGroupingDisplayValue('A\nB'), 'A / B');

  const sourceData = {
    displayedFields: ['Title', 'Status', 'Amount'],
    dataRows: [
      ['A', 'Open', '$1.00'],
      ['B', 'Closed', '$2.00'],
      ['C', 'Open', '$3.00']
    ],
    virtualData: {
      columnMap: new Map([
        ['Title', 0],
        ['Status', 1],
        ['Amount', 2]
      ])
    },
    fieldTypeMap: new Map([
      ['Title', 'string'],
      ['Status', 'string'],
      ['Amount', 'money']
    ])
  };

  assert.deepEqual(
    buildExportRows(sourceData),
    [
      { values: ['A', 'Open', 1], rawRow: ['A', 'Open', '$1.00'] },
      { values: ['B', 'Closed', 2], rawRow: ['B', 'Closed', '$2.00'] },
      { values: ['C', 'Open', 3], rawRow: ['C', 'Open', '$3.00'] }
    ]
  );

  const multiValueSourceData = {
    displayedFields: ['Title', 'Public Note', 'MARC 590'],
    dataRows: [
      ['A history of the Southern Confederacy', repeatedPublicNote, repeatedMarc590],
      ['Single-value record', 'Only public note', '$a Single local note']
    ],
    virtualData: {
      columnMap: new Map([
        ['Title', 0],
        ['Public Note', 1],
        ['MARC 590', 2]
      ])
    },
    fieldTypeMap: new Map([
      ['Title', 'string'],
      ['Public Note', 'string'],
      ['MARC 590', 'string']
    ])
  };

  assert.deepEqual(
    buildExportRows(multiValueSourceData).map(row => row.values),
    [
      [
        'A history of the Southern Confederacy',
        '1. First public note\n2. Second public note',
        '1. $a MSU -- Ulysses S. Grant Association.\n2. $a MSU -- Gift of Marcia Ewing-Current.\n3. $a MSU -- Richard Current Collection.\n4. $a DSU-180442'
      ],
      ['Single-value record', 'Only public note', '$a Single local note']
    ]
  );

  assert.deepEqual(
    buildGroupingCandidates(sourceData).map(candidate => ({
      field: candidate.field,
      index: candidate.index,
      distinctCount: candidate.distinctCount,
      counts: Object.fromEntries(candidate.counts)
    })),
    [
      {
        field: 'Status',
        index: 1,
        distinctCount: 2,
        counts: { Open: 2, Closed: 1 }
      },
      {
        field: 'Amount',
        index: 2,
        distinctCount: 3,
        counts: { 1: 1, 2: 1, 3: 1 }
      },
      {
        field: 'Title',
        index: 0,
        distinctCount: 3,
        counts: { A: 1, B: 1, C: 1 }
      }
    ]
  );
});

test('workbook grouping candidates can hydrate asynchronously and stay bounded', async () => {
  const sourceData = {
    displayedFields: ['Unique Title', 'Branch', 'Status'],
    dataRows: Array.from({ length: 500 }, (_, index) => [
      `Unique title ${index + 1}`,
      index % 2 === 0 ? 'Main' : 'East',
      index % 3 === 0 ? 'Open' : 'Closed'
    ]),
    virtualData: {
      columnMap: new Map([
        ['Unique Title', 0],
        ['Branch', 1],
        ['Status', 2]
      ])
    },
    fieldTypeMap: new Map([
      ['Unique Title', 'string'],
      ['Branch', 'string'],
      ['Status', 'string']
    ])
  };
  let yieldCount = 0;

  const syncCandidates = buildGroupingCandidates(sourceData);
  const asyncCandidates = await buildGroupingCandidatesAsync(sourceData, {
    rowBatch: 25,
    async yieldToBrowser() {
      yieldCount += 1;
    }
  });

  assert.equal(yieldCount > 0, true);
  assert.deepEqual(
    asyncCandidates.map(candidate => ({
      counts: Object.fromEntries(candidate.counts),
      distinctCount: candidate.distinctCount,
      field: candidate.field,
      index: candidate.index
    })),
    syncCandidates.map(candidate => ({
      counts: Object.fromEntries(candidate.counts),
      distinctCount: candidate.distinctCount,
      field: candidate.field,
      index: candidate.index
    }))
  );
  assert.deepEqual(asyncCandidates.map(candidate => candidate.field), ['Branch', 'Status']);

  const cancelledCandidates = await buildGroupingCandidatesAsync(sourceData, {
    rowBatch: 25,
    shouldContinue: () => false
  });
  assert.deepEqual(cancelledCandidates, []);
});
