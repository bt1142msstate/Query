const ISBN_HEADER = /^(?:isbn|isbn10|isbn13|standard number)$/iu;
const CATALOG_HEADER = /^(?:catalog(?: key)?|bib(?: key| id)?|title key)$/iu;
const ITEM_HEADER = /^(?:item(?: id)?|barcode)$/iu;
const TITLE_HEADER = /^(?:title|name)$/iu;

function normalizeHeader(value) {
  return String(value || '').trim().toLocaleLowerCase().replaceAll('_', ' ').replace(/\s+/gu, ' ');
}

function parseDelimitedRows(text, delimiter) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  const source = String(text || '').replace(/^\uFEFF/u, '');
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '"') {
      if (quoted && source[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === delimiter && !quoted) {
      row.push(cell);
      cell = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && source[index + 1] === '\n') index += 1;
      row.push(cell);
      if (row.some(value => String(value).trim())) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += character;
    }
  }
  row.push(cell);
  if (row.some(value => String(value).trim())) rows.push(row);
  return rows;
}

function detectDelimiter(text, filename = '') {
  if (/\.tsv$/iu.test(filename)) return '\t';
  if (/\.csv$/iu.test(filename)) return ',';
  const firstLine = String(text || '').split(/\r?\n/u, 1)[0] || '';
  return firstLine.includes('\t') ? '\t' : (firstLine.includes(',') ? ',' : '');
}

function headerType(header) {
  const normalized = normalizeHeader(header);
  if (ISBN_HEADER.test(normalized)) return 'isbn';
  if (CATALOG_HEADER.test(normalized)) return 'catalog_key';
  if (ITEM_HEADER.test(normalized)) return 'item_id';
  if (TITLE_HEADER.test(normalized)) return 'title';
  return '';
}

function parseInputFile(text, filename = '') {
  const delimiter = detectDelimiter(text, filename);
  const rows = delimiter
    ? parseDelimitedRows(text, delimiter)
    : String(text || '').replace(/^\uFEFF/u, '').split(/\r?\n/u).filter(line => line.trim()).map(line => [line]);
  return inputDataFromRows(rows);
}

function inputDataFromRows(rows) {
  if (!rows?.length) return { columns: [], rows: [] };
  const width = Math.max(...rows.map(row => row.length));
  const first = rows[0];
  const recognized = first.some(header => headerType(header));
  const headers = Array.from({ length: width }, (_, index) => (
    recognized ? String(first[index] || `Column ${index + 1}`).trim() : `Column ${index + 1}`
  ));
  return {
    columns: headers.map((label, index) => ({ index, label, type: headerType(label) })),
    rows: recognized ? rows.slice(1) : rows
  };
}

function valuesFromColumn(fileData, columnIndex) {
  return (fileData?.rows || [])
    .map(row => String(row[columnIndex] || '').trim())
    .filter(Boolean);
}

function normalizeIsbn(value) {
  return String(value || '').replace(/^isbn(?:-1[03])?\s*:?\s*/iu, '').replace(/[\s-]+/gu, '').toUpperCase();
}

function isValidIsbn(value) {
  const isbn = normalizeIsbn(value);
  if (/^\d{13}$/u.test(isbn)) {
    const sum = [...isbn].reduce((total, digit, index) => total + Number(digit) * (index % 2 ? 3 : 1), 0);
    return sum % 10 === 0;
  }
  if (/^\d{9}[\dX]$/u.test(isbn)) {
    const sum = [...isbn].reduce((total, digit, index) => total + (digit === 'X' ? 10 : Number(digit)) * (10 - index), 0);
    return sum % 11 === 0;
  }
  return false;
}

function detectLookupType(value) {
  const input = String(value || '').trim();
  if (isValidIsbn(input) || /^isbn(?:-1[03])?\s*:/iu.test(input)) return 'isbn';
  if (/^\d{1,9}$/u.test(input)) return 'catalog_key';
  if (/^[A-Za-z0-9_.-]{10,128}$/u.test(input) && !/\s/u.test(input)) return 'item_id';
  return 'title';
}

function splitPastedValues(text) {
  return String(text || '')
    .split(/\r?\n/u)
    .map(line => line.trim())
    .filter(Boolean);
}

function buildBulkEntries(values, selectedType = 'auto') {
  const seen = new Set();
  const entries = [];
  for (const rawValue of values || []) {
    const input = String(rawValue || '').trim();
    if (!input) continue;
    const lookupType = selectedType === 'auto' ? detectLookupType(input) : selectedType;
    const query = lookupType === 'isbn' ? normalizeIsbn(input) : input;
    const key = `${lookupType}\u0000${query.toLocaleLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({ lookup_type: lookupType, query, original: input });
  }
  return entries;
}

export {
  buildBulkEntries,
  detectLookupType,
  inputDataFromRows,
  isValidIsbn,
  parseDelimitedRows,
  parseInputFile,
  splitPastedValues,
  valuesFromColumn
};
