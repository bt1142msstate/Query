import { ZIP_MIME_TYPE, createZipBlob } from './xlsxZipWriter.js';
import { buildWorkbookFilename, downloadWorkbookBlob } from './workbookDownload.js';
import {
  WORKBOOK_DETAILS_SHEET_NAME,
  ensureWorkbookGenerationTimeRow,
  getWorkbookDetailsColumns,
  setWorkbookGenerationTimeRow
} from './workbookDetails.js';
import { buildOverviewRows, getOverviewColumns } from './workbookOverview.js';
import { formatDisplayValue, parseDateValue } from '../../../core/formatting/dateValues.js';
import { getCellValueParts, hasMultipleCellValues } from '../../../core/resultCellValues.js';

const BACKGROUND_WORKER_CELL_THRESHOLD = 15000;
const EXCEL_MAX_DATA_ROWS_PER_SHEET = 1048575;
const XML_CHUNK_SIZE = 1024 * 1024;
const PROGRESS_ROW_BATCH = 10000;
const WORKSHEET_TYPE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet';
const STYLES_TYPE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles';
const OFFICE_DOCUMENT_TYPE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument';
const TABLE_TYPE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/table';
const DATE_TEXT_STYLE_ID = '7';
const SHEET_NAME_LIMIT = 31;
const SERIALIZED_MULTI_VALUE_SEPARATOR = '\x1F';
const XML_CONTROL_CHARACTERS_PATTERN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/gu;
const XML_TEXT_ESCAPE_PATTERN = /[&<>]/gu;
const XML_TEXT_NEEDS_ESCAPE_PATTERN = /[&<>\u0000-\u0008\u000B\u000C\u000E-\u001F]/u;
const XML_ATTRIBUTE_QUOTE_PATTERN = /["']/gu;
const XML_ATTRIBUTE_NEEDS_ESCAPE_PATTERN = /["'&<>\u0000-\u0008\u000B\u000C\u000E-\u001F]/u;
const XML_PRESERVE_SPACE_PATTERN = /^\s|\s$|\n/u;
const SIMPLE_NUMBER_PATTERN = /^-?\d+(?:\.\d+)?$/u;
const COLUMN_NAME_CACHE = [''];
const DETAILS_WRAP_STYLE_ID = '8';
let workbookWorkerSequence = 0;

function getCurrentTimeMs() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

function getWorkbookCellCount(state) {
  const rowCount = Number(state?.rowCount || 0);
  const columnCount = Number(state?.sourceData?.displayedFields?.length || 0);
  return rowCount * columnCount;
}

function shouldUseWorkbookWorker(state, config = {}) {
  if (config.useWorker === false) {
    return false;
  }
  if (config.useWorker === true) {
    return true;
  }
  return getWorkbookCellCount(state) >= BACKGROUND_WORKER_CELL_THRESHOLD;
}

function getXmlTextEntity(character) {
  if (character === '&') return '&amp;';
  if (character === '<') return '&lt;';
  return '&gt;';
}

function escapeXmlText(text) {
  if (!XML_TEXT_NEEDS_ESCAPE_PATTERN.test(text)) {
    return text;
  }
  return text
    .replace(XML_CONTROL_CHARACTERS_PATTERN, '')
    .replace(XML_TEXT_ESCAPE_PATTERN, getXmlTextEntity);
}

function escapeXmlAttribute(value) {
  const text = String(value ?? '');
  if (!XML_ATTRIBUTE_NEEDS_ESCAPE_PATTERN.test(text)) {
    return text;
  }
  return escapeXmlText(text).replace(XML_ATTRIBUTE_QUOTE_PATTERN, character => (
    character === '"' ? '&quot;' : '&apos;'
  ));
}

function getColumnName(index) {
  if (COLUMN_NAME_CACHE[index]) {
    return COLUMN_NAME_CACHE[index];
  }

  let current = index;
  let name = '';
  while (current > 0) {
    const remainder = (current - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    current = Math.floor((current - 1) / 26);
  }
  COLUMN_NAME_CACHE[index] = name;
  return name;
}

function normalizeSheetName(name) {
  const cleaned = String(name || 'Sheet')
    .replace(/[\\/?*\[\]:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return (cleaned || 'Sheet').slice(0, SHEET_NAME_LIMIT);
}

function getUniqueSheetName(baseName, usedNames) {
  const normalizedBase = normalizeSheetName(baseName);
  if (!usedNames.has(normalizedBase)) {
    usedNames.add(normalizedBase);
    return normalizedBase;
  }

  let suffix = 2;
  while (suffix < 1000) {
    const suffixText = ` (${suffix})`;
    const truncatedBase = normalizedBase.slice(0, SHEET_NAME_LIMIT - suffixText.length).trim() || 'Sheet';
    const candidate = `${truncatedBase}${suffixText}`;
    if (!usedNames.has(candidate)) {
      usedNames.add(candidate);
      return candidate;
    }
    suffix += 1;
  }

  return normalizedBase;
}

function getMapValue(source, key) {
  if (source instanceof Map) return source.get(key);
  if (source && typeof source === 'object') return source[key];
  return undefined;
}

function getColumnIndex(sourceData, field) {
  return getMapValue(sourceData?.virtualData?.columnMap, field);
}

function getFieldType(sourceData, field) {
  return getMapValue(sourceData?.fieldTypeMap, field) || 'string';
}

function buildSourceColumnPlan(sourceData) {
  return sourceData.displayedFields.map((field, index) => {
    const type = getFieldType(sourceData, field);
    const styleId = getCellStyle(type);
    const textStyleId = getCellTextStyle(type);
    return {
      columnName: getColumnName(index + 1),
      field,
      sourceIndex: getColumnIndex(sourceData, field),
      styleAttr: styleId ? ` s="${styleId}"` : '',
      styleId,
      textStyleAttr: textStyleId ? ` s="${textStyleId}"` : '',
      textStyleId,
      type
    };
  });
}

function parseWorkbookNumericValue(raw, options = {}) {
  if (typeof raw === 'number') return raw;
  const { allowDecimal = true } = options;
  const text = String(raw || '').trim();
  if (allowDecimal && SIMPLE_NUMBER_PATTERN.test(text)) {
    return Number(text);
  }
  const isNegative = text.trim().startsWith('-');
  const numeric = text.replace(allowDecimal ? /[^0-9.]/gu : /[^0-9]/gu, '');
  const firstDot = numeric.indexOf('.');
  const whole = firstDot >= 0 ? numeric.slice(0, firstDot) : numeric;
  const decimals = allowDecimal && firstDot >= 0 ? numeric.slice(firstDot + 1).replace(/\./gu, '') : '';
  const normalized = `${isNegative ? '-' : ''}${whole || '0'}${decimals ? `.${decimals}` : ''}`;
  if (!whole && !decimals) return Number.NaN;
  return Number.parseFloat(normalized);
}

function parseCompactWorkbookDate(raw) {
  if (typeof raw !== 'string') {
    return null;
  }
  const text = raw.trim();
  if (text.length !== 8 && text.length !== 12 && text.length !== 14) {
    return null;
  }
  for (let index = 0; index < 8; index += 1) {
    const code = text.charCodeAt(index);
    if (code < 48 || code > 57) {
      return null;
    }
  }
  const year = Number(text.slice(0, 4));
  const month = Number(text.slice(4, 6));
  const day = Number(text.slice(6, 8));
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
    ? date
    : null;
}

function parseWorkbookDateValue(raw) {
  if (raw instanceof Date) {
    return Number.isNaN(raw.getTime()) ? null : new Date(raw.getTime());
  }
  return parseCompactWorkbookDate(raw) || parseDateValue(raw);
}

function mayHaveMultipleCellValues(raw) {
  if (Array.isArray(raw)) {
    return true;
  }
  if (raw && typeof raw === 'object') {
    return Array.isArray(raw.values) || Object.prototype.hasOwnProperty.call(raw, 'value');
  }
  return typeof raw === 'string' && raw.includes(SERIALIZED_MULTI_VALUE_SEPARATOR);
}

function formatWorkbookListItem(value) {
  if (value instanceof Date) {
    return formatDisplayValue(value, { fallbackToRaw: true, invalidValue: 'Never' });
  }
  if (typeof value === 'boolean') {
    return value ? 'True' : 'False';
  }
  return String(value ?? '').trim();
}

function formatNumberedWorkbookList(values) {
  const items = (Array.isArray(values) ? values : [])
    .map(formatWorkbookListItem)
    .filter(Boolean);
  return items.map((value, index) => `${index + 1}. ${value}`).join('\n');
}

function getDefaultCellExportValue(raw, type) {
  if (raw === undefined || raw === null) return '';
  if (mayHaveMultipleCellValues(raw) && hasMultipleCellValues(raw)) {
    const values = getCellValueParts(raw)
      .map(value => getDefaultCellExportValue(value, type))
      .filter(value => value !== '');
    return formatNumberedWorkbookList(values);
  }
  if (type === 'date') {
    const dt = parseWorkbookDateValue(raw);
    return dt !== null ? dt : 'Never';
  }
  if (type === 'number' || type === 'money') {
    const n = parseWorkbookNumericValue(raw);
    return Number.isNaN(n) ? '' : n;
  }
  return raw;
}

function getDefaultGroupingDisplayValue(rawValue) {
  if (rawValue === undefined || rawValue === null || rawValue === '') return 'Blank';
  if (rawValue instanceof Date) return formatDisplayValue(rawValue, { fallbackToRaw: true, invalidValue: 'Blank' });
  if (typeof rawValue === 'boolean') return rawValue ? 'True' : 'False';
  const text = String(rawValue).replace(/\n+/gu, ' / ').trim();
  return text || 'Blank';
}

function getWorkbookHelpers(helpers = {}) {
  return {
    getCellExportValue: typeof helpers.getCellExportValue === 'function' ? helpers.getCellExportValue : getDefaultCellExportValue,
    getGroupingDisplayValue: typeof helpers.getGroupingDisplayValue === 'function' ? helpers.getGroupingDisplayValue : getDefaultGroupingDisplayValue,
    getUniqueSheetName: typeof helpers.getUniqueSheetName === 'function' ? helpers.getUniqueSheetName : getUniqueSheetName,
    progress: helpers.progress || { update() {} },
    yieldToBrowser: typeof helpers.yieldToBrowser === 'function' ? helpers.yieldToBrowser : async () => {}
  };
}

function getExcelDateSerial(date) {
  const utcDate = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.round((utcDate - Date.UTC(1899, 11, 30)) / 86400000);
}

function buildTextCellAtReference(value, reference, styleId = '', styleAttr = '') {
  const rawText = String(value ?? '');
  const text = escapeXmlText(rawText);
  const style = styleAttr || (styleId ? ` s="${styleId}"` : '');
  const space = XML_PRESERVE_SPACE_PATTERN.test(rawText) ? ' xml:space="preserve"' : '';
  return `<c r="${reference}" t="inlineStr"${style}><is><t${space}>${text}</t></is></c>`;
}

function buildTextCell(value, rowNumber, columnNumber, styleId = '') {
  return buildTextCellAtReference(value, `${getColumnName(columnNumber)}${rowNumber}`, styleId);
}

function getCellStyle(type) {
  if (type === 'date') return '1';
  if (type === 'money') return '3';
  if (type === 'number') return '4';
  if (type === 'boolean') return '5';
  return '';
}

function buildCellAtReference(value, reference, styleId = '', textStyleId = '') {
  if (value === undefined || value === null || value === '') {
    return '';
  }

  const style = styleId ? ` s="${styleId}"` : '';
  if (value instanceof Date) {
    return `<c r="${reference}" s="1"><v>${getExcelDateSerial(value)}</v></c>`;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `<c r="${reference}"${style}><v>${value}</v></c>`;
  }
  if (typeof value === 'boolean') {
    return `<c r="${reference}" t="b"${style}><v>${value ? 1 : 0}</v></c>`;
  }
  return buildTextCellAtReference(value, reference, textStyleId);
}

function buildSourceCellAtReference(value, reference, column) {
  if (value === undefined || value === null || value === '') {
    return '';
  }

  if (value instanceof Date) {
    return `<c r="${reference}" s="1"><v>${getExcelDateSerial(value)}</v></c>`;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `<c r="${reference}"${column.styleAttr}><v>${value}</v></c>`;
  }
  if (typeof value === 'boolean') {
    return `<c r="${reference}" t="b"${column.styleAttr}><v>${value ? 1 : 0}</v></c>`;
  }
  if (String(value).includes('\n')) {
    return buildTextCellAtReference(value, reference, DETAILS_WRAP_STYLE_ID, ` s="${DETAILS_WRAP_STYLE_ID}"`);
  }
  return buildTextCellAtReference(value, reference, column.textStyleId, column.textStyleAttr);
}

function buildCell(value, rowNumber, columnNumber, styleId = '', textStyleId = '') {
  return buildCellAtReference(value, `${getColumnName(columnNumber)}${rowNumber}`, styleId, textStyleId);
}

function getCellTextStyle(type) {
  if (type === 'date') return DATE_TEXT_STYLE_ID;
  if (type === 'boolean') return '5';
  return '';
}

function buildHeaderRow(fields) {
  return `<row r="1">${fields.map((field, index) => buildTextCell(field, 1, index + 1, '2')).join('')}</row>`;
}

function getRawValue(rawRow, column) {
  return column.sourceIndex !== undefined ? rawRow[column.sourceIndex] : undefined;
}

function buildSourceRow(columnPlan, rawRow, rowNumber, getCellExportValue) {
  let cells = '';
  for (let index = 0; index < columnPlan.length; index += 1) {
    const column = columnPlan[index];
    const raw = column.sourceIndex !== undefined ? rawRow[column.sourceIndex] : undefined;
    const value = getCellExportValue(raw, column.type);
    cells += buildSourceCellAtReference(value, `${column.columnName}${rowNumber}`, column);
  }
  return `<row r="${rowNumber}">${cells}</row>`;
}

function getColumnWidthValue(rawRow, column) {
  const raw = column.sourceIndex !== undefined ? rawRow[column.sourceIndex] : undefined;
  if (raw === undefined || raw === null) return '';

  if (mayHaveMultipleCellValues(raw) && hasMultipleCellValues(raw)) {
    return getCellValueParts(raw)
      .map((value, index) => `${index + 1}. ${getColumnWidthValue([value], { ...column, sourceIndex: 0 })}`)
      .join(' ');
  }

  if (column.type === 'date') return '12/31/2000';
  if (column.type === 'number' || column.type === 'money') {
    const parsed = parseWorkbookNumericValue(raw);
    return Number.isNaN(parsed) ? '' : String(parsed);
  }
  const text = String(raw);
  return text.includes(SERIALIZED_MULTI_VALUE_SEPARATOR)
    ? text.replace(/\x1F/gu, ' ')
    : text;
}

async function calculateSourceColumnWidths(sourceData, helpers, columnPlan) {
  const widths = columnPlan.map(column => column.field.length);
  const rows = sourceData.dataRows;
  const rowCount = rows.length;
  const columnCount = columnPlan.length;

  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    const row = rows[rowIndex];
    for (let fieldIndex = 0; fieldIndex < columnCount; fieldIndex += 1) {
      const column = columnPlan[fieldIndex];
      const value = getColumnWidthValue(row, column);
      if (value) {
        widths[fieldIndex] = Math.max(widths[fieldIndex], value.length);
      }
    }

    if (rowIndex > 0 && rowIndex % PROGRESS_ROW_BATCH === 0) {
      helpers.progress.update({
        title: 'Sizing workbook columns',
        detail: `Measured ${rowIndex.toLocaleString()} of ${rowCount.toLocaleString()} rows`,
        percent: 6
      });
      await helpers.yieldToBrowser();
    }
  }

  return widths.map(width => Math.max(4, Math.min(60, width + 2)));
}

function calculateRowsColumnWidths(columns, rows) {
  const widths = columns.map(field => field.length);
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    for (let index = 0; index < row.length; index += 1) {
      const value = row[index];
      widths[index] = Math.max(widths[index], String(value ?? '').length);
    }
  }
  return widths.map(width => Math.max(4, Math.min(60, width + 2)));
}

function getGroupingLabel(rawRow, candidate, helpers, columnPlan) {
  const column = columnPlan[candidate.index];
  const raw = getRawValue(rawRow, column);
  return helpers.getGroupingDisplayValue(helpers.getCellExportValue(raw, column.type));
}

function splitSourceSheets(baseName, rowCount, usedNames, getUniqueSheetName) {
  const sheets = [];
  let part = 1;
  for (let start = 0; start < rowCount; start += EXCEL_MAX_DATA_ROWS_PER_SHEET) {
    const end = Math.min(start + EXCEL_MAX_DATA_ROWS_PER_SHEET, rowCount);
    const name = rowCount > EXCEL_MAX_DATA_ROWS_PER_SHEET ? `${baseName} ${part}` : baseName;
    sheets.push({
      dataRowCount: end - start,
      kind: 'source',
      name: getUniqueSheetName(name, usedNames),
      rowEnd: end,
      rowStart: start
    });
    part += 1;
  }
  return sheets;
}

function splitGroupSheets(label, count, rowIndexes, usedNames, getUniqueSheetName) {
  const sheets = [];
  let part = 1;
  for (let skip = 0; skip < count; skip += EXCEL_MAX_DATA_ROWS_PER_SHEET) {
    const take = Math.min(EXCEL_MAX_DATA_ROWS_PER_SHEET, count - skip);
    const name = count > EXCEL_MAX_DATA_ROWS_PER_SHEET ? `${label} ${part}` : label;
    sheets.push({
      dataRowCount: take,
      groupLabel: label,
      groupRowIndexes: rowIndexes,
      groupSkip: skip,
      groupTake: take,
      kind: 'group',
      name: getUniqueSheetName(name, usedNames)
    });
    part += 1;
  }
  return sheets;
}

function buildGroupRowIndex(sourceData, candidate, helpers, columnPlan) {
  const groups = new Map();
  for (let rowIndex = 0; rowIndex < sourceData.dataRows.length; rowIndex += 1) {
    const row = sourceData.dataRows[rowIndex];
    const label = getGroupingLabel(row, candidate, helpers, columnPlan);
    let indexes = groups.get(label);
    if (!indexes) {
      indexes = [];
      groups.set(label, indexes);
    }
    indexes.push(rowIndex);
  }
  return groups;
}

function buildWorkbookPlan(state, config, helpers, columnPlan) {
  const usedNames = new Set();
  const sourceData = state.sourceData;
  const sheets = [];

  if (Array.isArray(config.runDetailsRows) && config.runDetailsRows.length) {
    const rows = ensureWorkbookGenerationTimeRow(config.runDetailsRows);
    sheets.push({
      columns: getWorkbookDetailsColumns(),
      dataRowCount: rows.length,
      kind: 'details',
      name: helpers.getUniqueSheetName(WORKBOOK_DETAILS_SHEET_NAME, usedNames),
      rows
    });
  }

  if (config.mode !== 'grouped') {
    sheets.push(...splitSourceSheets(state.tableName, state.rowCount, usedNames, helpers.getUniqueSheetName));
    return sheets;
  }

  const candidate = state.groupingCandidates.find(item => item.field === config.groupField);
  if (!candidate) {
    throw new Error('A grouping field is required for grouped export');
  }

  const groups = Array.from(candidate.counts.entries())
    .map(([label, count]) => ({ count, label }))
    .sort((left, right) => left.label.localeCompare(right.label, undefined, { numeric: true, sensitivity: 'base' }));
  const groupRowIndex = buildGroupRowIndex(sourceData, candidate, helpers, columnPlan);

  if (config.includeMasterSheet) {
    sheets.push(...splitSourceSheets('All Results', state.rowCount, usedNames, helpers.getUniqueSheetName));
  }

  if (config.includeOverviewSheet) {
    const overviewRows = buildOverviewRows(groups, state.rowCount);
    sheets.push({
      columns: getOverviewColumns(candidate.field),
      dataRowCount: overviewRows.length,
      kind: 'overview',
      name: helpers.getUniqueSheetName('Overview', usedNames),
      rows: overviewRows
    });
  }

  groups.forEach(group => {
    sheets.push(...splitGroupSheets(
      group.label,
      group.count,
      groupRowIndex.get(group.label) || [],
      usedNames,
      helpers.getUniqueSheetName
    ));
  });

  sheets.forEach(sheet => {
    if (sheet.kind === 'group') {
      sheet.candidate = candidate;
      sheet.sourceData = sourceData;
    }
  });
  return sheets;
}

function buildContentTypes(sheetCount) {
  const sheetOverrides = Array.from({ length: sheetCount }, (_, index) => (
    `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
  )).join('');
  const tableOverrides = Array.from({ length: sheetCount }, (_, index) => (
    `<Override PartName="/xl/tables/table${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml"/>`
  )).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheetOverrides}${tableOverrides}</Types>`;
}

function buildWorkbookXml(sheets) {
  const sheetXml = sheets.map((sheet, index) => (
    `<sheet name="${escapeXmlAttribute(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`
  )).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheetXml}</sheets></workbook>`;
}

function buildWorkbookRelationships(sheetCount) {
  const sheetRels = Array.from({ length: sheetCount }, (_, index) => (
    `<Relationship Id="rId${index + 1}" Type="${WORKSHEET_TYPE}" Target="worksheets/sheet${index + 1}.xml"/>`
  )).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheetRels}<Relationship Id="rId${sheetCount + 1}" Type="${STYLES_TYPE}" Target="styles.xml"/></Relationships>`;
}

function buildSheetRelationships(tableId) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${TABLE_TYPE}" Target="../tables/table${tableId}.xml"/></Relationships>`;
}

function buildPackageRelationships() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${OFFICE_DOCUMENT_TYPE}" Target="xl/workbook.xml"/></Relationships>`;
}

function buildStylesXml() {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="2"><numFmt numFmtId="164" formatCode="mm/dd/yyyy"/><numFmt numFmtId="165" formatCode="$#,##0.00"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="9"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"><alignment horizontal="right"/></xf><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"><alignment horizontal="right"/></xf><xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"><alignment horizontal="right"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"><alignment horizontal="center"/></xf><xf numFmtId="10" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"><alignment horizontal="right"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"><alignment horizontal="right"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"><alignment vertical="top" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
}

function buildColumnXml(widths) {
  return widths?.length
    ? `<cols>${widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join('')}</cols>`
    : '';
}

function buildWorksheetStart(columns, dataRowCount, widths) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>${buildColumnXml(widths)}<sheetData>${buildHeaderRow(columns)}`;
}

function buildWorksheetEnd(columns, dataRowCount) {
  return '</sheetData><tableParts count="1"><tablePart r:id="rId1"/></tableParts></worksheet>';
}

function buildSafeTableName(name, index) {
  const normalized = String(name || `Table${index}`)
    .replace(/[^A-Za-z0-9_]/gu, '_')
    .replace(/^[^A-Za-z_]+/u, '')
    .slice(0, 230);
  return `${normalized || 'Table'}_${index}`;
}

function getSheetColumns(sheet) {
  return sheet.kind === 'overview' || sheet.kind === 'details'
    ? sheet.columns
    : sheet.sourceData.displayedFields;
}

function buildTableXml(sheet, tableId) {
  const columns = getSheetColumns(sheet);
  const ref = `A1:${getColumnName(columns.length)}${Math.max(1, sheet.dataRowCount + 1)}`;
  const tableColumns = columns.map((column, index) => `<tableColumn id="${index + 1}" name="${escapeXmlAttribute(column)}"/>`).join('');
  const tableName = buildSafeTableName(sheet.name, tableId);
  const styleName = sheet.kind === 'overview' ? 'TableStyleMedium2' : (sheet.kind === 'details' ? 'TableStyleMedium9' : 'TableStyleMedium4');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><table xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" id="${tableId}" name="${tableName}" displayName="${tableName}" ref="${ref}" totalsRowShown="0"><autoFilter ref="${ref}"/><tableColumns count="${columns.length}">${tableColumns}</tableColumns><tableStyleInfo name="${styleName}" showFirstColumn="0" showLastColumn="0" showRowStripes="1" showColumnStripes="0"/></table>`;
}

async function* createSourceSheetChunks(sheet, context) {
  const { columnPlan, helpers, sourceData } = context;
  yield buildWorksheetStart(sourceData.displayedFields, sheet.dataRowCount, sheet.columnWidths);

  let rowNumber = 2;
  let chunk = '';
  let written = 0;
  const dataRows = sourceData.dataRows;
  const getCellExportValue = helpers.getCellExportValue;
  const rowIndexes = Array.isArray(sheet.groupRowIndexes) ? sheet.groupRowIndexes : null;
  const groupStart = sheet.groupSkip || 0;
  const start = sheet.kind === 'source' ? (sheet.rowStart || 0) : 0;
  const end = sheet.kind === 'source' ? (sheet.rowEnd ?? dataRows.length) : dataRows.length;
  const rowCount = rowIndexes ? Math.min(sheet.groupTake, Math.max(0, rowIndexes.length - groupStart)) : end - start;

  for (let rowOffset = 0; rowOffset < rowCount; rowOffset += 1) {
    const rowIndex = rowIndexes ? rowIndexes[groupStart + rowOffset] : start + rowOffset;
    const rawRow = dataRows[rowIndex];

    chunk += buildSourceRow(columnPlan, rawRow, rowNumber, getCellExportValue);
    rowNumber += 1;
    written += 1;
    context.writtenRows += 1;

    if (chunk.length >= XML_CHUNK_SIZE) {
      yield chunk;
      chunk = '';
      await context.reportProgress(sheet.name);
    } else if (written % PROGRESS_ROW_BATCH === 0) {
      await context.reportProgress(sheet.name);
    }
  }

  if (chunk) {
    yield chunk;
  }
  yield buildWorksheetEnd(sourceData.displayedFields, sheet.dataRowCount);
  await context.reportProgress(sheet.name);
}

async function* createOverviewSheetChunks(sheet, context) {
  yield buildWorksheetStart(sheet.columns, sheet.dataRowCount, sheet.columnWidths);
  let chunk = '';
  sheet.rows.forEach((row, index) => {
    const rowNumber = index + 2;
    chunk += `<row r="${rowNumber}">${buildTextCell(row[0], rowNumber, 1)}${buildCell(row[1], rowNumber, 2, '4')}${buildCell(row[2], rowNumber, 3, '6')}</row>`;
  });
  context.writtenRows += sheet.rows.length;
  yield chunk;
  yield buildWorksheetEnd(sheet.columns, sheet.dataRowCount);
  await context.reportProgress(sheet.name);
}

async function* createDetailsSheetChunks(sheet, context) {
  setWorkbookGenerationTimeRow(sheet.rows, context.getGenerationElapsedMs());
  yield buildWorksheetStart(sheet.columns, sheet.dataRowCount, sheet.columnWidths);
  let chunk = '';
  for (let rowIndex = 0; rowIndex < sheet.rows.length; rowIndex += 1) {
    const row = sheet.rows[rowIndex];
    const rowNumber = rowIndex + 2;
    let cells = '';
    for (let columnIndex = 0; columnIndex < sheet.columns.length; columnIndex += 1) {
      cells += buildTextCell(row[columnIndex] ?? '', rowNumber, columnIndex + 1, DETAILS_WRAP_STYLE_ID);
    }
    chunk += `<row r="${rowNumber}">${cells}</row>`;
  }
  context.writtenRows += sheet.rows.length;
  yield chunk;
  yield buildWorksheetEnd(sheet.columns, sheet.dataRowCount);
  await context.reportProgress(sheet.name);
}

async function createWorkbookBlob({ state, config, helpers }) {
  const workbookStartedAt = getCurrentTimeMs();
  const resolvedHelpers = getWorkbookHelpers(helpers);
  const sourceColumnPlan = buildSourceColumnPlan(state.sourceData);
  const sheets = buildWorkbookPlan(state, config, resolvedHelpers, sourceColumnPlan);
  const sourceColumnWidths = await calculateSourceColumnWidths(state.sourceData, resolvedHelpers, sourceColumnPlan);
  sheets.forEach((sheet, index) => {
    sheet.tableId = index + 1;
    if (sheet.kind === 'overview' || sheet.kind === 'details') {
      sheet.columnWidths = calculateRowsColumnWidths(sheet.columns, sheet.rows);
    } else {
      sheet.columnWidths = sourceColumnWidths;
      sheet.sourceData = state.sourceData;
    }
  });
  const totalRows = Math.max(1, sheets.reduce((sum, sheet) => sum + sheet.dataRowCount, 0));
  const context = {
    helpers: resolvedHelpers,
    columnPlan: sourceColumnPlan,
    sourceData: state.sourceData,
    totalRows,
    writtenRows: 0,
    getGenerationElapsedMs() {
      return getCurrentTimeMs() - workbookStartedAt;
    },
    async reportProgress(sheetName) {
      const percent = Math.min(94, 8 + Math.round((this.writtenRows / this.totalRows) * 82));
      resolvedHelpers.progress.update({
        title: 'Building workbook',
        detail: `Writing ${sheetName} (${this.writtenRows.toLocaleString()} of ${this.totalRows.toLocaleString()} rows)`,
        percent
      });
      await resolvedHelpers.yieldToBrowser();
    }
  };

  resolvedHelpers.progress.update({
    title: 'Building workbook',
    detail: `Writing ${state.rowCount.toLocaleString()} rows to Excel`,
    percent: 5
  });
  await resolvedHelpers.yieldToBrowser();

  const worksheetEntries = sheets.map((sheet, index) => ({
    path: `xl/worksheets/sheet${index + 1}.xml`,
    sheet,
    chunks: () => {
      if (sheet.kind === 'overview') return createOverviewSheetChunks(sheet, context);
      if (sheet.kind === 'details') return createDetailsSheetChunks(sheet, context);
      return createSourceSheetChunks(sheet, context);
    }
  }));
  const orderedWorksheetEntries = [
    ...worksheetEntries.filter(entry => entry.sheet.kind !== 'details'),
    ...worksheetEntries.filter(entry => entry.sheet.kind === 'details')
  ].map(({ sheet, ...entry }) => entry);

  const entries = [
    { path: '[Content_Types].xml', chunks: [buildContentTypes(sheets.length)] },
    { path: '_rels/.rels', chunks: [buildPackageRelationships()] },
    { path: 'xl/workbook.xml', chunks: [buildWorkbookXml(sheets)] },
    { path: 'xl/_rels/workbook.xml.rels', chunks: [buildWorkbookRelationships(sheets.length)] },
    { path: 'xl/styles.xml', chunks: [buildStylesXml()] },
    ...sheets.map(sheet => ({
      path: `xl/worksheets/_rels/sheet${sheet.tableId}.xml.rels`,
      chunks: [buildSheetRelationships(sheet.tableId)]
    })),
    ...sheets.map(sheet => ({
      path: `xl/tables/table${sheet.tableId}.xml`,
      chunks: [buildTableXml(sheet, sheet.tableId)]
    })),
    ...orderedWorksheetEntries
  ];

  const blob = await createZipBlob(entries, { mimeType: ZIP_MIME_TYPE, yieldToBrowser: resolvedHelpers.yieldToBrowser });
  const filename = buildWorkbookFilename(state.tableName, config);
  resolvedHelpers.progress.update({
    title: 'Starting download',
    detail: `${filename} is ready`,
    percent: 100
  });
  await resolvedHelpers.yieldToBrowser();
  return { blob, filename };
}

function canUseWorkbookWorker() {
  return typeof Worker === 'function' && typeof URL === 'function';
}

function getWorkerGroupingCandidates(state, config = {}) {
  const candidates = Array.isArray(state?.groupingCandidates) ? state.groupingCandidates : [];
  if (config.mode !== 'grouped') {
    return [];
  }
  const selectedCandidate = candidates.find(candidate => candidate.field === config.groupField);
  return selectedCandidate ? [selectedCandidate] : candidates;
}

function getWorkerSourceData(sourceData = {}) {
  return {
    dataRows: sourceData.dataRows,
    displayedFields: sourceData.displayedFields,
    fieldTypeMap: sourceData.fieldTypeMap,
    virtualData: {
      columnMap: sourceData.virtualData?.columnMap
    }
  };
}

function createWorkerExportState(state, config = {}) {
  return {
    groupingCandidates: getWorkerGroupingCandidates(state, config),
    rowCount: state.rowCount,
    sourceData: getWorkerSourceData(state.sourceData),
    tableName: state.tableName
  };
}

function exportWorkbookInWorker({ state, config, helpers }) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./workbookExportWorker.js', import.meta.url), { type: 'module' });
    const id = `workbook-export-${Date.now()}-${workbookWorkerSequence += 1}`;
    let settled = false;
    function finish(callback, value) {
      if (settled) return;
      settled = true;
      worker.terminate();
      callback(value);
    }

    worker.onmessage = event => {
      const message = event.data || {};
      if (message.id !== id) return;
      if (message.type === 'progress') {
        helpers.progress.update(message.payload || {});
        return;
      }
      if (message.type === 'complete') {
        downloadWorkbookBlob(message.blob, message.filename);
        finish(resolve, message.filename);
        return;
      }
      if (message.type === 'error') {
        finish(reject, new Error(message.error || 'Workbook export worker failed'));
      }
    };
    worker.onerror = event => {
      finish(reject, new Error(event.message || 'Workbook export worker failed'));
    };
    worker.onmessageerror = () => {
      finish(reject, new Error('Workbook export worker message failed'));
    };
    helpers.progress.update({
      title: 'Building workbook',
      detail: 'Preparing workbook in a background worker',
      percent: 4
    });
    try {
      worker.postMessage({ config, id, state: createWorkerExportState(state, config) });
    } catch (error) {
      finish(reject, error);
    }
  });
}

async function exportWorkbook({ state, config, helpers }) {
  const resolvedHelpers = getWorkbookHelpers(helpers);
  if (shouldUseWorkbookWorker(state, config) && canUseWorkbookWorker()) {
    try {
      return await exportWorkbookInWorker({ config, helpers: resolvedHelpers, state });
    } catch (error) {
      console.warn('Workbook export worker failed; falling back to page export.', error);
    }
  }

  const { blob, filename } = await createWorkbookBlob({ config, helpers: resolvedHelpers, state });
  downloadWorkbookBlob(blob, filename);
  return filename;
}

export { createWorkbookBlob, exportWorkbook, getWorkbookCellCount, shouldUseWorkbookWorker };
