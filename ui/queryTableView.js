/**
 * Query table rendering and empty-state management.
 * Owns table construction so orchestration code does not mutate table DOM directly.
 */
(function initializeQueryTableView() {
  const dom = window.DOM;
  const appState = window.AppState;
  const services = window.AppServices;
  const uiActions = window.AppUiActions;
  const getDisplayedFields = window.QueryStateReaders.getDisplayedFields.bind(window.QueryStateReaders);

  function areDisplayedFieldsEqual(left, right) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
      return false;
    }

    for (let index = 0; index < left.length; index += 1) {
      if (left[index] !== right[index]) {
        return false;
      }
    }

    return true;
  }

  function syncBubbleDragState(renderFields) {
    document.querySelectorAll('.bubble').forEach(bubbleEl => {
      const field = bubbleEl.textContent.trim();
      const fieldDef = window.fieldDefs ? window.fieldDefs.get(field) : null;
      if (fieldDef && fieldDef.is_buildable) {
        bubbleEl.setAttribute('draggable', 'false');
      } else if (renderFields.includes(field)) {
        bubbleEl.removeAttribute('draggable');
        services.applyBubbleStyling(bubbleEl);
      } else {
        bubbleEl.setAttribute('draggable', 'true');
        services.applyBubbleStyling(bubbleEl);
      }
    });
  }

  function restoreEmptyTableDropTarget(container) {
    if (!container || !services.dragDrop) {
      return;
    }

    services.attachBubbleDropTarget(container);

    const placeholderTh = container.querySelector('thead th');
    if (!placeholderTh) {
      return;
    }

    placeholderTh.addEventListener('dragover', event => event.preventDefault());
    placeholderTh.addEventListener('drop', event => {
      event.preventDefault();
      const field = event.dataTransfer.getData('bubble-field');
      if (!field) {
        return;
      }

      services.markDropSuccessful();
      services.restoreFieldWithDuplicates(field);
    });
    placeholderTh.addEventListener('dragenter', () => {
      placeholderTh.classList.add('th-drag-over');
    });
    placeholderTh.addEventListener('dragleave', () => {
      placeholderTh.classList.remove('th-drag-over');
    });

    container.addEventListener('dragover', () => {
      if (getDisplayedFields().length === 0) {
        placeholderTh.classList.add('th-drag-over');
      }
    });
    container.addEventListener('dragleave', () => {
      placeholderTh.classList.remove('th-drag-over');
    });
  }

  function renderEmptyQueryTableState() {
    services.clearInsertAffordance({ immediate: true });
    services.clearVirtualTableData();

    const container = dom.tableContainer;
    const placeholderHeight = 400;
    if (container) {
      container.classList.remove('table-container-hidden');
      container.style.minHeight = `${placeholderHeight}px`;
      container.style.height = `${placeholderHeight}px`;
      container.innerHTML = `
        <table id="example-table" class="min-w-full divide-y divide-gray-200 bg-white">
          <thead>
            <tr><th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" colspan="1">
              Drag a bubble here to add your first column
            </th></tr>
          </thead>
          <tbody class="divide-y divide-gray-200"></tbody>
        </table>`;

      restoreEmptyTableDropTarget(container);
    }

    document.querySelectorAll('.bubble').forEach(bubble => {
      const fieldName = bubble.textContent.trim();
      const fieldDef = window.fieldDefs ? window.fieldDefs.get(fieldName) : null;
      bubble.setAttribute('draggable', fieldDef && fieldDef.is_buildable ? 'false' : 'true');
    });

    uiActions.updateCategoryCounts();
  }

  function createQueryTableHeaderCell(fieldName, index, options = {}) {
    const fieldText = String(fieldName ?? '');
    const fieldExistsInData = options.existsInData !== false;
    const hasLoadedData = options.hasLoadedData !== false;
    const showMissingDataState = hasLoadedData && !fieldExistsInData;

    const th = document.createElement('th');
    th.draggable = true;
    th.dataset.colIndex = String(index);
    th.className = 'px-6 py-3 text-center text-xs font-medium uppercase tracking-wider bg-gray-50';

    if (fieldExistsInData) {
      th.classList.add('sortable-header', 'text-gray-500', 'cursor-pointer', 'hover:bg-gray-100', 'transition-colors');
      th.setAttribute('data-sort-field', fieldText);
    } else if (showMissingDataState) {
      th.classList.add('query-table-column-missing-data');
      th.style.setProperty('color', '#ef4444', 'important');
      th.setAttribute('data-tooltip', 'This field is not in the current data. Run a new query to populate it.');
    } else {
      th.classList.add('text-gray-500');
    }

    const headerContent = document.createElement('div');
    headerContent.className = 'th-header-content';

    const leftSlot = document.createElement('div');
    leftSlot.className = 'th-side-slot th-side-slot-left';

    if (fieldExistsInData || !hasLoadedData) {
      const sortIcon = document.createElement('span');
      sortIcon.className = 'sort-icon text-gray-400';
      sortIcon.setAttribute('aria-hidden', 'true');
      leftSlot.appendChild(sortIcon);
    }

    const labelGroup = document.createElement('div');
    labelGroup.className = 'th-label-group';

    const labelText = document.createElement('span');
    labelText.className = 'th-text';
    labelText.textContent = fieldText;

    if (showMissingDataState) {
      labelText.style.setProperty('color', '#ef4444', 'important');
    }

    labelGroup.appendChild(labelText);
    headerContent.appendChild(leftSlot);
    headerContent.appendChild(labelGroup);

    const rightSlot = document.createElement('div');
    rightSlot.className = 'th-side-slot th-side-slot-right';
    headerContent.appendChild(rightSlot);
    th.appendChild(headerContent);

    ['left', 'right'].forEach(edge => {
      const resizeHandle = document.createElement('button');
      resizeHandle.type = 'button';
      resizeHandle.className = `th-resize-handle th-resize-handle-${edge} hidden`;
      resizeHandle.setAttribute('aria-label', `Resize ${fieldText} column from the ${edge} edge`);
      resizeHandle.setAttribute('data-field-name', fieldText);
      resizeHandle.setAttribute('data-edge', edge);
      resizeHandle.setAttribute('aria-hidden', 'true');
      resizeHandle.innerHTML = '<span></span>';
      th.appendChild(resizeHandle);
    });

    return th;
  }

  async function showExampleTable(fields, options = {}) {
    const syncQueryState = options.syncQueryState !== false;

    if (!Array.isArray(fields) || fields.length === 0) {
      if (syncQueryState && getDisplayedFields().length > 0) {
        window.QueryChangeManager.replaceDisplayedFields([], { source: 'QueryTableView.showExampleTable.empty' });
        return;
      }

      renderEmptyQueryTableState();
      return;
    }

    const uniqueFields = [];
    fields.forEach(fieldName => {
      if (!uniqueFields.includes(fieldName)) {
        uniqueFields.push(fieldName);
      }
    });
    const renderFields = uniqueFields.slice();

    if (syncQueryState) {
      const currentDisplayedFields = getDisplayedFields();
      if (!areDisplayedFieldsEqual(currentDisplayedFields, uniqueFields)) {
        window.QueryChangeManager.replaceDisplayedFields(uniqueFields, { source: 'QueryTableView.showExampleTable' });
        return;
      }
    }

    const container = dom.tableContainer;
    if (!container) {
      return;
    }

    const preservedScrollTop = options.preserveScroll === true ? container.scrollTop : 0;
    const preservedScrollLeft = options.preserveScroll === true ? container.scrollLeft : 0;

    services.resetDragDropHeaderUi();

    if (!document.getElementById('table-query-bubble')) {
      container.classList.remove('table-container-hidden');
    }

    const table = document.createElement('table');
    table.id = 'example-table';
    table.className = 'min-w-full divide-y divide-gray-200 bg-white';

    const thead = document.createElement('thead');
    thead.className = 'sticky top-0 z-20 bg-gray-50';

    const tableHeaderRow = document.createElement('tr');
    renderFields.forEach((field, index) => {
      const virtualTableData = services.getVirtualTableData();
      const hasLoadedData = Boolean(virtualTableData && virtualTableData.columnMap instanceof Map && virtualTableData.columnMap.size > 0);
      const fieldExistsInData = Boolean(virtualTableData && virtualTableData.columnMap && virtualTableData.columnMap.has(field));
      tableHeaderRow.appendChild(createQueryTableHeaderCell(field, index, {
        existsInData: fieldExistsInData,
        hasLoadedData
      }));
    });
    thead.appendChild(tableHeaderRow);

    const tbody = document.createElement('tbody');
    tbody.className = 'divide-y divide-gray-200';

    table.appendChild(thead);
    table.appendChild(tbody);
    container.replaceChildren(table);

    try {
      await services.setupVirtualTable(container, renderFields, {
        preserveScroll: options.preserveScroll === true,
        preserveScrollTop: preservedScrollTop,
        preserveScrollLeft: preservedScrollLeft
      });
    } catch (error) {
      console.error('Error setting up virtual table:', error);
      container.innerHTML = `
        <div class="p-6 text-center">
          <div class="text-red-600 font-semibold mb-2">Error Loading Data</div>
          <div class="text-gray-600">Failed to initialize table view.</div>
          <div class="text-sm text-gray-500 mt-2">${error.message}</div>
        </div>`;
      return;
    }

    const headerRow = table.querySelector('thead tr');
    headerRow.querySelectorAll('th').forEach((th, index) => {
      const field = renderFields[index];
      const width = services.getCalculatedColumnWidth(field) || 150;
      th.style.width = `${width}px`;
      th.style.minWidth = `${width}px`;
      th.style.maxWidth = `${width}px`;
    });

    services.measureTableRowHeight(table, renderFields);
    services.renderVirtualTable();
    services.syncColumnResizeModeUi?.();

    table.querySelectorAll('th.sortable-header').forEach(th => {
      th.addEventListener('click', event => {
        if (event.target.closest('.th-action') || event.target.closest('.th-resize-handle')) {
          return;
        }

        const field = th.getAttribute('data-sort-field');
        if (field) {
          services.sortTableBy(field);
        }
      });
    });

    if (!window.updateSortHeadersUI) {
      window.updateSortHeadersUI = (sortColumn, sortDirection) => {
        document.querySelectorAll('#example-table th').forEach(th => {
          let iconSpan = th.querySelector('.sort-icon');
          if (!iconSpan) {
            const headerContent = th.querySelector('.th-header-content');
            const leftSlot = headerContent?.querySelector('.th-side-slot-left');
            if (headerContent) {
              iconSpan = document.createElement('span');
              iconSpan.className = 'sort-icon';
              iconSpan.setAttribute('aria-hidden', 'true');
              (leftSlot || headerContent).appendChild(iconSpan);
            }
          }

          if (iconSpan) {
            const isSortedColumn = th.getAttribute('data-sort-field') === sortColumn;
            iconSpan.textContent = isSortedColumn ? (sortDirection === 'asc' ? '↑' : '↓') : '';
            iconSpan.classList.toggle('is-active', isSortedColumn);
            iconSpan.classList.toggle('is-desc', isSortedColumn && sortDirection === 'desc');
          }
        });

        services.syncHeaderSortActionState();
      };
    }

    const state = services.getVirtualTableState();
    if (state && state.currentSortColumn && window.updateSortHeadersUI) {
      window.updateSortHeadersUI(state.currentSortColumn, state.currentSortDirection);
    }

    services.addDragAndDrop(table);
    services.attachBubbleDropTarget(container);

    syncBubbleDragState(renderFields);
    uiActions.updateCategoryCounts();

    if (appState.currentCategory === 'Selected') {
      services.rerenderBubbles();
    }
  }

  const queryTableView = {
    restoreEmptyTableDropTarget,
    renderEmptyQueryTableState,
    createQueryTableHeaderCell,
    showExampleTable
  };

  window.QueryTableView = queryTableView;
  window.renderEmptyQueryTableState = renderEmptyQueryTableState;
  window.createQueryTableHeaderCell = createQueryTableHeaderCell;

  window.QueryStateSubscriptions.subscribe(event => {
    if (event?.changes?.displayedFields) {
      showExampleTable(event.snapshot?.displayedFields || [], { syncQueryState: false }).catch(error => {
        console.error('Failed to re-render table from query state change:', error);
      });
    }

    if (event.changes?.activeFilters) {
      uiActions.updateCategoryCounts();
    }
  }, {
    displayedFields: true,
    activeFilters: true
  });
})();
