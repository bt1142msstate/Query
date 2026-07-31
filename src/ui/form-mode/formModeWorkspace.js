const FORM_MODE_WORKSPACE_CLASS = 'form-workspace-focused';

function getFormModeWorkspaceState(state = {}) {
  return {
    focused: Boolean(state.active && state.viewMode === 'form' && state.workspaceFocused)
  };
}

function syncWorkspaceButton(button, active) {
  if (!button) {
    return;
  }

  button.setAttribute('aria-pressed', active ? 'true' : 'false');
  button.classList.toggle('is-active', active);
}

function syncFormModeWorkspacePresentation({
  state,
  document: documentRef,
  refreshLayout
} = {}) {
  if (!state || !documentRef) {
    return false;
  }

  const { focused } = getFormModeWorkspaceState(state);
  documentRef.body?.classList.toggle(FORM_MODE_WORKSPACE_CLASS, focused);
  syncWorkspaceButton(state.focusFormBtn, focused);
  syncWorkspaceButton(state.showTableBtn, !focused);
  if (focused) {
    documentRef.defaultView?.scrollTo?.({ top: 0, left: 0, behavior: 'auto' });
  }
  refreshLayout?.();
  return focused;
}

function setFormModeWorkspaceFocused(context = {}, focused) {
  if (!context.state) {
    return false;
  }

  context.state.workspaceFocused = Boolean(focused);
  return syncFormModeWorkspacePresentation(context);
}

export {
  FORM_MODE_WORKSPACE_CLASS,
  getFormModeWorkspaceState,
  setFormModeWorkspaceFocused,
  syncFormModeWorkspacePresentation
};
