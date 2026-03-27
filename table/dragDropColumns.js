/**
 * Shared column-operation helpers for drag/drop interactions.
 * Keeps structural column changes separate from pointer and drag orchestration.
 */
(function initializeDragDropColumns() {
  const getDisplayedFields = window.QueryStateReaders.getDisplayedFields.bind(window.QueryStateReaders);
  const appState = window.AppState;
  const services = window.AppServices;
  const uiActions = window.AppUiActions;

  function formatColumnClipboardValue(rawValue, fieldName) {
    return window.FormatUtils.formatCellDisplay(rawValue, fieldName);
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

    const baseFieldName = window.getBaseFieldName(normalizedField);
    const relatedFieldPattern = new RegExp(`^\\d+(st|nd|rd|th)\\s+${baseFieldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);

    return displayedFields.filter(field => field === baseFieldName || relatedFieldPattern.test(field));
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
    window.QueryTableView?.queueNextStateRenderOptions?.({
      preserveScroll: options.preserveScroll !== false,
      scrollAnchorField: options.scrollAnchorField || ''
    });
  }

  function removeColumnsByFieldName(fieldName) {
    const normalizedField = String(fieldName || '').trim();
    if (!normalizedField) {
      return false;
    }

    const displayedFieldsBeforeRemoval = getDisplayedFields();
    const relatedFieldNames = getRelatedDisplayedFieldNames(normalizedField, displayedFieldsBeforeRemoval);
    if (!relatedFieldNames.length) {
      return false;
    }

    const baseFieldName = window.getBaseFieldName(normalizedField);
    const remainingFields = displayedFieldsBeforeRemoval.filter(field => !relatedFieldNames.includes(field));
    const removedColumnIndices = relatedFieldNames
      .map(field => displayedFieldsBeforeRemoval.indexOf(field))
      .filter(index => index >= 0)
      .sort((left, right) => left - right);
    const anchorIndex = removedColumnIndices.length ? removedColumnIndices[0] : 0;
    const scrollAnchorField = remainingFields.length
      ? (remainingFields[Math.min(anchorIndex, remainingFields.length - 1)] || remainingFields[Math.max(0, anchorIndex - 1)] || '')
      : '';

    window.removedColumnInfo.set(baseFieldName, {
      columnNames: relatedFieldNames.slice(),
      originalIndices: removedColumnIndices,
      removedAt: Date.now()
    });

    queueColumnMutationRender({
      preserveScroll: true,
      scrollAnchorField
    });

    window.QueryChangeManager.removeDisplayedField(relatedFieldNames, {
      source: 'DragDrop.removeColumn'
    });

    if (baseFieldName) {
      document.querySelectorAll('.bubble').forEach(bubbleEl => {
        if (bubbleEl.textContent.trim() === baseFieldName) {
          const fieldDef = window.fieldDefs ? window.fieldDefs.get(baseFieldName) : null;
          if (fieldDef && fieldDef.is_buildable) {
            bubbleEl.setAttribute('draggable', 'false');
          } else {
            bubbleEl.setAttribute('draggable', 'true');
          }
          applyCorrectBubbleStyling(bubbleEl);
        }
      });
    }

    syncTableAfterColumnMutation({ scrollAnchorField });
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

    syncTableAfterColumnMutation(getDisplayedFields(), {
      preserveScroll: true,
      scrollAnchorField: options.scrollAnchorField || ''
    });
  }

  function moveSingleColumn(table, fromIndex, toIndex) {
    if (fromIndex === toIndex) return;
    const movedFieldName = getDisplayedFields()[fromIndex];

    queueColumnMutationRender({
      preserveScroll: true,
      scrollAnchorField: movedFieldName
    });

    window.QueryChangeManager.moveDisplayedField(fromIndex, toIndex, {
      source: 'DragDrop.moveSingleColumn'
    });

    finalizeMoveOperation({ scrollAnchorField: movedFieldName });
  }

  function moveColumnGroup(table, groupIndices, targetIndex) {
    const movedFieldName = getDisplayedFields()[groupIndices[0]];
    queueColumnMutationRender({
      preserveScroll: true,
      scrollAnchorField: movedFieldName
    });

    window.QueryChangeManager.moveDisplayedField(groupIndices[0], targetIndex, {
      count: groupIndices.length,
      behavior: 'group',
      source: 'DragDrop.moveColumnGroup'
    });

    finalizeMoveOperation({ scrollAnchorField: movedFieldName });
  }

  function moveColumn(table, fromIndex, toIndex) {
    if (fromIndex === toIndex) return;

    const fromFieldName = getDisplayedFields()[fromIndex];
    if (!fromFieldName) return;

    const relatedIndices = findRelatedColumnIndices(fromFieldName);
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
    removeColumnsByFieldName(fieldName);
  }

  function addColumn(fieldName, insertAt = -1) {
    if (fieldOrDuplicatesExist(fieldName)) {
      return false;
    }

    queueColumnMutationRender({
      preserveScroll: true,
      scrollAnchorField: fieldName
    });

    const success = restoreFieldWithDuplicates(fieldName, insertAt);

    if (success) {
      syncTableAfterColumnMutation({
        preserveScroll: true,
        scrollAnchorField: fieldName
      });
    } else {
      window.QueryTableView?.queueNextStateRenderOptions?.({});
    }

    return success;
  }

  function removeColumnByName(fieldName) {
    return removeColumnsByFieldName(fieldName);
  }

  window.DragDropColumnOps = Object.freeze({
    formatColumnClipboardValue,
    getSampleColumnData,
    createColumnDragGhost,
    refreshColIndices,
    moveColumn,
    moveSingleColumn,
    moveColumnGroup,
    finalizeMoveOperation,
    removeColumn,
    addColumn,
    removeColumnByName
  });
})();
