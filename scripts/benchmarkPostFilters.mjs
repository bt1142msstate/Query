import { performance } from 'node:perf_hooks';
import { buildExpandedMultiValueTable } from '../src/features/table/virtual-table/splitColumnExpansion.js';
import { createVirtualTablePostFilterController } from '../src/features/table/virtual-table/virtualTablePostFilters.js';

const TARGET_MS = 1000;
const rowCount = Number.parseInt(process.argv[2] || '1000000', 10);
const safeRowCount = Number.isFinite(rowCount) && rowCount > 0 ? rowCount : 1000000;

function createRows(count) {
  return Array.from({ length: count }, (_, index) => [
    index % 10 === 0 ? `Alpha ${index}` : `Title ${index}`,
    index % 3 === 0 ? 'Main' : (index % 3 === 1 ? 'East' : ''),
    String(index % 100),
    String(20240101 + (index % 28)),
    index % 7 === 0 ? 'One\x1FTwo\x1FThree' : (index % 11 === 0 ? '\x1F' : 'Solo'),
    `$${(index % 1000).toLocaleString()}.25`
  ]);
}

const rawTableData = {
  headers: ['Title', 'Branch', 'Bill Count', 'Due Date', 'Public Note', 'Balance'],
  rows: createRows(safeRowCount),
  columnMap: new Map([
    ['Title', 0],
    ['Branch', 1],
    ['Bill Count', 2],
    ['Due Date', 3],
    ['Public Note', 4],
    ['Balance', 5]
  ])
};
const splitTableData = buildExpandedMultiValueTable(rawTableData, { lazyRows: true });

let activeBaseViewData = rawTableData;
let activeDisplayedFields = rawTableData.headers;
const controller = createVirtualTablePostFilterController({
  getBaseViewData: () => activeBaseViewData,
  getDisplayedFields: () => activeDisplayedFields,
  getFieldType(field) {
    if (field === 'Bill Count') return 'number';
    if (field === 'Due Date') return 'date';
    if (field === 'Balance') return 'money';
    return 'text';
  }
});

const cases = [
  ['text contains', { Title: { filters: [{ cond: 'contains', val: 'alpha' }] } }],
  ['text starts', { Title: { filters: [{ cond: 'starts', val: 'Title 99' }] } }],
  ['text equals', { Branch: { filters: [{ cond: 'equals', val: 'Main' }] } }],
  ['text does not equal', { Branch: { filters: [{ cond: 'does_not_equal', val: 'Main' }] } }],
  ['text multi-select equals', { Branch: { filters: [{ cond: 'equals', vals: ['Main', 'East'] }] } }],
  ['text multi-select does not equal', { Branch: { filters: [{ cond: 'does_not_equal', vals: ['Main', 'East'] }] } }],
  ['number greater', { 'Bill Count': { filters: [{ cond: 'greater', val: '50' }] } }],
  ['number less', { 'Bill Count': { filters: [{ cond: 'less', val: '25' }] } }],
  ['number greater or equal', { 'Bill Count': { filters: [{ cond: 'greater_or_equal', val: '25' }] } }],
  ['number less or equal', { 'Bill Count': { filters: [{ cond: 'less_or_equal', val: '25' }] } }],
  ['number equals', { 'Bill Count': { filters: [{ cond: 'equals', val: '42' }] } }],
  ['number does not equal', { 'Bill Count': { filters: [{ cond: 'does_not_equal', val: '42' }] } }],
  ['number between', { 'Bill Count': { filters: [{ cond: 'between', val: '25|75' }] } }],
  ['money greater', { Balance: { filters: [{ cond: 'greater', val: '$500.00' }] } }],
  ['date before', { 'Due Date': { filters: [{ cond: 'before', val: '20240115' }] } }],
  ['date after', { 'Due Date': { filters: [{ cond: 'after', val: '20240115' }] } }],
  ['date on or before', { 'Due Date': { filters: [{ cond: 'on_or_before', val: '20240115' }] } }],
  ['date on or after', { 'Due Date': { filters: [{ cond: 'on_or_after', val: '20240115' }] } }],
  ['date equals', { 'Due Date': { filters: [{ cond: 'equals', val: '20240115' }] } }],
  ['date does not equal', { 'Due Date': { filters: [{ cond: 'does_not_equal', val: '20240115' }] } }],
  ['date between', { 'Due Date': { filters: [{ cond: 'between', val: '20240110|20240120' }] } }],
  ['blank', { Branch: { filters: [{ cond: 'is_blank', val: '' }] } }],
  ['has value', { Branch: { filters: [{ cond: 'has_value', val: '' }] } }],
  ['has multiple values', { 'Public Note': { filters: [{ cond: 'has_multiple_values', val: '' }] } }],
  ['single value', { 'Public Note': { filters: [{ cond: 'does_not_have_multiple_values', val: '' }] } }],
  ['multi-value contains', { 'Public Note': { filters: [{ cond: 'contains', val: 'two' }] } }],
  ['same-field any logic', { Title: { logic: 'any', filters: [{ cond: 'contains', val: 'alpha' }, { cond: 'starts', val: 'title' }] } }],
  ['two fields all logic', { Title: { filters: [{ cond: 'contains', val: 'alpha' }] }, 'Bill Count': { filters: [{ cond: 'greater', val: '50' }] } }],
  ['split parent contains', { 'Public Note': { filters: [{ cond: 'contains', val: 'two' }] } }, splitTableData],
  ['split parent has multiple', { 'Public Note': { filters: [{ cond: 'has_multiple_values', val: '' }] } }, splitTableData]
];

const results = cases.map(([name, filters, tableData = rawTableData]) => {
  activeBaseViewData = tableData;
  activeDisplayedFields = tableData.headers;
  controller.assign(filters);
  controller.sanitizeForCurrentView();
  const started = performance.now();
  const filteredRows = controller.getFilteredRows();
  const elapsedMs = performance.now() - started;
  return {
    elapsedMs: Math.round(elapsedMs * 100) / 100,
    matches: filteredRows.length,
    name,
    withinTarget: elapsedMs < TARGET_MS
  };
});

const max = results.reduce((current, result) => result.elapsedMs > current.elapsedMs ? result : current, results[0]);
console.log(JSON.stringify({
  rowCount: safeRowCount,
  targetMs: TARGET_MS,
  max,
  results
}, null, 2));
