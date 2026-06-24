/**
 * Shared column-operation helpers for drag/drop interactions.
 * Keeps structural column changes separate from pointer and drag orchestration.
 */
import { appServices } from '../tableServices.js';
import { appUiActions } from '../../../core/appUiActions.js';
import {
  AppState,
  getBaseFieldName,
  QueryChangeManager,
  QueryStateReaders,
  registerQueryStateRuntimeAccessors
} from '../tableQueryState.js';
import { CellDisplayFormatting } from '../../../core/formatting/cellDisplayFormatting.js';
import { QueryTableView } from '../../../ui/queryTableView.js';
import { buildDisplayedFieldRemoval } from '../../../lib/virtual-table/splitColumnFields.js';
import { applyImmediateColumnOrder, applyImmediateColumnRemoval } from './dragDropImmediateReorder.js';
import {
  fieldOrDuplicatesExist,
  findRelatedColumnIndices,
  removedColumnInfo,
  restoreFieldWithDuplicates
} from './columnManager.js';
import { fieldDefs, isFieldBuildable } from '../../filters/fieldDefs.js';

let dragDropColumnOps;

(function initializeDragDropColumns() {
  const DEFER_PROJECTION_ROW_THRESHOLD = 50000;
  const getDisplayedFields = QueryStateReaders.getDisplayedFields.bind(QueryStateReaders);
  const appState = AppState;
  const services = appServices;
  const uiActions = appUiActions;

  function formatColumnClipboardValue(rawValue, fieldName) {
    return CellDisplayFormatting.formatCellDisplay(rawValue, fieldName);
  }

  function getHeaderFieldName(th) {
    if (!th) {
      return '';
    }

    return String(
      th.getAttribute('data-sort-field')
      || th.querySelector('.th-text')?.textContent
      || th.textContent
      || ''
    ).trim();
  }

  function getRelatedDisplayedFieldNames(fieldName, displayedFields = getDisplayedFields()) {
    const normalizedField = String(fieldName || '').trim();
    if (!normalizedField) {
      return [];
    }

    const baseFieldName = getBaseFieldName(normalizedField);
    const relatedFieldPattern = new RegExp(`^\\d+(st|nd|rd|th)\\s+${baseFieldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);

    return displayedFields.filter(field => field === baseFieldName || relatedFieldPattern.test(field));
  }

  function getColumnMoveGroupIndices(fieldName, displayedFields = getDisplayedFields()) {
    const splitGroupIndices = services.getDisplayedFieldMoveGroupIndices?.(fieldName, displayedFields) || [];
    if (splitGroupIndices.length > 1) {
      return splitGroupIndices;
    }

    return findRelatedColumnIndices(fieldName);
  }

  function syncTableAfterColumnMutation(options = {}) {
    uiActions.updateQueryJson();
    uiActions.updateButtonStates();
    uiActions.updateCategoryCounts();

    if (appState.currentCategory === 'Selected') {
      services.rerenderBubbles();
    }
  }

  function queueColumnMutationRender(options = {}) {
    const tableDomAlreadySynced = options.tableDomAlreadySynced === true;
    const deferProjectionSync = options.deferProjectionSync === true
      || (tableDomAlreadySynced && shouldDeferProjectionSync());
    QueryTableView.queueNextStateRenderOptions({
      preserveScroll: options.preserveScroll !== false,
      scrollAnchorField: options.scrollAnchorField || '',
      tableDomAlreadySynced,
      skipProjectionSync: options.skipProjectionSync === true,
      deferProjectionSync
    });
  }

  function shouldDeferProjectionSync() {
    if (services.isDuplicateRowCollapseActive?.() !== true) {
      return false;
    }

    const state = services.getVirtualTableState?.();
    const baseRowCount = Array.isArray(state?.baseViewData?.rows)
      ? state.baseViewData.rows.length
      : 0;
    const currentRowCount = Array.isArray(services.getVirtualTableData?.()?.rows)
      ? services.getVirtualTableData().rows.length
      : 0;

    return Math.max(baseRowCount, currentRowCount) >= DEFER_PROJECTION_ROW_THRESHOLD;
  }

  function areDisplayedFieldsEqual(left, right) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
      return false;
    }

    return left.every((field, index) => field === right[index]);
  }

  function normalizeFieldIdentity(fieldName) {
    return String(fieldName || '').trim().toLowerCase();
  }

  function getEquivalentPostFilterFieldNames(fieldName) {
    const field = String(fieldName || '').trim();
    if (!field) {
      return [];
    }

    return [
      field,
      getBaseFieldName(field),
      services.getFilterActionFieldName?.(field)
    ].filter(Boolean);
  }

  function hasPostFilterForRemovedFields(removedFields) {
    const postFilters = services.getPostFilterState?.() || {};
    const activePostFilterFields = new Set(Object.entries(postFilters)
      .filter(([, data]) => Array.isArray(data?.filters) && data.filters.length > 0)
      .flatMap(([field]) => getEquivalentPostFilterFieldNames(field))
      .map(normalizeFieldIdentity)
      .filter(Boolean));

    if (!activePostFilterFields.size) {
      return false;
    }

    return (Array.isArray(removedFields) ? removedFields : [])
      .flatMap(getEquivalentPostFilterFieldNames)
      .map(normalizeFieldIdentity)
      .some(field => activePostFilterFields.has(field));
  }

  function canSkipProjectionAfterRemoval(removedFields) {
    if (services.isDuplicateRowCollapseActive?.() === true) {
      return false;
    }

    return !hasPostFilterForRemovedFields(removedFields);
  }

  function canSkipProjectionAfterAdd() {
    return services.isDuplicateRowCollapseActive?.() !== true;
  }

  function normalizeAddColumnOptions(input) {
    if (typeof input === 'number') {
      return { insertAt: input };
    }

    if (input && typeof input === 'object') {
      return input;
    }

    return {};
  }

  function deferAuthoritativeColumnMutation(commit) {
    if (typeof commit !== 'function') {
      return;
    }

    if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
      commit();
      return;
    }

    window.requestAnimationFrame(() => {
      window.setTimeout(commit, 0);
    });
  }

  function buildSingleColumnOrder(fields, fromIndex, toIndex) {
    const nextFields = Array.isArray(fields) ? fields.slice() : [];
    if (
      !Number.isInteger(fromIndex)
      || !Number.isInteger(toIndex)
      || fromIndex < 0
      || fromIndex >= nextFields.length
      || fromIndex === toIndex
    ) {
      return nextFields;
    }

    const [movedField] = nextFields.splice(fromIndex, 1);
    const insertAt = Math.max(0, Math.min(toIndex, nextFields.length));
    nextFields.splice(insertAt, 0, movedField);
    return nextFields;
  }

  function buildColumnGroupOrder(fields, groupIndices, targetIndex) {
    const nextFields = Array.isArray(fields) ? fields.slice() : [];
    const startIndex = Array.isArray(groupIndices) && groupIndices.length ? groupIndices[0] : -1;
    const count = Array.isArray(groupIndices) ? groupIndices.length : 0;
    if (startIndex < 0 || count <= 0 || startIndex >= nextFields.length) {
      return nextFields;
    }

    const safeCount = Math.min(count, nextFields.length - startIndex);
    const movedFields = nextFields.splice(startIndex, safeCount);
    let insertAt = targetIndex;
    for (let offset = 0; offset < safeCount; offset += 1) {
      if (startIndex + offset < targetIndex) {
        insertAt -= 1;
      }
    }
    insertAt = Math.max(0, Math.min(insertAt, nextFields.length));
    nextFields.splice(insertAt, 0, ...movedFields);
    return nextFields;
  }

  function getSplitRemovalTableData() {
    return services.getVirtualTableState?.()?.baseViewData || services.getVirtualTableData?.() || null;
  }

  function removeColumnsByFieldName(fieldName, options = {}) {
    const normalizedField = String(fieldName || '').trim();
    if (!normalizedField) {
      return false;
    }

    const displayedFieldsBeforeRemoval = getDisplayedFields();
    let removal = buildDisplayedFieldRemoval(displayedFieldsBeforeRemoval, normalizedField, getSplitRemovalTableData());
    if (!removal.changed && options.allRelated === true) {
      const relatedFieldNames = getRelatedDisplayedFieldNames(normalizedField, displayedFieldsBeforeRemoval);
      removal = {
        changed: relatedFieldNames.length > 0,
        fields: displayedFieldsBeforeRemoval.filter(field => !relatedFieldNames.includes(field)),
        isGroupRemoval: relatedFieldNames.length > 1,
        parentField: getBaseFieldName(normalizedField),
        removedFields: relatedFieldNames,
        removedIndices: relatedFieldNames
          .map(field => displayedFieldsBeforeRemoval.indexOf(field))
          .filter(index => index >= 0)
          .sort((left, right) => left - right)
      };
    }

    const relatedFieldNames = removal.removedFields || [];
    if (!relatedFieldNames.length) {
      return false;
    }

    const baseFieldName = removal.parentField || getBaseFieldName(normalizedField);
    const remainingFields = removal.fields;
    const removedColumnIndices = removal.removedIndices || [];
    const anchorIndex = removedColumnIndices.length ? removedColumnIndices[0] : 0;
    const scrollAnchorField = remainingFields.length
      ? (remainingFields[Math.min(anchorIndex, remainingFields.length - 1)] || remainingFields[Math.max(0, anchorIndex - 1)] || '')
      : '';

    removedColumnInfo.set(baseFieldName, {
      columnNames: relatedFieldNames.slice(),
      originalIndices: removedColumnIndices,
      removedAt: Date.now()
    });

    const table = options.table || document.querySelector('#example-table');
    const removalMetrics = options.tableDomAlreadySynced === true
      ? { changed: true, skippedBodyRows: 0 }
      : applyImmediateColumnRemoval(table, remainingFields);
    const appliedOptimistically = removalMetrics.changed === true;
    if (appliedOptimistically || options.tableDomAlreadySynced === true) {
      uiActions.syncFilterSidePanelDisplayOrder(remainingFields);
    }
    const tableDomAlreadySynced = appliedOptimistically && Number(removalMetrics.skippedBodyRows || 0) === 0;
    const runCommit = () => {
      const currentFields = getDisplayedFields();
      const stateAlreadyUpdated = areDisplayedFieldsEqual(currentFields, remainingFields);
      if (
        appliedOptimistically
        && !stateAlreadyUpdated
        && !areDisplayedFieldsEqual(currentFields, displayedFieldsBeforeRemoval)
      ) {
        return;
      }

      queueColumnMutationRender({
        preserveScroll: true,
        scrollAnchorField,
        tableDomAlreadySynced,
        skipProjectionSync: canSkipProjectionAfterRemoval(relatedFieldNames)
      });

      if (!stateAlreadyUpdated) {
        QueryChangeManager.replaceDisplayedFields(remainingFields, {
          optimisticTableDomAlreadySynced: tableDomAlreadySynced,
          source: removal.isGroupRemoval ? 'DragDrop.removeSplitColumnGroup' : 'DragDrop.removeColumn'
        });
      }

      if (baseFieldName) {
        document.querySelectorAll('.bubble').forEach(bubbleEl => {
          if (bubbleEl.textContent.trim() === baseFieldName) {
            const fieldDef = fieldDefs ? fieldDefs.get(baseFieldName) : null;
            if (isFieldBuildable(fieldDef)) {
              bubbleEl.setAttribute('draggable', 'false');
            } else {
              bubbleEl.setAttribute('draggable', 'true');
            }
            services.applyBubbleStyling(bubbleEl);
          }
        });
      }

      syncTableAfterColumnMutation({ scrollAnchorField });
    };

    if (appliedOptimistically) {
      deferAuthoritativeColumnMutation(runCommit);
      return true;
    }

    runCommit();
    return true;
  }

  function getSampleColumnData(fieldName, maxSamples = 3) {
    const virtualTableData = services.getVirtualTableData();
    if (!virtualTableData || !virtualTableData.rows || virtualTableData.rows.length === 0) {
      return ['No data', 'available', '...'];
    }

    const columnIndex = virtualTableData.columnMap.get(fieldName);
    if (columnIndex === undefined) {
      return ['...', '(no data)', '...'];
    }

    const samples = [];
    const maxRows = Math.min(virtualTableData.rows.length, maxSamples);

    for (let index = 0; index < maxRows; index += 1) {
      const value = virtualTableData.rows[index][columnIndex];
      let displayValue = '';

      if (value === null || value === undefined || value === '') {
        displayValue = '—';
      } else {
        displayValue = formatColumnClipboardValue(value, fieldName);
      }

      if (typeof displayValue === 'string' && displayValue.length > 15) {
        displayValue = `${displayValue.substring(0, 15)}…`;
      }

      samples.push(displayValue);
    }

    return samples.length > 0 ? samples : ['(empty)', 'column', '...'];
  }

  function createColumnDragGhost(th, relatedIndices) {
    const ghost = document.createElement('div');
    ghost.style.background = '#fff';
    ghost.style.border = '2px solid #3b82f6';
    ghost.style.borderRadius = '8px';
    ghost.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
    ghost.style.opacity = '0.95';
    ghost.style.minWidth = '120px';
    ghost.style.maxWidth = '200px';
    ghost.style.fontSize = '12px';
    ghost.style.fontFamily = 'ui-sans-serif, system-ui, sans-serif';
    ghost.style.pointerEvents = 'none';

    const header = document.createElement('div');
    header.style.background = '#f8fafc';
    header.style.borderBottom = '1px solid #e2e8f0';
    header.style.padding = '8px 12px';
    header.style.fontWeight = '600';
    header.style.fontSize = '11px';
    header.style.color = '#374151';
    header.style.textAlign = 'center';
    header.style.borderTopLeftRadius = '6px';
    header.style.borderTopRightRadius = '6px';
    const headerFieldName = getHeaderFieldName(th);

    if (relatedIndices.length > 1) {
      header.textContent = `${headerFieldName} (+${relatedIndices.length - 1})`;
    } else {
      header.textContent = headerFieldName;
    }

    ghost.appendChild(header);

    const dataPreview = document.createElement('div');
    dataPreview.style.padding = '6px 12px';

    const colIndex = parseInt(th.dataset.colIndex, 10);
    const fieldName = getDisplayedFields()[colIndex];
    const sampleData = getSampleColumnData(fieldName, 3);

    sampleData.forEach((value, index) => {
      const cell = document.createElement('div');
      cell.style.padding = '2px 0';
      cell.style.color = '#6b7280';
      cell.style.fontSize = '10px';
      cell.style.overflow = 'hidden';
      cell.style.textOverflow = 'ellipsis';
      cell.style.whiteSpace = 'nowrap';

      if (index % 2 === 1) {
        cell.style.background = '#f9fafb';
        cell.style.margin = '0 -6px';
        cell.style.padding = '2px 6px';
      }

      cell.textContent = value;
      dataPreview.appendChild(cell);
    });

    ghost.appendChild(dataPreview);

    if (sampleData.length > 0) {
      const dots = document.createElement('div');
      dots.style.textAlign = 'center';
      dots.style.color = '#9ca3af';
      dots.style.fontSize = '10px';
      dots.style.padding = '2px';
      dots.textContent = '⋯';
      ghost.appendChild(dots);
    }

    return ghost;
  }

  function refreshColIndices(table) {
    const ths = table.querySelectorAll('thead th');
    ths.forEach((th, index) => {
      th.dataset.colIndex = index;
      if (!th.hasAttribute('draggable')) th.setAttribute('draggable', 'true');
    });
    const rows = table.querySelectorAll('tbody tr');
    rows.forEach(row => {
      Array.from(row.children).forEach((cell, index) => {
        cell.dataset.colIndex = index;
      });
    });
  }

  function finalizeMoveOperation(options = {}) {
    if (document.body.classList.contains('dragging-cursor')) {
      document.body.classList.remove('dragging-cursor');
    }

    syncTableAfterColumnMutation({
      preserveScroll: true,
      scrollAnchorField: options.scrollAnchorField || ''
    });
  }

  function applyOptimisticColumnMove(table, nextFields) {
    return applyImmediateColumnOrder(table, nextFields);
  }

  function commitColumnMove({ commit, movedFieldName, table, nextFields }) {
    const displayedFieldsBeforeMove = getDisplayedFields();
    const moveMetrics = applyOptimisticColumnMove(table, nextFields);
    const appliedOptimistically = moveMetrics.changed === true;
    if (appliedOptimistically) {
      uiActions.syncFilterSidePanelDisplayOrder(nextFields);
    }
    const tableDomAlreadySynced = appliedOptimistically && Number(moveMetrics.skippedBodyRows || 0) === 0;
    if (document.body.classList.contains('dragging-cursor')) {
      document.body.classList.remove('dragging-cursor');
    }

    const runCommit = () => {
      const currentFields = getDisplayedFields();
      const stateAlreadyUpdated = areDisplayedFieldsEqual(currentFields, nextFields);
      if (
        appliedOptimistically
        && !stateAlreadyUpdated
        && !areDisplayedFieldsEqual(currentFields, displayedFieldsBeforeMove)
      ) {
        return;
      }

      queueColumnMutationRender({
        preserveScroll: true,
        scrollAnchorField: movedFieldName,
        tableDomAlreadySynced,
        skipProjectionSync: true
      });

      if (!stateAlreadyUpdated) {
        commit({ tableDomAlreadySynced });
      }

      syncTableAfterColumnMutation({
        preserveScroll: true,
        scrollAnchorField: movedFieldName
      });
    };

    runCommit();
  }

  function moveSingleColumn(table, fromIndex, toIndex) {
    if (fromIndex === toIndex) return;
    const displayedFields = getDisplayedFields();
    const movedFieldName = displayedFields[fromIndex];
    const nextFields = buildSingleColumnOrder(displayedFields, fromIndex, toIndex);

    commitColumnMove({
      movedFieldName,
      nextFields,
      table,
      commit({ tableDomAlreadySynced }) {
        QueryChangeManager.moveDisplayedField(fromIndex, toIndex, {
          optimisticTableDomAlreadySynced: tableDomAlreadySynced,
          source: 'DragDrop.moveSingleColumn'
        });
      }
    });
  }

  function moveColumnGroup(table, groupIndices, targetIndex) {
    const displayedFields = getDisplayedFields();
    const movedFieldName = displayedFields[groupIndices[0]];
    const nextFields = buildColumnGroupOrder(displayedFields, groupIndices, targetIndex);

    commitColumnMove({
      movedFieldName,
      nextFields,
      table,
      commit({ tableDomAlreadySynced }) {
        QueryChangeManager.moveDisplayedField(groupIndices[0], targetIndex, {
          count: groupIndices.length,
          behavior: 'group',
          optimisticTableDomAlreadySynced: tableDomAlreadySynced,
          source: 'DragDrop.moveColumnGroup'
        });
      }
    });
  }

  function moveColumn(table, fromIndex, toIndex) {
    if (fromIndex === toIndex) return;

    const displayedFields = getDisplayedFields();
    const fromFieldName = displayedFields[fromIndex];
    if (!fromFieldName) return;

    const splitMove = services.buildDisplayedFieldMove?.(displayedFields, fromIndex, toIndex) || null;
    if (splitMove?.isGroupMove) {
      if (!splitMove.changed) {
        return;
      }

      const movedFieldName = splitMove.movedFields[0] || fromFieldName;
      commitColumnMove({
        movedFieldName,
        nextFields: splitMove.fields,
        table,
        commit({ tableDomAlreadySynced }) {
          QueryChangeManager.replaceDisplayedFields(splitMove.fields, {
            optimisticTableDomAlreadySynced: tableDomAlreadySynced,
            source: 'DragDrop.moveSplitColumnGroup'
          });
        }
      });
      return;
    }

    const relatedIndices = getColumnMoveGroupIndices(fromFieldName, displayedFields);
    if (relatedIndices.length === 1) {
      moveSingleColumn(table, fromIndex, toIndex);
    } else {
      moveColumnGroup(table, relatedIndices, toIndex);
    }
  }

  function removeColumn(table, colIndex) {
    const headerCell = table.querySelector(`thead th[data-col-index="${colIndex}"]`);
    const fieldName = headerCell ? getHeaderFieldName(headerCell) : null;
    if (!fieldName) return;
    removeColumnsByFieldName(fieldName, { allRelated: true, table });
  }

  function addColumn(fieldName, input = {}) {
    if (fieldOrDuplicatesExist(fieldName)) {
      return false;
    }

    const options = normalizeAddColumnOptions(input);
    const insertAt = Number.isInteger(options.insertAt) ? options.insertAt : -1;
    const skipProjectionSync = canSkipProjectionAfterAdd();
    const deferProjectionSync = !skipProjectionSync && shouldDeferProjectionSync();

    queueColumnMutationRender({
      preserveScroll: true,
      scrollAnchorField: fieldName,
      skipProjectionSync,
      deferProjectionSync
    });

    const success = restoreFieldWithDuplicates(fieldName, insertAt, {
      skipExistingCheck: true,
      skipPostFilterRefresh: true,
      source: options.source || 'DragDrop.addColumn'
    });

    if (success) {
      syncTableAfterColumnMutation({
        preserveScroll: true,
        scrollAnchorField: fieldName
      });
    } else {
      QueryTableView.queueNextStateRenderOptions({});
    }

    return success;
  }

  function removeColumnByName(fieldName, options = {}) {
    return removeColumnsByFieldName(fieldName, { allRelated: false, ...options });
  }

  dragDropColumnOps = Object.freeze({
    formatColumnClipboardValue,
    getSampleColumnData,
    createColumnDragGhost,
    refreshColIndices,
    getColumnMoveGroupIndices,
    moveColumn,
    moveSingleColumn,
    moveColumnGroup,
    finalizeMoveOperation,
    removeColumn,
    addColumn,
    removeColumnByName
  });
  registerQueryStateRuntimeAccessors({ getColumnOps: () => dragDropColumnOps });
})();

export { dragDropColumnOps };
