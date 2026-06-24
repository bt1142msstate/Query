function resolveRequestedFormViewMode() {
  return 'form';
}

function getFormModePresentationState(state = {}) {
  return {
    isFormMode: true,
    isLimitedView: Boolean(state.active && state.limitedView)
  };
}

function getFormModeStageElement(documentRef) {
  return documentRef.getElementById('form-mode-stage');
}

function removeModeToggleButton(state) {
  const button = state?.modeToggleBtn || null;
  if (!button) {
    return;
  }

  button.remove();
  state.modeToggleBtn = null;
}

function syncFormModePresentation({
  state,
  document: documentRef,
  uiActions,
  queryTableView
} = {}) {
  if (!state || !documentRef) {
    return;
  }

  const presentation = getFormModePresentationState(state);
  const querySearchBlock = documentRef.getElementById('query-input')?.closest('.mb-6') || null;
  const formModeStage = getFormModeStageElement(documentRef);
  const hiddenControlIds = ['toggle-json', 'toggle-queries'];

  documentRef.body?.classList.toggle('form-mode-active', presentation.isFormMode);

  [querySearchBlock].filter(Boolean).forEach(node => {
    node.classList.toggle('form-mode-hidden', presentation.isFormMode);
  });

  formModeStage?.classList.toggle('form-mode-stage-active', presentation.isFormMode);
  state.formHost?.classList.toggle('hidden', !presentation.isFormMode);
  state.formCard?.classList.toggle('hidden', !presentation.isFormMode);

  hiddenControlIds.forEach(id => {
    documentRef.getElementById(id)?.classList.toggle('hidden', presentation.isLimitedView);
  });

  removeModeToggleButton(state);
  uiActions?.syncTableViewportHeight?.();
  documentRef.defaultView?.requestAnimationFrame?.(() => {
    uiActions?.syncTableViewportHeight?.();
  });
  uiActions?.updateFilterSidePanel?.();
  queryTableView?.syncEmptyTableMessage?.();
}

export {
  getFormModePresentationState,
  resolveRequestedFormViewMode,
  syncFormModePresentation
};
