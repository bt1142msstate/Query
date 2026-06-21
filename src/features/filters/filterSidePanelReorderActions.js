function createFilterSidePanelReorderActions({
  DOM,
  QueryChangeManager,
  QueryStateReaders,
  QueryTableView,
  createDisplaySection,
  getActiveFilterFields,
  services,
  uiActions
} = {}) {
  const DEFER_PROJECTION_ROW_THRESHOLD = 50000;
  const getDisplayedFields = () => QueryStateReaders?.getDisplayedFields?.() || [];

  function moveDisplayedFieldByOffset(index, offset) {
    const fields = getDisplayedFields();
    const targetIndex = getDisplayedFieldOffsetTargetIndex(fields, index, offset);
    if (index < 0 || index >= fields.length || targetIndex < 0 || targetIndex >= fields.length) {
      return;
    }

    moveDisplayedField(index, targetIndex, 'FilterSidePanel.moveDisplayedField');
  }

  function getDisplayItemCurrentIndex(item) {
    const fieldName = getDisplayItemFieldName(item);
    if (!fieldName) {
      return -1;
    }

    const fields = getDisplayedFields();
    const displayItems = Array.from(DOM?.filterPanelBody?.querySelectorAll?.('.fp-display-item') || []);
    const domIndex = displayItems.indexOf(item);
    if (domIndex >= 0 && fields[domIndex] === fieldName) {
      return domIndex;
    }

    return fields.findIndex(field => field === fieldName);
  }

  function moveDisplayedFieldItemByOffset(item, offset) {
    moveDisplayedFieldByOffset(getDisplayItemCurrentIndex(item), offset);
  }

  function getDisplayedFieldOffsetTargetIndex(fields, index, offset) {
    const normalizedOffset = Number(offset) < 0 ? -1 : 1;
    const fieldName = fields[index];
    const groupIndices = services?.getDisplayedFieldMoveGroupIndices?.(fieldName, fields) || [];
    if (groupIndices.length <= 1) {
      return index + normalizedOffset;
    }

    const groupStart = Math.min(...groupIndices);
    const groupEnd = Math.max(...groupIndices);
    return normalizedOffset < 0 ? groupStart - 1 : groupEnd + 1;
  }

  function areStringArraysEqual(left, right) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
      return false;
    }

    return left.every((value, index) => value === right[index]);
  }

  function getDisplayItemFieldName(item) {
    return String(item?.querySelector?.('.fp-display-name')?.textContent || '').trim();
  }

  function applyOptimisticDisplayListOrder(nextFields) {
    const fields = Array.isArray(nextFields) ? nextFields.filter(Boolean) : [];
    const displaySection = DOM?.filterPanelBody?.querySelector?.('.fp-display-section');
    if (!displaySection) {
      return false;
    }

    const currentFields = Array.from(displaySection.querySelectorAll('.fp-display-item'))
      .map(getDisplayItemFieldName)
      .filter(Boolean);
    const changed = !areStringArraysEqual(currentFields, fields);
    if (!changed) {
      return false;
    }

    displaySection.replaceWith(createDisplaySection(fields));
    return true;
  }

  function queueOptimisticTableStateSync(metrics, scrollAnchorField, options = {}) {
    const tableDomAlreadySynced = metrics?.changed === true && Number(metrics?.skippedBodyRows || 0) === 0;
    QueryTableView?.queueNextStateRenderOptions?.({
      preserveScroll: true,
      scrollAnchorField: scrollAnchorField || '',
      tableDomAlreadySynced,
      skipProjectionSync: tableDomAlreadySynced && options.skipProjectionSync === true,
      deferProjectionSync: tableDomAlreadySynced && shouldDeferProjectionSync()
    });
    return tableDomAlreadySynced;
  }

  function shouldDeferProjectionSync() {
    if (services?.isDuplicateRowCollapseActive?.() !== true) {
      return false;
    }

    const state = services?.getVirtualTableState?.();
    const baseRowCount = Array.isArray(state?.baseViewData?.rows)
      ? state.baseViewData.rows.length
      : 0;
    const currentData = services?.getVirtualTableData?.();
    const currentRowCount = Array.isArray(currentData?.rows) ? currentData.rows.length : 0;

    return Math.max(baseRowCount, currentRowCount) >= DEFER_PROJECTION_ROW_THRESHOLD;
  }

  function moveDisplayedField(fromIndex, toIndex, source) {
    const fields = getDisplayedFields();
    if (!Number.isInteger(fromIndex) || !Number.isInteger(toIndex) || fromIndex === toIndex) {
      return false;
    }

    if (fromIndex < 0 || fromIndex >= fields.length) {
      return false;
    }

    const splitMove = services?.buildDisplayedFieldMove?.(fields, fromIndex, toIndex);
    if (splitMove?.isGroupMove) {
      if (!splitMove.changed) {
        return false;
      }

      applyOptimisticDisplayListOrder(splitMove.fields);
      const moveMetrics = services?.applyImmediateColumnOrder?.(splitMove.fields);
      const tableDomAlreadySynced = queueOptimisticTableStateSync(moveMetrics, splitMove.movedFields?.[0] || fields[fromIndex] || '', {
        skipProjectionSync: true
      });
      QueryChangeManager?.replaceDisplayedFields?.(splitMove.fields, {
        optimisticTableDomAlreadySynced: tableDomAlreadySynced,
        source
      });

      return true;
    }

    const nextFields = fields.slice();
    const [movedField] = nextFields.splice(fromIndex, 1);
    const insertAt = Math.max(0, Math.min(toIndex, nextFields.length));
    nextFields.splice(insertAt, 0, movedField);
    applyOptimisticDisplayListOrder(nextFields);
    const moveMetrics = services?.applyImmediateColumnOrder?.(nextFields);
    const tableDomAlreadySynced = queueOptimisticTableStateSync(moveMetrics, movedField, {
      skipProjectionSync: true
    });
    QueryChangeManager?.moveDisplayedField?.(fromIndex, toIndex, {
      optimisticTableDomAlreadySynced: tableDomAlreadySynced,
      source
    });

    return true;
  }

  function moveDisplayedFieldRelativeToTarget(draggedItem, targetItem, insertAfter) {
    const fromIndex = Number.parseInt(draggedItem?.dataset?.index || '', 10);
    const targetIndex = Number.parseInt(targetItem?.dataset?.index || '', 10);
    if (!Number.isInteger(fromIndex) || !Number.isInteger(targetIndex) || fromIndex === targetIndex) {
      return false;
    }

    const nextIndex = insertAfter
      ? (fromIndex < targetIndex ? targetIndex : targetIndex + 1)
      : (fromIndex < targetIndex ? targetIndex - 1 : targetIndex);

    return moveDisplayedField(fromIndex, nextIndex, 'FilterSidePanel.pointerDragDisplayedField');
  }

  function moveFilterGroupRelativeToTarget(draggedField, targetField, insertAfter) {
    if (!draggedField || !targetField || draggedField === targetField) {
      return false;
    }

    const order = getActiveFilterFields();
    const fromIndex = order.indexOf(draggedField);
    if (fromIndex === -1 || !order.includes(targetField)) {
      return false;
    }

    const targetIndex = order.indexOf(targetField);
    const nextIndex = insertAfter
      ? (fromIndex < targetIndex ? targetIndex : targetIndex + 1)
      : (fromIndex < targetIndex ? targetIndex - 1 : targetIndex);

    return moveFilterGroup(fromIndex, nextIndex, 'FilterSidePanel.pointerDragFilterGroups');
  }

  function moveFilterGroup(fromIndex, toIndex, source) {
    const order = getActiveFilterFields();
    if (!Number.isInteger(fromIndex) || !Number.isInteger(toIndex) || fromIndex === toIndex) {
      return false;
    }

    if (fromIndex < 0 || fromIndex >= order.length || toIndex < 0 || toIndex >= order.length) {
      return false;
    }

    const nextOrder = order.slice();
    const [draggedField] = nextOrder.splice(fromIndex, 1);
    nextOrder.splice(toIndex, 0, draggedField);

    applyOptimisticFilterListOrder(nextOrder);
    QueryChangeManager?.reorderFilterGroups?.(nextOrder, {
      source
    });
    uiActions?.updateQueryJson?.();
    uiActions?.updateFilterSidePanel?.();
    return true;
  }

  function applyOptimisticFilterListOrder(nextOrder) {
    const list = DOM?.filterPanelBody?.querySelector?.('.fp-filter-list');
    const order = Array.isArray(nextOrder) ? nextOrder.filter(Boolean) : [];
    if (!list || order.length === 0) {
      return false;
    }

    const groups = Array.from(list.children)
      .filter(child => child?.classList?.contains('fp-field-group'));
    const groupsByField = new Map(groups.map(group => [String(group.dataset.field || ''), group]));
    const orderedGroups = order
      .map(fieldName => groupsByField.get(fieldName))
      .filter(Boolean);

    groups.forEach(group => {
      if (!orderedGroups.includes(group)) {
        orderedGroups.push(group);
      }
    });

    if (orderedGroups.length !== groups.length) {
      return false;
    }

    orderedGroups.forEach((group, index) => {
      list.appendChild(group);
      syncFilterOrderButtons(group, index, orderedGroups.length);
    });
    return true;
  }

  function syncFilterOrderButtons(group, index, total) {
    const upButton = group.querySelector('.fp-filter-order-btn-up');
    const downButton = group.querySelector('.fp-filter-order-btn-down');
    upButton?.toggleAttribute?.('disabled', index === 0);
    downButton?.toggleAttribute?.('disabled', index === total - 1);
  }

  function getFilterGroupCurrentIndex(group) {
    const fieldName = String(group?.dataset?.field || '').trim();
    if (!fieldName) {
      return -1;
    }

    const fields = getActiveFilterFields();
    const filterGroups = Array.from(DOM?.filterPanelBody?.querySelectorAll?.('.fp-field-group') || []);
    const domIndex = filterGroups.indexOf(group);
    if (domIndex >= 0 && fields[domIndex] === fieldName) {
      return domIndex;
    }

    return fields.indexOf(fieldName);
  }

  function moveFilterGroupByOffset(index, offset) {
    const targetIndex = index + (Number(offset) < 0 ? -1 : 1);
    moveFilterGroup(index, targetIndex, 'FilterSidePanel.moveFilterGroup');
  }

  function moveFilterGroupItemByOffset(group, offset) {
    moveFilterGroupByOffset(getFilterGroupCurrentIndex(group), offset);
  }

  function removeDisplayedFieldAt(index) {
    const fields = getDisplayedFields();
    const fieldName = fields[index];
    if (!fieldName) {
      return;
    }

    const removal = services?.buildDisplayedFieldRemoval?.(fields, fieldName);
    if (removal?.changed && !areStringArraysEqual(removal.fields, fields)) {
      applyOptimisticDisplayListOrder(removal.fields);
      const removalMetrics = services?.applyImmediateColumnRemoval?.(removal.fields);
      const scrollAnchorField = removal.fields[Math.min(index, removal.fields.length - 1)]
        || removal.fields[Math.max(0, index - 1)]
        || '';
      const tableDomAlreadySynced = queueOptimisticTableStateSync(removalMetrics, scrollAnchorField);
      QueryChangeManager?.hideField?.(fieldName, {
        optimisticTableDomAlreadySynced: tableDomAlreadySynced,
        tableDomAlreadySynced,
        source: 'FilterSidePanel.removeDisplayedField'
      });
      return;
    }

    QueryChangeManager?.hideField?.(fieldName, {
      source: 'FilterSidePanel.removeDisplayedField'
    });
  }

  function removeDisplayedFieldItem(item) {
    removeDisplayedFieldAt(getDisplayItemCurrentIndex(item));
  }

  return Object.freeze({
    moveDisplayedFieldItemByOffset,
    moveDisplayedFieldRelativeToTarget,
    moveFilterGroupItemByOffset,
    moveFilterGroupRelativeToTarget,
    removeDisplayedFieldItem,
    syncDisplayListOrder: applyOptimisticDisplayListOrder
  });
}

export { createFilterSidePanelReorderActions };
