/**
 * Excel Exporter Module
 * Handles exporting table data to Excel files with proper formatting and type detection.
 * @module ExcelExporter
 */
import { appServices } from '../core/appServices.js';
import { showToastMessage } from '../core/toast.js';
import { QueryStateReaders } from '../core/queryState.js';
import { MoneyUtils, ValueFormatting } from '../core/utils.js';
import { VisibilityUtils } from '../core/visibility.js';
import { appRuntime } from '../core/appRuntime.js';

(() => {
  // When true, multi-value cells (delimited by \x1F) are split into separate columns
  // instead of being stacked as newlines in a single cell.
  // Synced with appRuntime.splitColumnsActive which virtualTable.js also reads.
  let splitMultiValues = false;
  let exportState = null;
  appRuntime.splitColumnsActive = false;

  const SHEET_NAME_LIMIT = 31;
  const MAX_GROUPED_SHEETS = 100;
  const { getDisplayedFields } = QueryStateReaders;
  const services = appServices;

  function getExportElements() {
    return {
      overlay: document.getElementById('export-overlay'),
      backdrop: document.getElementById('export-overlay-backdrop'),
      closeBtn: document.getElementById('export-overlay-close'),
      cancelBtn: document.getElementById('export-cancel-btn'),
      confirmBtn: document.getElementById('export-confirm-btn'),
      singleMode: document.getElementById('export-mode-single'),
      groupedMode: document.getElementById('export-mode-grouped'),
      groupPanel: document.getElementById('export-group-panel'),
      groupField: document.getElementById('export-group-field'),
      preview: document.getElementById('export-group-preview'),
      summaryName: document.getElementById('export-summary-name'),
      summaryRows: document.getElementById('export-summary-rows'),
      summaryColumns: document.getElementById('export-summary-columns'),
      summaryGroups: document.getElementById('export-summary-groups'),
      includeMasterSheet: document.getElementById('export-include-master-sheet'),
      includeOverviewSheet: document.getElementById('export-include-overview-sheet'),
      modeCards: Array.from(document.querySelectorAll('[data-export-mode-card]'))
    };
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

  function getWorkbookSourceData() {
    const displayedFields = getDisplayedFields();
    const virtualData = services.getVirtualTableData();
    if (!displayedFields.length || !virtualData?.rows?.length) {
      return null;
    }

    const dataRows = virtualData.rows;
    const fieldTypeMap = new Map();

    displayedFields.forEach(field => {
      let def = appRuntime.fieldDefs && appRuntime.fieldDefs.get(field);
      if (!def) {
        const baseName = field.replace(/ \d+$/, '');
        def = appRuntime.fieldDefs && appRuntime.fieldDefs.get(baseName);
      }
      fieldTypeMap.set(field, def ? def.type : 'string');
    });

    return {
      virtualData,
      dataRows,
      displayedFields: [...displayedFields],
      fieldTypeMap
    };
  }

  function getCellExportValue(raw, type) {
    if (raw === undefined || raw === null) return '';

    if (type === 'date') {
      const dt = appRuntime.CustomDatePicker && typeof appRuntime.CustomDatePicker.parseDateValue === 'function'
        ? appRuntime.CustomDatePicker.parseDateValue(raw)
        : null;
      return dt !== null ? dt : 'Never';
    }

    if (type === 'number' || type === 'money') {
      const n = type === 'money'
        ? MoneyUtils.parseNumber(raw)
        : (typeof raw === 'number' ? raw : parseFloat(String(raw).replace(/,/g, '')));
      return isNaN(n) ? '' : n;
    }

    if (typeof raw === 'string' && raw.includes('\x1F')) {
      return raw.split('\x1F').join('\n');
    }

    return raw;
  }

  function getGroupingDisplayValue(rawValue) {
    if (rawValue === undefined || rawValue === null || rawValue === '') {
      return 'Blank';
    }

    if (rawValue instanceof Date) {
      return appRuntime.CustomDatePicker && typeof appRuntime.CustomDatePicker.formatDisplayValue === 'function'
        ? appRuntime.CustomDatePicker.formatDisplayValue(rawValue, { fallbackToRaw: true, invalidValue: 'Blank' })
        : rawValue.toLocaleDateString();
    }

    if (typeof rawValue === 'boolean') {
      return rawValue ? 'True' : 'False';
    }

    const text = String(rawValue).replace(/\n+/g, ' / ').trim();
    return text || 'Blank';
  }

  function buildExportRows(sourceData) {
    return sourceData.dataRows.map(row => {
      const values = sourceData.displayedFields.map(field => {
        const colIndex = sourceData.virtualData.columnMap.get(field);
        const raw = colIndex !== undefined ? row[colIndex] : undefined;
        const type = sourceData.fieldTypeMap.get(field);
        return getCellExportValue(raw, type);
      });

      return {
        values,
        rawRow: row
      };
    });
  }

  function buildGroupingCandidates(sourceData, exportedRows) {
    const candidates = sourceData.displayedFields.map((field, index) => {
      const counts = new Map();

      exportedRows.forEach(row => {
        const displayValue = getGroupingDisplayValue(row.values[index]);
        counts.set(displayValue, (counts.get(displayValue) || 0) + 1);
      });

      return {
        field,
        index,
        distinctCount: counts.size,
        counts
      };
    }).filter(candidate => candidate.distinctCount > 1 && candidate.distinctCount <= MAX_GROUPED_SHEETS);

    candidates.sort((left, right) => {
      if (left.distinctCount !== right.distinctCount) {
        return left.distinctCount - right.distinctCount;
      }

      return left.field.localeCompare(right.field);
    });

    return candidates;
  }

  function buildExportState() {
    const sourceData = getWorkbookSourceData();
    if (!sourceData) {
      return null;
    }

    const tableName = appRuntime.QueryUI?.ensureTableName?.()
      || appRuntime.QueryUI?.getDefaultTableName?.()
      || 'Query Results';

    const exportedRows = buildExportRows(sourceData);
    const groupingCandidates = buildGroupingCandidates(sourceData, exportedRows);

    return {
      sourceData,
      tableName,
      exportedRows,
      groupingCandidates,
      selectedGroupingField: groupingCandidates[0]?.field || ''
    };
  }

  function setModeCardState(elements, mode) {
    elements.modeCards.forEach(card => {
      card.classList.toggle('export-mode-card--active', card.dataset.exportModeCard === mode);
    });
  }

  function updateExportSummary(elements) {
    if (!exportState) {
      return;
    }

    if (elements.summaryName) {
      elements.summaryName.textContent = exportState.tableName;
    }
    if (elements.summaryRows) {
      elements.summaryRows.textContent = exportState.exportedRows.length.toLocaleString();
    }
    if (elements.summaryColumns) {
      elements.summaryColumns.textContent = exportState.sourceData.displayedFields.length.toLocaleString();
    }
    if (elements.summaryGroups) {
      elements.summaryGroups.textContent = exportState.groupingCandidates.length.toLocaleString();
    }
  }

  function updateExportPreview(elements) {
    if (!exportState || !elements.preview) {
      return;
    }

    const groupedModeActive = !!elements.groupedMode?.checked;
    const candidate = exportState.groupingCandidates.find(item => item.field === exportState.selectedGroupingField);

    if (!groupedModeActive) {
      elements.preview.textContent = `${exportState.exportedRows.length.toLocaleString()} rows into 1 sheet.`;
      return;
    }

    if (!candidate) {
      elements.preview.textContent = 'No eligible displayed fields are available for sheet grouping yet.';
      return;
    }

    let sheetCount = candidate.distinctCount;
    const extras = [];

    if (elements.includeMasterSheet?.checked) {
      sheetCount += 1;
      extras.push('All Results');
    }

    if (elements.includeOverviewSheet?.checked) {
      sheetCount += 1;
      extras.push('Overview');
    }

    const descriptor = extras.length ? `plus ${extras.join(' and ')}` : 'group sheets only';
    elements.preview.textContent = `${candidate.distinctCount.toLocaleString()} grouped sheet${candidate.distinctCount === 1 ? '' : 's'} from ${candidate.field} (${descriptor}, ${sheetCount.toLocaleString()} total tab${sheetCount === 1 ? '' : 's'}).`;
  }

  function renderGroupingOptions(elements) {
    if (!elements.groupField) {
      return;
    }

    const candidates = exportState?.groupingCandidates || [];
    elements.groupField.innerHTML = '';

    if (!candidates.length) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'No displayed field currently supports grouping';
      elements.groupField.appendChild(option);
      elements.groupField.disabled = true;
      return;
    }

    candidates.forEach(candidate => {
      const option = document.createElement('option');
      option.value = candidate.field;
      option.textContent = `${candidate.field} (${candidate.distinctCount.toLocaleString()} sheet${candidate.distinctCount === 1 ? '' : 's'})`;
      elements.groupField.appendChild(option);
    });

    elements.groupField.disabled = false;
    elements.groupField.value = exportState.selectedGroupingField || candidates[0].field;
  }

  function updateExportModeUI(elements) {
    const groupedModeActive = !!elements.groupedMode?.checked;
    setModeCardState(elements, groupedModeActive ? 'grouped' : 'single');

    if (elements.groupPanel) {
      elements.groupPanel.classList.toggle('is-disabled', !groupedModeActive);
      elements.groupPanel.setAttribute('aria-disabled', groupedModeActive ? 'false' : 'true');
    }

    if (elements.groupField) {
      const noCandidates = !exportState?.groupingCandidates?.length;
      elements.groupField.disabled = !groupedModeActive || noCandidates;
    }

    if (elements.includeMasterSheet) {
      elements.includeMasterSheet.disabled = !groupedModeActive;
    }

    if (elements.includeOverviewSheet) {
      elements.includeOverviewSheet.disabled = !groupedModeActive;
    }

    if (elements.confirmBtn) {
      elements.confirmBtn.disabled = groupedModeActive && !exportState?.selectedGroupingField;
    }

    updateExportPreview(elements);
  }

  function openExportOverlay() {
    exportState = buildExportState();
    if (!exportState) {
      return;
    }

    const elements = getExportElements();
    if (!elements.overlay) {
      runWorkbookExport({ mode: 'single' }).catch(error => {
        console.error('Failed to export workbook', error);
        showToastMessage('Could not generate the Excel file', 'error');
      });
      return;
    }

    renderGroupingOptions(elements);
    updateExportSummary(elements);

    if (elements.singleMode) {
      const hasGrouping = exportState.groupingCandidates.length > 0;
      elements.singleMode.checked = true;
      if (elements.groupedMode) {
        elements.groupedMode.checked = false;
        elements.groupedMode.disabled = !hasGrouping;
      }
    }

    if (elements.groupField) {
      elements.groupField.value = exportState.selectedGroupingField;
    }

    VisibilityUtils.show([elements.overlay], {
      ariaHidden: false,
      bodyClass: 'export-overlay-open',
      raisedUiKey: 'export-overlay'
    });

    updateExportModeUI(elements);

    const focusTarget = elements.groupedMode?.checked && !elements.groupField?.disabled
      ? elements.groupField
      : elements.confirmBtn;
    window.requestAnimationFrame(() => focusTarget?.focus());
  }

  function closeExportOverlay() {
    const elements = getExportElements();
    if (!VisibilityUtils.isVisible(elements.overlay)) {
      return;
    }

    VisibilityUtils.hide([elements.overlay], {
      ariaHidden: true,
      bodyClass: 'export-overlay-open',
      raisedUiKey: 'export-overlay'
    });
  }

  function triggerWorkbookDownload(buffer, filename) {
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  }

  function configureWorksheetColumns(worksheet, sourceData, rowsToExport) {
    worksheet.columns = sourceData.displayedFields.map(field => {
      let maxLen = field.length;
      const colIndex = sourceData.virtualData.columnMap.get(field);
      const type = sourceData.fieldTypeMap.get(field);

      if (colIndex !== undefined) {
        rowsToExport.forEach(row => {
          let val = row[colIndex];
          if (val === undefined || val === null) return;
          if (type === 'date') val = '12/31/2000';
          else if (type === 'number' || type === 'money') {
            const parsedNumericValue = type === 'money'
              ? MoneyUtils.parseNumber(val)
              : (typeof val === 'number' ? val : parseFloat(String(val).replace(/,/g, '')));
            if (Number.isNaN(parsedNumericValue)) return;
            val = String(parsedNumericValue);
          }
          else val = String(val).replace(/\x1F/g, ' ');
          maxLen = Math.max(maxLen, val.length);
        });
      }

      return { header: field, key: field, width: Math.max(4, Math.min(60, maxLen + 2)) };
    });
  }

  function applyWorksheetFormatting(worksheet, sourceData, rowsToExport) {
    sourceData.displayedFields.forEach((field, idx) => {
      const column = worksheet.getColumn(idx + 1);
      const type = sourceData.fieldTypeMap.get(field);

      if (type === 'date') {
        column.numFmt = 'mm/dd/yyyy';
        column.alignment = { horizontal: 'right' };
      } else if (type === 'number' || type === 'money') {
        const numberFormat = ValueFormatting.getNumberFormat(field) || '';
        const colIndex = sourceData.virtualData.columnMap.get(field);
        const sample = colIndex !== undefined
          ? rowsToExport.map(r => r[colIndex]).find(v => v !== null && v !== undefined && v !== '')
          : null;
        if (type === 'money') {
          column.numFmt = '$#,##0.00';
        } else if (numberFormat === 'year') {
          column.numFmt = '0';
        } else {
          const isDecimal = sample !== undefined && sample !== null && !Number.isInteger(
            typeof sample === 'number' ? sample : parseFloat(String(sample))
          );
          column.numFmt = isDecimal ? '#,##0.00' : '#,##0';
        }
        column.alignment = { horizontal: 'right' };
      } else if (type === 'boolean') {
        column.alignment = { horizontal: 'center' };
      } else {
        const needsWrap = !splitMultiValues && (() => {
          const cIdx = sourceData.virtualData.columnMap.get(field);
          if (cIdx === undefined) return false;
          return rowsToExport.some(r => r[cIdx] != null && typeof r[cIdx] === 'string' && r[cIdx].includes('\x1F'));
        })();
        column.alignment = { horizontal: 'left', wrapText: needsWrap };
      }
    });
  }

  function addWorksheetTable(worksheet, sourceData, exportedRows, tableBaseName) {
    worksheet.views = [{ state: 'frozen', ySplit: 1 }];
    configureWorksheetColumns(worksheet, sourceData, exportedRows.map(row => row.rawRow));

    const tableRows = exportedRows.map(row => row.values);
    applyWorksheetFormatting(worksheet, sourceData, exportedRows.map(row => row.rawRow));

    const safeTableName = tableBaseName.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 240) || 'Query_Results';
    worksheet.addTable({
      name: safeTableName,
      ref: 'A1',
      headerRow: true,
      style: { theme: 'TableStyleMedium4', showRowStripes: true },
      columns: sourceData.displayedFields.map(field => ({ name: field, filterButton: true })),
      rows: tableRows
    });

    worksheet.getRow(1).eachCell(cell => {
      cell.alignment = {
        ...(cell.alignment || {}),
        horizontal: 'center',
        vertical: 'middle'
      };
    });
  }

  function addOverviewWorksheet(workbook, groups, groupField, usedNames) {
    const overviewSheet = workbook.addWorksheet(getUniqueSheetName('Overview', usedNames));
    overviewSheet.views = [{ state: 'frozen', ySplit: 1 }];
    overviewSheet.columns = [
      { header: groupField, key: 'group', width: 26 },
      { header: 'Rows', key: 'count', width: 12 }
    ];
    overviewSheet.addTable({
      name: `Overview_${Date.now()}`,
      ref: 'A1',
      headerRow: true,
      style: { theme: 'TableStyleMedium2', showRowStripes: true },
      columns: [{ name: groupField, filterButton: true }, { name: 'Rows', filterButton: true }],
      rows: groups.map(group => [group.label, group.rows.length])
    });
    overviewSheet.getColumn(2).alignment = { horizontal: 'right' };
  }

  async function runWorkbookExport(config) {
    const state = exportState || buildExportState();
    if (!state) {
      return;
    }

    const workbook = new ExcelJS.Workbook();
    const usedNames = new Set();

    if (config.mode === 'grouped') {
      const candidate = state.groupingCandidates.find(item => item.field === config.groupField);
      if (!candidate) {
        throw new Error('A grouping field is required for grouped export');
      }

      const groups = Array.from(candidate.counts.keys()).map(label => ({
        label,
        rows: state.exportedRows.filter(row => getGroupingDisplayValue(row.values[candidate.index]) === label)
      })).sort((left, right) => left.label.localeCompare(right.label, undefined, { numeric: true, sensitivity: 'base' }));

      if (config.includeMasterSheet) {
        const masterSheetName = getUniqueSheetName('All Results', usedNames);
        addWorksheetTable(workbook.addWorksheet(masterSheetName), state.sourceData, state.exportedRows, `${state.tableName}_AllResults`);
      }

      if (config.includeOverviewSheet) {
        addOverviewWorksheet(workbook, groups, candidate.field, usedNames);
      }

      groups.forEach(group => {
        const sheetName = getUniqueSheetName(group.label, usedNames);
        addWorksheetTable(workbook.addWorksheet(sheetName), state.sourceData, group.rows, `${state.tableName}_${group.label}`);
      });
    } else {
      const sheetName = getUniqueSheetName(state.tableName, usedNames);
      addWorksheetTable(workbook.addWorksheet(sheetName), state.sourceData, state.exportedRows, state.tableName);
    }

    const safeFileName = state.tableName.replace(/[^a-zA-Z0-9\-_\s]/g, '').replace(/\s+/g, '-');
    const suffix = config.mode === 'grouped' && config.groupField
      ? `-by-${config.groupField.replace(/[^a-zA-Z0-9\-_\s]/g, '').trim().replace(/\s+/g, '-')}`
      : '';
    const filename = `${safeFileName || 'Query-Results'}${suffix}.xlsx`;
    const buffer = await workbook.xlsx.writeBuffer();
    triggerWorkbookDownload(buffer, filename);
  }

  async function confirmExportFromOverlay() {
    const elements = getExportElements();
    const groupedModeActive = !!elements.groupedMode?.checked;

    const config = groupedModeActive
      ? {
          mode: 'grouped',
          groupField: elements.groupField?.value || exportState?.selectedGroupingField || '',
          includeMasterSheet: !!elements.includeMasterSheet?.checked,
          includeOverviewSheet: !!elements.includeOverviewSheet?.checked
        }
      : { mode: 'single' };

    if (config.mode === 'grouped' && !config.groupField) {
      showToastMessage('Choose a field to split sheets by', 'warning');
      return;
    }

    const confirmBtn = elements.confirmBtn;
    if (confirmBtn) {
      confirmBtn.disabled = true;
      confirmBtn.textContent = 'Preparing...';
    }

    try {
      await runWorkbookExport(config);
      closeExportOverlay();
      showToastMessage(
        config.mode === 'grouped'
          ? `Workbook downloaded with sheets grouped by ${config.groupField}`
          : 'Workbook downloaded',
        'success'
      );
    } catch (error) {
      console.error('Failed to export workbook', error);
      showToastMessage('Could not generate the Excel file', 'error');
    } finally {
      if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Download';
      }
    }
  }

  function attachExportOverlayListeners() {
    const elements = getExportElements();
    if (!elements.overlay) {
      return;
    }

    elements.backdrop?.addEventListener('click', closeExportOverlay);
    elements.closeBtn?.addEventListener('click', closeExportOverlay);
    elements.cancelBtn?.addEventListener('click', closeExportOverlay);
    elements.confirmBtn?.addEventListener('click', () => {
      confirmExportFromOverlay();
    });

    elements.singleMode?.addEventListener('change', () => updateExportModeUI(elements));
    elements.groupedMode?.addEventListener('change', () => updateExportModeUI(elements));
    elements.includeMasterSheet?.addEventListener('change', () => updateExportPreview(elements));
    elements.includeOverviewSheet?.addEventListener('change', () => updateExportPreview(elements));
    elements.groupField?.addEventListener('change', event => {
      exportState.selectedGroupingField = event.target.value;
      updateExportPreview(elements);
    });

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        closeExportOverlay();
      }
    });
  }

  function getSplitEligibleSummary() {
    const rawData = services.getRawTableData();
    if (!rawData || !Array.isArray(rawData.headers) || !Array.isArray(rawData.rows) || rawData.headers.length === 0 || rawData.rows.length === 0) {
      return { eligible: false, columnCount: 0, valueCount: 0 };
    }

    let columnCount = 0;
    let valueCount = 0;

    rawData.headers.forEach((field, columnIndex) => {
      let fieldHasMultiValues = false;

      rawData.rows.forEach(row => {
        const raw = row[columnIndex];
        if (typeof raw === 'string' && raw.includes('\x1F')) {
          fieldHasMultiValues = true;
          valueCount += raw.split('\x1F').filter(part => part !== '').length - 1;
        }
      });

      if (fieldHasMultiValues) {
        columnCount += 1;
      }
    });

    return {
      eligible: columnCount > 0,
      columnCount,
      valueCount
    };
  }

  function buildSplitToggleTooltipHtml(active, summary) {
    const title = active ? 'Multi-Value Export: Split Columns' : 'Multi-Value Export: Stacked Cells';
    const stateLine = active
      ? 'Values are currently expanded into numbered columns for export.'
      : 'Values are currently kept together inside a single export cell.';
    const actionLine = summary.eligible
      ? (active ? 'Click to compact them back into one cell per field.' : 'Click to expand them into separate numbered columns.')
      : 'No current result columns contain multi-value data to expand or compact.';
    const statsLine = summary.eligible
      ? `${summary.columnCount} column${summary.columnCount === 1 ? '' : 's'} can change layout${summary.valueCount > 0 ? `, affecting ${summary.valueCount} extra value${summary.valueCount === 1 ? '' : 's'}` : ''}.`
      : 'Run or load results that include multi-value fields such as MARC or repeated entries.';

    return `<div class="split-toggle-tooltip"><div class="tt-filter-container"><div class="tt-filter-title" style="color: #93c5fd; display: flex; align-items: center; gap: 6px;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="18" rx="1"></rect><rect x="14" y="3" width="7" height="18" rx="1"></rect></svg>${title}</div><div style="color: #f8fafc; font-size: 0.95rem; line-height: 1.4; padding-top: 2px;">${stateLine}</div><div style="color: #cbd5e1; font-size: 0.84rem; line-height: 1.45; padding-top: 8px;">${actionLine}</div><div style="color: #94a3b8; font-size: 0.8rem; line-height: 1.45; padding-top: 8px;">${statsLine}</div></div></div>`;
  }

  function applySplitToggleVisualState(toggleBtn, active, eligible) {
    const iconStack = document.getElementById('split-toggle-icon-stack');
    const iconCols  = document.getElementById('split-toggle-icon-cols');

    if (active) {
      toggleBtn.classList.replace('bg-white', 'bg-indigo-100');
      toggleBtn.classList.replace('text-black', 'text-indigo-700');
      iconStack && iconStack.classList.add('hidden');
      iconCols  && iconCols.classList.remove('hidden');
    } else {
      toggleBtn.classList.replace('bg-indigo-100', 'bg-white');
      if (!toggleBtn.classList.contains('bg-white')) toggleBtn.classList.add('bg-white');
      toggleBtn.classList.replace('text-indigo-700', 'text-black');
      if (!toggleBtn.classList.contains('text-black')) toggleBtn.classList.add('text-black');
      iconStack && iconStack.classList.remove('hidden');
      iconCols  && iconCols.classList.add('hidden');
    }

    toggleBtn.setAttribute('aria-disabled', eligible ? 'false' : 'true');
    toggleBtn.classList.toggle('split-toggle-disabled', !eligible);
  }

  function updateSplitColumnsToggleState() {
    const toggleBtn = document.getElementById('split-columns-toggle');
    if (!toggleBtn) return;

    const summary = getSplitEligibleSummary();
    if (!summary.eligible) {
      splitMultiValues = false;
      appRuntime.splitColumnsActive = false;
    }

    applySplitToggleVisualState(toggleBtn, splitMultiValues, summary.eligible);
    toggleBtn.removeAttribute('data-tooltip');
    toggleBtn.setAttribute('data-tooltip-html', buildSplitToggleTooltipHtml(splitMultiValues, summary));
  }
  appRuntime.updateSplitColumnsToggleState = updateSplitColumnsToggleState;

  /**
   * Attaches the download and toggle event listeners.
   * @function attach
   * @memberof ExcelExporter
   */
  function attach() {
    const downloadBtn = appRuntime.DOM?.downloadBtn || document.getElementById('download-btn');
    if (downloadBtn) {
      downloadBtn.addEventListener('click', handleDownload);
    }

    attachExportOverlayListeners();

    const toggleBtn = document.getElementById('split-columns-toggle');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        const summary = getSplitEligibleSummary();
        if (!summary.eligible) {
          updateSplitColumnsToggleState();
          return;
        }

        splitMultiValues = !splitMultiValues;

        if (splitMultiValues) {
          showToastMessage('Multi-values split into separate columns', 'info');
        } else {
          showToastMessage('Multi-values stacked in one cell', 'info');
        }

        updateSplitColumnsToggleState();

        // Drive the virtual table to match
        services.setSplitColumnsMode(splitMultiValues);
      });

      // Called by VirtualTable when new data is loaded so the button resets visually
      appRuntime.resetSplitColumnsToggleUI = function() {
        splitMultiValues = false;
        updateSplitColumnsToggleState();
      };
      
      // Make it possible to force it active externally
      appRuntime.setSplitColumnsToggleUIActive = function() {
        splitMultiValues = true;
        updateSplitColumnsToggleState();
      };

      updateSplitColumnsToggleState();
    }
  }

  /**
   * Handles the download button click event.
   * Validates data availability, creates Excel workbook, and triggers download.
   * @function handleDownload
   * @memberof ExcelExporter
   */
  function handleDownload() {
    const downloadBtn = appRuntime.DOM?.downloadBtn || document.getElementById('download-btn');
    if (!downloadBtn) return;
    const missingLoadedColumns = appRuntime.QueryUI && typeof appRuntime.QueryUI.getDisplayedFieldsMissingFromLoadedData === 'function'
      ? appRuntime.QueryUI.getDisplayedFieldsMissingFromLoadedData()
      : [];

    // Check if button is disabled and show message
    if (downloadBtn.disabled) {
      const displayedFields = getDisplayedFields();
      const hasData = displayedFields.length > 0 && services.getVirtualTableRows().length > 0;

      let messageText = '';
      if (!hasData) {
        messageText = 'Add columns to download';
      } else if (missingLoadedColumns.length > 0) {
        messageText = missingLoadedColumns.length === 1
          ? `${missingLoadedColumns[0]} is not in the current data. Run a new query before downloading.`
          : 'Some displayed columns are not in the current data. Run a new query before downloading.';
      }

      if (messageText) {
        showToastMessage(messageText, 'warning');
      }
      return;
    }

    const displayedFields = getDisplayedFields();
    if (!displayedFields.length || services.getVirtualTableRows().length === 0 || missingLoadedColumns.length > 0) {
      return;
    }

    openExportOverlay();
  }

  attach();
  return { download: handleDownload };
})();
