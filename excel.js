/**
 * Excel Exporter Module
 * Handles exporting table data to Excel files with proper formatting and type detection.
 * @module ExcelExporter
 */
const ExcelExporter = (() => {
  // When true, multi-value cells (delimited by \x1F) are split into separate columns
  // instead of being stacked as newlines in a single cell.
  // Synced with window.splitColumnsActive which virtualTable.js also reads.
  let splitMultiValues = false;
  window.splitColumnsActive = false;

  /**
   * Attaches the download and toggle event listeners.
   * @function attach
   * @memberof ExcelExporter
   */
  function attach() {
    const downloadBtn = window.DOM?.downloadBtn || document.getElementById('download-btn');
    if (downloadBtn) {
      downloadBtn.addEventListener('click', handleDownload);
    }

    const toggleBtn = document.getElementById('split-columns-toggle');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        splitMultiValues = !splitMultiValues;

        const iconStack = document.getElementById('split-toggle-icon-stack');
        const iconCols  = document.getElementById('split-toggle-icon-cols');

        if (splitMultiValues) {
          toggleBtn.classList.replace('bg-white', 'bg-indigo-100');
          toggleBtn.classList.replace('text-black', 'text-indigo-700');
          toggleBtn.setAttribute('data-tooltip', 'Multi-value export: split into columns (click to stack in one cell)');
          iconStack && iconStack.classList.add('hidden');
          iconCols  && iconCols.classList.remove('hidden');
          window.showToastMessage && window.showToastMessage('Multi-values split into separate columns', 'info');
        } else {
          toggleBtn.classList.replace('bg-indigo-100', 'bg-white');
          toggleBtn.classList.replace('text-indigo-700', 'text-black');
          toggleBtn.setAttribute('data-tooltip', 'Multi-value export: stacked in one cell (click to split into columns)');
          iconStack && iconStack.classList.remove('hidden');
          iconCols  && iconCols.classList.add('hidden');
          window.showToastMessage && window.showToastMessage('Multi-values stacked in one cell', 'info');
        }

        // Drive the virtual table to match
        if (window.VirtualTable && window.VirtualTable.setSplitColumnsMode) {
          window.VirtualTable.setSplitColumnsMode(splitMultiValues);
        }
      });

      // Called by VirtualTable when new data is loaded so the button resets visually
      window.resetSplitColumnsToggleUI = function() {
        splitMultiValues = false;
        toggleBtn.classList.replace('bg-indigo-100', 'bg-white');
        if (!toggleBtn.classList.contains('bg-white')) toggleBtn.classList.add('bg-white');
        toggleBtn.classList.remove('text-indigo-700');
        if (!toggleBtn.classList.contains('text-black')) toggleBtn.classList.add('text-black');
        toggleBtn.setAttribute('data-tooltip', 'Multi-value export: stacked in one cell (click to split into columns)');
        const iconStack = document.getElementById('split-toggle-icon-stack');
        const iconCols  = document.getElementById('split-toggle-icon-cols');
        iconStack && iconStack.classList.remove('hidden');
        iconCols  && iconCols.classList.add('hidden');
      };
      
      // Make it possible to force it active externally
      window.setSplitColumnsToggleUIActive = function() {
        splitMultiValues = true;
        toggleBtn.classList.replace('bg-white', 'bg-indigo-100');
        if (!toggleBtn.classList.contains('bg-indigo-100')) toggleBtn.classList.add('bg-indigo-100');
        toggleBtn.classList.replace('text-black', 'text-indigo-700');
        if (!toggleBtn.classList.contains('text-indigo-700')) toggleBtn.classList.add('text-indigo-700');
        toggleBtn.setAttribute('data-tooltip', 'Multi-value export: split into separate columns (click to stack)');
        
        const iconStack = document.getElementById('split-toggle-icon-stack');
        const iconCols  = document.getElementById('split-toggle-icon-cols');
        iconStack && iconStack.classList.add('hidden');
        iconCols  && iconCols.classList.remove('hidden');
      };
    }
  }

  /**
   * Handles the download button click event.
   * Validates data availability, creates Excel workbook, and triggers download.
   * @function handleDownload
   * @memberof ExcelExporter
   */
  function handleDownload() {
    const downloadBtn = window.DOM?.downloadBtn || document.getElementById('download-btn');
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

    const tableNameInput = document.getElementById('table-name-input');
    const tableName = tableNameInput ? tableNameInput.value.trim() || 'Query Results' : 'Query Results';

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(tableName);

    worksheet.views = [{ state: 'frozen', ySplit: 1 }];

    // VirtualTable.setSplitColumnsMode() already expanded virtualTableData and
    // updated window.displayedFields when split mode is active, so we just read
    // from them directly — no separate column-expansion logic needed here.
    const virtualData = VirtualTable.virtualTableData;
    const dataRows = virtualData.rows;

    // Build a type lookup. For split columns like "Marc590 1", fall back to the
    // base field name ("Marc590") to find the type definition.
    const fieldTypeMap = new Map();
    displayedFields.forEach(field => {
      let def = window.fieldDefs && window.fieldDefs.get(field);
      if (!def) {
        // Strip trailing " N" suffix for split columns (e.g. "Marc590 1" → "Marc590")
        const baseName = field.replace(/ \d+$/, '');
        def = window.fieldDefs && window.fieldDefs.get(baseName);
      }
      fieldTypeMap.set(field, def ? def.type : 'string');
    });

    // Parse a raw YYYYMMDD integer (e.g. 20200914) into a JS Date.
    function parseSirsDate(raw) {
      const n = typeof raw === 'string' ? parseInt(raw, 10) : raw;
      if (!n || isNaN(n)) return null;
      const y = Math.floor(n / 10000);
      const m = Math.floor((n % 10000) / 100) - 1;
      const d = n % 100;
      const dt = new Date(y, m, d);
      return isNaN(dt.getTime()) ? null : dt;
    }

    // Build worksheet column widths
    worksheet.columns = displayedFields.map(field => {
      let maxLen = field.length;
      const colIndex = virtualData.columnMap.get(field);
      const type = fieldTypeMap.get(field);

      if (colIndex !== undefined) {
        dataRows.forEach(row => {
          let val = row[colIndex];
          if (val === undefined || val === null) return;
          if (type === 'date') val = '12/31/2000';
          else if (type === 'number' || type === 'money') val = String(val).replace(/[$,]/g, '');
          else val = String(val).replace(/\x1F/g, ' '); // flatten for length estimate
          maxLen = Math.max(maxLen, val.length);
        });
      }

      return { header: field, key: field, width: Math.max(4, Math.min(60, maxLen + 2)) };
    });

    // Build data rows
    const tableRows = [];
    dataRows.forEach(row => {
      const rowData = displayedFields.map(field => {
        const colIndex = virtualData.columnMap.get(field);
        const raw = (colIndex !== undefined) ? row[colIndex] : undefined;
        if (raw === undefined || raw === null) return '';

        const type = fieldTypeMap.get(field);

        if (type === 'date') {
          const dt = parseSirsDate(raw);
          return dt !== null ? dt : 'Never';
        }
        if (type === 'number' || type === 'money') {
          const n = typeof raw === 'number' ? raw : parseFloat(String(raw).replace(/[$,]/g, ''));
          return isNaN(n) ? '' : n;
        }
        // In stacked mode \x1F values become newlines; in split mode virtualTableData
        // already has individual values so \x1F won't be present.
        if (typeof raw === 'string' && raw.includes('\x1F')) {
          return raw.split('\x1F').join('\n');
        }
        return raw;
      });
      tableRows.push(rowData);
    });

    // Apply column formatting
    displayedFields.forEach((field, idx) => {
      const column = worksheet.getColumn(idx + 1);
      const type = fieldTypeMap.get(field);

      if (type === 'date') {
        column.numFmt = 'mm/dd/yyyy';
        column.alignment = { horizontal: 'right' };
      } else if (type === 'number' || type === 'money') {
        const colIndex = virtualData.columnMap.get(field);
        const sample = colIndex !== undefined
          ? dataRows.map(r => r[colIndex]).find(v => v !== null && v !== undefined && v !== '')
          : null;
        if (type === 'money') {
          column.numFmt = '$#,##0.00';
        } else {
          const isDecimal = sample !== undefined && sample !== null && !Number.isInteger(
            typeof sample === 'number' ? sample : parseFloat(String(sample))
          );
          column.numFmt = isDecimal ? '#,##0.00' : '0';
        }
        column.alignment = { horizontal: 'right' };
      } else if (type === 'boolean') {
        column.alignment = { horizontal: 'center' };
      } else {
        // Wrap text only when in stacked mode and the column has multi-values
        const needsWrap = !splitMultiValues && (() => {
          const cIdx = virtualData.columnMap.get(field);
          if (cIdx === undefined) return false;
          return dataRows.some(r => r[cIdx] != null && typeof r[cIdx] === 'string' && r[cIdx].includes('\x1F'));
        })();
        column.alignment = { horizontal: 'left', wrapText: needsWrap };
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
