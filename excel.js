/* =========================
   Excel Exporter Module
   ========================= */
const ExcelExporter = (() => {
  function attach() {
    const downloadBtn = document.getElementById('download-btn');
    if (downloadBtn) {
      downloadBtn.addEventListener('click', handleDownload);
    }
  }

  function handleDownload() {
    const downloadBtn = document.getElementById('download-btn');
    if (!downloadBtn) return;

    // Check if button is disabled and show message
    if (downloadBtn.disabled) {
      const tableNameInput = document.getElementById('table-name-input');
      const tableName = tableNameInput ? tableNameInput.value.trim() : '';
      const hasData = Array.isArray(displayedFields) && displayedFields.length > 0 && Array.isArray(virtualTableData) && virtualTableData.length > 0;
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
        const message = document.createElement('div');
        message.className = 'fixed bottom-4 right-4 bg-orange-100 border border-orange-500 text-orange-700 px-4 py-3 rounded-md shadow-lg z-50';
        message.innerHTML = `
          <div class="flex items-center gap-2">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 16.5c-.77.833.192 2.5 1.732 2.5z"></path>
            </svg>
            <span>${messageText}</span>
          </div>
        `;
        document.body.appendChild(message);

        setTimeout(() => {
          message.style.opacity = '0';
          message.style.transition = 'opacity 0.5s ease';
          setTimeout(() => {
            if (document.body.contains(message)) {
              document.body.removeChild(message);
            }
          }, 500);
        }, 3000);
      }
      return;
    }

    if (!Array.isArray(displayedFields) || !displayedFields.length || !Array.isArray(virtualTableData) || !virtualTableData.length) {
      return;
    }

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
      width: Math.max(12, Math.min(50, Math.round(((calculatedColumnWidths && calculatedColumnWidths[field]) || 150) / 7)))
    }));

    // Accumulate typed rows for the Excel table definition
    const tableRows = [];
    virtualTableData.forEach(row => {
      const rowData = displayedFields.map(field => {
        const raw = row[field];
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
        const sample = virtualTableData.find(r => r[field] !== undefined && r[field] !== null)?.[field];
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
