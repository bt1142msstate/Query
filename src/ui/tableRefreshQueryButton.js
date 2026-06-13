function getActionLabel(queryChanged) {
  return queryChanged ? 'Run updated query' : 'Refresh results';
}

function normalizeDisplayedFields(displayedFields) {
  return Array.isArray(displayedFields) ? displayedFields.filter(Boolean) : [];
}

function normalizeLifecycleState(lifecycleState) {
  return lifecycleState && typeof lifecycleState === 'object' ? lifecycleState : {};
}

export function updateTableRefreshQueryButtonState({
  button,
  displayedFields,
  lifecycleState,
  queryChanged,
  validationError = null
} = {}) {
  if (!button) {
    return;
  }

  const fields = normalizeDisplayedFields(displayedFields);
  const state = normalizeLifecycleState(lifecycleState);
  const hasLoadedResultSet = state.hasLoadedResultSet === true;
  const hasFields = fields.length > 0;
  const queryRunning = state.queryRunning === true;
  const hidden = !hasLoadedResultSet || !hasFields;
  const disabled = hidden || queryRunning || Boolean(validationError);
  const actionLabel = getActionLabel(queryChanged === true);
  const tooltip = validationError || (queryRunning ? 'Query is already running' : actionLabel);

  button.hidden = hidden;
  button.classList.toggle('hidden', hidden);
  button.disabled = disabled;
  button.classList.toggle('table-toolbar-btn-active', !disabled && queryChanged !== true);
  button.setAttribute('aria-label', tooltip);
  button.setAttribute('data-tooltip', tooltip);
}
