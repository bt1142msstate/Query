(function initializeQueryTemplates() {
  const API_URL = 'https://mlp.sirsi.net/uhtbin/query_api.pl';
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
    editingCategoryId: ''
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
      emptyState: el('templates-empty-state'),
      detail: el('templates-detail'),
      detailMode: el('templates-detail-mode'),
      detailTitle: el('templates-detail-title'),
      nameInput: el('template-name-input'),
      descriptionInput: el('template-description-input'),
      validation: el('templates-validation'),
      meta: el('templates-meta'),
      useBtn: el('template-use-btn'),
      saveBtn: el('template-save-btn'),
      deleteBtn: el('template-delete-btn'),
      categoryFilter: el('templates-category-filter'),
      searchInput: el('templates-search-input'),
      resultsSummary: el('templates-results-summary'),
      categoryList: el('templates-category-list'),
      categoryNameLabel: el('template-category-name-label'),
      categoryNameInput: el('template-category-name-input'),
      categorySaveBtn: el('template-category-save-btn'),
      categoryCancelBtn: el('template-category-cancel-btn'),
      categoryAssignment: el('template-category-assignment')
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

    return {
      id,
      name
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
    const id = getTemplateId(rawTemplate) || `template-${index}`;
    const categories = Array.isArray(rawTemplate?.categories)
      ? normalizeCategoryList(rawTemplate.categories)
      : [];

    return {
      id,
      name,
      description,
      categories,
      uiConfig,
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
      categories: template.categories ? JSON.parse(JSON.stringify(template.categories)) : [],
      uiConfig: template.uiConfig ? JSON.parse(JSON.stringify(template.uiConfig)) : null,
      createdAt: template.createdAt,
      updatedAt: template.updatedAt
    };
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
    syncDraftCategoriesFromInputs();
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
        ...template.categories.map(category => category.name)
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(searchNeedle);
    });
  }

  async function sendTemplateRequest(payload) {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const text = await response.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch (_) {
      throw new Error(text || `Server error: ${response.status}`);
    }

    if (!response.ok || data.error) {
      throw new Error(data.error || `Server error: ${response.status}`);
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

    if (!hasUsableCurrentQuery()) {
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
      }
    }

    if (!state.selectedId && visibleTemplates.length) {
      state.selectedId = visibleTemplates[0].id;
      setDraftFromTemplate(visibleTemplates[0]);
    }
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
      state.templates = (Array.isArray(payload.templates) ? payload.templates : [])
        .map(normalizeTemplate)
        .sort((left, right) => left.name.localeCompare(right.name, undefined, {
          sensitivity: 'base',
          numeric: true
        }));
      state.categories = normalizeCategoryList(payload.categories);
      if (state.selectedCategoryFilter && !state.categories.some(category => category.id === state.selectedCategoryFilter)) {
        state.selectedCategoryFilter = '';
      }
      reconcileTemplateSelection();
      state.loaded = true;
    } catch (error) {
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
      categories: [],
      uiConfig: getCurrentQueryConfigSnapshot(),
      createdAt: '',
      updatedAt: ''
    };
    render();
    getElements().nameInput?.focus();
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
        categories: getAssignedCategoriesForPayload(state.draft),
        ui_config: getCurrentQueryConfigSnapshot()
      });

      const normalized = normalizeTemplate(payload.template || payload, state.templates.length);
      state.templates.push(normalized);
      state.templates.sort((left, right) => left.name.localeCompare(right.name, undefined, {
        sensitivity: 'base',
        numeric: true
      }));
      state.selectedId = normalized.id;
      setDraftFromTemplate(normalized);
      state.loaded = true;

      if (typeof window.showToastMessage === 'function') {
        window.showToastMessage(`Template "${normalized.name}" saved.`, 'success');
      }
    } catch (error) {
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
        categories: getAssignedCategoriesForPayload(state.draft),
        ui_config: getCurrentQueryConfigSnapshot()
      });

      const normalized = normalizeTemplate(payload.template || payload, 0);
      const index = state.templates.findIndex(template => template.id === state.selectedId);
      if (index !== -1) {
        state.templates.splice(index, 1, normalized);
      }
      state.templates.sort((left, right) => left.name.localeCompare(right.name, undefined, {
        sensitivity: 'base',
        numeric: true
      }));
      state.selectedId = normalized.id;
      setDraftFromTemplate(normalized);

      if (typeof window.showToastMessage === 'function') {
        window.showToastMessage(`Template "${normalized.name}" updated.`, 'success');
      }
    } catch (error) {
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
      reconcileTemplateSelection();

      if (typeof window.showToastMessage === 'function') {
        window.showToastMessage(`Template "${selected.name}" deleted.`, 'success');
      }
    } catch (error) {
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
        name: rawName
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
    if (!elements.categoryList || !elements.categoryNameInput || !elements.categorySaveBtn || !elements.categoryCancelBtn || !elements.categoryNameLabel) {
      return;
    }

    elements.categoryList.replaceChildren(...state.categories.map(category => {
      const chip = document.createElement('div');
      chip.className = 'templates-category-chip';
      chip.classList.toggle('is-filter-active', category.id === state.selectedCategoryFilter);

      const nameButton = document.createElement('button');
      nameButton.type = 'button';
      nameButton.className = 'templates-category-chip__name';
      nameButton.textContent = category.name;
      nameButton.addEventListener('click', () => {
        state.selectedCategoryFilter = state.selectedCategoryFilter === category.id ? '' : category.id;
        reconcileTemplateSelection();
        render();
      });
      chip.appendChild(nameButton);

      if (!restricted) {
        const actions = document.createElement('div');
        actions.className = 'templates-category-chip__actions';

        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'templates-category-chip__btn';
        editBtn.textContent = 'E';
        editBtn.title = `Edit ${category.name}`;
        editBtn.addEventListener('click', event => {
          event.stopPropagation();
          startCategoryEdit(category.id);
        });
        actions.appendChild(editBtn);

        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'templates-category-chip__btn';
        deleteBtn.textContent = 'X';
        deleteBtn.title = `Delete ${category.name}`;
        deleteBtn.addEventListener('click', event => {
          event.stopPropagation();
          deleteCategory(category.id);
        });
        actions.appendChild(deleteBtn);

        chip.appendChild(actions);
      }

      return chip;
    }));

    elements.categoryNameInput.disabled = restricted || state.saving;
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
    if (state.loading) {
      elements.listStatus.textContent = 'Loading templates…';
      elements.listStatus.classList.remove('hidden');
      elements.list.replaceChildren();
      return;
    }

    if (!visibleTemplates.length) {
      elements.listStatus.textContent = state.selectedCategoryFilter
        ? 'No templates match the selected category.'
        : 'No templates saved yet.';
      elements.listStatus.classList.remove('hidden');
      elements.list.replaceChildren();
      return;
    }

    elements.listStatus.classList.add('hidden');
    elements.list.replaceChildren(...visibleTemplates.map(template => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'templates-list-item';
      button.classList.toggle('is-selected', template.id === state.selectedId);
      button.dataset.templateId = template.id;

      const categorySummary = template.categories.length
        ? template.categories.map(category => category.name).join(', ')
        : 'Uncategorized';

      button.innerHTML = `
        <div class="templates-list-item__title">${window.escapeHtml(template.name)}</div>
        <div class="templates-list-item__description">${window.escapeHtml(template.description || 'No description yet.')}</div>
        <div class="templates-list-item__meta">${window.escapeHtml(categorySummary)}</div>
        <div class="templates-list-item__meta">${window.escapeHtml(formatTimestamp(template.updatedAt || template.createdAt) || 'Saved on server')}</div>
      `;
      button.addEventListener('click', () => selectTemplate(template.id));
      return button;
    }));
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

    if (!selected) {
      elements.emptyState?.classList.remove('hidden');
      elements.detail?.classList.add('hidden');
      renderValidation([]);
      renderCategoryAssignment();
      return;
    }

    elements.emptyState?.classList.add('hidden');
    elements.detail?.classList.remove('hidden');

    if (elements.detailMode) {
      elements.detailMode.textContent = isNew ? 'New Template' : (restricted ? 'Read Only' : 'Editable Template');
    }

    if (elements.detailTitle) {
      elements.detailTitle.textContent = isNew ? 'Create Template From Current Query' : selected.name;
    }

    if (elements.nameInput) {
      elements.nameInput.value = selected.name || '';
      elements.nameInput.disabled = restricted || state.saving;
      elements.nameInput.readOnly = restricted;
    }

    if (elements.descriptionInput) {
      elements.descriptionInput.value = selected.description || '';
      elements.descriptionInput.disabled = restricted || state.saving;
      elements.descriptionInput.readOnly = restricted;
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
        metaParts.push('Saving will capture the current query columns and filters.');
      }
      elements.meta.textContent = metaParts.join(' • ');
    }

    if (elements.useBtn) {
      elements.useBtn.disabled = state.saving;
      elements.useBtn.classList.toggle('hidden', isNew);
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

    elements.nameInput?.addEventListener('input', () => {
      syncDraftFromInputs();
      renderValidation([]);
    });

    elements.descriptionInput?.addEventListener('input', () => {
      syncDraftFromInputs();
      renderValidation([]);
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

    elements.categorySaveBtn?.addEventListener('click', () => {
      saveCategory();
    });

    elements.categoryCancelBtn?.addEventListener('click', () => {
      resetCategoryEditor();
      renderValidation([]);
      render();
    });

    elements.useBtn?.addEventListener('click', () => {
      applyTemplate();
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
    bindEvents();
    refreshTemplates({ force: !state.loaded });
  }

  window.QueryTemplatesSystem = {
    openPanel,
    refreshTemplates
  };

  window.onDOMReady(() => {
    bindEvents();
    render();
  });
})();
