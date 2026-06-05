import assert from 'node:assert/strict';
import { exportLargeWorkbook, shouldUseLargeWorkbookExport } from '../../src/features/table/export/largeWorkbookExport.js';
import test from 'node:test';

test('large workbook export', async () => {
  const NativeURL = globalThis.URL;
  let downloadedBlob = null;
  let downloadedFilename = '';

  globalThis.document = {
    body: {
      appendChild() {},
      removeChild() {}
    },
    createElement() {
      return {
        click() {
          downloadedFilename = this.download;
        },
        download: '',
        href: ''
      };
    }
  };

  globalThis.URL = {
    createObjectURL(blob) {
      downloadedBlob = blob;
      return 'blob:test-workbook';
    },
    revokeObjectURL() {}
  };

  globalThis.window = {
    setTimeout(callback) {
      callback();
    }
  };

  const repeatedPublicNote = 'First public note\x1FSecond public note';
  const repeatedMarc590 = '$a MSU -- Ulysses S. Grant Association.\x1F$a MSU -- Gift of Marcia Ewing-Current.\x1F$a MSU -- Richard Current Collection.\x1F$a DSU-180442';

  const sourceData = {
    dataRows: [
      ['Alpha & Beta', '12', '20240131', repeatedPublicNote, repeatedMarc590],
      ['Gamma < Delta', '7', 'NEVER', 'Only public note', '$a Single local note']
    ],
    displayedFields: ['Title', 'Copies', 'Due Date', 'Public Note', 'MARC 590'],
    fieldTypeMap: new Map([
      ['Title', 'string'],
      ['Copies', 'number'],
      ['Due Date', 'date'],
      ['Public Note', 'string'],
      ['MARC 590', 'string']
    ]),
    virtualData: {
      columnMap: new Map([
        ['Title', 0],
        ['Copies', 1],
        ['Due Date', 2],
        ['Public Note', 3],
        ['MARC 590', 4]
      ])
    }
  };

  const helpers = {
    getCellExportValue(raw, type) {
      if (raw === undefined || raw === null) return '';
      if (type === 'number') return Number(raw);
      if (type === 'date') {
        if (raw === 'NEVER') return 'Never';
        return new Date(Date.UTC(2024, 0, 31));
      }
      if (typeof raw === 'string' && raw.includes('\x1F')) {
        return raw.split('\x1F').join('\n');
      }
      return raw;
    },
    getGroupingDisplayValue(value) {
      return value instanceof Date ? value.toISOString().slice(0, 10) : String(value || 'Blank');
    },
    getUniqueSheetName(name, usedNames) {
      const normalized = String(name || 'Sheet').slice(0, 31);
      usedNames.add(normalized);
      return normalized;
    },
    progress: {
      update() {}
    },
    async yieldToBrowser() {}
  };

  assert.equal(shouldUseLargeWorkbookExport({
    rowCount: 1000,
    sourceData: { displayedFields: Array.from({ length: 80 }) }
  }), true);
  assert.equal(shouldUseLargeWorkbookExport({
    rowCount: 200,
    sourceData: { displayedFields: Array.from({ length: 80 }) }
  }), true);
  assert.equal(shouldUseLargeWorkbookExport({ rowCount: 2, sourceData }), false);

  await exportLargeWorkbook({
    config: {
      mode: 'single',
      runDetailsRows: [
        ['Export', 'Workbook', 'Large Report'],
        ['Query', 'Duration', '12s']
      ]
    },
    helpers,
    state: {
      groupingCandidates: [],
      rowCount: sourceData.dataRows.length,
      sourceData,
      tableName: 'Large Report'
    }
  });

  assert.equal(downloadedFilename, 'Large-Report.xlsx');
  assert.equal(downloadedBlob?.type, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

  const workbookText = new TextDecoder().decode(await downloadedBlob.arrayBuffer());
  assert.match(workbookText.slice(0, 4), /^PK/u);
  assert.match(workbookText, /xl\/worksheets\/sheet1\.xml/u);
  assert.match(workbookText, /xl\/tables\/table1\.xml/u);
  assert.match(workbookText, /tableStyleInfo name="TableStyleMedium4"/u);
  assert.match(workbookText, /Run Details/u);
  assert.match(workbookText, /Duration/u);
  assert.match(workbookText, /12s/u);
  assert.match(workbookText, /TableStyleMedium9/u);
  assert.match(workbookText, /<cols><col min="1" max="1" width="/u);
  assert.match(workbookText, /<tableParts count="1"><tablePart r:id="rId1"\/><\/tableParts>/u);
  assert.doesNotMatch(workbookText, /FFE5F3FF|applyFill="1"/u);
  assert.match(workbookText, /Alpha &amp; Beta/u);
  assert.match(workbookText, /Gamma &lt; Delta/u);
  assert.match(workbookText, /First public note\s+Second public note/u);
  assert.match(workbookText, /MSU -- Gift of Marcia Ewing-Current/u);
  assert.match(workbookText, /mm\/dd\/yyyy/u);
  assert.match(workbookText, /<c r="C3" t="inlineStr" s="7"><is><t>Never<\/t><\/is><\/c>/u);

  downloadedBlob = null;
  downloadedFilename = '';
  await exportLargeWorkbook({
    config: {
      groupField: 'Title',
      includeMasterSheet: false,
      includeOverviewSheet: true,
      mode: 'grouped'
    },
    helpers,
    state: {
      groupingCandidates: [
        {
          counts: new Map([
            ['Alpha & Beta', 1],
            ['Gamma < Delta', 1]
          ]),
          field: 'Title',
          index: 0
        }
      ],
      rowCount: sourceData.dataRows.length,
      sourceData,
      tableName: 'Large Report'
    }
  });

  const groupedWorkbookText = new TextDecoder().decode(await downloadedBlob.arrayBuffer());
  assert.equal(downloadedFilename, 'Large-Report-by-Title.xlsx');
  assert.match(groupedWorkbookText, /Overview/u);
  assert.match(groupedWorkbookText, /Percent of Total/u);
  assert.match(groupedWorkbookText, /Total/u);
  assert.match(groupedWorkbookText, /Alpha &amp; Beta/u);
  assert.match(groupedWorkbookText, /Gamma &lt; Delta/u);
  assert.match(groupedWorkbookText, /ref="A1:C4"/u);
  assert.match(groupedWorkbookText, /<v>0\.5<\/v>/u);
  assert.match(groupedWorkbookText, /<v>1<\/v>/u);
  assert.match(groupedWorkbookText, /numFmtId="10"/u);
  assert.match(groupedWorkbookText, /<cellXfs count="8">/u);

  let workerUrl = '';
  let workerOptions = null;
  let workerPayload = null;
  let workerTerminated = false;
  function TestURL(input, base) {
    return new NativeURL(input, base);
  }
  TestURL.createObjectURL = blob => {
    downloadedBlob = blob;
    return 'blob:test-worker-workbook';
  };
  TestURL.revokeObjectURL = () => {};

  globalThis.URL = TestURL;
  globalThis.Worker = class MockWorker {
    constructor(url, options) {
      workerUrl = String(url);
      workerOptions = options;
    }

    postMessage(payload) {
      workerPayload = payload;
      this.onmessage?.({
        data: {
          id: payload.id,
          payload: {
            detail: 'Worker progress',
            percent: 50,
            title: 'Building large workbook'
          },
          type: 'progress'
        }
      });
      this.onmessage?.({
        data: {
          blob: new Blob(['worker-generated'], {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          }),
          filename: 'Worker-Report.xlsx',
          id: payload.id,
          type: 'complete'
        }
      });
    }

    terminate() {
      workerTerminated = true;
    }
  };

  downloadedBlob = null;
  downloadedFilename = '';
  await exportLargeWorkbook({
    config: {
      mode: 'single'
    },
    helpers,
    state: {
      groupingCandidates: [],
      rowCount: sourceData.dataRows.length,
      sourceData,
      tableName: 'Worker Report'
    }
  });

  assert.match(workerUrl, /largeWorkbookWorker\.js$/u);
  assert.equal(workerOptions?.type, 'module');
  assert.equal(workerPayload?.config?.mode, 'single');
  assert.equal('helpers' in workerPayload, false);
  assert.equal(workerTerminated, true);
  assert.equal(downloadedFilename, 'Worker-Report.xlsx');
  assert.equal(await downloadedBlob.text(), 'worker-generated');
});
