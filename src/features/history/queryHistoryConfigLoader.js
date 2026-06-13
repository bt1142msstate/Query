export function buildHistoryActiveFilters(filters, {
  resolveFieldName,
  mapFieldOperatorToUiCond
}) {
  const nextActiveFilters = {};

  filters.forEach(filter => {
    const fieldName = typeof resolveFieldName === 'function'
      ? resolveFieldName(filter.FieldName)
      : filter.FieldName;
    const uiCond = mapFieldOperatorToUiCond(filter.FieldOperator);
    const valueGlue = uiCond === 'between' ? '|' : ',';

    if (!fieldName) {
      return;
    }

    if (!nextActiveFilters[fieldName]) {
      nextActiveFilters[fieldName] = { filters: [] };
    }

    nextActiveFilters[fieldName].filters.push({
      cond: uiCond,
      val: (filter.Values || []).join(valueGlue)
    });
  });

  return nextActiveFilters;
}

function syncFormModeAfterHistoryConfig(appServices) {
  if (!appServices.isFormModeActive()) {
    return true;
  }

  return Promise.resolve(appServices.syncFormModeFromCurrentQuery()).catch(error => {
    console.error('Failed to sync form URL after loading query config:', error);
    return false;
  });
}

export function createQueryHistoryConfigLoader({
  appServices,
  document,
  dom,
  historyDependencies,
  queryChangeManager,
  queryStateReaders,
  services,
  uiActions,
  appendUniqueColumn,
  mapFieldOperatorToUiCond,
  normalizeUiConfigFilters,
  registerDynamicField,
  resolveFieldName,
  resolveSpecialPayloadFieldNames
}) {
  return function loadQueryConfig(query) {
    if (!query || !query.jsonConfig) return false;

    const getDisplayedFields = () => queryStateReaders?.getDisplayedFields?.() || [];

    if (!queryChangeManager) {
      console.error('Query history module requires QueryChangeManager access');
      return false;
    }

    const tableNameInput = dom?.tableNameInput || document.getElementById('table-name-input');

    queryChangeManager.setLifecycleState({
      hasPartialResults: false,
      hasLoadedResultSet: false
    }, { source: 'QueryHistory.loadQueryConfig', silent: true });
    services.clearPostFilters?.({ refreshView: false, notify: true, resetScroll: false });
    uiActions.updateTableResultsLip();

    if (tableNameInput) {
      tableNameInput.value = query.name || '';
      tableNameInput.classList.remove('error');
      tableNameInput.dispatchEvent(new Event('input', { bubbles: true }));
    }

    const filters = normalizeUiConfigFilters(query.jsonConfig, { trackAliases: true });
    const desiredColumns = Array.isArray(query.jsonConfig.DesiredColumnOrder)
      ? query.jsonConfig.DesiredColumnOrder.map(fieldName => (
          typeof resolveFieldName === 'function'
            ? resolveFieldName(fieldName, { trackAlias: true })
            : fieldName
        ))
      : [];
    const resolvedSpecialFields = resolveSpecialPayloadFieldNames(
      query.jsonConfig.SpecialFields || query.jsonConfig.specialFields || [],
      historyDependencies.mapper()
    );
    resolvedSpecialFields.forEach(fieldName => appendUniqueColumn(desiredColumns, fieldName));

    if (typeof registerDynamicField === 'function') {
      resolvedSpecialFields.forEach(fieldName => registerDynamicField(fieldName));
      filters.forEach(filter => {
        if (filter?.FieldName) {
          registerDynamicField(filter.FieldName);
        }
      });
    }

    queryChangeManager.setQueryState({
      displayedFields: desiredColumns,
      activeFilters: buildHistoryActiveFilters(filters, {
        resolveFieldName,
        mapFieldOperatorToUiCond
      })
    }, { source: 'QueryHistory.loadQueryConfig' });

    if (typeof registerDynamicField === 'function') {
      getDisplayedFields().forEach(fieldName => registerDynamicField(fieldName));
    }

    document.querySelectorAll('.bubble-filter').forEach(bubble => {
      bubble.classList.remove('bubble-filter');
      bubble.removeAttribute('data-filtered');
    });

    if (filters.length) {
      filters.forEach(filter => {
        const bubbleEl = Array.from(document.querySelectorAll('.bubble'))
          .find(bubble => bubble.textContent.trim() === filter.FieldName);
        if (bubbleEl) {
          bubbleEl.classList.add('bubble-filter');
          bubbleEl.dataset.filtered = 'true';
        }
      });
    }
    uiActions.updateFilterSidePanel();

    if (queryStateReaders && typeof queryStateReaders.getSerializableState === 'function') {
      queryChangeManager.setLifecycleState({
        lastExecutedQueryState: queryStateReaders.getSerializableState()
      }, { source: 'QueryHistory.setLastExecutedState', silent: true });
    }
    uiActions.updateButtonStates();

    return syncFormModeAfterHistoryConfig(appServices);
  };
}

export { syncFormModeAfterHistoryConfig };
