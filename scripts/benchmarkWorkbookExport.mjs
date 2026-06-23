import { performance } from 'node:perf_hooks';
import { createWorkbookBlob } from '../src/lib/workbook-export/workbookExport.js';

const rowCount = readNumberArg('--rows', 100000);
const columnCount = readNumberArg('--columns', 12);
const runs = readNumberArg('--runs', 3);

function readNumberArg(name, fallback) {
  const prefix = `${name}=`;
  const arg = process.argv.find(value => value.startsWith(prefix));
  if (!arg) return fallback;
  const parsed = Number(arg.slice(prefix.length));
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function createFields(count) {
  return Array.from({ length: count }, (_, index) => `Field ${index + 1}`);
}

function createRows(fields, count) {
  return Array.from({ length: count }, (_, rowIndex) => fields.map((field, columnIndex) => {
    if (columnIndex === 0) return `Title ${rowIndex}`;
    if (columnIndex === 1) return rowIndex % 100 === 0 ? `Alpha & Beta ${rowIndex}` : `Library value ${rowIndex % 900}`;
    if (columnIndex === 2) return rowIndex % 17 === 0 ? 'NEVER' : '20240131';
    if (columnIndex === 3) return String(rowIndex % 10000);
    if (columnIndex === 4 && rowIndex % 11 === 0) return `First note ${rowIndex}\x1FSecond note ${rowIndex}`;
    return `${field} ${rowIndex % 250}`;
  }));
}

function createSourceData() {
  const fields = createFields(columnCount);
  return {
    dataRows: createRows(fields, rowCount),
    displayedFields: fields,
    fieldTypeMap: new Map(fields.map((field, index) => [
      field,
      index === 2 ? 'date' : (index === 3 ? 'number' : 'string')
    ])),
    virtualData: {
      columnMap: new Map(fields.map((field, index) => [field, index]))
    }
  };
}

function round(value) {
  return Math.round(value * 100) / 100;
}

async function timeRun(runIndex) {
  const sourceData = createSourceData();
  const started = performance.now();
  const result = await createWorkbookBlob({
    config: { mode: 'single', runDetailsRows: [] },
    helpers: { progress: { update() {} }, async yieldToBrowser() {} },
    state: {
      groupingCandidates: [],
      rowCount,
      sourceData,
      tableName: `Workbook Benchmark ${runIndex + 1}`
    }
  });
  return {
    elapsedMs: round(performance.now() - started),
    sizeMB: round(result.blob.size / 1024 / 1024)
  };
}

const results = [];
for (let runIndex = 0; runIndex < runs; runIndex += 1) {
  results.push(await timeRun(runIndex));
}

const elapsedValues = results.map(result => result.elapsedMs).sort((left, right) => left - right);
console.log(JSON.stringify({
  columnCount,
  medianMs: elapsedValues[Math.floor(elapsedValues.length / 2)] || 0,
  results,
  rowCount,
  runs
}, null, 2));
