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

    const tableNameInput = document.getElementById('table-name-input');
    const tableName = tableNameInput ? tableNameInput.value.trim() || 'Query Results' : 'Query Results';

    const wb = XLSX.utils.book_new();

    const wsData = [displayedFields];
    virtualTableData.forEach(row => {
      const rowData = displayedFields.map(field => {
        const value = row[field] || '';
        if (typeof value === 'string' && value.startsWith('$')) {
          const numValue = parseFloat(value.replace('$', '').replace(',', ''));
          return isNaN(numValue) ? value : numValue;
        }
        return value;
      });
      wsData.push(rowData);
    });

    const ws = XLSX.utils.aoa_to_sheet(wsData);

    const colWidths = displayedFields.map(field => {
      const width = (calculatedColumnWidths && calculatedColumnWidths[field]) || 150;
      return { wch: Math.max(12, Math.min(50, Math.round(width / 7))) };
    });
    ws['!cols'] = colWidths;

    const range = XLSX.utils.decode_range(ws['!ref']);
    const tableRef = `A1:${XLSX.utils.encode_cell({r: range.e.r, c: range.e.c})}`;

    const safeTableName = tableName.replace(/[^a-zA-Z0-9_]/g, '_');

    ws['!freeze'] = { xSplit: 0, ySplit: 1 }; // Freeze header row

    ws['!tables'] = [{
      ref: tableRef,
      name: safeTableName,
      headerRowCount: 1,
      totalsRowCount: 0,
      style: {
        theme: "TableStyleMedium9",
        showFirstColumn: false,
        showLastColumn: false,
        showRowStripes: true,
        showColumnStripes: false
      },
      columns: displayedFields.map(field => ({
        name: field,
        totalsRowFunction: "none"
      }))
    }];

    for (let R = 0; R <= range.e.r; ++R) {
      for (let C = 0; C <= range.e.c; ++C) {
        const cell_address = XLSX.utils.encode_cell({r:R, c:C});
        if (!ws[cell_address]) continue;
        if (R === 0) {
          ws[cell_address].s = {
            font: { bold: true, color: { rgb: "FFFFFF" } },
            fill: { fgColor: { rgb: "4472C4" } },
            alignment: { horizontal: "center", vertical: "center" },
            border: {
              top: { style: "medium", color: { rgb: "FFFFFF" } },
              bottom: { style: "medium", color: { rgb: "FFFFFF" } },
              left: { style: "medium", color: { rgb: "FFFFFF" } },
              right: { style: "medium", color: { rgb: "FFFFFF" } }
            }
          };
        } else {
          const isEvenRow = R % 2 === 0;
          ws[cell_address].s = {
            fill: { fgColor: { rgb: isEvenRow ? "FDFDFD" : "FFFFFF" } },
            alignment: { horizontal: "left", vertical: "center" },
            border: {
              top: { style: "thin", color: { rgb: "E0E0E0" } },
              bottom: { style: "thin", color: { rgb: "E0E0E0" } },
              left: { style: "thin", color: { rgb: "E0E0E0" } },
              right: { style: "thin", color: { rgb: "E0E0E0" } }
            }
          };
          const fieldName = displayedFields[C];
          if (fieldName && (fieldName.toLowerCase().includes('price') || fieldName.toLowerCase().includes('cost'))) {
            ws[cell_address].s.numFmt = '"$"#,##0.00';
          } else if (fieldName && (fieldName.toLowerCase().includes('date') || fieldName.toLowerCase().includes('time'))) {
            ws[cell_address].s.numFmt = 'mm/dd/yyyy';
          }
        }
      }
    }

    ws['!autofilter'] = { ref: tableRef };

    XLSX.utils.book_append_sheet(wb, ws, tableName);

    wb.Props = {
      Title: tableName,
      Subject: "Database Query Export",
      Author: "Query Tool",
      CreatedDate: new Date()
    };

    const safeFileName = tableName.replace(/[^a-zA-Z0-9\-_\s]/g, '').replace(/\s+/g, '-');
    const filename = `${safeFileName}.xlsx`;

    XLSX.writeFile(wb, filename, {
      bookType: 'xlsx',
      type: 'binary',
      cellStyles: true,
      sheetStubs: false
    });
  }

  attach();
  return { download: handleDownload };
})();
