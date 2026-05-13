import assert from 'node:assert/strict';
import { exportLargeWorkbook, shouldUseLargeWorkbookExport } from '../../table/export/largeWorkbookExport.js';

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

const sourceData = {
  dataRows: [
    ['Alpha & Beta', '12', '20240131'],
    ['Gamma < Delta', '7', 'NEVER']
  ],
  displayedFields: ['Title', 'Copies', 'Due Date'],
  fieldTypeMap: new Map([
    ['Title', 'string'],
    ['Copies', 'number'],
    ['Due Date', 'date']
  ]),
  virtualData: {
    columnMap: new Map([
      ['Title', 0],
      ['Copies', 1],
      ['Due Date', 2]
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
assert.equal(shouldUseLargeWorkbookExport({ rowCount: 2, sourceData }), false);

await exportLargeWorkbook({
  config: { mode: 'single' },
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
assert.match(workbookText, /<cols><col min="1" max="1" width="/u);
assert.match(workbookText, /<tableParts count="1"><tablePart r:id="rId1"\/><\/tableParts>/u);
assert.match(workbookText, /Alpha &amp; Beta/u);
assert.match(workbookText, /Gamma &lt; Delta/u);
assert.match(workbookText, /mm\/dd\/yyyy/u);

console.log('Large workbook export logic tests passed');
