function bindFormModeTableNameUrlSync(options) {
  const {
    state,
    tableNameInput,
    collectFormBindings,
    getCurrentInputValues,
    supportsMultipleValues,
    getInputParamKeys,
    syncFormHeaderCopy,
    interpolateValue,
    refreshBrowserUrl
  } = options;

  if (state.tableNameListenersBound || !tableNameInput) {
    return false;
  }

  tableNameInput.placeholder = 'No name';

  const syncBrowserUrl = () => {
    if (!state.active || !state.spec || state.isClearingQuery) {
      return;
    }

    const currentTableName = tableNameInput.value.trim();
    state.spec.title = currentTableName;
    state.spec.queryName = currentTableName;

    const bindings = collectFormBindings(state.spec, getCurrentInputValues, supportsMultipleValues, getInputParamKeys);
    syncFormHeaderCopy(state.formCard, state.spec, bindings, interpolateValue);
    refreshBrowserUrl();
  };

  tableNameInput.addEventListener('input', syncBrowserUrl);
  tableNameInput.addEventListener('change', syncBrowserUrl);
  state.tableNameListenersBound = true;
  return true;
}

export { bindFormModeTableNameUrlSync };
