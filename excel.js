/**
 * Excel Exporter Module
 * Handles exporting table data to Excel files with proper formatting and type detection.
 * @module ExcelExporter
 */
const ExcelExporter = (() => {
  /**
   * Attaches the download event listener to the download button.
   * @function attach
   * @memberof ExcelExporter
   */
  function attach() {
    const downloadBtn = document.getElementById('download-btn');
    if (downloadBtn) {
      downloadBtn.addEventListener('click', handleDownload);
    }
  }

  /**
   * Handles the download button click event.
   * Validates data availability, creates Excel workbook, and triggers download.
   * @function handleDownload
   * @memberof ExcelExporter
   */
  function handleDownload() {
    const downloadBtn = document.getElementById('download-btn');
    if (!downloadBtn) return;

    // Check if button is disabled and show message
    if (downloadBtn.disabled) {
      const tableNameInput = document.getElementById('table-name-input');
      const tableName = tableNameInput ? tableNameInput.value.trim() : '';
      const hasData = Array.isArray(displayedFields) && displayedFields.length > 0 && VirtualTable.virtualTableData && VirtualTable.virtualTableData.rows && VirtualTable.virtualTableData.rows.length > 0;
      const hasName = tableName && tableName !== '';

      let messageText = '';
      if (!hasData && !hasName) {
        messageText = 'Add columns and name your table to download';
      } else if (!hasData) {
        messageText = 'Add columns to download';
      } else if (!hasName) {
        messageText = 'Name your table';
      }

      if (messageText) {
        window.showToastMessage(messageText, 'warning');
      }
      return;
    }

    if (!Array.isArray(displayedFields) || !displayedFields.length || !VirtualTable.virtualTableData || !VirtualTable.virtualTableData.rows || !VirtualTable.virtualTableData.rows.length) {
      return;
    }

    /**
     * Converts a column number to Excel column letter(s) (1=A, 26=Z, 27=AA).
     * @function columnNumberToLetter
     * @param {number} number - The column number to convert
     * @returns {string} The Excel column letter(s)
     */
    function columnNumberToLetter(number) {
      let temp;
      let letter = '';
      while (number > 0) {
        temp = (number - 1) % 26;
        letter = String.fromCharCode(65 + temp) + letter;
        number = Math.floor((number - temp - 1) / 26);
      }
      return letter;
    }

    const tableNameInput = document.getElementById('table-name-input');
    const tableName = tableNameInput ? tableNameInput.value.trim() || 'Query Results' : 'Query Results';

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(tableName);

    worksheet.views = [{ state: 'frozen', ySplit: 1 }];

    // Accumulate typed rows for the Excel table definition
    const tableRows = [];
    
    // Access the virtual table data correctly - it's now a 2D array format
    const virtualData = VirtualTable.virtualTableData;
    const headers = virtualData.headers;
    const dataRows = virtualData.rows;
    
    // Build a type lookup from fieldDefs for all displayed fields
    const fieldTypeMap = new Map();
    displayedFields.forEach(field => {
      const def = window.fieldDefs && window.fieldDefs.get(field);
      fieldTypeMap.set(field, def ? def.type : 'string');
    });

    worksheet.columns = displayedFields.map(field => {
      let maxLen = field.length;
      const colIndex = virtualData.columnMap.get(field);
      const type = fieldTypeMap.get(field);
      
      if (colIndex !== undefined) {
        dataRows.forEach(row => {
          let val = row[colIndex];
          if (val !== undefined && val !== null) {
            if (type === 'date') val = '12/31/2000'; // typical date length
            else if (type === 'number') val = String(val).replace(/[$,]/g, '');
            else val = String(val);
            maxLen = Math.max(maxLen, val.length);
          }
        });
      }
      
      // Add padding for header filters/icons and cap max width at 60
      const charWidth = Math.max(4, Math.min(60, maxLen + 2));
      
      return {
        header: field,
        key: field,
        width: charWidth
      };
    });

    // Parse a raw YYYYMMDD integer (e.g. 20200914) into a JS Date.
    // Returns null for 0 / falsy values so they export as blank.
    function parseSirsDate(raw) {
      const n = typeof raw === 'string' ? parseInt(raw, 10) : raw;
      if (!n || isNaN(n)) return null;
      const y = Math.floor(n / 10000);
      const m = Math.floor((n % 10000) / 100) - 1; // 0-based month
      const d = n % 100;
      const dt = new Date(y, m, d);
      return isNaN(dt.getTime()) ? null : dt;
    }

    dataRows.forEach(row => {
      const rowData = displayedFields.map(field => {
        const colIndex = virtualData.columnMap.get(field);
        const raw = (colIndex !== undefined) ? row[colIndex] : undefined;
        if (raw === undefined || raw === null) return '';

        const type = fieldTypeMap.get(field);

        if (type === 'date') {
          const dt = parseSirsDate(raw);
          return dt !== null ? dt : 'Never'; // "Never" for 0 / invalid dates
        }

        if (type === 'number') {
          const n = typeof raw === 'number' ? raw : parseFloat(String(raw).replace(/[$,]/g, ''));
          return isNaN(n) ? '' : n;
        }

        // boolean, string, or anything else — replace multi-value delimiter with newline for Excel
        const str = String(raw);
        return str.includes('\x1F') ? str.split('\x1F').join('\n') : raw;
      });
      tableRows.push(rowData);
    });

    displayedFields.forEach((field, idx) => {
      const column = worksheet.getColumn(idx + 1);
      const type = fieldTypeMap.get(field);

      if (type === 'date') {
        column.numFmt = 'mm/dd/yyyy';
        column.alignment = { horizontal: 'right' };
      } else if (type === 'number') {
        // Check first non-empty value to decide integer vs decimal
        const colIndex = virtualData.columnMap.get(field);
        const sample = colIndex !== undefined
          ? virtualData.rows.map(r => r[colIndex]).find(v => v !== null && v !== undefined && v !== '')
          : null;
        const isDecimal = sample !== undefined && sample !== null && !Number.isInteger(
          typeof sample === 'number' ? sample : parseFloat(String(sample))
        );
        column.numFmt = isDecimal ? '#,##0.00' : '0';
        column.alignment = { horizontal: 'right' };
      } else if (type === 'boolean') {
        column.alignment = { horizontal: 'center' };
      } else {
        const isMarc = field.startsWith('Marc');
        column.alignment = { horizontal: 'left', wrapText: isMarc };
      }
    });

    const safeTableName = tableName.replace(/[^a-zA-Z0-9_]/g, '_');
    worksheet.addTable({
      name: safeTableName,
      ref: 'A1',
      headerRow: true,
      style: { theme: 'TableStyleMedium4', showRowStripes: true },
      columns: displayedFields.map(f => ({ name: f, filterButton: true })),
      rows: tableRows
    });


    const safeFileName = tableName.replace(/[^a-zA-Z0-9\-_\s]/g, '').replace(/\s+/g, '-');
    const filename = `${safeFileName}.xlsx`;

    workbook.xlsx.writeBuffer().then(buffer => {
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
    });
  }

  attach();
  return { download: handleDownload };
})();
