import { appRuntime } from './appRuntime.js';
function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function formatDuration(seconds) {
  if (seconds < 60) {
    return `${seconds}s`;
  }

  const days = Math.floor(seconds / (24 * 60 * 60));
  const hours = Math.floor((seconds % (24 * 60 * 60)) / (60 * 60));
  const minutes = Math.floor((seconds % (60 * 60)) / 60);
  const remainingSeconds = seconds % 60;
  const parts = [];

  if (days > 0) parts.push(`${days} day${days !== 1 ? 's' : ''}`);
  if (hours > 0) parts.push(`${hours} hr${hours !== 1 ? 's' : ''}`);
  if (minutes > 0) parts.push(`${minutes} min`);
  if (remainingSeconds > 0 || parts.length === 0) parts.push(`${remainingSeconds} sec`);

  return parts.join(' ');
}

function getFieldOutputSegments(fieldName, fieldDefinitions = null) {
  const definitions = fieldDefinitions || (typeof window !== 'undefined' ? appRuntime.fieldDefs : null);
  if (!definitions || typeof definitions.get !== 'function') {
    return 1;
  }

  let fieldDef = definitions.get(fieldName);
  if (!fieldDef && typeof fieldName === 'string') {
    const baseName = fieldName.replace(/ \d+$/, '');
    if (baseName !== fieldName) {
      fieldDef = definitions.get(baseName);
    }
  }

  const parsed = Number.parseInt(fieldDef && fieldDef.parts, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function parsePipeDelimitedRow(line, columns, options = {}) {
  const values = String(line || '').split('|');
  const row = {};
  let valueIndex = 0;

  columns.forEach(column => {
    const segmentCount = getFieldOutputSegments(column, options.fieldDefs);
    row[column] = valueIndex < values.length
      ? values.slice(valueIndex, valueIndex + segmentCount).join('|')
      : '';
    valueIndex += segmentCount;
  });

  return row;
}

if (typeof window !== 'undefined') {
  Object.defineProperty(appRuntime, 'escapeRegExp', {
    configurable: false,
    enumerable: true,
    value: escapeRegExp,
    writable: false
  });
  Object.defineProperty(appRuntime, 'formatDuration', {
    configurable: false,
    enumerable: true,
    value: formatDuration,
    writable: false
  });
  Object.defineProperty(appRuntime, 'getFieldOutputSegments', {
    configurable: false,
    enumerable: true,
    value: getFieldOutputSegments,
    writable: false
  });
  Object.defineProperty(appRuntime, 'parsePipeDelimitedRow', {
    configurable: false,
    enumerable: true,
    value: parsePipeDelimitedRow,
    writable: false
  });
}

export {
  escapeRegExp,
  formatDuration,
  getFieldOutputSegments,
  parsePipeDelimitedRow
};
