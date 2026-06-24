import { BackendApi } from '../../core/backendApi.js';
import { onDOMReady } from '../../core/domReady.js';
import { showToastMessage } from '../../core/toast.js';
import { VisibilityUtils } from '../../core/visibility.js';
import { buildQueryUiConfig } from '../filters/queryPayload.js';
import { appServices, registerQueryTemplatesService } from '../../core/appServices.js';
import {
  cloneTemplate,
  normalizeCategoryList,
  normalizeTemplate
} from './data/queryTemplateModels.js';
import { cloneUiConfig, getUniqueTemplateName, hasUsableUiConfig } from './data/queryTemplateUiConfig.js';
import {
  createTemplateDraftFromConfig,
  filterVisibleTemplates,
  validateTemplateDraft
} from './data/queryTemplateState.js';
import {
  appendTemplateToCollection,
  applyPinnedTemplateOrder,
  getPinnedTemplateCountExcluding,
  removeTemplateFromCollection,
  replaceTemplateInCollection,
  sortTemplateCollection
} from './data/queryTemplateCollection.js';
import {
  buildCreateTemplatePayload,
  buildPinTemplatePayload,
  buildUpdateTemplatePayload
} from './data/queryTemplatePayloads.js';
import { createQueryTemplateRepository } from './data/queryTemplateRepository.js';
import {
  buildTemplateDetailMeta,
  getPinnedTemplatesForStrip
} from './view/queryTemplateViewState.js';
import { renderTemplateDetailView } from './view/queryTemplateDetailView.js';
import { createQueryTemplateCategoryActions } from './category/queryTemplateCategoryActions.js';
import {
  renderTemplateCategoryAssignment,
  renderTemplateCategoryFilter,
  renderTemplateCategoryList
} from './category/queryTemplateCategoryView.js';
import { renderTemplateList } from './view/queryTemplateListView.js';
import { getQueryTemplateElements } from './view/queryTemplateElements.js';
import { getTemplateSvgMarkup } from './view/queryTemplateSvg.js';
import { escapeHtml } from '../../core/formatting/html.js';
(function initializeQueryTemplates() {
  const NEW_TEMPLATE_ID = '__new_template__';
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

  function getElements() {
    return getQueryTemplateElements(document);
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
    return hasUsableUiConfig(getCurrentQueryConfigSnapshot());
  }

  function getDraftUiConfigForSave() {
    if (hasUsableUiConfig(state.draft?.uiConfig)) {
      return cloneUiConfig(state.draft.uiConfig);
    }

    return getCurrentQueryConfigSnapshot();
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

  function createFromHistoryQuery(query) {
    if (isRestrictedMode()) {
      return false;
    }

    const uiConfig = cloneUiConfig(query?.jsonConfig || query?.uiConfig || query?.config);
    if (!hasUsableUiConfig(uiConfig)) {
      showToastMessage('This history query does not have saved fields or filters to use as a template.', 'warning');
      return false;
    }

    appServices.openModalPanel('templates-panel');
    state.selectedId = NEW_TEMPLATE_ID;
    state.draft = createTemplateDraftFromConfig(uiConfig);
    state.draft.source = 'history';
    state.draft.name = getUniqueTemplateName(query?.name || 'History query template', state.templates);
    state.draft.description = query?.id
      ? `Created from query history item ${query.id}.`
      : 'Created from query history.';
    state.detailOverlayOpen = true;
    renderValidation([]);
    render();
    refreshTemplates({ force: !state.loaded });
    window.requestAnimationFrame(() => {
      getElements().nameInput?.focus?.();
    });
    return true;
  }

  async function createTemplate() {
    if (isRestrictedMode() || !state.draft) {
      return;
    }

    syncDraftFromInputs();
    const validationErrors = validateTemplateDraft(state.draft, {
      hasUsableCurrentQuery: hasUsableUiConfig(getDraftUiConfigForSave()),
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
        uiConfig: getDraftUiConfigForSave()
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

  const categoryActions = createQueryTemplateCategoryActions({
    getElements,
    isRestrictedMode,
    render,
    renderValidation,
    showToastMessage,
    state,
    templateRepository,
    window
  });
  const {
    deleteCategory,
    resetCategoryEditor,
    saveCategory,
    startCategoryEdit
  } = categoryActions;

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
    renderTemplateDetailView({
      elements: getElements(),
      state,
      selected: getSelectedTemplate(),
      restricted: isRestrictedMode(),
      isNew: state.selectedId === NEW_TEMPLATE_ID,
      getTemplateSvgMarkup,
      buildTemplateDetailMeta,
      renderCategoryAssignment,
      renderValidation
    });
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
    refreshTemplates,
    createFromHistoryQuery
  }));

  onDOMReady(() => {
    bindEvents();
    render();
    refreshTemplates({ force: !state.loaded });
  });
})();
