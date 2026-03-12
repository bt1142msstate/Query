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
    const downloadBtn = document.getElementById('download-btn');
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

    const tableNameInput = document.getElementById('table-name-input');
    const tableName = tableNameInput ? tableNameInput.value.trim() || 'Query Results' : 'Query Results';

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(tableName);

    worksheet.views = [{ state: 'frozen', ySplit: 1 }];

    // Access the virtual table data
    const virtualData = VirtualTable.virtualTableData;
    const dataRows = virtualData.rows;

    // Build a type lookup from fieldDefs for all displayed fields
    const fieldTypeMap = new Map();
    displayedFields.forEach(field => {
      const def = window.fieldDefs && window.fieldDefs.get(field);
      fieldTypeMap.set(field, def ? def.type : 'string');
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

    // Coerce a raw value to its typed export value (date object, number, or string).
    function coerceValue(raw, type) {
      if (raw === undefined || raw === null || raw === '') return '';

      if (type === 'date') {
        const dt = parseSirsDate(raw);
        return dt !== null ? dt : 'Never';
      }
      if (type === 'number') {
        const n = typeof raw === 'number' ? raw : parseFloat(String(raw).replace(/[$,]/g, ''));
        return isNaN(n) ? '' : n;
      }
      return raw;
    }

    // -------------------------------------------------------------------------
    // Build the expanded column list.
    // For fields that contain \x1F multi-values AND splitMultiValues is on,
    // we replace the single column with N numbered columns where N = the max
    // number of values found across all rows for that field.
    // -------------------------------------------------------------------------

    // Maps original field name → max number of \x1F-delimited values in any row.
    const multiMaxCount = new Map();

    if (splitMultiValues) {
      displayedFields.forEach(field => {
        const colIndex = virtualData.columnMap.get(field);
        if (colIndex === undefined) return;
        let max = 1;
        dataRows.forEach(row => {
          const raw = row[colIndex];
          if (raw != null && typeof raw === 'string' && raw.includes('\x1F')) {
            const count = raw.split('\x1F').length;
            if (count > max) max = count;
          }
        });
        if (max > 1) multiMaxCount.set(field, max);
      });
    }

    // Flatten displayedFields into the final export columns array.
    // Each entry: { header, sourceField, valueIndex (null = single, 0-based for split) }
    const exportCols = [];
    displayedFields.forEach(field => {
      const max = multiMaxCount.get(field);
      if (max !== undefined) {
        for (let i = 0; i < max; i++) {
          exportCols.push({ header: `${field} ${i + 1}`, sourceField: field, valueIndex: i });
        }
      } else {
        exportCols.push({ header: field, sourceField: field, valueIndex: null });
      }
    });

    // Build worksheet column widths
    worksheet.columns = exportCols.map(col => {
      let maxLen = col.header.length;
      const colIndex = virtualData.columnMap.get(col.sourceField);
      const type = fieldTypeMap.get(col.sourceField);

      if (colIndex !== undefined) {
        dataRows.forEach(row => {
          let raw = row[colIndex];
          if (raw === undefined || raw === null) return;

          // If split mode & this is a multi-value col, pull the specific slice
          if (col.valueIndex !== null && typeof raw === 'string' && raw.includes('\x1F')) {
            const parts = raw.split('\x1F');
            raw = parts[col.valueIndex] ?? '';
          }

          let val;
          if (type === 'date') val = '12/31/2000';
          else if (type === 'number') val = String(raw).replace(/[$,]/g, '');
          else val = String(raw);

          maxLen = Math.max(maxLen, val.length);
        });
      }

      return { header: col.header, key: col.header, width: Math.max(4, Math.min(60, maxLen + 2)) };
    });

    // Build data rows
    const tableRows = [];
    dataRows.forEach(row => {
      const rowData = exportCols.map(col => {
        const colIndex = virtualData.columnMap.get(col.sourceField);
        let raw = (colIndex !== undefined) ? row[colIndex] : undefined;

        if (raw === undefined || raw === null) return '';

        const type = fieldTypeMap.get(col.sourceField);
        const isMulti = typeof raw === 'string' && raw.includes('\x1F');

        if (col.valueIndex !== null) {
          // Split-column mode: pull only the value at this index
          const parts = isMulti ? raw.split('\x1F') : [raw];
          raw = parts[col.valueIndex] ?? '';
          return coerceValue(raw, type);
        }

        // Single-column mode
        if (isMulti) {
          // Stacked newlines in one cell
          return raw.split('\x1F').join('\n');
        }
        return coerceValue(raw, type);
      });
      tableRows.push(rowData);
    });

    // Apply column formatting after columns are defined
    exportCols.forEach((col, idx) => {
      const column = worksheet.getColumn(idx + 1);
      const type = fieldTypeMap.get(col.sourceField);
      const isMultiCol = col.valueIndex !== null || (!splitMultiValues && multiMaxCount.size === 0 && col.header.startsWith('Marc'));

      if (type === 'date') {
        column.numFmt = 'mm/dd/yyyy';
        column.alignment = { horizontal: 'right' };
      } else if (type === 'number') {
        const colIndex = virtualData.columnMap.get(col.sourceField);
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
        // Wrap text for stacked multi-value cells (not needed when split into separate cols)
        const needsWrap = !splitMultiValues && (() => {
          const cIdx = virtualData.columnMap.get(col.sourceField);
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
      columns: exportCols.map(c => ({ name: c.header, filterButton: true })),
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
