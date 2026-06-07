import { appServices } from '../../../core/appServices.js';
import { registerAppUiActionDependencies } from '../../../core/appUiActions.js';
import { showToastMessage } from '../../../core/toast.js';
import { QueryStateReaders } from '../../../core/queryState.js';
import { MoneyUtils } from '../../../core/formatting/moneyUtils.js';
import { ValueFormatting } from '../../../core/formatting/valueFormatting.js';
import { VisibilityUtils } from '../../../core/visibility.js';
import { QueryUI } from '../../../ui/queryUI.js';
import { fieldDefs } from '../../filters/fieldDefs.js';
import { DOM } from '../../../core/domCache.js';
import { alignDateTextCells } from './excelDateCellFormatting.js';
import { ExcelExportProgress, yieldToBrowser } from './exportProgress.js';
import { addOverviewWorksheet } from './excelOverviewWorksheet.js';
import { exportLargeWorkbook, shouldUseLargeWorkbookExport } from './largeWorkbookExport.js';
import { getMultiValueTableSummary, materializeExpandedRow } from '../virtual-table/splitColumnExpansion.js';
import { addWorkbookDetailsWorksheet, buildWorkbookDetailsRowsFromRuntime } from './workbookDetails.js';
import { buildWorkbookFilename, notifyWorkbookDownloadComplete, prepareWorkbookDownloadNotification, triggerWorkbookDownload } from './workbookDownload.js';
import {
  buildExportRows,
  buildGroupingCandidates,
  getCellExportValue,
  getGroupingDisplayValue,
  getUniqueSheetName
} from './workbookExportData.js';
(() => {
  // When true, multi-value cells (delimited by \x1F) are split into separate columns
  // instead of being stacked as newlines in a single cell.
  let splitMultiValues = false;
  let exportState = null;
  let exportInProgress = false;
  let exportOverlayPreparing = false;
  let exportOverlayHydrationId = 0;
  let splitEligibleSummaryCache = {
    rawData: null,
    summary: null
  };
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
      includeRunDetailsSheet: document.getElementById('export-include-run-details-sheet'),
      modeCards: Array.from(document.querySelectorAll('[data-export-mode-card]'))
    };
  }

  function getWorkbookSourceData() {
    const displayedFields = getDisplayedFields();
    const virtualData = services.getVirtualTableData();
    if (!displayedFields.length || !virtualData?.rows?.length) {
      return null;
    }

    const dataRows = services.isSplitColumnsActive?.()
      ? virtualData.rows.map(materializeExpandedRow)
      : virtualData.rows;
    const exportVirtualData = dataRows === virtualData.rows
      ? virtualData
      : {
          ...virtualData,
          rows: dataRows
        };
    const fieldTypeMap = new Map();

    displayedFields.forEach(field => {
      let def = fieldDefs && fieldDefs.get(field);
      if (!def) {
        const baseName = field.replace(/ \d+$/, '');
        def = fieldDefs && fieldDefs.get(baseName);
      }
      fieldTypeMap.set(field, def ? def.type : 'string');
    });

    return {
      virtualData: exportVirtualData,
      dataRows,
      displayedFields: [...displayedFields],
      fieldTypeMap
    };
  }

  function buildExportState() {
    const sourceData = getWorkbookSourceData();
    if (!sourceData) {
      return null;
    }

    const tableName = QueryUI.ensureTableName?.()
      || QueryUI.getDefaultTableName?.()
      || 'Query Results';

    const rowCount = sourceData.dataRows.length;
    const groupingCandidates = buildGroupingCandidates(sourceData);

    return {
      sourceData,
      tableName,
      rowCount,
      groupingCandidates,
      selectedGroupingField: groupingCandidates[0]?.field || ''
    };
  }

  function buildQuickExportSnapshot() {
    const displayedFields = getDisplayedFields();
    const virtualData = services.getVirtualTableData();
    const rowCount = virtualData?.rows?.length || services.getVirtualTableRows?.()?.length || 0;
    const tableName = QueryUI.ensureTableName?.()
      || QueryUI.getDefaultTableName?.()
      || 'Query Results';

    return {
      columnCount: displayedFields.length,
      rowCount,
      tableName
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
      elements.summaryRows.textContent = exportState.rowCount.toLocaleString();
    }
    if (elements.summaryColumns) {
      elements.summaryColumns.textContent = exportState.sourceData.displayedFields.length.toLocaleString();
    }
    if (elements.summaryGroups) {
      elements.summaryGroups.textContent = exportState.groupingCandidates.length.toLocaleString();
    }
  }

  function updateExportPreview(elements) {
    if (!elements.preview) {
      return;
    }

    if (exportOverlayPreparing || !exportState) {
      elements.preview.textContent = 'Preparing export options...';
      return;
    }

    const groupedModeActive = !!elements.groupedMode?.checked;
    const candidate = exportState.groupingCandidates.find(item => item.field === exportState.selectedGroupingField);

    if (!groupedModeActive) {
      elements.preview.textContent = `${exportState.rowCount.toLocaleString()} rows into 1 sheet.`;
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

    if (elements.includeRunDetailsSheet?.checked) {
      sheetCount += 1;
      extras.push('Run Details');
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

  function renderPreparingGroupingOptions(elements) {
    if (!elements.groupField) {
      return;
    }

    elements.groupField.innerHTML = '';
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'Preparing grouping fields...';
    elements.groupField.appendChild(option);
    elements.groupField.disabled = true;
  }

  function renderPreparingExportOverlay(elements, snapshot) {
    exportState = null;
    exportOverlayPreparing = true;

    if (elements.summaryName) {
      elements.summaryName.textContent = snapshot.tableName;
    }
    if (elements.summaryRows) {
      elements.summaryRows.textContent = snapshot.rowCount.toLocaleString();
    }
    if (elements.summaryColumns) {
      elements.summaryColumns.textContent = snapshot.columnCount.toLocaleString();
    }
    if (elements.summaryGroups) {
      elements.summaryGroups.textContent = 'Preparing';
    }
    if (elements.singleMode) {
      elements.singleMode.checked = true;
    }
    if (elements.groupedMode) {
      elements.groupedMode.checked = false;
      elements.groupedMode.disabled = true;
    }
    if (elements.includeRunDetailsSheet) {
      elements.includeRunDetailsSheet.checked = false;
    }

    renderPreparingGroupingOptions(elements);
    updateExportModeUI(elements);
  }

  function updateExportModeUI(elements) {
    const preparing = exportOverlayPreparing || !exportState;
    const hasGrouping = !!exportState?.groupingCandidates?.length;
    const groupedModeActive = !preparing && !!elements.groupedMode?.checked;
    setModeCardState(elements, groupedModeActive ? 'grouped' : 'single');

    if (elements.groupedMode) {
      elements.groupedMode.disabled = preparing || !hasGrouping;
      if (elements.groupedMode.disabled) {
        elements.groupedMode.checked = false;
      }
    }

    if (preparing && elements.singleMode) {
      elements.singleMode.checked = true;
    }

    if (elements.groupPanel) {
      elements.groupPanel.classList.toggle('is-disabled', !groupedModeActive);
      elements.groupPanel.setAttribute('aria-disabled', groupedModeActive ? 'false' : 'true');
    }

    if (elements.groupField) {
      elements.groupField.disabled = preparing || !groupedModeActive || !hasGrouping;
    }

    if (elements.includeMasterSheet) {
      elements.includeMasterSheet.disabled = !groupedModeActive;
    }

    if (elements.includeOverviewSheet) {
      elements.includeOverviewSheet.disabled = !groupedModeActive;
    }

    if (elements.confirmBtn) {
      elements.confirmBtn.disabled = preparing || (groupedModeActive && !exportState?.selectedGroupingField);
    }

    updateExportPreview(elements);
  }

  function scheduleExportOverlayHydration(hydrationId) {
    window.requestAnimationFrame(() => {
      window.setTimeout(() => {
        if (hydrationId !== exportOverlayHydrationId) {
          return;
        }

        const elements = getExportElements();
        if (!VisibilityUtils.isVisible(elements.overlay)) {
          return;
        }

        let nextState = null;
        try {
          nextState = buildExportState();
        } catch (error) {
          console.error('Failed to prepare export options', error);
          exportOverlayPreparing = false;
          updateExportModeUI(elements);
          showToastMessage('Could not prepare the Excel export options', 'error');
          return;
        }
        if (hydrationId !== exportOverlayHydrationId) {
          return;
        }
        if (!nextState) {
          exportOverlayPreparing = false;
          closeExportOverlay();
          showToastMessage('Add columns to download', 'warning');
          return;
        }

        exportState = nextState;
        exportOverlayPreparing = false;
        renderGroupingOptions(elements);
        updateExportSummary(elements);
        if (elements.groupField) {
          elements.groupField.value = exportState.selectedGroupingField;
        }
        updateExportModeUI(elements);
      }, 0);
    });
  }

  function openExportOverlay() {
    const elements = getExportElements();
    if (!elements.overlay) {
      exportState = buildExportState();
      if (!exportState) {
        return;
      }
      runWorkbookExport({ mode: 'single' }).catch(error => {
        console.error('Failed to export workbook', error);
        showToastMessage('Could not generate the Excel file', 'error');
      });
      return;
    }

    const snapshot = buildQuickExportSnapshot();
    renderPreparingExportOverlay(elements, snapshot);

    VisibilityUtils.show([elements.overlay], {
      ariaHidden: false,
      bodyClass: 'export-overlay-open',
      raisedUiKey: 'export-overlay'
    });

    const hydrationId = exportOverlayHydrationId += 1;
    scheduleExportOverlayHydration(hydrationId);
    const focusTarget = elements.confirmBtn;
    window.requestAnimationFrame(() => focusTarget?.focus());
  }

  function closeExportOverlay() {
    const elements = getExportElements();
    if (!VisibilityUtils.isVisible(elements.overlay)) {
      return;
    }
    if (exportInProgress) {
      showToastMessage('Excel export is still preparing', 'info');
      return;
    }

    VisibilityUtils.hide([elements.overlay], {
      ariaHidden: true,
      bodyClass: 'export-overlay-open',
      raisedUiKey: 'export-overlay'
    });
    exportOverlayHydrationId += 1;
    exportOverlayPreparing = false;
    ExcelExportProgress.hide();
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

  async function addWorksheetTable(worksheet, sourceData, exportedRows, tableBaseName, progress = {}) {
    const sheetLabel = worksheet.name || 'worksheet';
    ExcelExportProgress.update({
      title: progress.title || 'Building workbook',
      detail: progress.detail || `Preparing ${sheetLabel}`,
      percent: progress.percent || 12
    });
    await yieldToBrowser();

    worksheet.views = [{ state: 'frozen', ySplit: 1 }];
    configureWorksheetColumns(worksheet, sourceData, exportedRows.map(row => row.rawRow));
    await yieldToBrowser();

    ExcelExportProgress.update({
      title: progress.title || 'Building workbook',
      detail: `Adding ${exportedRows.length.toLocaleString()} rows to ${sheetLabel}`,
      percent: progress.rowPercent || progress.percent || 35
    });
    const tableRows = exportedRows.map(row => row.values);
    applyWorksheetFormatting(worksheet, sourceData, exportedRows.map(row => row.rawRow));
    await yieldToBrowser();

    const safeTableName = tableBaseName.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 240) || 'Query_Results';
    worksheet.addTable({
      name: safeTableName,
      ref: 'A1',
      headerRow: true,
      style: { theme: 'TableStyleMedium4', showRowStripes: true },
      columns: sourceData.displayedFields.map(field => ({ name: field, filterButton: true })),
      rows: tableRows
    });
    alignDateTextCells(worksheet, sourceData, exportedRows);

    worksheet.getRow(1).eachCell(cell => {
      cell.alignment = {
        ...(cell.alignment || {}),
        horizontal: 'center',
        vertical: 'middle'
      };
    });
    await yieldToBrowser();
  }

  async function runWorkbookExport(config) {
    const state = exportState || buildExportState();
    if (!state) {
      return;
    }

    ExcelExportProgress.update({
      title: 'Preparing workbook',
      detail: `Preparing ${state.rowCount.toLocaleString()} rows for Excel`,
      percent: 3
    });
    await yieldToBrowser();

    config.runDetailsRows = config.includeRunDetailsSheet
      ? buildWorkbookDetailsRowsFromRuntime({ config, queryStateReaders: QueryStateReaders, services, splitMultiValues, state })
      : [];

    if (shouldUseLargeWorkbookExport(state)) {
      return exportLargeWorkbook({
        state,
        config,
        helpers: {
          getCellExportValue,
          getGroupingDisplayValue,
          getUniqueSheetName,
          progress: ExcelExportProgress,
          yieldToBrowser
        }
      });
    }

    const exportedRows = buildExportRows(state.sourceData);
    const workbook = new ExcelJS.Workbook();
    const usedNames = new Set();

    if (config.mode === 'grouped') {
      const candidate = state.groupingCandidates.find(item => item.field === config.groupField);
      if (!candidate) {
        throw new Error('A grouping field is required for grouped export');
      }

      ExcelExportProgress.update({
        title: 'Preparing grouped sheets',
        detail: `Splitting rows by ${candidate.field}`,
        percent: 8
      });
      await yieldToBrowser();

      const groups = Array.from(candidate.counts.keys()).map(label => ({
        label,
        rows: exportedRows.filter(row => getGroupingDisplayValue(row.values[candidate.index]) === label)
      })).sort((left, right) => left.label.localeCompare(right.label, undefined, { numeric: true, sensitivity: 'base' }));

      const sheetCount = groups.length + (config.includeMasterSheet ? 1 : 0) + (config.includeOverviewSheet ? 1 : 0) + (config.runDetailsRows.length ? 1 : 0);
      let sheetIndex = 0;
      const getSheetProgress = () => {
        sheetIndex += 1;
        const basePercent = 12 + Math.floor((sheetIndex / Math.max(sheetCount, 1)) * 62);
        return { percent: basePercent, rowPercent: Math.min(basePercent + 8, 80) };
      };

      if (config.runDetailsRows.length) {
        addWorkbookDetailsWorksheet(workbook, { getUniqueSheetName, rows: config.runDetailsRows, usedNames });
        sheetIndex += 1;
        await yieldToBrowser();
      }
      if (config.includeMasterSheet) {
        const masterSheetName = getUniqueSheetName('All Results', usedNames);
        await addWorksheetTable(workbook.addWorksheet(masterSheetName), state.sourceData, exportedRows, `${state.tableName}_AllResults`, {
          ...getSheetProgress(),
          detail: 'Building the all-results sheet'
        });
      }

      if (config.includeOverviewSheet) {
        ExcelExportProgress.update({
          title: 'Building workbook',
          detail: 'Adding the grouped sheet overview',
          percent: 18 + Math.floor((sheetIndex / Math.max(sheetCount, 1)) * 58)
        });
        addOverviewWorksheet(workbook, {
          getUniqueSheetName,
          groupField: candidate.field,
          groups,
          usedNames
        });
        sheetIndex += 1;
        await yieldToBrowser();
      }

      for (const group of groups) {
        const sheetName = getUniqueSheetName(group.label, usedNames);
        await addWorksheetTable(workbook.addWorksheet(sheetName), state.sourceData, group.rows, `${state.tableName}_${group.label}`, {
          ...getSheetProgress(),
          detail: `Building ${sheetName}`
        });
      }
    } else {
      if (config.runDetailsRows.length) {
        addWorkbookDetailsWorksheet(workbook, { getUniqueSheetName, rows: config.runDetailsRows, usedNames });
        await yieldToBrowser();
      }
      const sheetName = getUniqueSheetName(state.tableName, usedNames);
      await addWorksheetTable(workbook.addWorksheet(sheetName), state.sourceData, exportedRows, state.tableName, {
        percent: 18,
        rowPercent: 48,
        detail: `Building ${sheetName}`
      });
    }

    const filename = buildWorkbookFilename(state.tableName, config);
    ExcelExportProgress.update({
      title: 'Packaging workbook',
      detail: 'Compressing the Excel file for download',
      percent: 86,
      indeterminate: true
    });
    await yieldToBrowser();
    const buffer = await workbook.xlsx.writeBuffer();
    ExcelExportProgress.update({
      title: 'Starting download',
      detail: `${filename} is ready`,
      percent: 100
    });
    await yieldToBrowser();
    triggerWorkbookDownload(buffer, filename);
    return filename;
  }

  async function confirmExportFromOverlay() {
    if (exportInProgress) {
      return;
    }
    if (exportOverlayPreparing || !exportState) {
      showToastMessage('Export options are still preparing', 'info');
      return;
    }

    const elements = getExportElements();
    const groupedModeActive = !!elements.groupedMode?.checked;

    const config = groupedModeActive
      ? {
          mode: 'grouped',
          groupField: elements.groupField?.value || exportState?.selectedGroupingField || '',
          includeMasterSheet: !!elements.includeMasterSheet?.checked,
          includeOverviewSheet: !!elements.includeOverviewSheet?.checked,
          includeRunDetailsSheet: !!elements.includeRunDetailsSheet?.checked
        }
      : { mode: 'single', includeRunDetailsSheet: !!elements.includeRunDetailsSheet?.checked };

    if (config.mode === 'grouped' && !config.groupField) {
      showToastMessage('Choose a field to split sheets by', 'warning');
      return;
    }

    const notificationPermission = prepareWorkbookDownloadNotification();
    const confirmBtn = elements.confirmBtn;
    if (confirmBtn) {
      confirmBtn.disabled = true;
      confirmBtn.textContent = 'Exporting...';
    }
    exportInProgress = true;
    ExcelExportProgress.setBusy(elements, true);
    ExcelExportProgress.update({
      title: 'Preparing workbook',
      detail: 'Starting Excel export',
      percent: 1
    });
    await yieldToBrowser();

    try {
      const filename = await runWorkbookExport(config);
      exportInProgress = false;
      closeExportOverlay();
      notifyWorkbookDownloadComplete({ filename, permissionPromise: notificationPermission }).catch(() => {});
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
      exportInProgress = false;
      ExcelExportProgress.setBusy(elements, false);
      ExcelExportProgress.hide();
      updateExportModeUI(elements);
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
    elements.includeRunDetailsSheet?.addEventListener('change', () => updateExportPreview(elements));
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
    if (splitEligibleSummaryCache.rawData === rawData && splitEligibleSummaryCache.summary) {
      return splitEligibleSummaryCache.summary;
    }

    const summary = getMultiValueTableSummary(rawData);
    splitEligibleSummaryCache = { rawData, summary };
    return summary;
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
      : 'Run or load results that include multi-value or repeated-entry fields.';

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
    }

    applySplitToggleVisualState(toggleBtn, splitMultiValues, summary.eligible);
    toggleBtn.removeAttribute('data-tooltip');
    toggleBtn.setAttribute('data-tooltip-html', buildSplitToggleTooltipHtml(splitMultiValues, summary));
  }

  const splitColumnsUi = Object.freeze({
    resetSplitColumnsToggleUI() {
      splitMultiValues = false;
      updateSplitColumnsToggleState();
    },
    setSplitColumnsToggleUIActive() {
      splitMultiValues = true;
      updateSplitColumnsToggleState();
    },
    updateSplitColumnsToggleState
  });
  registerAppUiActionDependencies({ splitColumnsUi });

  function attach() {
    const downloadBtn = DOM?.downloadBtn || document.getElementById('download-btn');
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

      updateSplitColumnsToggleState();
    }
  }

  function handleDownload() {
    const downloadBtn = DOM?.downloadBtn || document.getElementById('download-btn');
    if (!downloadBtn) return;
    const missingLoadedColumns = QueryUI.getDisplayedFieldsMissingFromLoadedData();

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
