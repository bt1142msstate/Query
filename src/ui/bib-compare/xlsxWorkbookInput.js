const ZIP_LOCAL_FILE_HEADER = 0x04034b50;
const ZIP_CENTRAL_FILE_HEADER = 0x02014b50;
const ZIP_END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const ZIP_STORE_METHOD = 0;
const ZIP_DEFLATE_METHOD = 8;
const MAX_WORKBOOK_BYTES = 50 * 1024 * 1024;
const MAX_ENTRY_BYTES = 200 * 1024 * 1024;
const MAX_ZIP_ENTRIES = 10_000;
const MAX_WORKSHEET_CELLS = 2_000_000;
const XLSX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function isXlsxFile(file) {
  return /\.xlsx$/iu.test(String(file?.name || '')) || file?.type === XLSX_MIME_TYPE;
}

function requireBounds(view, offset, length, label) {
  if (offset < 0 || length < 0 || offset + length > view.byteLength) {
    throw new Error(`The Excel workbook contains an invalid ${label}.`);
  }
}

function findEndOfCentralDirectory(view) {
  const minimum = Math.max(0, view.byteLength - 65_557);
  for (let offset = view.byteLength - 22; offset >= minimum; offset -= 1) {
    if (view.getUint32(offset, true) === ZIP_END_OF_CENTRAL_DIRECTORY) return offset;
  }
  return -1;
}

