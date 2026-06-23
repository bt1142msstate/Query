import { performance } from 'node:perf_hooks';
import { buildExpandedMultiValueTable } from '../src/lib/virtual-table/splitColumnExpansion.js';

function readArgValue(name, fallback = '') {
  const prefix = `${name}=`;
  const arg = process.argv.slice(2).find(value => value === name || value.startsWith(prefix));
  if (!arg) return fallback;
  if (arg === name) return 'true';
  return arg.slice(prefix.length);
}

const rowCount = Number.parseInt(readArgValue('--rows', process.argv[2] || '500000'), 10);
const safeRowCount = Number.isFinite(rowCount) && rowCount > 0 ? rowCount : 500000;
const assertBudget = process.argv.includes('--assert');

const rawTableData = {
  headers: ['Title', 'Public Note', 'MARC 590', 'Branch', 'Bill Count'],
  rows: Array.from({ length: safeRowCount }, (_, index) => [
    `Title ${index}`,
    index % 2 === 0 ? 'First note\x1FSecond note\x1FThird note' : 'Only note',
    index % 5 === 0 ? '$a Local note one\x1F$a Local note two' : '$a Single note',
    index % 3 === 0 ? 'Main' : 'East',
    String(index % 12)
  ]),
  columnMap: new Map([
    ['Title', 0],
    ['Public Note', 1],
    ['MARC 590', 2],
    ['Branch', 3],
    ['Bill Count', 4]
  ])
};

const started = performance.now();
const expanded = buildExpandedMultiValueTable(rawTableData, { lazyRows: true });
const elapsed = performance.now() - started;
const budgetMs = Math.max(75, safeRowCount / 4000);

if (assertBudget && elapsed > budgetMs) {
  throw new Error(`Split-column lazy expansion exceeded budget: ${Math.round(elapsed)}ms > ${Math.round(budgetMs)}ms for ${safeRowCount} rows`);
}

console.log(JSON.stringify({
  budgetMs: Math.round(budgetMs * 100) / 100,
  elapsedMs: Math.round(elapsed * 100) / 100,
  rowCount: expanded.rows.length,
  columnCount: expanded.headers.length,
  sample: expanded.rows[Math.min(42, expanded.rows.length - 1)]?.[1] || ''
}, null, 2));
