function setHidden(element, hidden) {
  element?.classList.toggle('hidden', hidden);
}

function setDisabled(element, disabled) {
  if (element) {
    element.disabled = disabled;
  }
}

function setReadOnlyInput(input, { value, restricted, saving }) {
  if (!input) return;
  input.value = value;
  input.disabled = restricted || saving;
  input.readOnly = restricted;
}

function renderTemplatePanelChrome({ elements, restricted, state }) {
  if (elements.modeNote) {
    elements.modeNote.textContent = restricted
      ? 'Restricted mode: you can browse and use templates, but editing categories or templates is disabled.'
      : 'Templates are saved on the server, are not auto-pruned, and can be organized with categories.';
  }

  setHidden(elements.newBtn, restricted);
  setDisabled(elements.newBtn, restricted || state.saving);
  setDisabled(elements.refreshBtn, state.loading || state.saving);
  setDisabled(elements.manageCategoriesBtn, state.loading || state.saving);
}

function renderEmptyTemplateDetail({ elements, renderCategoryAssignment, renderValidation }) {
  elements.detail?.classList.add('hidden');
  renderValidation([]);
  renderCategoryAssignment();
}

function getTemplateDetailTitle({ isNew, selected }) {
  if (!isNew) {
    return selected.name;
  }

  return selected.source === 'history'
    ? 'Create Template From Query History'
    : 'Create Template From Current Query';
}

function renderTemplateInputs({ elements, selected, state, restricted }) {
  const saving = state.saving;
  setReadOnlyInput(elements.nameInput, {
    value: state.draft?.name ?? selected.name ?? '',
    restricted,
    saving
  });
  setReadOnlyInput(elements.descriptionInput, {
    value: state.draft?.description ?? selected.description ?? '',
    restricted,
    saving
  });
}

function renderTemplateActionButtons({ elements, isNew, restricted, selected, state }) {
  setDisabled(elements.useBtn, state.saving);
  setHidden(elements.useBtn, isNew);

  if (elements.pinBtn) {
    elements.pinBtn.textContent = selected.pinned ? 'Unpin Template' : 'Pin Template';
  }
  setDisabled(elements.pinBtn, restricted || state.saving || isNew);
  setHidden(elements.pinBtn, restricted || isNew);

  if (elements.saveBtn) {
    elements.saveBtn.textContent = isNew ? 'Create Template' : 'Save Changes';
  }
  setDisabled(elements.saveBtn, restricted || state.saving);
  setHidden(elements.saveBtn, restricted);

  setDisabled(elements.deleteBtn, restricted || state.saving || isNew);
  setHidden(elements.deleteBtn, restricted || isNew);
}

export function renderTemplateDetailView({
  elements,
  state,
  selected,
  restricted,
  isNew,
  buildTemplateDetailMeta,
  renderCategoryAssignment,
  renderValidation
}) {
  renderTemplatePanelChrome({ elements, restricted, state });

  if (!selected || !state.detailOverlayOpen) {
    renderEmptyTemplateDetail({ elements, renderCategoryAssignment, renderValidation });
    return;
  }

  elements.detail?.classList.remove('hidden');

  if (elements.detailMode) {
    elements.detailMode.textContent = isNew ? 'New Template' : (restricted ? 'Read Only' : 'Editable Template');
  }

  if (elements.detailTitle) {
    elements.detailTitle.textContent = getTemplateDetailTitle({ isNew, selected });
  }

  renderTemplateInputs({ elements, selected, state, restricted });

  renderCategoryAssignment();

  if (elements.meta) {
    elements.meta.textContent = buildTemplateDetailMeta({ selected, isNew, restricted });
  }

  renderTemplateActionButtons({ elements, isNew, restricted, selected, state });
  renderValidation([]);
}