function readZipDirectory(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const endOffset = findEndOfCentralDirectory(view);
  if (endOffset < 0) throw new Error('The selected file is not a valid Excel workbook.');
  requireBounds(view, endOffset, 22, 'ZIP directory');
  const entryCount = view.getUint16(endOffset + 10, true);
  if (entryCount > MAX_ZIP_ENTRIES) throw new Error('The Excel workbook contains too many internal files.');
  let centralOffset = view.getUint32(endOffset + 16, true);
  const decoder = new TextDecoder();
  const entries = new Map();

  for (let index = 0; index < entryCount; index += 1) {
    requireBounds(view, centralOffset, 46, 'ZIP entry');
    if (view.getUint32(centralOffset, true) !== ZIP_CENTRAL_FILE_HEADER) {
      throw new Error('The Excel workbook directory is incomplete.');
    }
    const flags = view.getUint16(centralOffset + 8, true);
    const compression = view.getUint16(centralOffset + 10, true);
    const compressedSize = view.getUint32(centralOffset + 20, true);
    const uncompressedSize = view.getUint32(centralOffset + 24, true);
    const nameLength = view.getUint16(centralOffset + 28, true);
    const extraLength = view.getUint16(centralOffset + 30, true);
    const commentLength = view.getUint16(centralOffset + 32, true);
    const localOffset = view.getUint32(centralOffset + 42, true);
    requireBounds(view, centralOffset + 46, nameLength + extraLength + commentLength, 'ZIP entry name');
    const name = decoder.decode(bytes.slice(centralOffset + 46, centralOffset + 46 + nameLength));
    if (flags & 0x0001) throw new Error('Password-protected Excel workbooks are not supported.');
    if (uncompressedSize > MAX_ENTRY_BYTES) throw new Error('An Excel worksheet is too large to import safely.');
    if (name && !name.startsWith('/') && !name.split('/').includes('..')) {
      entries.set(name, { compressedSize, compression, localOffset, uncompressedSize });
    }
    centralOffset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

async function inflateRaw(bytes) {
  if (typeof DecompressionStream !== 'function') {
    throw new Error('This browser cannot read compressed Excel workbooks.');
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function readZipEntry(bytes, entry, path) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  requireBounds(view, entry.localOffset, 30, 'local ZIP entry');
  if (view.getUint32(entry.localOffset, true) !== ZIP_LOCAL_FILE_HEADER) {
    throw new Error(`The Excel workbook entry ${path} is invalid.`);
  }
  const nameLength = view.getUint16(entry.localOffset + 26, true);
  const extraLength = view.getUint16(entry.localOffset + 28, true);
  const dataOffset = entry.localOffset + 30 + nameLength + extraLength;
  requireBounds(view, dataOffset, entry.compressedSize, 'worksheet data');
  const compressed = bytes.slice(dataOffset, dataOffset + entry.compressedSize);
  let content;
  if (entry.compression === ZIP_STORE_METHOD) content = compressed;
  else if (entry.compression === ZIP_DEFLATE_METHOD) content = await inflateRaw(compressed);
  else throw new Error('The Excel workbook uses an unsupported compression method.');
  if (entry.uncompressedSize && content.byteLength !== entry.uncompressedSize) {
    throw new Error(`The Excel workbook entry ${path} is incomplete.`);
  }
  return content;
}

function parseXml(text, label) {
  if (typeof DOMParser !== 'function') throw new Error('This browser cannot parse Excel worksheets.');
  const document = new DOMParser().parseFromString(text, 'application/xml');
  if (document.getElementsByTagName('parsererror').length) {
    throw new Error(`The Excel workbook contains invalid ${label} XML.`);
  }
  return document;
}

function elements(document, localName) {
  return [...document.getElementsByTagNameNS('*', localName)];
}

function relationshipId(element) {
  return element.getAttribute('r:id')
    || element.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id')
    || '';
}

function normalizeWorkbookPath(target) {
  const normalizedTarget = String(target || '').replace(/^\/+/, '');
  if (normalizedTarget.startsWith('xl/')) return normalizedTarget;
  const parts = normalizedTarget.split('/');
  const resolved = ['xl'];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') resolved.pop();
    else resolved.push(part);
  }
  return resolved.join('/');
}

function columnIndexFromReference(reference) {
  const letters = String(reference || '').match(/^[A-Z]+/iu)?.[0]?.toUpperCase() || '';
  let index = 0;
  for (const letter of letters) index = (index * 26) + letter.charCodeAt(0) - 64;
  return index ? index - 1 : -1;
}

function elementText(element) {
  return elements(element, 't').map(node => node.textContent || '').join('');
}

function parseSharedStrings(document) {
  return elements(document, 'si').map(elementText);
}

function cellValue(cell, sharedStrings) {
  const type = cell.getAttribute('t') || '';
  if (type === 'inlineStr') return elementText(cell);
  const raw = elements(cell, 'v')[0]?.textContent || '';
  if (type === 's') return sharedStrings[Number(raw)] ?? '';
  if (type === 'b') return raw === '1' ? 'TRUE' : 'FALSE';
  if (type === 'e') return '';
  return raw;
}

function parseWorksheet(document, sharedStrings) {
  const rows = [];
  let cellCount = 0;
  for (const rowElement of elements(document, 'row')) {
    const row = [];
    let sequentialIndex = 0;
    for (const cell of elements(rowElement, 'c')) {
      const referencedIndex = columnIndexFromReference(cell.getAttribute('r'));
      const columnIndex = referencedIndex >= 0 ? referencedIndex : sequentialIndex;
      if (columnIndex >= 16_384) throw new Error('The Excel worksheet exceeds the supported column range.');
      row[columnIndex] = cellValue(cell, sharedStrings);
      sequentialIndex = columnIndex + 1;
      cellCount += 1;
      if (cellCount > MAX_WORKSHEET_CELLS) throw new Error('The Excel worksheet contains too many cells to import safely.');
    }
    if (row.some(value => String(value || '').trim())) rows.push(row);
  }
  return rows;
}

async function readXmlEntry(bytes, entries, path, required = true) {
  const entry = entries.get(path);
  if (!entry) {
    if (!required) return null;
    throw new Error(`The Excel workbook is missing ${path}.`);
  }
  return parseXml(new TextDecoder().decode(await readZipEntry(bytes, entry, path)), path);
}

async function parseXlsxWorkbook(arrayBuffer) {
  const bytes = arrayBuffer instanceof Uint8Array ? arrayBuffer : new Uint8Array(arrayBuffer || 0);
  if (!bytes.byteLength) throw new Error('The selected Excel workbook is empty.');
  if (bytes.byteLength > MAX_WORKBOOK_BYTES) throw new Error('The Excel workbook exceeds the 50 MB import limit.');
  const entries = readZipDirectory(bytes);
  const workbook = await readXmlEntry(bytes, entries, 'xl/workbook.xml');
  const relationships = await readXmlEntry(bytes, entries, 'xl/_rels/workbook.xml.rels');
  const sharedDocument = await readXmlEntry(bytes, entries, 'xl/sharedStrings.xml', false);
  const sharedStrings = sharedDocument ? parseSharedStrings(sharedDocument) : [];
  const targets = new Map(elements(relationships, 'Relationship').map(relation => [
    relation.getAttribute('Id') || '',
    normalizeWorkbookPath(relation.getAttribute('Target'))
  ]));
  const sheets = [];
  for (const sheet of elements(workbook, 'sheet')) {
    const path = targets.get(relationshipId(sheet));
    if (!path || !entries.has(path)) continue;
    const worksheet = await readXmlEntry(bytes, entries, path);
    const rows = parseWorksheet(worksheet, sharedStrings);
    if (rows.length) sheets.push({ name: sheet.getAttribute('name') || `Sheet ${sheets.length + 1}`, rows });
  }
  if (!sheets.length) throw new Error('The Excel workbook does not contain a readable worksheet.');
  return { sheets };
}

export {
  XLSX_MIME_TYPE,
  columnIndexFromReference,
  isXlsxFile,
  parseXlsxWorkbook
};
