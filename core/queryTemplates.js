(function initializeQueryTemplates() {
  const NEW_TEMPLATE_ID = '__new_template__';
  const DEFAULT_TEMPLATE_SVG = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" aria-hidden="true">
      <polygon fill="#7AB9E8" points="512,48.762 512,414.476 341.333,463.238 170.667,414.476 0,463.238 0,97.524 170.667,48.762 341.333,97.524"/>
      <polygon fill="#61AAE4" points="170.667,48.762 170.667,414.476 341.333,463.238 341.333,97.524"/>
      <g>
        <path fill="#F8F8F9" d="M456.554,132.02c-2.291-1.729-5.26-2.286-8.018-1.492l-107.203,30.63l-168.154-48.044c-1.642-0.469-3.382-0.469-5.024,0L58.441,144.461c-3.925,1.123-6.63,4.709-6.63,8.792v158.259v0.005v61.164c0,2.87,1.346,5.571,3.636,7.298c2.291,1.727,5.258,2.283,8.018,1.492l107.202-30.63l168.154,48.044c0.82,0.234,1.666,0.352,2.512,0.352c0.845,0,1.691-0.118,2.511-0.352l109.714-31.347c3.925-1.123,6.632-4.709,6.632-8.792V139.319C460.19,136.45,458.843,133.748,456.554,132.02z M341.333,380.587l-168.154-48.044c-0.82-0.234-1.666-0.352-2.512-0.352c-0.845,0-1.691,0.118-2.512,0.352L70.095,360.56v-41.935l10.951-3.128c4.855-1.386,7.667-6.448,6.279-11.302c-1.387-4.855-6.451-7.669-11.303-6.278l-5.927,1.693v-71.955c20.841-4.246,36.571-22.718,36.571-44.794c0-5.051-4.094-9.143-9.143-9.143s-9.143,4.092-9.143,9.143c0,11.919-7.645,22.081-18.286,25.856v-48.564l100.571-28.739l76.19,21.769v11.393c0,5.051,4.094,9.143,9.143,9.143c5.049,0,9.143-4.092,9.143-9.143v-6.168l73.678,21.052c1.642,0.469,3.382,0.469,5.024,0l98.06-28.016v49.301c-3.319,2.119-5.007,6.233-3.869,10.214c0.636,2.227,2.06,4.001,3.869,5.16v68.233c-20.841,4.246-36.571,22.718-36.571,44.794c0,5.051,4.094,9.143,9.143,9.143c5.049,0,9.143-4.092,9.143-9.143c0-11.919,7.643-22.081,18.286-25.856v48.564L341.333,380.587z"/>
      </g>
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
    return Boolean(window.QueryFormMode?.isLimitedView?.());
  }

  function getTemplateId(template) {
    return String(
      template?.id
      || template?.template_id
      || template?.templateId
      || template?.name
      || template?.template_name
      || ''
    ).trim();
  }

  function normalizeCategory(rawCategory, index) {
    const id = String(
      rawCategory?.id
      || rawCategory?.category_id
      || rawCategory?.categoryId
      || rawCategory?.name
      || `category-${index}`
    ).trim();
    const name = String(rawCategory?.name || rawCategory?.category_name || '').trim();
    const description = String(rawCategory?.description || rawCategory?.category_description || '').trim();

    return {
      id,
      name,
      description
    };
  }

  function normalizeCategoryList(rawCategories) {
    if (!Array.isArray(rawCategories)) {
      return [];
    }

    return rawCategories
      .map(normalizeCategory)
      .filter(category => category.id && category.name)
      .sort((left, right) => left.name.localeCompare(right.name, undefined, {
        sensitivity: 'base',
        numeric: true
      }));
  }

  function normalizeTemplate(rawTemplate, index) {
    const uiConfig = rawTemplate?.ui_config || rawTemplate?.jsonConfig || rawTemplate?.config || null;
    const name = String(rawTemplate?.name || rawTemplate?.template_name || '').trim();
    const description = String(rawTemplate?.description || '').trim();
    const svg = String(rawTemplate?.svg || rawTemplate?.bubble_svg || '').trim();
    const id = getTemplateId(rawTemplate) || `template-${index}`;
    const categories = Array.isArray(rawTemplate?.categories)
      ? normalizeCategoryList(rawTemplate.categories)
      : [];

    return {
      id,
      name,
      description,
      svg,
      categories,
      uiConfig,
      pinned: Boolean(rawTemplate?.pinned),
      pinOrder: Number.isFinite(Number(rawTemplate?.pin_order)) ? Number(rawTemplate?.pin_order) : null,
      createdAt: rawTemplate?.created_at || rawTemplate?.createdAt || '',
      updatedAt: rawTemplate?.updated_at || rawTemplate?.updatedAt || rawTemplate?.modified_at || ''
    };
  }

  function cloneTemplate(template) {
    if (!template) {
      return null;
    }

    return {
      id: template.id,
      name: template.name,
      description: template.description,
      svg: template.svg,
      categories: template.categories ? JSON.parse(JSON.stringify(template.categories)) : [],
      uiConfig: template.uiConfig ? JSON.parse(JSON.stringify(template.uiConfig)) : null,
      pinned: Boolean(template.pinned),
      pinOrder: Number.isFinite(Number(template.pinOrder)) ? Number(template.pinOrder) : null,
      createdAt: template.createdAt,
      updatedAt: template.updatedAt
    };
  }

  function sortTemplatesInState() {
    state.templates.sort((left, right) => {
      const leftPinned = left.pinned ? 1 : 0;
      const rightPinned = right.pinned ? 1 : 0;
      if (leftPinned !== rightPinned) {
        return rightPinned - leftPinned;
      }

      if (leftPinned && rightPinned) {
        const leftOrder = Number.isFinite(left.pinOrder) ? left.pinOrder : Number.MAX_SAFE_INTEGER;
        const rightOrder = Number.isFinite(right.pinOrder) ? right.pinOrder : Number.MAX_SAFE_INTEGER;
        if (leftOrder !== rightOrder) {
          return leftOrder - rightOrder;
        }
      }

      return left.name.localeCompare(right.name, undefined, {
        sensitivity: 'base',
        numeric: true
      });
    });
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
    if (typeof window.buildQueryUiConfig !== 'function') {
      return null;
    }

    return window.buildQueryUiConfig();
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

  function formatTimestamp(value) {
    if (!value) {
      return '';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return String(value);
    }

    return date.toLocaleString();
  }

  function getAssignedCategoryIds(draft = state.draft) {
    if (!draft || !Array.isArray(draft.categories)) {
      return [];
    }

    return draft.categories.map(category => category.id);
  }

  function getAssignedCategoriesForPayload(draft = state.draft) {
    if (!draft) {
      return [];
    }

    const assignedIds = new Set(getAssignedCategoryIds(draft));
    return state.categories.filter(category => assignedIds.has(category.id));
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

  function sanitizeSvgMarkup(rawSvg) {
    const normalized = String(rawSvg || '').trim();
    if (!normalized) {
      return '';
    }

    const withoutHeader = normalized
      .replace(/<\?xml[\s\S]*?\?>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .trim();

    if (!/^<svg[\s\S]*<\/svg>$/i.test(withoutHeader)) {
      return '';
    }

    return withoutHeader
      .replace(/\son\w+=(["']).*?\1/gi, '')
      .replace(/\son\w+=([^\s>]+)/gi, '')
      .replace(/<script[\s\S]*?<\/script>/gi, '');
  }

  function getTemplateSvgMarkup(template) {
    return sanitizeSvgMarkup(template?.svg) || DEFAULT_TEMPLATE_SVG;
  }

  function getVisibleTemplates() {
    const searchNeedle = state.searchQuery.trim().toLowerCase();

    return state.templates.filter(template => {
      const matchesCategory = !state.selectedCategoryFilter || (
        Array.isArray(template.categories)
        && template.categories.some(category => category.id === state.selectedCategoryFilter)
      );

      if (!matchesCategory) {
        return false;
      }

      if (!searchNeedle) {
        return true;
      }

      const haystack = [
        template.name,
        template.description,
        ...template.categories.map(category => category.name),
        ...template.categories.map(category => category.description || '')
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(searchNeedle);
    });
  }

  async function sendTemplateRequest(payload) {
    const { data } = await window.BackendApi.postJson(payload);
    if (data.error) {
      throw new Error(data.error);
    }
    return data;
  }

  function validateDraft(draft, options = {}) {
    const validationErrors = [];
    const trimmedName = String(draft?.name || '').trim();

    if (!trimmedName) {
      validationErrors.push('Template name is required.');
    }

    const duplicate = state.templates.find(template =>
      template.name.toLowerCase() === trimmedName.toLowerCase()
      && template.id !== options.currentTemplateId
    );
    if (duplicate) {
      validationErrors.push('Template names must be unique.');
    }

    if (!options.currentTemplateId && !hasUsableCurrentQuery()) {
      validationErrors.push('Build a query with at least one column or filter before saving a template.');
    }

    return validationErrors;
  }

  function validateCategoryName(name, options = {}) {
    const trimmedName = String(name || '').trim();
    if (!trimmedName) {
      return 'Category name is required.';
    }

    const duplicate = state.categories.find(category =>
      category.name.toLowerCase() === trimmedName.toLowerCase()
      && category.id !== options.currentCategoryId
    );

    if (duplicate) {
      return 'Category names must be unique.';
    }

    return '';
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
    window.VisibilityUtils?.show?.([elements.detailOverlay, elements.detail], {
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
    window.VisibilityUtils?.hide?.([elements.detailOverlay, elements.detail], {
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
      const payload = await sendTemplateRequest({ action: 'list_templates' });
      state.templates = (Array.isArray(payload.templates) ? payload.templates : []).map(normalizeTemplate);
      sortTemplatesInState();
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
      if (typeof window.showToastMessage === 'function') {
        window.showToastMessage(`Failed to load templates: ${error.message}`, 'error');
      }
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
    window.VisibilityUtils?.show?.([elements.categoriesOverlay], {
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
    window.VisibilityUtils?.hide?.([elements.categoriesOverlay], {
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
      if (typeof window.showToastMessage === 'function') {
        window.showToastMessage('Build a query before creating a template.', 'warning');
      }
      return;
    }

    state.selectedId = NEW_TEMPLATE_ID;
    state.draft = {
      id: '',
      name: '',
      description: '',
      svg: '',
      categories: [],
      uiConfig: getCurrentQueryConfigSnapshot(),
      pinned: false,
      pinOrder: null,
      createdAt: '',
      updatedAt: ''
    };
    openDetailOverlay();
  }

  async function createTemplate() {
    if (isRestrictedMode() || !state.draft) {
      return;
    }

    syncDraftFromInputs();
    const validationErrors = validateDraft(state.draft);
    if (validationErrors.length) {
      renderValidation(validationErrors);
      return;
    }

    state.saving = true;
    render();

    try {
      const payload = await sendTemplateRequest({
        action: 'create_template',
        name: state.draft.name,
        description: state.draft.description,
        svg: sanitizeSvgMarkup(state.draft.svg),
        categories: getAssignedCategoriesForPayload(state.draft),
        ui_config: getCurrentQueryConfigSnapshot(),
        pinned: Boolean(state.draft.pinned),
        pin_order: Number.isFinite(state.draft.pinOrder) ? state.draft.pinOrder : undefined
      });

      const normalized = normalizeTemplate(payload.template || payload, state.templates.length);
      state.templates.push(normalized);
      sortTemplatesInState();
      state.selectedId = normalized.id;
      setDraftFromTemplate(normalized);
      state.detailOverlayOpen = true;
      state.loaded = true;

      if (typeof window.showToastMessage === 'function') {
        window.showToastMessage(`Template "${normalized.name}" saved.`, 'success');
      }
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
    const validationErrors = validateDraft(state.draft, { currentTemplateId: state.selectedId });
    if (validationErrors.length) {
      renderValidation(validationErrors);
      return;
    }

    state.saving = true;
    render();

    try {
      const payload = await sendTemplateRequest({
        action: 'update_template',
        template_id: state.selectedId,
        name: state.draft.name,
        description: state.draft.description,
        svg: sanitizeSvgMarkup(state.draft.svg),
        categories: getAssignedCategoriesForPayload(state.draft),
        ui_config: hasUsableCurrentQuery() ? getCurrentQueryConfigSnapshot() : state.draft.uiConfig,
        pinned: Boolean(state.draft.pinned),
        pin_order: Number.isFinite(state.draft.pinOrder) ? state.draft.pinOrder : undefined
      });

      const normalized = normalizeTemplate(payload.template || payload, 0);
      const index = state.templates.findIndex(template => template.id === state.selectedId);
      if (index !== -1) {
        state.templates.splice(index, 1, normalized);
      }
      sortTemplatesInState();
      state.selectedId = normalized.id;
      setDraftFromTemplate(normalized);
      state.detailOverlayOpen = true;

      if (typeof window.showToastMessage === 'function') {
        window.showToastMessage(`Template "${normalized.name}" updated.`, 'success');
      }
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
      await sendTemplateRequest({
        action: 'delete_template',
        template_id: selected.id,
        name: selected.name
      });

      state.templates = state.templates.filter(template => template.id !== selected.id);
      state.selectedId = '';
      state.draft = null;
      state.detailOverlayOpen = false;

      if (typeof window.showToastMessage === 'function') {
        window.showToastMessage(`Template "${selected.name}" deleted.`, 'success');
      }
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

    if (typeof window.clearCurrentQuery === 'function') {
      try {
        await window.clearCurrentQuery({ suppressToast: true });
      } catch (error) {
        console.error('Failed to clear query before applying template:', error);
      }
    }

    window.QueryHistorySystem?.applyQueryConfig?.({
      jsonConfig: selected.uiConfig
    });

    if (window.QueryFormMode?.isActive?.()) {
      window.QueryFormMode.syncFromCurrentQuery().catch(error => {
        console.error('Failed to sync form mode after applying template:', error);
      });
    }

    if (typeof window.showToastMessage === 'function') {
      window.showToastMessage(`Applied template "${selected.name}".`, 'success');
    }

    window.modalManager?.closePanel?.('templates-panel');
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
      const pinnedTemplates = state.templates.filter(template => template.pinned && template.id !== selected.id);
      const nextPinned = !selected.pinned;
      const payload = await sendTemplateRequest({
        action: 'update_template',
        template_id: selected.id,
        name: selected.name,
        description: selected.description,
        svg: sanitizeSvgMarkup(selected.svg),
        categories: selected.categories,
        ui_config: selected.uiConfig,
        pinned: nextPinned,
        pin_order: nextPinned ? pinnedTemplates.length : undefined
      });

      const normalized = normalizeTemplate(payload.template || payload, 0);
      const index = state.templates.findIndex(template => template.id === selected.id);
      if (index !== -1) {
        state.templates.splice(index, 1, normalized);
      }
      if (!nextPinned) {
        const stillPinned = state.templates
          .filter(template => template.pinned)
          .sort((left, right) => (left.pinOrder ?? Number.MAX_SAFE_INTEGER) - (right.pinOrder ?? Number.MAX_SAFE_INTEGER));
        stillPinned.forEach((template, orderIndex) => {
          template.pinOrder = orderIndex;
        });
      }
      sortTemplatesInState();
      state.selectedId = normalized.id;
      setDraftFromTemplate(normalized);
      state.detailOverlayOpen = wasOverlayOpen;

      if (typeof window.showToastMessage === 'function') {
        window.showToastMessage(nextPinned ? `Pinned "${normalized.name}".` : `Unpinned "${normalized.name}".`, 'success');
      }
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
      const payload = await sendTemplateRequest({
        action: 'reorder_pinned_templates',
        template_ids: normalizedIds
      });

      if (Array.isArray(payload.templates)) {
        state.templates = payload.templates.map(normalizeTemplate);
        sortTemplatesInState();
      } else {
        state.templates
          .filter(template => template.pinned)
          .sort((left, right) => normalizedIds.indexOf(left.id) - normalizedIds.indexOf(right.id))
          .forEach((template, index) => {
            template.pinOrder = index;
          });
        sortTemplatesInState();
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
      if (typeof window.showToastMessage === 'function') {
        window.showToastMessage(`Failed to reorder pinned templates: ${error.message}`, 'error');
      }
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
      currentCategoryId: state.editingCategoryId
    });
    if (validationError) {
      renderValidation([validationError]);
      return;
    }

    state.saving = true;
    render();

    try {
      const payload = await sendTemplateRequest({
        action: state.editingCategoryId ? 'update_template_category' : 'create_template_category',
        category_id: state.editingCategoryId || undefined,
        name: rawName,
        description: String(elements.categoryDescriptionInput?.value || '').trim()
      });

      state.categories = normalizeCategoryList(payload.categories);
      const renamedCategory = payload.category ? normalizeCategory(payload.category, 0) : null;
      if (renamedCategory) {
        state.templates = state.templates.map(template => ({
          ...template,
          categories: template.categories.map(category =>
            category.id === renamedCategory.id ? renamedCategory : category
          )
        }));

        if (state.draft?.categories) {
          state.draft.categories = state.draft.categories.map(category =>
            category.id === renamedCategory.id ? renamedCategory : category
          );
        }
      }
      resetCategoryEditor();
      renderValidation([]);

      if (typeof window.showToastMessage === 'function') {
        window.showToastMessage(`Category "${rawName}" saved.`, 'success');
      }
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
      const payload = await sendTemplateRequest({
        action: 'delete_template_category',
        category_id: categoryId
      });

      state.categories = normalizeCategoryList(payload.categories);
      state.templates = state.templates.map(template => ({
        ...template,
        categories: template.categories.filter(item => item.id !== categoryId)
      }));
      if (state.draft?.categories) {
        state.draft.categories = state.draft.categories.filter(item => item.id !== categoryId);
      }
      if (state.selectedCategoryFilter === categoryId) {
        state.selectedCategoryFilter = '';
      }
      if (state.editingCategoryId === categoryId) {
        resetCategoryEditor();
      }
      renderValidation([]);

      if (typeof window.showToastMessage === 'function') {
        window.showToastMessage(`Category "${category.name}" deleted.`, 'success');
      }
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
    if (!elements.categoryFilter || !elements.searchInput || !elements.resultsSummary) {
      return;
    }

    const options = [
      '<option value="">All categories</option>',
      ...state.categories.map(category => `<option value="${window.escapeHtml(category.id)}">${window.escapeHtml(category.name)}</option>`)
    ];
    elements.categoryFilter.innerHTML = options.join('');
    elements.categoryFilter.value = state.selectedCategoryFilter;
    elements.categoryFilter.disabled = state.loading || state.saving;
    elements.searchInput.value = state.searchQuery;
    elements.searchInput.disabled = state.loading || state.saving;

    const visibleCount = getVisibleTemplates().length;
    const totalCount = state.templates.length;
    const summaryBits = [];
    if (state.searchQuery.trim()) {
      summaryBits.push(`Search: "${state.searchQuery.trim()}"`);
    }
    if (state.selectedCategoryFilter) {
      const selectedCategory = state.categories.find(category => category.id === state.selectedCategoryFilter);
      summaryBits.push(`Category: ${selectedCategory ? selectedCategory.name : 'Filtered'}`);
    }
    summaryBits.push(`${visibleCount} of ${totalCount} templates`);
    elements.resultsSummary.textContent = summaryBits.join(' • ');
  }

  function renderCategoryList() {
    const elements = getElements();
    const restricted = isRestrictedMode();
    if (!elements.categoryList || !elements.categoryNameInput || !elements.categoryDescriptionInput || !elements.categorySaveBtn || !elements.categoryCancelBtn || !elements.categoryNameLabel) {
      return;
    }

    if (!state.categories.length) {
      const empty = document.createElement('div');
      empty.className = 'templates-category-empty-state';
      empty.innerHTML = restricted
        ? '<h4>No categories yet</h4><p>Categories have not been created yet. You can still browse and use templates.</p>'
        : '<h4>No categories yet</h4><p>Create a category to group related templates and speed up browsing.</p>';
      elements.categoryList.replaceChildren(empty);
    } else {
      elements.categoryList.replaceChildren(...state.categories.map(category => {
        const card = document.createElement('article');
        card.className = 'templates-category-card';
        card.classList.toggle('is-filter-active', category.id === state.selectedCategoryFilter);

        const usageCount = state.templates.filter(template =>
          Array.isArray(template.categories) && template.categories.some(item => item.id === category.id)
        ).length;

        const infoButton = document.createElement('button');
        infoButton.type = 'button';
        infoButton.className = 'templates-category-card__main';
        infoButton.addEventListener('click', () => {
          state.selectedCategoryFilter = state.selectedCategoryFilter === category.id ? '' : category.id;
          reconcileTemplateSelection();
          render();
        });

        const name = document.createElement('div');
        name.className = 'templates-category-card__name';
        name.textContent = category.name;

        const meta = document.createElement('div');
        meta.className = 'templates-category-card__meta';
        meta.textContent = `${usageCount} template${usageCount === 1 ? '' : 's'}${category.description ? ` • ${category.description}` : ''}`;

        infoButton.append(name, meta);
        card.appendChild(infoButton);

        if (!restricted) {
          const actions = document.createElement('div');
          actions.className = 'templates-category-card__actions';

          const editBtn = document.createElement('button');
          editBtn.type = 'button';
          editBtn.className = 'templates-category-card__btn';
          editBtn.textContent = 'Edit';
          editBtn.title = `Edit ${category.name}`;
          editBtn.addEventListener('click', event => {
            event.stopPropagation();
            startCategoryEdit(category.id);
          });
          actions.appendChild(editBtn);

          const deleteBtn = document.createElement('button');
          deleteBtn.type = 'button';
          deleteBtn.className = 'templates-category-card__btn templates-category-card__btn--danger';
          deleteBtn.textContent = 'Delete';
          deleteBtn.title = `Delete ${category.name}`;
          deleteBtn.addEventListener('click', event => {
            event.stopPropagation();
            deleteCategory(category.id);
          });
          actions.appendChild(deleteBtn);

          card.appendChild(actions);
        }

        return card;
      }));
    }

    elements.categoryNameInput.disabled = restricted || state.saving;
    elements.categoryDescriptionInput.disabled = restricted || state.saving;
    elements.categorySaveBtn.disabled = restricted || state.saving;
    elements.categoryCancelBtn.disabled = restricted || state.saving;
    elements.categorySaveBtn.classList.toggle('hidden', restricted);
    elements.categoryCancelBtn.classList.toggle('hidden', restricted || !state.editingCategoryId);
    elements.categorySaveBtn.textContent = state.editingCategoryId ? 'Save Category' : 'Add Category';
    elements.categoryNameLabel.textContent = state.editingCategoryId ? 'Edit Category' : 'New Category';
  }

  function renderCategoryAssignment() {
    const elements = getElements();
    const restricted = isRestrictedMode();
    const selected = getSelectedTemplate();
    if (!elements.categoryAssignment) {
      return;
    }

    if (!selected) {
      elements.categoryAssignment.replaceChildren();
      return;
    }

    if (!state.categories.length) {
      const empty = document.createElement('div');
      empty.className = 'template-category-empty';
      empty.textContent = restricted
        ? 'No categories have been created yet.'
        : 'No categories yet. Add categories in the sidebar to organize templates.';
      elements.categoryAssignment.replaceChildren(empty);
      return;
    }

    const assignedIds = new Set(getAssignedCategoryIds(selected));
    elements.categoryAssignment.replaceChildren(...state.categories.map(category => {
      const label = document.createElement('label');
      label.className = 'template-category-option';

      const input = document.createElement('input');
      input.type = 'checkbox';
      input.value = category.id;
      input.checked = assignedIds.has(category.id);
      input.disabled = restricted || state.saving;
      input.addEventListener('change', () => {
        syncDraftCategoriesFromInputs();
        renderValidation([]);
      });

      const text = document.createElement('span');
      text.textContent = category.name;

      label.append(input, text);
      return label;
    }));
  }

  function renderList() {
    const elements = getElements();
    if (!elements.list || !elements.listStatus) {
      return;
    }

    const visibleTemplates = getVisibleTemplates();
    const pinnedTemplates = visibleTemplates.filter(template => template.pinned);
    const otherTemplates = visibleTemplates.filter(template => !template.pinned);
    if (state.loading) {
      elements.listStatus.textContent = 'Loading templates…';
      elements.listStatus.classList.remove('hidden');
      elements.list.replaceChildren();
      elements.emptyState?.classList.add('hidden');
      return;
    }

    if (!visibleTemplates.length) {
      elements.listStatus.classList.add('hidden');
      elements.list.replaceChildren();
      elements.emptyState?.classList.remove('hidden');
      return;
    }

    elements.emptyState?.classList.add('hidden');
    elements.listStatus.classList.add('hidden');
    function createTemplateRow(template, options = {}) {
      const row = document.createElement('div');
      row.className = 'templates-list-row';
      row.classList.toggle('is-pinned', Boolean(template.pinned));
      row.classList.toggle('is-draggable', Boolean(options.draggable));
      row.dataset.templateId = template.id;

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'templates-list-item';
      button.classList.toggle('is-selected', template.id === state.selectedId);
      button.dataset.templateId = template.id;
      const descriptionTooltip = String(template.description || '').trim() || 'No description provided.';
      button.setAttribute('data-tooltip', descriptionTooltip);
      button.setAttribute('aria-label', `${template.name}. ${descriptionTooltip}`);
      button.innerHTML = `
        <div class="templates-list-item__title-row">
          ${template.pinned ? '<span class="templates-list-item__pin-badge">Pinned</span>' : ''}
          <div class="templates-list-item__title">${window.escapeHtml(template.name)}</div>
        </div>`;
      button.addEventListener('click', () => selectTemplate(template.id));
      row.appendChild(button);

      if (!isRestrictedMode()) {
        const pinBtn = document.createElement('button');
        pinBtn.type = 'button';
        pinBtn.className = 'templates-list-pin-btn';
        pinBtn.textContent = template.pinned ? 'Unpin' : 'Pin';
        pinBtn.setAttribute('aria-label', `${template.pinned ? 'Unpin' : 'Pin'} ${template.name}`);
        pinBtn.addEventListener('click', async event => {
          event.stopPropagation();
          state.selectedId = template.id;
          setDraftFromTemplate(template);
          await togglePinSelectedTemplate();
        });
        row.appendChild(pinBtn);
      }

      if (options.draggable && !isRestrictedMode()) {
        row.draggable = true;
        row.addEventListener('dragstart', event => {
          state.draggedPinnedId = template.id;
          row.classList.add('is-dragging');
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData('text/plain', template.id);
        });
        row.addEventListener('dragend', () => {
          state.draggedPinnedId = '';
          row.classList.remove('is-dragging');
          elements.list.querySelectorAll('.templates-list-row').forEach(item => item.classList.remove('is-drop-target'));
        });
        row.addEventListener('dragover', event => {
          event.preventDefault();
          if (state.draggedPinnedId && state.draggedPinnedId !== template.id) {
            row.classList.add('is-drop-target');
          }
        });
        row.addEventListener('dragleave', () => {
          row.classList.remove('is-drop-target');
        });
        row.addEventListener('drop', event => {
          event.preventDefault();
          row.classList.remove('is-drop-target');
          const draggedId = state.draggedPinnedId || event.dataTransfer.getData('text/plain');
          if (!draggedId || draggedId === template.id) {
            return;
          }
          const nextPinnedIds = pinnedTemplates.map(item => item.id);
          const fromIndex = nextPinnedIds.indexOf(draggedId);
          const toIndex = nextPinnedIds.indexOf(template.id);
          if (fromIndex === -1 || toIndex === -1) {
            return;
          }
          nextPinnedIds.splice(toIndex, 0, nextPinnedIds.splice(fromIndex, 1)[0]);
          reorderPinnedTemplates(nextPinnedIds);
        });
      }

      return row;
    }

    const fragment = document.createDocumentFragment();
    const buildSection = (title, items, options = {}) => {
      if (!items.length) return;
      const section = document.createElement('section');
      section.className = 'templates-list-section';
      const header = document.createElement('div');
      header.className = 'templates-list-section__header';
      header.innerHTML = `<h4 class="templates-list-section__title">${window.escapeHtml(title)}</h4><span class="templates-list-section__count">${items.length}</span>`;
      section.appendChild(header);
      const body = document.createElement('div');
      body.className = 'templates-list-section__body';
      items.forEach(template => body.appendChild(createTemplateRow(template, options)));
      section.appendChild(body);
      fragment.appendChild(section);
    };

    buildSection('Pinned Templates', pinnedTemplates, { draggable: pinnedTemplates.length > 1 });
    buildSection(pinnedTemplates.length ? 'All Other Templates' : 'Templates', otherTemplates);
    elements.list.replaceChildren(fragment);
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
      const metaParts = [];
      const timestamp = formatTimestamp(selected.updatedAt || selected.createdAt);
      if (timestamp) {
        metaParts.push(`Last saved ${timestamp}`);
      }
      if (selected.categories.length) {
        metaParts.push(`Categories: ${selected.categories.map(category => category.name).join(', ')}`);
      }
      if (!restricted) {
        metaParts.push(isNew
          ? 'Saving will capture the current query columns and filters.'
          : 'Saving will update the query to your current columns and filters, or preserve the existing query if none is built.'
        );
      }
      elements.meta.textContent = metaParts.join(' • ');
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

    const pinnedTemplates = state.templates
      .filter(template => template.pinned)
      .sort((left, right) => {
        const leftOrder = Number.isFinite(left.pinOrder) ? left.pinOrder : Number.MAX_SAFE_INTEGER;
        const rightOrder = Number.isFinite(right.pinOrder) ? right.pinOrder : Number.MAX_SAFE_INTEGER;
        return leftOrder - rightOrder;
      });

    elements.pinnedStrip.classList.toggle('hidden', pinnedTemplates.length === 0 && !state.loading);
    elements.pinnedList.replaceChildren(...pinnedTemplates.map(template => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'pinned-template-bubble';
      button.setAttribute('aria-label', `Use pinned template ${template.name}`);
      const description = String(template.description || '').trim() || 'Use pinned template';
      button.setAttribute('data-tooltip', description);
      button.innerHTML = `
        <span class="pinned-template-bubble__name">${window.escapeHtml(template.name)}</span>
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
      window.modalManager?.openPanel?.('templates-panel');
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

  window.QueryTemplatesSystem = {
    openPanel,
    closePanel,
    refreshTemplates
  };

  window.onDOMReady(() => {
    bindEvents();
    render();
    refreshTemplates({ force: !state.loaded });
  });
})();
