import { performance } from 'node:perf_hooks';
import { buildVirtualTableProjection } from '../src/lib/virtual-table/virtualTableDuplicateCollapse.js';

const DEFAULT_ROWS = [200000, 500000, 1000000];

function readArgValue(name, fallback = '') {
  const prefix = `${name}=`;
  const arg = process.argv.slice(2).find(value => value === name || value.startsWith(prefix));
  if (!arg) return fallback;
  if (arg === name) return 'true';
  return arg.slice(prefix.length);
}

function readRows() {
  const raw = readArgValue('--rows', DEFAULT_ROWS.join(','));
  const rows = raw
    .split(',')
    .map(value => Number.parseInt(value.trim(), 10))
    .filter(value => Number.isFinite(value) && value > 0);
  return rows.length ? rows : DEFAULT_ROWS;
}

function shouldAssertBudget() {
  return process.argv.includes('--assert');
}

function buildRows(rowCount, scenario) {
  return Array.from({ length: rowCount }, (_, index) => [
    scenario === 'unique' ? `Title ${index}` : `Title ${index % 50000}`,
    `Branch ${index % 7}`,
    `Item ${index}`
  ]);
}

function measureCase({ rowCount, scenario }) {
  const rows = buildRows(rowCount, scenario);
  const columnMap = new Map([
    ['Title', 0],
    ['Branch', 1],
    ['Item ID', 2]
  ]);
  const started = performance.now();
  const projection = buildVirtualTableProjection({
    baseViewData: { headers: ['Title', 'Branch', 'Item ID'], rows, columnMap },
    displayedFields: ['Title', 'Branch'],
    filteredRows: rows,
    collapseDuplicates: true
  });
  const elapsedMs = performance.now() - started;

  return {
    collapsedRows: projection.stats.duplicateRowsCollapsed,
    elapsedMs: Math.round(elapsedMs * 10) / 10,
    rowCount,
    scenario,
    uniqueRows: projection.stats.uniqueRows
  };
}

function assertCase(result) {
  const budgetMs = result.scenario === 'unique'
    ? Math.max(75, result.rowCount / 2500)
    : Math.max(125, result.rowCount / 1000);

  if (result.elapsedMs > budgetMs) {
    throw new Error(`${result.scenario} duplicate-collapse case exceeded budget: ${result.elapsedMs}ms > ${Math.round(budgetMs)}ms for ${result.rowCount} rows`);
  }
}

const rows = readRows();
const results = [];
for (const rowCount of rows) {
  for (const scenario of ['unique', 'duplicate-heavy']) {
    const result = measureCase({ rowCount, scenario });
    if (shouldAssertBudget()) {
      assertCase(result);
    }
    results.push(result);
  }
}

console.log(JSON.stringify({ results }, null, 2));
