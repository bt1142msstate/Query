const ISBN_HEADER = /^(?:isbn|isbn10|isbn13|standard number)$/iu;
const CATALOG_HEADER = /^(?:catalog(?: key)?|bib(?: key| id)?|title key)$/iu;
const ITEM_HEADER = /^(?:item(?: id)?|barcode)$/iu;
const TITLE_HEADER = /^(?:title|name)$/iu;
const METADATA_HEADER_PATTERNS = Object.freeze([
  ['title', /^(?:title|book title|journal title|name)$/iu],
  ['creators', /^(?:author|authors|creator|creators|personal author|corporate author)$/iu],
  ['isbns', /^(?:isbn|isbn 10|isbn 13|isbn10|isbn13|standard number)$/iu],
  ['issns', /^(?:issn|issns)$/iu],
  ['lccns', /^(?:lccn|library of congress control number)$/iu],
  ['oclc_numbers', /^(?:oclc|oclc number|oclc no|worldcat|worldcat number)$/iu],
  ['standard_numbers', /^(?:identifier|identifiers|standard identifier|standard identifiers|upc|ean)$/iu],
  ['edition', /^(?:edition|edition statement)$/iu],
  ['publisher', /^(?:publisher|publisher name)$/iu],
  ['publication_place', /^(?:place|publication place|place of publication)$/iu],
  ['years', /^(?:year|date|publication year|publication date|date published)$/iu],
  ['languages', /^(?:language|language code|marc language)$/iu],
  ['format', /^(?:format|material format|material type|type)$/iu],
  ['physical_description', /^(?:physical description|extent|pagination)$/iu],
  ['series', /^(?:series|series title)$/iu],
  ['row_label', /^(?:row id|source id|local id|reference)$/iu]
]);

const SPREADSHEET_FIELDS = Object.freeze([
  { value: '', label: 'Ignore column' },
  { value: 'title', label: 'Bibliographic title' },
  { value: 'creators', label: 'Creator / author' },
  { value: 'isbns', label: 'ISBN' },
  { value: 'issns', label: 'ISSN' },
  { value: 'lccns', label: 'LCCN' },
  { value: 'oclc_numbers', label: 'OCLC number' },
  { value: 'standard_numbers', label: 'Other standard number' },
  { value: 'edition', label: 'Edition' },
  { value: 'publisher', label: 'Publisher' },
  { value: 'publication_place', label: 'Publication place' },
  { value: 'years', label: 'Publication year' },
  { value: 'languages', label: 'Language (MARC code)' },
  { value: 'format', label: 'Material format' },
  { value: 'physical_description', label: 'Physical description' },
  { value: 'series', label: 'Series' },
  { value: 'row_label', label: 'Source row label' }
]);

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

function spreadsheetFieldForHeader(header) {
  const normalized = normalizeHeader(header);
  return METADATA_HEADER_PATTERNS.find(([, pattern]) => pattern.test(normalized))?.[0] || '';
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
    columns: headers.map((label, index) => ({
      index,
      label,
      type: headerType(label),
      spreadsheetField: spreadsheetFieldForHeader(label)
    })),
    rows: recognized ? rows.slice(1) : rows
  };
}

function splitIdentifierValues(value) {
  return String(value || '').split(/[;,|\n]+/u).map(part => part.trim()).filter(Boolean);
}

function valuesForRole(value, role) {
  const text = String(value || '').trim();
  if (!text) return [];
  if (['isbns', 'issns', 'lccns', 'oclc_numbers', 'standard_numbers', 'series'].includes(role)) {
    return splitIdentifierValues(text);
  }
  if (role === 'years') return [...text.matchAll(/\b(?:18|19|20)\d{2}\b/gu)].map(match => match[0]);
  if (role === 'languages') return splitIdentifierValues(text).map(part => part.toLowerCase());
  return [text];
}

function buildSpreadsheetEntries(fileData, mappings = {}) {
  const repeatable = new Set([
    'creators', 'isbns', 'issns', 'lccns', 'oclc_numbers', 'standard_numbers',
    'years', 'languages', 'series'
  ]);
  const entries = [];
  (fileData?.rows || []).forEach((row, rowIndex) => {
    const metadata = {};
    (fileData?.columns || []).forEach(column => {
      const role = mappings[column.index] ?? column.spreadsheetField ?? '';
      if (!role) return;
      const values = valuesForRole(row[column.index], role);
      if (!values.length) return;
      if (repeatable.has(role)) metadata[role] = [...(metadata[role] || []), ...values];
      else if (!metadata[role]) [metadata[role]] = values;
    });
    if (!metadata.row_label) metadata.row_label = `Row ${rowIndex + 2}`;
    const hasIdentifier = ['isbns', 'issns', 'lccns', 'oclc_numbers', 'standard_numbers']
      .some(role => metadata[role]?.length);
    if (metadata.title || hasIdentifier) {
      entries.push({ metadata, original: metadata.title || metadata.row_label });
    }
  });
  return entries;
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
  buildSpreadsheetEntries,
  detectLookupType,
  inputDataFromRows,
  isValidIsbn,
  parseDelimitedRows,
  parseInputFile,
  SPREADSHEET_FIELDS,
  spreadsheetFieldForHeader,
  splitPastedValues,
  valuesFromColumn
};
