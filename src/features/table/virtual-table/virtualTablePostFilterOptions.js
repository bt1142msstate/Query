import {
  POST_FILTER_BLANK_SENTINEL,
  getComparableRowValues,
  getRawCellValueParts,
  isBlankCellValue
} from '../post-filters/postFilterLogic.js';

function buildFieldOptions({ rows, columnIndex, getRawValue, fieldType }) {
  const counts = new Map();
  let blankCount = 0;

  rows.forEach(row => {
    const rawValue = typeof getRawValue === 'function'
      ? getRawValue(row)
      : row[columnIndex];

    if (isBlankCellValue(rawValue)) {
      blankCount += 1;
      return;
    }

    const rawParts = getRawCellValueParts(rawValue).filter(value => String(value ?? '').trim());
    const values = getComparableRowValues(rawValue, fieldType)
      .map((value, index) => fieldType === 'number' || fieldType === 'money' || fieldType === 'date'
        ? String(rawParts[index] ?? rawValue).trim()
        : String(value ?? '').trim())
      .filter(Boolean);

    const seenInRow = new Set();
    values.forEach(value => {
      if (seenInRow.has(value)) {
        return;
      }
      seenInRow.add(value);
      counts.set(value, (counts.get(value) || 0) + 1);
    });
  });

  const options = Array.from(counts.entries())
    .map(([value, count]) => ({
      value,
      label: value,
      count,
      isBlank: false
    }))
    .sort((left, right) => String(left.label).localeCompare(String(right.label), undefined, { numeric: true, sensitivity: 'base' }));

  if (blankCount > 0) {
    options.unshift({
      value: POST_FILTER_BLANK_SENTINEL,
      label: '(Blank values)',
      count: blankCount,
      isBlank: true
    });
  }

  return options;
}

function cloneOptions(options) {
  return options.map(option => ({ ...option }));
}

export {
  buildFieldOptions,
  cloneOptions
};
