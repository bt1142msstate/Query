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

    worksheet.columns = displayedFields.map(field => ({
      header: field,
      key: field,
      width: Math.max(12, Math.min(50, Math.round(((VirtualTable.calculatedColumnWidths && VirtualTable.calculatedColumnWidths[field]) || 150) / 7)))
    }));

    // Accumulate typed rows for the Excel table definition
    const tableRows = [];
    
    // Access the virtual table data correctly - it's now a 2D array format
    const virtualData = VirtualTable.virtualTableData;
    const headers = virtualData.headers;
    const dataRows = virtualData.rows;
    
    dataRows.forEach(row => {
      const rowData = displayedFields.map(field => {
        // Get the column index for this field
        const colIndex = virtualData.columnMap.get(field);
        const raw = (colIndex !== undefined) ? row[colIndex] : undefined;
        const value = (raw === undefined || raw === null) ? '' : raw;

        // Only attempt type‑coercion for strings
        if (typeof value === 'string') {
          const trimmed = value.trim();

          /* ---------- Money "$1,234.56" ---------- */
          if (trimmed.startsWith('$')) {
            const numValue = parseFloat(trimmed.replace(/[$,]/g, ''));
            if (!isNaN(numValue)) return numValue;
          }

          /* ---------- Negative numbers "(1,234.56)" ---------- */
          if (/^\(\s*-?[0-9,]+(\.[0-9]+)?\s*\)$/.test(trimmed)) {
            const numValue = -parseFloat(trimmed.replace(/[\(\),\s]/g, ''));
            if (!isNaN(numValue)) return numValue;
          }

          /* ---------- Plain numeric strings "1,234.56" ---------- */
          if (/^-?[0-9,]+(\.[0-9]+)?$/.test(trimmed)) {
            const numValue = parseFloat(trimmed.replace(/,/g, ''));
            if (!isNaN(numValue)) return numValue;
          }

          /* ---------- Flexible date strings "1995-7-2" or "1995/7/2" ---------- */
          if (/^\d{4}[-\/]\d{1,2}[-\/]\d{1,2}$/.test(trimmed)) {
            const parts = trimmed.split(/[-\/]/).map(Number);
            const asDate = new Date(parts[0], parts[1] - 1, parts[2]);
            if (!isNaN(asDate.getTime())) return asDate;
          }

          /* ---------- Fallback: anything Date.parse can understand ---------- */
          const parsed = Date.parse(trimmed);
          if (!isNaN(parsed)) return new Date(parsed);
        }

        return value;
      });
      worksheet.addRow(rowData);
      tableRows.push(rowData);
    });

    displayedFields.forEach((field, idx) => {
      const column = worksheet.getColumn(idx + 1);
      const lower = field ? field.toLowerCase() : '';

      if (lower.includes('price') || lower.includes('cost')) {
        column.numFmt = '"$"#,##0.00';
      } else if (lower.includes('date') || lower.includes('time')) {
        column.numFmt = 'mm/dd/yyyy';
      } else {
        // Sample a value that made it into the sheet to infer type
        const virtualData = VirtualTable.virtualTableData;
        const colIndex = virtualData.columnMap.get(field);
        const sample = (colIndex !== undefined && virtualData.rows.length > 0) ? virtualData.rows[0][colIndex] : null;
        if (sample instanceof Date) {
          column.numFmt = 'mm/dd/yyyy';
        } else if (typeof sample === 'number') {
          column.numFmt = '#,##0.00';
        }
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
