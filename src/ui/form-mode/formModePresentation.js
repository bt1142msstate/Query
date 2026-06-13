function resolveRequestedFormViewMode() {
  return 'form';
}

function getFormModePresentationState(state = {}) {
  return {
    isFormMode: true,
    isLimitedView: Boolean(state.active && state.limitedView)
  };
}

function getBubbleStageElement(documentRef) {
  return documentRef.getElementById('bubble-container')?.closest('.flex.items-start.justify-center') || null;
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
  const categoryBar = documentRef.getElementById('category-bar');
  const mobileCategorySelector = documentRef.getElementById('mobile-category-selector');
  const bubbleStage = getBubbleStageElement(documentRef);
  const hiddenControlIds = ['toggle-json', 'toggle-queries'];

  documentRef.body?.classList.toggle('form-mode-active', presentation.isFormMode);

  [querySearchBlock, categoryBar, mobileCategorySelector].filter(Boolean).forEach(node => {
    node.classList.toggle('form-mode-hidden', presentation.isFormMode);
  });

  bubbleStage?.classList.toggle('form-mode-stage-active', presentation.isFormMode);
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
