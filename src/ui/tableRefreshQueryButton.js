export function getQueryRunActionState({
  hasLoadedResultSet = false,
  queryChanged = true
} = {}) {
  if (hasLoadedResultSet && queryChanged !== true) {
    return {
      icon: 'refresh',
      isRefresh: true,
      label: 'Refresh results',
      mode: 'refresh'
    };
  }

  if (hasLoadedResultSet) {
    return {
      icon: 'run',
      isRefresh: false,
      label: 'Run updated query',
      mode: 'run-updated'
    };
  }

  return {
    icon: 'run',
    isRefresh: false,
    label: 'Run query',
    mode: 'run'
  };
}

function normalizeDisplayedFields(displayedFields) {
  return Array.isArray(displayedFields) ? displayedFields.filter(Boolean) : [];
}

function normalizeLifecycleState(lifecycleState) {
  return lifecycleState && typeof lifecycleState === 'object' ? lifecycleState : {};
}

function updateButtonIcon(button, actionState) {
  const runIcon = button.querySelector?.('[data-table-query-icon="run"]');
  const refreshIcon = button.querySelector?.('[data-table-query-icon="refresh"]');
  const showRefresh = actionState.icon === 'refresh';

  runIcon?.classList.toggle('hidden', showRefresh);
  refreshIcon?.classList.toggle('hidden', !showRefresh);
  button.dataset.queryActionMode = actionState.mode;
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
  const actionState = getQueryRunActionState({
    hasLoadedResultSet,
    queryChanged: queryChanged === true
  });
  const tooltip = validationError || (queryRunning ? 'Query is already running' : actionState.label);

  button.hidden = hidden;
  button.classList.toggle('hidden', hidden);
  button.disabled = disabled;
  button.classList.toggle('table-toolbar-btn-active', !disabled && actionState.isRefresh);
  updateButtonIcon(button, actionState);
  button.setAttribute('aria-label', tooltip);
  button.setAttribute('data-tooltip', tooltip);
}
