import { MoneyUtils } from '../core/utils.js';

function parseSortNumericValue(value, type = 'number') {
  if (type === 'money') {
    return MoneyUtils.parseNumber(value);
  }

  if (typeof value === 'number') {
    return value;
  }

  return Number.parseFloat(String(value).replace(/,/gu, ''));
}

export function sortRowsByColumn(rows, colIndex, type, direction) {
  rows.sort((a, b) => {
    const valA = a[colIndex];
    const valB = b[colIndex];

    const emptyA = valA === undefined || valA === null || valA === '';
    const emptyB = valB === undefined || valB === null || valB === '';

    if (emptyA && emptyB) return 0;
    if (emptyA) return direction === 'asc' ? 1 : -1;
    if (emptyB) return direction === 'asc' ? -1 : 1;

    let result = 0;
    if (type === 'number' || type === 'money') {
      result = (parseSortNumericValue(valA, type) || 0) - (parseSortNumericValue(valB, type) || 0);
    } else if (type === 'date') {
      result = (Number.parseInt(valA, 10) || 0) - (Number.parseInt(valB, 10) || 0);
    } else {
      result = String(valA).localeCompare(String(valB));
    }

    return direction === 'asc' ? result : -result;
  });
}
