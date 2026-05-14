import assert from 'node:assert/strict';
import { alignDateTextCells } from '../../table/export/excelDateCellFormatting.js';

const cells = new Map();
const worksheet = {
  getCell(row, column) {
    const key = `${row}:${column}`;
    if (!cells.has(key)) {
      cells.set(key, { alignment: {} });
    }
    return cells.get(key);
  }
};

alignDateTextCells(worksheet, {
  displayedFields: ['Title', 'Due Date'],
  fieldTypeMap: new Map([
    ['Title', 'string'],
    ['Due Date', 'date']
  ])
}, [
  { values: ['Alpha', 'Never'] },
  { values: ['Beta', new Date(Date.UTC(2026, 0, 2))] },
  { values: ['Gamma', ''] }
]);

assert.equal(cells.get('2:2')?.alignment?.horizontal, 'right');
assert.equal(cells.has('3:2'), false);
assert.equal(cells.has('4:2'), false);

console.log('Excel date cell formatting logic tests passed');
