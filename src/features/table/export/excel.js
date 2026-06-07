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
import { addWorkbookDetailsWorksheet, buildWorkbookDetailsRowsFromRuntime } from './workbookDetails.js';
import { buildWorkbookFilename, notifyWorkbookDownloadComplete, prepareWorkbookDownloadNotification, triggerWorkbookDownload } from './workbookDownload.js';
import { createSplitColumnsToggleUi } from './splitColumnsToggleUi.js';
import {
  buildExportRows,
  buildGroupingCandidates,
  buildGroupingCandidatesAsync,
  getCellExportValue,
  getGroupingDisplayValue,
  getUniqueSheetName
} from './workbookExportData.js';
(() => {
  let exportState = null;
  let exportInProgress = false;
  let exportOverlayPreparing = false;
  let exportGroupingPreparing = false;
  let exportOverlayHydrationId = 0;
  const { getDisplayedFields } = QueryStateReaders;
  const services = appServices;
  const splitColumnsToggleUi = createSplitColumnsToggleUi({ services, showToastMessage });

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

    const dataRows = virtualData.rows;
    const exportVirtualData = virtualData;
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

  function buildExportState(options = {}) {
    const includeGrouping = options.includeGrouping !== false;
    const sourceData = getWorkbookSourceData();
    if (!sourceData) {
      return null;
    }

    const tableName = QueryUI.ensureTableName?.()
      || QueryUI.getDefaultTableName?.()
      || 'Query Results';

    const rowCount = sourceData.dataRows.length;
    const groupingCandidates = includeGrouping ? buildGroupingCandidates(sourceData) : [];

    return {
      sourceData,
      tableName,
      rowCount,
      groupingCandidates,
      groupingCandidatesReady: includeGrouping,
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
      elements.summaryGroups.textContent = exportState.groupingCandidatesReady === false || exportGroupingPreparing
        ? 'Preparing'
        : exportState.groupingCandidates.length.toLocaleString();
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
    if (groupedModeActive && (exportState.groupingCandidatesReady === false || exportGroupingPreparing)) {
      elements.preview.textContent = 'Preparing grouped sheet options...';
      return;
    }
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

    if (exportState?.groupingCandidatesReady === false || exportGroupingPreparing) {
      renderPreparingGroupingOptions(elements);
      return;
    }

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
    exportGroupingPreparing = false;

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
    const groupingReady = !preparing && exportState.groupingCandidatesReady !== false && !exportGroupingPreparing;
    const hasGrouping = groupingReady && !!exportState?.groupingCandidates?.length;
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

  function applyExportGroupingCandidates(candidates, elements) {
    if (!exportState) {
      return;
    }

    const previousSelection = exportState.selectedGroupingField;
    exportState.groupingCandidates = candidates;
    exportState.groupingCandidatesReady = true;
    exportState.selectedGroupingField = candidates.some(candidate => candidate.field === previousSelection)
      ? previousSelection
      : candidates[0]?.field || '';
    exportGroupingPreparing = false;
    renderGroupingOptions(elements);
    updateExportSummary(elements);
    if (elements.groupField && exportState.selectedGroupingField) {
      elements.groupField.value = exportState.selectedGroupingField;
    }
    updateExportModeUI(elements);
  }

  function cancelGroupingCandidatesHydration() {
    exportOverlayHydrationId += 1;
    exportGroupingPreparing = false;
  }

  function scheduleGroupingCandidatesHydration(hydrationId) {
    exportGroupingPreparing = true;
    window.setTimeout(async () => {
      if (hydrationId !== exportOverlayHydrationId || !exportState) {
        return;
      }

      const elements = getExportElements();
      if (!VisibilityUtils.isVisible(elements.overlay)) {
        return;
      }

      try {
        const candidates = await buildGroupingCandidatesAsync(exportState.sourceData, {
          shouldContinue: () => hydrationId === exportOverlayHydrationId && !exportInProgress && !!exportState,
          yieldToBrowser
        });
        if (hydrationId !== exportOverlayHydrationId || !exportState) {
          return;
        }
        applyExportGroupingCandidates(candidates, elements);
      } catch (error) {
        console.error('Failed to prepare grouped export options', error);
        if (hydrationId !== exportOverlayHydrationId) {
          return;
        }
        exportGroupingPreparing = false;
        if (exportState) {
          exportState.groupingCandidates = [];
          exportState.groupingCandidatesReady = true;
          exportState.selectedGroupingField = '';
        }
        updateExportSummary(elements);
        renderGroupingOptions(elements);
        updateExportModeUI(elements);
        showToastMessage('Could not prepare grouped export options', 'error');
      }
    }, 0);
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
          nextState = buildExportState({ includeGrouping: false });
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
        exportGroupingPreparing = false;
        renderGroupingOptions(elements);
        updateExportSummary(elements);
        if (elements.groupField) {
          elements.groupField.value = exportState.selectedGroupingField;
        }
        updateExportModeUI(elements);
        scheduleGroupingCandidatesHydration(hydrationId);
      }, 0);
    });
  }

  function openExportOverlay() {
    const elements = getExportElements();
    if (!elements.overlay) {
      exportState = buildExportState({ includeGrouping: false });
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
    exportGroupingPreparing = false;
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
        const needsWrap = !splitColumnsToggleUi.isActive() && (() => {
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
    const state = exportState || buildExportState({ includeGrouping: config?.mode === 'grouped' });
    if (!state) {
      return;
    }

    if (config.mode === 'grouped' && state.groupingCandidatesReady === false) {
      ExcelExportProgress.update({
        title: 'Preparing grouped export',
        detail: 'Scanning rows for grouped sheets',
        percent: 3,
        indeterminate: true
      });
      const elements = getExportElements();
      const candidates = await buildGroupingCandidatesAsync(state.sourceData, { yieldToBrowser });
      applyExportGroupingCandidates(candidates, elements);
    }

    ExcelExportProgress.update({
      title: 'Preparing workbook',
      detail: `Preparing ${state.rowCount.toLocaleString()} rows for Excel`,
      percent: 3
    });
    await yieldToBrowser();

    config.runDetailsRows = config.includeRunDetailsSheet
      ? buildWorkbookDetailsRowsFromRuntime({
          config,
          queryStateReaders: QueryStateReaders,
          services,
          splitMultiValues: splitColumnsToggleUi.isActive(),
          state
        })
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

    if (config.mode !== 'grouped') {
      cancelGroupingCandidatesHydration();
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
      if (!exportState) {
        return;
      }
      exportState.selectedGroupingField = event.target.value;
      updateExportPreview(elements);
    });

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        closeExportOverlay();
      }
    });
  }

  registerAppUiActionDependencies({ splitColumnsUi: splitColumnsToggleUi });

  function attach() {
    const downloadBtn = DOM?.downloadBtn || document.getElementById('download-btn');
    if (downloadBtn) {
      downloadBtn.addEventListener('click', handleDownload);
    }

    attachExportOverlayListeners();

    splitColumnsToggleUi.attach();
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
