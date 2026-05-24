import { BackendApi } from '../core/backendApi.js';
import { onDOMReady } from '../core/domReady.js';
import { showToastMessage } from '../core/toast.js';
import { VisibilityUtils } from '../core/visibility.js';
import { buildQueryUiConfig } from '../filters/queryPayload.js';
import { appServices, registerQueryTemplatesService } from '../core/appServices.js';
import {
  cloneTemplate,
  normalizeCategory,
  normalizeCategoryList,
  normalizeTemplate,
  sanitizeSvgMarkup
} from './queryTemplateModels.js';
import {
  createTemplateDraftFromConfig,
  filterVisibleTemplates,
  removeCategoryFromTemplates,
  replaceCategoryInTemplates,
  validateCategoryName,
  validateTemplateDraft
} from './queryTemplateState.js';
import {
  appendTemplateToCollection,
  applyPinnedTemplateOrder,
  getPinnedTemplateCountExcluding,
  removeTemplateFromCollection,
  replaceTemplateInCollection,
  sortTemplateCollection
} from './queryTemplateCollection.js';
import {
  buildCreateTemplatePayload,
  buildPinTemplatePayload,
  buildUpdateTemplatePayload
} from './queryTemplatePayloads.js';
import { createQueryTemplateRepository } from './queryTemplateRepository.js';
import {
  buildTemplateDetailMeta,
  getPinnedTemplatesForStrip
} from './queryTemplateViewState.js';
import {
  renderTemplateCategoryAssignment,
  renderTemplateCategoryFilter,
  renderTemplateCategoryList
} from './queryTemplateCategoryView.js';
import { renderTemplateList } from './queryTemplateListView.js';
import { escapeHtml } from '../core/html.js';
(function initializeQueryTemplates() {
  const NEW_TEMPLATE_ID = '__new_template__';
  const DEFAULT_TEMPLATE_SVG = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" class="template-default-icon" aria-hidden="true">
      <rect x="8" y="8" width="48" height="48" rx="10" fill="#FFFFFF" stroke="#111827" stroke-width="4"/>
      <rect x="18" y="18" width="28" height="11" rx="3" fill="#111827"/>
      <path d="M18 38h10M36 38h10M18 46h28" fill="none" stroke="#111827" stroke-width="4" stroke-linecap="round"/>
      <path d="M48 8v13a4 4 0 0 0 4 4h4" fill="none" stroke="#111827" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `;
  const state = {
    templates: [],
    categories: [],
    loaded: false,
    loading: false,
    saving: false,
    selectedId: '',
    selectedCategoryFilter: '',
    searchQuery: '',
    draft: null,
    draggedPinnedId: '',
    editingCategoryId: '',
    categoriesOverlayOpen: false,
    detailOverlayOpen: false
  };
  const templateRepository = createQueryTemplateRepository({
    postJson: payload => BackendApi.postJson(payload)
  });

  function el(id) {
    return document.getElementById(id);
  }

  function getElements() {
    return {
      panel: el('templates-panel'),
      modeNote: el('templates-mode-note'),
      listStatus: el('templates-list-status'),
      list: el('templates-list'),
      newBtn: el('templates-new-btn'),
      refreshBtn: el('templates-refresh-btn'),
      manageCategoriesBtn: el('templates-manage-categories-btn'),
      emptyState: el('templates-empty-state'),
      detailOverlay: el('templates-detail-overlay'),
      detailBackdrop: el('templates-detail-backdrop'),
      detail: el('templates-detail'),
      detailCloseBtn: el('templates-detail-close-btn'),
      detailMode: el('templates-detail-mode'),
      detailTitle: el('templates-detail-title'),
      nameInput: el('template-name-input'),
      descriptionInput: el('template-description-input'),
      svgInput: el('template-svg-input'),
      svgPreview: el('template-svg-preview'),
      validation: el('templates-validation'),
      meta: el('templates-meta'),
      useBtn: el('template-use-btn'),
      pinBtn: el('template-pin-btn'),
      saveBtn: el('template-save-btn'),
      deleteBtn: el('template-delete-btn'),
      categoryFilter: el('templates-category-filter'),
      searchInput: el('templates-search-input'),
      resultsSummary: el('templates-results-summary'),
      categoryList: el('templates-category-list'),
      categoriesOverlay: el('templates-categories-overlay'),
      categoriesBackdrop: el('templates-categories-backdrop'),
      categoriesCloseBtn: el('templates-categories-close-btn'),
      categoryNameLabel: el('template-category-name-label'),
      categoryNameInput: el('template-category-name-input'),
      categoryDescriptionInput: el('template-category-description-input'),
      categorySaveBtn: el('template-category-save-btn'),
      categoryCancelBtn: el('template-category-cancel-btn'),
      categoryAssignment: el('template-category-assignment'),
      pinnedStrip: el('pinned-templates-strip'),
      pinnedList: el('pinned-templates-list'),
      pinnedMoreBtn: el('pinned-templates-more-btn')
    };
  }

  function isRestrictedMode() {
    return appServices.isFormModeLimitedView();
  }

  function getSelectedTemplate() {
    if (state.selectedId === NEW_TEMPLATE_ID) {
      return state.draft;
    }

    return state.templates.find(template => template.id === state.selectedId) || null;
  }

  function setDraftFromTemplate(template) {
    state.draft = cloneTemplate(template);
  }

  function getCurrentQueryConfigSnapshot() {
    return buildQueryUiConfig();
  }

  function hasUsableCurrentQuery() {
    const config = getCurrentQueryConfigSnapshot();
    if (!config) {
      return false;
    }

    return Boolean(
      (Array.isArray(config.DesiredColumnOrder) && config.DesiredColumnOrder.length)
      || (Array.isArray(config.Filters) && config.Filters.length)
      || (Array.isArray(config.SpecialFields) && config.SpecialFields.length)
    );
  }

  function syncDraftCategoriesFromInputs() {
    if (!state.draft) {
      return;
    }

    const assignmentContainer = getElements().categoryAssignment;
    if (!assignmentContainer) {
      return;
    }

    const selectedIds = Array.from(assignmentContainer.querySelectorAll('input[type="checkbox"]:checked'))
      .map(input => input.value);
    const selectedIdSet = new Set(selectedIds);
    state.draft.categories = state.categories.filter(category => selectedIdSet.has(category.id));
  }

  function syncDraftFromInputs() {
    if (!state.draft) {
      return;
    }

    const elements = getElements();
    state.draft.name = String(elements.nameInput?.value || '').trim();
    state.draft.description = String(elements.descriptionInput?.value || '').trim();
    state.draft.svg = String(elements.svgInput?.value || '').trim();
    syncDraftCategoriesFromInputs();
  }

  function getTemplateSvgMarkup(template) {
    return sanitizeSvgMarkup(template?.svg) || DEFAULT_TEMPLATE_SVG;
  }

  function getVisibleTemplates() {
    return filterVisibleTemplates(state.templates, {
      searchQuery: state.searchQuery,
      selectedCategoryFilter: state.selectedCategoryFilter
    });
  }

  function reconcileTemplateSelection() {
    const visibleTemplates = getVisibleTemplates();
    if (state.selectedId === NEW_TEMPLATE_ID) {
      return;
    }

    if (state.selectedId) {
      const selected = state.templates.find(template => template.id === state.selectedId);
      const isVisible = visibleTemplates.some(template => template.id === state.selectedId);
      if (selected && isVisible) {
        setDraftFromTemplate(selected);
      } else {
        state.selectedId = '';
        state.draft = null;
        state.detailOverlayOpen = false;
      }
    }
  }

  function openDetailOverlay() {
    const elements = getElements();
    if (!elements.detailOverlay) {
      return;
    }

    state.detailOverlayOpen = true;
    VisibilityUtils.show([elements.detailOverlay, elements.detail], {
      ariaHidden: false,
      raisedUiKey: 'templates-detail-overlay'
    });
    render();
    window.requestAnimationFrame(() => {
      const target = getSelectedTemplate() && !isRestrictedMode()
        ? elements.nameInput
        : (elements.useBtn || elements.detailCloseBtn);
      target?.focus?.();
    });
  }

  function closeDetailOverlay() {
    const elements = getElements();
    if (!elements.detailOverlay || !elements.detail) {
      return;
    }

    state.detailOverlayOpen = false;
    if (state.selectedId !== NEW_TEMPLATE_ID) {
      state.selectedId = '';
      state.draft = null;
    }
    VisibilityUtils.hide([elements.detailOverlay, elements.detail], {
      ariaHidden: true,
      raisedUiKey: 'templates-detail-overlay'
    });
    renderValidation([]);
    render();
  }

  async function refreshTemplates(options = {}) {
    const force = options.force === true;
    if (state.loading) {
      return;
    }

    if (state.loaded && !force) {
      render();
      return;
    }

    state.loading = true;
    render();

    try {
      const payload = await templateRepository.listTemplates();
      state.templates = sortTemplateCollection((Array.isArray(payload.templates) ? payload.templates : []).map(normalizeTemplate));
      state.categories = normalizeCategoryList(payload.categories);
      if (state.selectedCategoryFilter && !state.categories.some(category => category.id === state.selectedCategoryFilter)) {
        state.selectedCategoryFilter = '';
      }
      reconcileTemplateSelection();
      state.loaded = true;
    } catch (error) {
      if (error?.isRateLimited) {
        return;
      }
      state.loaded = false;
      state.templates = [];
      state.categories = [];
      state.selectedId = '';
      state.draft = null;
      showToastMessage(`Failed to load templates: ${error.message}`, 'error');
    } finally {
      state.loading = false;
      render();
    }
  }

  function selectTemplate(templateId) {
    const selected = state.templates.find(template => template.id === templateId);
    if (!selected) {
      return;
    }

    state.selectedId = selected.id;
    setDraftFromTemplate(selected);
    openDetailOverlay();
  }

  function openCategoriesOverlay() {
    const elements = getElements();
    if (!elements.categoriesOverlay) {
      return;
    }

    state.categoriesOverlayOpen = true;
    VisibilityUtils.show([elements.categoriesOverlay], {
      ariaHidden: false,
      raisedUiKey: 'templates-categories-overlay'
    });
    render();
    window.requestAnimationFrame(() => {
      const target = isRestrictedMode()
        ? elements.categoriesCloseBtn
        : (elements.categoryNameInput || elements.categoriesCloseBtn);
      target?.focus?.();
    });
  }

  function closeCategoriesOverlay() {
    const elements = getElements();
    if (!elements.categoriesOverlay) {
      return;
    }

    state.categoriesOverlayOpen = false;
    VisibilityUtils.hide([elements.categoriesOverlay], {
      ariaHidden: true,
      raisedUiKey: 'templates-categories-overlay'
    });
    render();
  }

  function startCreateFromCurrentQuery() {
    if (isRestrictedMode()) {
      return;
    }

    if (!hasUsableCurrentQuery()) {
      showToastMessage('Build a query before creating a template.', 'warning');
      return;
    }

    state.selectedId = NEW_TEMPLATE_ID;
    state.draft = createTemplateDraftFromConfig(getCurrentQueryConfigSnapshot());
    openDetailOverlay();
  }

  async function createTemplate() {
    if (isRestrictedMode() || !state.draft) {
      return;
    }

    syncDraftFromInputs();
    const validationErrors = validateTemplateDraft(state.draft, {
      hasUsableCurrentQuery: hasUsableCurrentQuery(),
      templates: state.templates
    });
    if (validationErrors.length) {
      renderValidation(validationErrors);
      return;
    }

    state.saving = true;
    render();

    try {
      const payload = await templateRepository.createTemplate(buildCreateTemplatePayload({
        draft: state.draft,
        categories: state.categories,
        uiConfig: getCurrentQueryConfigSnapshot()
      }));

      const normalized = normalizeTemplate(payload.template || payload, state.templates.length);
      state.templates = appendTemplateToCollection(state.templates, normalized);
      state.selectedId = normalized.id;
      setDraftFromTemplate(normalized);
      state.detailOverlayOpen = true;
      state.loaded = true;

      showToastMessage(`Template "${normalized.name}" saved.`, 'success');
    } catch (error) {
      if (error?.isRateLimited) {
        return;
      }
      renderValidation([error.message]);
    } finally {
      state.saving = false;
      render();
    }
  }

  async function updateTemplate() {
    if (isRestrictedMode() || !state.draft || state.selectedId === NEW_TEMPLATE_ID) {
      return;
    }

    syncDraftFromInputs();
    const validationErrors = validateTemplateDraft(state.draft, {
      currentTemplateId: state.selectedId,
      hasUsableCurrentQuery: hasUsableCurrentQuery(),
      templates: state.templates
    });
    if (validationErrors.length) {
      renderValidation(validationErrors);
      return;
    }

    state.saving = true;
    render();

    try {
      const payload = await templateRepository.updateTemplate(state.selectedId, buildUpdateTemplatePayload({
        draft: state.draft,
        categories: state.categories,
        currentQueryConfig: hasUsableCurrentQuery() ? getCurrentQueryConfigSnapshot() : null,
        fallbackUiConfig: state.draft.uiConfig
      }));

      const normalized = normalizeTemplate(payload.template || payload, 0);
      state.templates = replaceTemplateInCollection(state.templates, state.selectedId, normalized);
      state.selectedId = normalized.id;
      setDraftFromTemplate(normalized);
      state.detailOverlayOpen = true;

      showToastMessage(`Template "${normalized.name}" updated.`, 'success');
    } catch (error) {
      if (error?.isRateLimited) {
        return;
      }
      renderValidation([error.message]);
    } finally {
      state.saving = false;
      render();
    }
  }

  async function deleteTemplate() {
    const selected = getSelectedTemplate();
    if (isRestrictedMode() || !selected || state.selectedId === NEW_TEMPLATE_ID) {
      return;
    }

    if (!window.confirm(`Delete template "${selected.name}"?`)) {
      return;
    }

    state.saving = true;
    render();

    try {
      await templateRepository.deleteTemplate({
        templateId: selected.id,
        name: selected.name
      });

      state.templates = removeTemplateFromCollection(state.templates, selected.id);
      state.selectedId = '';
      state.draft = null;
      state.detailOverlayOpen = false;

      showToastMessage(`Template "${selected.name}" deleted.`, 'success');
    } catch (error) {
      if (error?.isRateLimited) {
        return;
      }
      renderValidation([error.message]);
    } finally {
      state.saving = false;
      render();
    }
  }

  async function applyTemplate() {
    const selected = getSelectedTemplate();
    if (!selected?.uiConfig) {
      return;
    }

    try {
      await appServices.clearCurrentQuery({ suppressToast: true });
    } catch (error) {
      console.error('Failed to clear query before applying template:', error);
    }

    appServices.applyHistoryQueryConfig({
      jsonConfig: selected.uiConfig
    });

    if (appServices.isFormModeActive()) {
      Promise.resolve(appServices.syncFormModeFromCurrentQuery()).catch(error => {
        console.error('Failed to sync form mode after applying template:', error);
      });
    }

    showToastMessage(`Applied template "${selected.name}".`, 'success');

    appServices.closeModalPanel('templates-panel');
  }

  async function togglePinSelectedTemplate() {
    const selected = getSelectedTemplate();
    if (isRestrictedMode() || !selected || state.selectedId === NEW_TEMPLATE_ID) {
      return;
    }
    const wasOverlayOpen = state.detailOverlayOpen;

    state.saving = true;
    render();

    try {
      const nextPinned = !selected.pinned;
      const payload = await templateRepository.updateTemplate(selected.id, buildPinTemplatePayload({
        template: selected,
        nextPinned,
        nextPinOrder: getPinnedTemplateCountExcluding(state.templates, selected.id)
      }));

      const normalized = normalizeTemplate(payload.template || payload, 0);
      state.templates = replaceTemplateInCollection(state.templates, selected.id, normalized, {
        renumberPinned: !nextPinned
      });
      state.selectedId = normalized.id;
      setDraftFromTemplate(normalized);
      state.detailOverlayOpen = wasOverlayOpen;

      showToastMessage(nextPinned ? `Pinned "${normalized.name}".` : `Unpinned "${normalized.name}".`, 'success');
    } catch (error) {
      if (error?.isRateLimited) {
        return;
      }
      renderValidation([error.message]);
    } finally {
      state.saving = false;
      render();
    }
  }

  async function reorderPinnedTemplates(orderedIds) {
    if (isRestrictedMode()) {
      return;
    }

    const normalizedIds = Array.isArray(orderedIds)
      ? orderedIds.map(id => String(id || '').trim()).filter(Boolean)
      : [];
    if (normalizedIds.length < 2) {
      return;
    }

    state.saving = true;
    render();

    try {
      const payload = await templateRepository.reorderPinnedTemplates(normalizedIds);

      if (Array.isArray(payload.templates)) {
        state.templates = sortTemplateCollection(payload.templates.map(normalizeTemplate));
      } else {
        state.templates = applyPinnedTemplateOrder(state.templates, normalizedIds);
      }

      if (state.selectedId) {
        const selected = state.templates.find(template => template.id === state.selectedId);
        if (selected) {
          setDraftFromTemplate(selected);
        }
      }
    } catch (error) {
      if (error?.isRateLimited) {
        return;
      }
      showToastMessage(`Failed to reorder pinned templates: ${error.message}`, 'error');
    } finally {
      state.saving = false;
      state.draggedPinnedId = '';
      render();
    }
  }

  function startCategoryEdit(categoryId) {
    if (isRestrictedMode()) {
      return;
    }

    const category = state.categories.find(item => item.id === categoryId);
    if (!category) {
      return;
    }

    state.editingCategoryId = category.id;
    const elements = getElements();
    if (elements.categoryNameLabel) {
      elements.categoryNameLabel.textContent = 'Edit Category';
    }
    if (elements.categoryNameInput) {
      elements.categoryNameInput.value = category.name;
      elements.categoryNameInput.focus();
    }
    if (elements.categoryDescriptionInput) {
      elements.categoryDescriptionInput.value = category.description || '';
    }
    render();
  }

  function resetCategoryEditor() {
    state.editingCategoryId = '';
    const elements = getElements();
    if (elements.categoryNameLabel) {
      elements.categoryNameLabel.textContent = 'New Category';
    }
    if (elements.categoryNameInput) {
      elements.categoryNameInput.value = '';
    }
    if (elements.categoryDescriptionInput) {
      elements.categoryDescriptionInput.value = '';
    }
  }

  async function saveCategory() {
    if (isRestrictedMode()) {
      return;
    }

    const elements = getElements();
    const rawName = String(elements.categoryNameInput?.value || '').trim();
    const validationError = validateCategoryName(rawName, {
      categories: state.categories,
      currentCategoryId: state.editingCategoryId
    });
    if (validationError) {
      renderValidation([validationError]);
      return;
    }

    state.saving = true;
    render();

    try {
      const payload = await templateRepository.saveCategory({
        categoryId: state.editingCategoryId,
        name: rawName,
        description: String(elements.categoryDescriptionInput?.value || '').trim()
      });

      state.categories = normalizeCategoryList(payload.categories);
      const renamedCategory = payload.category ? normalizeCategory(payload.category, 0) : null;
      if (renamedCategory) {
        state.templates = replaceCategoryInTemplates(state.templates, renamedCategory);

        if (state.draft?.categories) {
          state.draft.categories = replaceCategoryInTemplates([state.draft], renamedCategory)[0].categories;
        }
      }
      resetCategoryEditor();
      renderValidation([]);

      showToastMessage(`Category "${rawName}" saved.`, 'success');
    } catch (error) {
      if (error?.isRateLimited) {
        return;
      }
      renderValidation([error.message]);
    } finally {
      state.saving = false;
      render();
    }
  }

  async function deleteCategory(categoryId) {
    if (isRestrictedMode()) {
      return;
    }

    const category = state.categories.find(item => item.id === categoryId);
    if (!category) {
      return;
    }

    if (!window.confirm(`Delete category "${category.name}" from all templates?`)) {
      return;
    }

    state.saving = true;
    render();

    try {
      const payload = await templateRepository.deleteCategory(categoryId);

      state.categories = normalizeCategoryList(payload.categories);
      state.templates = removeCategoryFromTemplates(state.templates, categoryId);
      if (state.draft?.categories) {
        state.draft.categories = removeCategoryFromTemplates([state.draft], categoryId)[0].categories;
      }
      if (state.selectedCategoryFilter === categoryId) {
        state.selectedCategoryFilter = '';
      }
      if (state.editingCategoryId === categoryId) {
        resetCategoryEditor();
      }
      renderValidation([]);

      showToastMessage(`Category "${category.name}" deleted.`, 'success');
    } catch (error) {
      if (error?.isRateLimited) {
        return;
      }
      renderValidation([error.message]);
    } finally {
      state.saving = false;
      render();
    }
  }

  function renderValidation(errors = []) {
    const validationEl = getElements().validation;
    if (!validationEl) {
      return;
    }

    validationEl.textContent = errors.join(' ');
    validationEl.classList.toggle('visible', errors.length > 0);
  }

  function renderCategoryFilter() {
    const elements = getElements();
    renderTemplateCategoryFilter({
      elements,
      state,
      visibleCount: getVisibleTemplates().length
    });
  }

  function renderCategoryList() {
    const elements = getElements();
    renderTemplateCategoryList({
      elements,
      state,
      restricted: isRestrictedMode(),
      onToggleCategoryFilter(categoryId) {
        state.selectedCategoryFilter = state.selectedCategoryFilter === categoryId ? '' : categoryId;
        reconcileTemplateSelection();
        render();
      },
      onStartCategoryEdit: startCategoryEdit,
      onDeleteCategory: deleteCategory
    });
  }

  function renderCategoryAssignment() {
    renderTemplateCategoryAssignment({
      elements: getElements(),
      state,
      restricted: isRestrictedMode(),
      selected: getSelectedTemplate(),
      onDraftCategoriesChange: syncDraftCategoriesFromInputs,
      onClearValidation() {
        renderValidation([]);
      }
    });
  }

  function renderList() {
    renderTemplateList({
      elements: getElements(),
      state,
      visibleTemplates: getVisibleTemplates(),
      restricted: isRestrictedMode(),
      onSelectTemplate: selectTemplate,
      async onPinTemplate(template) {
        state.selectedId = template.id;
        setDraftFromTemplate(template);
        await togglePinSelectedTemplate();
      },
      onReorderPinnedTemplates: reorderPinnedTemplates,
      onDraggedPinnedIdChange(nextId) {
        state.draggedPinnedId = nextId;
      }
    });
  }

  function renderDetail() {
    const elements = getElements();
    const restricted = isRestrictedMode();
    const selected = getSelectedTemplate();
    const isNew = state.selectedId === NEW_TEMPLATE_ID;

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
      elements.detailTitle.textContent = isNew ? 'Create Template From Current Query' : selected.name;
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

  function render() {
    renderCategoryFilter();
    renderCategoryList();
    renderList();
    renderDetail();
    const elements = getElements();
    if (elements.detailOverlay) {
      elements.detailOverlay.classList.toggle('hidden', !state.detailOverlayOpen);
    }
    if (elements.categoriesOverlay) {
      elements.categoriesOverlay.classList.toggle('hidden', !state.categoriesOverlayOpen);
    }
    renderPinnedStrip();
  }

  function renderPinnedStrip() {
    const elements = getElements();
    if (!elements.pinnedStrip || !elements.pinnedList) {
      return;
    }

    const pinnedTemplates = getPinnedTemplatesForStrip(state.templates);

    elements.pinnedStrip.classList.toggle('hidden', pinnedTemplates.length === 0 && !state.loading);
    elements.pinnedList.replaceChildren(...pinnedTemplates.map(template => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'pinned-template-bubble';
      button.setAttribute('aria-label', `Use pinned template ${template.name}`);
      const description = String(template.description || '').trim() || 'Use pinned template';
      button.setAttribute('data-tooltip', description);
      button.innerHTML = `
        <span class="pinned-template-bubble__name">${escapeHtml(template.name)}</span>
        <span class="pinned-template-bubble__svg">${getTemplateSvgMarkup(template)}</span>
      `;
      button.addEventListener('click', async () => {
        state.selectedId = template.id;
        setDraftFromTemplate(template);
        await applyTemplate();
      });
      return button;
    }));
  }

  function bindEvents() {
    const elements = getElements();
    if (!elements.panel || elements.panel.dataset.templatesBound === 'true') {
      return;
    }

    elements.refreshBtn?.addEventListener('click', () => {
      refreshTemplates({ force: true });
    });

    elements.newBtn?.addEventListener('click', () => {
      startCreateFromCurrentQuery();
    });

    elements.manageCategoriesBtn?.addEventListener('click', () => {
      openCategoriesOverlay();
    });

    elements.nameInput?.addEventListener('input', () => {
      syncDraftFromInputs();
      renderValidation([]);
    });

    elements.descriptionInput?.addEventListener('input', () => {
      syncDraftFromInputs();
      renderValidation([]);
      if (elements.svgPreview && state.draft) {
        elements.svgPreview.innerHTML = getTemplateSvgMarkup(state.draft);
      }
    });

    elements.svgInput?.addEventListener('input', () => {
      syncDraftFromInputs();
      renderValidation([]);
      if (elements.svgPreview && state.draft) {
        elements.svgPreview.innerHTML = getTemplateSvgMarkup(state.draft);
      }
    });

    elements.categoryFilter?.addEventListener('change', event => {
      state.selectedCategoryFilter = event.target.value;
      reconcileTemplateSelection();
      render();
    });

    elements.searchInput?.addEventListener('input', event => {
      state.searchQuery = event.target.value;
      reconcileTemplateSelection();
      render();
    });

    elements.pinnedMoreBtn?.addEventListener('click', () => {
      appServices.openModalPanel('templates-panel');
    });

    elements.categorySaveBtn?.addEventListener('click', () => {
      saveCategory();
    });

    elements.categoryCancelBtn?.addEventListener('click', () => {
      resetCategoryEditor();
      renderValidation([]);
      render();
    });

    [elements.categoriesBackdrop, elements.categoriesCloseBtn].forEach(node => {
      node?.addEventListener('click', () => {
        closeCategoriesOverlay();
      });
    });

    [elements.detailBackdrop, elements.detailCloseBtn].forEach(node => {
      node?.addEventListener('click', () => {
        closeDetailOverlay();
      });
    });

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && state.detailOverlayOpen) {
        closeDetailOverlay();
        return;
      }
      if (event.key === 'Escape' && state.categoriesOverlayOpen) {
        closeCategoriesOverlay();
      }
    });

    elements.useBtn?.addEventListener('click', () => {
      applyTemplate();
    });

    elements.pinBtn?.addEventListener('click', () => {
      togglePinSelectedTemplate();
    });

    elements.saveBtn?.addEventListener('click', () => {
      if (state.selectedId === NEW_TEMPLATE_ID) {
        createTemplate();
      } else {
        updateTemplate();
      }
    });

    elements.deleteBtn?.addEventListener('click', () => {
      deleteTemplate();
    });

    elements.panel.dataset.templatesBound = 'true';
  }

  function openPanel() {
    state.detailOverlayOpen = false;
    if (state.selectedId !== NEW_TEMPLATE_ID) {
      state.selectedId = '';
      state.draft = null;
    }
    bindEvents();
    refreshTemplates({ force: !state.loaded });
  }

  function closePanel() {
    if (state.categoriesOverlayOpen) {
      closeCategoriesOverlay();
    }
    if (state.detailOverlayOpen) {
      closeDetailOverlay();
    }
  }

  registerQueryTemplatesService(Object.freeze({
    openPanel,
    closePanel,
    refreshTemplates
  }));

  onDOMReady(() => {
    bindEvents();
    render();
    refreshTemplates({ force: !state.loaded });
  });
})();
