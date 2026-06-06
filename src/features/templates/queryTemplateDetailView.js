export function renderTemplateDetailView({
  elements,
  state,
  selected,
  restricted,
  isNew,
  getTemplateSvgMarkup,
  buildTemplateDetailMeta,
  renderCategoryAssignment,
  renderValidation
}) {
  if (elements.modeNote) {
    elements.modeNote.textContent = restricted
      ? 'Restricted mode: you can browse and use templates, but editing categories or templates is disabled.'
      : 'Templates are saved on the server, are not auto-pruned, and can be organized with categories.';
  }

  if (elements.newBtn) {
    elements.newBtn.classList.toggle('hidden', restricted);
    elements.newBtn.disabled = restricted || state.saving;
  }

  if (elements.refreshBtn) {
    elements.refreshBtn.disabled = state.loading || state.saving;
  }

  if (elements.manageCategoriesBtn) {
    elements.manageCategoriesBtn.disabled = state.loading || state.saving;
  }

  if (!selected || !state.detailOverlayOpen) {
    elements.detail?.classList.add('hidden');
    renderValidation([]);
    renderCategoryAssignment();
    return;
  }

  elements.detail?.classList.remove('hidden');

  if (elements.detailMode) {
    elements.detailMode.textContent = isNew ? 'New Template' : (restricted ? 'Read Only' : 'Editable Template');
  }

  if (elements.detailTitle) {
    const createTitle = selected.source === 'history'
      ? 'Create Template From Query History'
      : 'Create Template From Current Query';
    elements.detailTitle.textContent = isNew ? createTitle : selected.name;
  }

  if (elements.nameInput) {
    elements.nameInput.value = state.draft?.name ?? selected.name ?? '';
    elements.nameInput.disabled = restricted || state.saving;
    elements.nameInput.readOnly = restricted;
  }

  if (elements.descriptionInput) {
    elements.descriptionInput.value = state.draft?.description ?? selected.description ?? '';
    elements.descriptionInput.disabled = restricted || state.saving;
    elements.descriptionInput.readOnly = restricted;
  }

  if (elements.svgInput) {
    elements.svgInput.value = state.draft?.svg ?? selected.svg ?? '';
    elements.svgInput.disabled = restricted || state.saving;
    elements.svgInput.readOnly = restricted;
  }

  if (elements.svgPreview) {
    elements.svgPreview.innerHTML = getTemplateSvgMarkup(state.draft ?? selected);
  }

  renderCategoryAssignment();

  if (elements.meta) {
    elements.meta.textContent = buildTemplateDetailMeta({ selected, isNew, restricted });
  }

  if (elements.useBtn) {
    elements.useBtn.disabled = state.saving;
    elements.useBtn.classList.toggle('hidden', isNew);
  }

  if (elements.pinBtn) {
    elements.pinBtn.disabled = restricted || state.saving || isNew;
    elements.pinBtn.textContent = selected.pinned ? 'Unpin Template' : 'Pin Template';
    elements.pinBtn.classList.toggle('hidden', restricted || isNew);
  }

  if (elements.saveBtn) {
    elements.saveBtn.textContent = isNew ? 'Create Template' : 'Save Changes';
    elements.saveBtn.disabled = restricted || state.saving;
    elements.saveBtn.classList.toggle('hidden', restricted);
  }

  if (elements.deleteBtn) {
    elements.deleteBtn.disabled = restricted || state.saving || isNew;
    elements.deleteBtn.classList.toggle('hidden', restricted || isNew);
  }

  renderValidation([]);
}
