import { ZIP_MIME_TYPE, createZipBlob } from './xlsxZipWriter.js';

const LARGE_EXPORT_CELL_THRESHOLD = 75000;
const EXCEL_MAX_DATA_ROWS_PER_SHEET = 1048575;
const XML_CHUNK_SIZE = 256000;
const PROGRESS_ROW_BATCH = 500;
const WORKSHEET_TYPE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet';
const STYLES_TYPE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles';
const OFFICE_DOCUMENT_TYPE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument';

function shouldUseLargeWorkbookExport(state) {
  const rowCount = Number(state?.rowCount || 0);
  const columnCount = Number(state?.sourceData?.displayedFields?.length || 0);
  return rowCount * columnCount >= LARGE_EXPORT_CELL_THRESHOLD;
}

function escapeXml(value) {
  return String(value ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/gu, '')
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;');
}

function escapeXmlAttribute(value) {
  return escapeXml(value).replace(/"/gu, '&quot;').replace(/'/gu, '&apos;');
}

function getColumnName(index) {
  let current = index;
  let name = '';
  while (current > 0) {
    const remainder = (current - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    current = Math.floor((current - 1) / 26);
  }
  return name;
}

function getExcelDateSerial(date) {
  const utcDate = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.round((utcDate - Date.UTC(1899, 11, 30)) / 86400000);
}

function buildTextCell(value, rowNumber, columnNumber, styleId = '') {
  const text = escapeXml(value);
  const style = styleId ? ` s="${styleId}"` : '';
  const space = /^\s|\s$|\n/u.test(String(value ?? '')) ? ' xml:space="preserve"' : '';
  return `<c r="${getColumnName(columnNumber)}${rowNumber}" t="inlineStr"${style}><is><t${space}>${text}</t></is></c>`;
}

function buildCell(value, rowNumber, columnNumber) {
  if (value === undefined || value === null || value === '') {
    return '';
  }

  const reference = `${getColumnName(columnNumber)}${rowNumber}`;
  if (value instanceof Date) {
    return `<c r="${reference}" s="1"><v>${getExcelDateSerial(value)}</v></c>`;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `<c r="${reference}"><v>${value}</v></c>`;
  }
  if (typeof value === 'boolean') {
    return `<c r="${reference}" t="b"><v>${value ? 1 : 0}</v></c>`;
  }
  return buildTextCell(value, rowNumber, columnNumber);
}

function buildHeaderRow(fields) {
  return `<row r="1">${fields.map((field, index) => buildTextCell(field, 1, index + 1, '2')).join('')}</row>`;
}

function getRawValue(sourceData, rawRow, field) {
  const colIndex = sourceData.virtualData.columnMap.get(field);
  return colIndex !== undefined ? rawRow[colIndex] : undefined;
}

function buildSourceRow(sourceData, rawRow, rowNumber, getCellExportValue) {
  const cells = sourceData.displayedFields.map((field, index) => {
    const raw = getRawValue(sourceData, rawRow, field);
    const type = sourceData.fieldTypeMap.get(field);
    return buildCell(getCellExportValue(raw, type), rowNumber, index + 1);
  }).join('');
  return `<row r="${rowNumber}">${cells}</row>`;
}

function getGroupingLabel(sourceData, rawRow, candidate, helpers) {
  const field = sourceData.displayedFields[candidate.index];
  const raw = getRawValue(sourceData, rawRow, field);
  const type = sourceData.fieldTypeMap.get(field);
  return helpers.getGroupingDisplayValue(helpers.getCellExportValue(raw, type));
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

function splitGroupSheets(label, count, usedNames, getUniqueSheetName) {
  const sheets = [];
  let part = 1;
  for (let skip = 0; skip < count; skip += EXCEL_MAX_DATA_ROWS_PER_SHEET) {
    const take = Math.min(EXCEL_MAX_DATA_ROWS_PER_SHEET, count - skip);
    const name = count > EXCEL_MAX_DATA_ROWS_PER_SHEET ? `${label} ${part}` : label;
    sheets.push({
      dataRowCount: take,
      groupLabel: label,
      groupSkip: skip,
      groupTake: take,
      kind: 'group',
      name: getUniqueSheetName(name, usedNames)
    });
    part += 1;
  }
  return sheets;
}

function buildWorkbookPlan(state, config, helpers) {
  const usedNames = new Set();
  const sourceData = state.sourceData;
  const sheets = [];

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

  if (config.includeMasterSheet) {
    sheets.push(...splitSourceSheets('All Results', state.rowCount, usedNames, helpers.getUniqueSheetName));
  }

  if (config.includeOverviewSheet) {
    sheets.push({
      columns: [candidate.field, 'Rows'],
      dataRowCount: groups.length,
      kind: 'overview',
      name: helpers.getUniqueSheetName('Overview', usedNames),
      rows: groups.map(group => [group.label, group.count])
    });
  }

  groups.forEach(group => {
    sheets.push(...splitGroupSheets(group.label, group.count, usedNames, helpers.getUniqueSheetName));
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
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheetOverrides}</Types>`;
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

function buildPackageRelationships() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${OFFICE_DOCUMENT_TYPE}" Target="xl/workbook.xml"/></Relationships>`;
}

function buildStylesXml() {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="mm/dd/yyyy"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE5F3FF"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
}

function buildWorksheetStart(columns, dataRowCount) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetData>${buildHeaderRow(columns)}`;
}

function buildWorksheetEnd(columns, dataRowCount) {
  const lastColumn = getColumnName(columns.length);
  const lastRow = Math.max(1, dataRowCount + 1);
  return `</sheetData><autoFilter ref="A1:${lastColumn}${lastRow}"/></worksheet>`;
}

async function* createSourceSheetChunks(sheet, context) {
  const { helpers, sourceData } = context;
  yield buildWorksheetStart(sourceData.displayedFields, sheet.dataRowCount);

  let rowNumber = 2;
  let chunk = '';
  const start = sheet.kind === 'source' ? (sheet.rowStart || 0) : 0;
  const end = sheet.kind === 'source' ? (sheet.rowEnd ?? sourceData.dataRows.length) : sourceData.dataRows.length;
  let matched = 0;
  let written = 0;

  for (let rowIndex = start; rowIndex < end; rowIndex += 1) {
    const rawRow = sourceData.dataRows[rowIndex];
    if (sheet.kind === 'group') {
      if (getGroupingLabel(sourceData, rawRow, sheet.candidate, helpers) !== sheet.groupLabel) {
        continue;
      }
      matched += 1;
      if (matched <= sheet.groupSkip || written >= sheet.groupTake) {
        continue;
      }
    }

    chunk += buildSourceRow(sourceData, rawRow, rowNumber, helpers.getCellExportValue);
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
  yield buildWorksheetStart(sheet.columns, sheet.dataRowCount);
  let chunk = '';
  sheet.rows.forEach((row, index) => {
    const rowNumber = index + 2;
    chunk += `<row r="${rowNumber}">${buildTextCell(row[0], rowNumber, 1)}${buildCell(row[1], rowNumber, 2)}</row>`;
  });
  context.writtenRows += sheet.rows.length;
  yield chunk;
  yield buildWorksheetEnd(sheet.columns, sheet.dataRowCount);
  await context.reportProgress(sheet.name);
}

function buildFilename(tableName, config) {
  const safeFileName = tableName.replace(/[^a-zA-Z0-9\-_\s]/g, '').replace(/\s+/g, '-');
  const suffix = config.mode === 'grouped' && config.groupField
    ? `-by-${config.groupField.replace(/[^a-zA-Z0-9\-_\s]/g, '').trim().replace(/\s+/g, '-')}`
    : '';
  return `${safeFileName || 'Query-Results'}${suffix}.xlsx`;
}

function downloadBlob(blob, filename) {
  const link = document.createElement('a');
  const objectUrl = URL.createObjectURL(blob);
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
}

async function exportLargeWorkbook({ state, config, helpers }) {
  const sheets = buildWorkbookPlan(state, config, helpers);
  const totalRows = Math.max(1, sheets.reduce((sum, sheet) => sum + sheet.dataRowCount, 0));
  const context = {
    helpers,
    sourceData: state.sourceData,
    totalRows,
    writtenRows: 0,
    async reportProgress(sheetName) {
      const percent = Math.min(94, 8 + Math.round((this.writtenRows / this.totalRows) * 82));
      helpers.progress.update({
        title: 'Building large workbook',
        detail: `Writing ${sheetName} (${this.writtenRows.toLocaleString()} of ${this.totalRows.toLocaleString()} rows)`,
        percent
      });
      await helpers.yieldToBrowser();
    }
  };

  helpers.progress.update({
    title: 'Building large workbook',
    detail: `Using memory-safe export for ${state.rowCount.toLocaleString()} rows`,
    percent: 5
  });
  await helpers.yieldToBrowser();

  const entries = [
    { path: '[Content_Types].xml', chunks: [buildContentTypes(sheets.length)] },
    { path: '_rels/.rels', chunks: [buildPackageRelationships()] },
    { path: 'xl/workbook.xml', chunks: [buildWorkbookXml(sheets)] },
    { path: 'xl/_rels/workbook.xml.rels', chunks: [buildWorkbookRelationships(sheets.length)] },
    { path: 'xl/styles.xml', chunks: [buildStylesXml()] },
    ...sheets.map((sheet, index) => ({
      path: `xl/worksheets/sheet${index + 1}.xml`,
      chunks: () => sheet.kind === 'overview'
        ? createOverviewSheetChunks(sheet, context)
        : createSourceSheetChunks(sheet, context)
    }))
  ];

  const blob = await createZipBlob(entries, { mimeType: ZIP_MIME_TYPE, yieldToBrowser: helpers.yieldToBrowser });
  const filename = buildFilename(state.tableName, config);
  helpers.progress.update({
    title: 'Starting download',
    detail: `${filename} is ready`,
    percent: 100
  });
  await helpers.yieldToBrowser();
  downloadBlob(blob, filename);
}

export { exportLargeWorkbook, shouldUseLargeWorkbookExport };
