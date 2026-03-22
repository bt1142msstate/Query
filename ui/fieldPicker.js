(function() {
  const services = window.AppServices;
  const { getDisplayedFields, getFilterGroupForField } = window.QueryStateReaders;

  function getFieldPickerOptionsFromDefinitions() {
    const source = Array.isArray(window.fieldDefsArray) && window.fieldDefsArray.length > 0
      ? window.fieldDefsArray
      : Array.from((window.fieldDefs && window.fieldDefs.values()) || []);

    return source
      .filter(fieldDef => fieldDef && fieldDef.name)
      .map(fieldDef => ({
        name: String(fieldDef.name),
        type: String(fieldDef.type || 'text'),
        filterable: typeof window.isFieldBackendFilterable === 'function'
          ? window.isFieldBackendFilterable(fieldDef)
          : Array.isArray(fieldDef.filters) && fieldDef.filters.length > 0,
        desc: typeof fieldDef.desc === 'string' ? fieldDef.desc : '',
        description: typeof fieldDef.description === 'string' ? fieldDef.description : '',
        category: Array.isArray(fieldDef.category)
          ? fieldDef.category.filter(Boolean).join(', ')
          : String(fieldDef.category || ''),
        tooltipHtml: typeof window.formatFieldDefinitionTooltipHTML === 'function'
          ? window.formatFieldDefinitionTooltipHTML(fieldDef, { title: fieldDef.name })
          : ''
      }))
      .sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' }));
  }

  function normalizePickerState(state) {
    return {
      display: Boolean(state && state.display),
      filter: Boolean(state && state.filter)
    };
  }

  async function openSharedFieldPicker(config = {}) {
    if (typeof config.beforeOpen === 'function') {
      await config.beforeOpen();
    }

    const resolvedOptions = await (typeof config.getOptions === 'function'
      ? config.getOptions()
      : getFieldPickerOptionsFromDefinitions());
    const options = Array.isArray(resolvedOptions) ? resolvedOptions : [];

    if (options.length === 0) {
      if (window.showToastMessage) {
        window.showToastMessage(config.emptyToastMessage || 'No fields are available right now.', 'warning');
      }
      return;
    }

    const labels = {
      kicker: 'Add Field',
      title: 'Choose a field',
      description: 'Select a field, then decide how it should be used.',
      displayChoice: 'Display in results',
      filterChoice: 'Add filter control',
      displayBadge: 'Displayed',
      filterBadge: 'Filter',
      selectedFieldLabel: 'Selected field',
      footerNote: 'Changes apply automatically.',
      ...config.labels
    };

    const allowDisplay = config.allowDisplay !== false;
    const allowFilter = config.allowFilter !== false;
    const autoApplyDisplayOnOptionClick = Boolean(config.autoApplyDisplayOnOptionClick && allowDisplay);
    const compactLayout = Boolean(config.compactLayout);
    const autoAddFilterFromPreview = Boolean(
      config.autoAddFilterFromPreview
      && allowFilter
      && typeof config.renderFilterPreview === 'function'
    );
    const getFieldState = typeof config.getFieldState === 'function'
      ? config.getFieldState
      : (() => ({ display: false, filter: false }));

    const backdrop = document.createElement('div');
    backdrop.className = 'form-mode-field-picker-backdrop';

    const modal = document.createElement('div');
    modal.className = 'form-mode-field-picker-modal';
    if (compactLayout) {
      modal.classList.add('form-mode-field-picker-modal--compact');
    }
    modal.innerHTML = `
      <div class="form-mode-field-picker-header">
        <div>
          ${labels.kicker ? `<span class="form-mode-field-picker-kicker">${labels.kicker}</span>` : ''}
          <h3 class="form-mode-field-picker-title">${labels.title}</h3>
          <p class="form-mode-field-picker-description">${labels.description}</p>
        </div>
        <button type="button" class="form-mode-field-picker-close" aria-label="Close field picker">×</button>
      </div>
      <div class="form-mode-field-picker-body">
        <div class="form-mode-field-picker-list-panel">
          <div class="form-mode-field-picker-controls">
            <input type="search" class="form-mode-field-picker-search" placeholder="Search fields..." aria-label="Search fields" data-search-ui="enhanced" data-search-wrapper-class="form-mode-field-picker-search-field" data-search-clear-label="Clear field search" />
            <label class="form-mode-field-picker-category-wrap">
              <span class="form-mode-field-picker-category-label">Category</span>
              <select class="form-mode-field-picker-category-select" aria-label="Filter fields by category">
                <option value="">All categories</option>
              </select>
            </label>
          </div>
          <div class="form-mode-field-picker-list" role="listbox" aria-label="Available fields"></div>
        </div>
        ${compactLayout ? '' : `<div class="form-mode-field-picker-details">
          <p class="form-mode-field-picker-selected-label">${labels.selectedFieldLabel}</p>
          <h4 class="form-mode-field-picker-field-name"></h4>
          <p class="form-mode-field-picker-field-meta hidden"></p>
          ${allowDisplay ? `<label class="form-mode-field-picker-choice"><input type="checkbox" data-field-picker-choice="display" /><span>${labels.displayChoice}</span></label>` : ''}
          ${allowFilter && !autoAddFilterFromPreview ? `<label class="form-mode-field-picker-choice"><input type="checkbox" data-field-picker-choice="filter" /><span>${labels.filterChoice}</span></label>` : ''}
          ${allowFilter && typeof config.renderFilterPreview === 'function' ? `<div class="form-mode-field-picker-filter-preview hidden" data-field-picker-filter-preview>
            <p class="form-mode-field-picker-filter-preview-label">Filter preview</p>
            <div class="form-mode-field-picker-filter-preview-host"></div>
          </div>` : ''}
          <p class="form-mode-field-picker-status"></p>
        </div>`}
      </div>
      <div class="form-mode-field-picker-footer">
        <span class="form-mode-field-picker-footer-note">${labels.footerNote}</span>
      </div>
    `;

    document.body.appendChild(backdrop);
    document.body.appendChild(modal);

    const closeButton = modal.querySelector('.form-mode-field-picker-close');
    const searchInput = modal.querySelector('.form-mode-field-picker-search');
    const categorySelect = modal.querySelector('.form-mode-field-picker-category-select');
    const listEl = modal.querySelector('.form-mode-field-picker-list');
    const fieldNameEl = modal.querySelector('.form-mode-field-picker-field-name');
    const fieldMetaEl = modal.querySelector('.form-mode-field-picker-field-meta');
    const statusEl = modal.querySelector('.form-mode-field-picker-status');
    const displayChoice = modal.querySelector('[data-field-picker-choice="display"]');
    const filterChoice = modal.querySelector('[data-field-picker-choice="filter"]');
    const filterPreviewWrap = modal.querySelector('[data-field-picker-filter-preview]');
    const filterPreviewHost = modal.querySelector('.form-mode-field-picker-filter-preview-host');
    let currentFilterPreviewApi = null;
    let previewSyncTimer = null;
    const filterPreviewDrafts = new Map();

    if (searchInput && typeof window.initializeSearchInputs === 'function') {
      window.initializeSearchInputs(modal);
    }

    let selectedFieldName = options.some(option => option.name === config.initialFieldName)
      ? config.initialFieldName
      : options[0].name;
    let searchTerm = '';
    let selectedCategory = '';
    let syncingControls = false;

    const categories = options
      .flatMap(option => String(option.category || '')
        .split(',')
        .map(category => category.trim())
        .filter(Boolean))
      .filter((category, index, list) => list.indexOf(category) === index)
      .sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }));

    if (categorySelect) {
      categories.forEach(category => {
        const option = document.createElement('option');
        option.value = category;
        option.textContent = category;
        categorySelect.appendChild(option);
      });
    }

    function clearFilterPreview() {
      if (previewSyncTimer) {
        window.clearTimeout(previewSyncTimer);
        previewSyncTimer = null;
      }
      if (currentFilterPreviewApi && typeof currentFilterPreviewApi.cleanup === 'function') {
        currentFilterPreviewApi.cleanup();
      }
      currentFilterPreviewApi = null;
      if (filterPreviewHost) {
        filterPreviewHost.replaceChildren();
      }
      if (filterPreviewWrap) {
        filterPreviewWrap.classList.add('hidden');
      }
    }

    function cleanup() {
      document.removeEventListener('keydown', onKeyDown);
      clearFilterPreview();
      backdrop.remove();
      modal.remove();
    }

    function onKeyDown(event) {
      if (event.key === 'Escape') {
        cleanup();
      }
    }

    function getSelectedState() {
      return normalizePickerState(getFieldState(selectedFieldName));
    }

    function syncChoiceInputs() {
      const state = getSelectedState();
      const selected = options.find(option => option.name === selectedFieldName) || null;
      syncingControls = true;
      if (displayChoice) displayChoice.checked = state.display;
      if (filterChoice) {
        filterChoice.checked = state.filter;
        filterChoice.disabled = Boolean(selected && selected.filterable === false);
      }
      syncingControls = false;
    }

    function syncOptionBadges() {
      listEl.querySelectorAll('.form-mode-field-picker-option').forEach(button => {
        const fieldName = String(button.dataset.fieldName || '').trim();
        if (!fieldName) return;

        button.classList.toggle('is-selected', fieldName === selectedFieldName);

        const state = normalizePickerState(getFieldState(fieldName));
        const badges = [];
        if (allowDisplay && state.display) {
          badges.push(`<span class="form-mode-field-picker-badge">${labels.displayBadge}</span>`);
        }
        if (allowFilter && state.filter) {
          badges.push(`<span class="form-mode-field-picker-badge">${labels.filterBadge}</span>`);
        }

        const badgesEl = button.querySelector('.form-mode-field-picker-option-badges');
        if (badgesEl) {
          badgesEl.innerHTML = badges.join('');
        }
      });
    }

    function getCurrentFilterPreviewState() {
      if (currentFilterPreviewApi && typeof currentFilterPreviewApi.getState === 'function') {
        return currentFilterPreviewApi.getState();
      }

      return filterPreviewDrafts.get(selectedFieldName) || null;
    }

    function isFilterPreviewReady(previewState) {
      if (typeof config.isFilterPreviewReady === 'function') {
        return Boolean(config.isFilterPreviewReady(previewState));
      }

      if (!previewState || !Array.isArray(previewState.values)) {
        return false;
      }

      const values = previewState.values.map(value => String(value || '').trim());
      if (String(previewState.operator || '').trim().toLowerCase() === 'between') {
        return Boolean(values[0] && values[1]);
      }

      return values.some(Boolean);
    }

    async function syncAutoFilterFromPreview() {
      if (!autoAddFilterFromPreview) {
        return;
      }

      const selected = options.find(option => option.name === selectedFieldName) || null;
      if (!selected || selected.filterable === false) {
        return;
      }

      const previewState = getCurrentFilterPreviewState();
      if (!isFilterPreviewReady(previewState)) {
        return;
      }

      const currentState = normalizePickerState(getFieldState(selectedFieldName));
      if (currentState.filter) {
        if (typeof config.onFilterPreviewChange === 'function') {
          await config.onFilterPreviewChange(selectedFieldName, previewState, { modal, cleanup });
          syncOptionBadges();
          syncChoiceInputs();
          syncStatusTextOnly(selected);
        }
        return;
      }

      await applyFilterChange(selectedFieldName, true, { trigger: 'preview-auto-add' });
    }

    function scheduleAutoFilterSync(previewState = null) {
      if (!autoAddFilterFromPreview) {
        return;
      }

      if (previewState && previewState.fieldName) {
        filterPreviewDrafts.set(previewState.fieldName, {
          fieldName: previewState.fieldName,
          operator: previewState.operator,
          values: Array.isArray(previewState.values) ? previewState.values.slice() : []
        });
      }

      if (previewSyncTimer) {
        window.clearTimeout(previewSyncTimer);
      }

      previewSyncTimer = window.setTimeout(() => {
        previewSyncTimer = null;
        syncAutoFilterFromPreview().catch(error => {
          console.error('Failed to auto-add filter from preview:', error);
        });
      }, 0);
    }

    function syncFilterPreview() {
      if (!filterPreviewWrap || !filterPreviewHost || typeof config.renderFilterPreview !== 'function') {
        return;
      }

      clearFilterPreview();
      const selected = options.find(option => option.name === selectedFieldName) || null;
      if (!selected || selected.filterable === false) {
        return;
      }

      const previewApi = config.renderFilterPreview(filterPreviewHost, selectedFieldName, {
        selected,
        state: getSelectedState(),
        previewState: filterPreviewDrafts.get(selectedFieldName) || null,
        onPreviewChange: scheduleAutoFilterSync
      });

      if (previewApi && typeof previewApi === 'object') {
        currentFilterPreviewApi = previewApi;
      }
      if (filterPreviewHost.childNodes.length > 0) {
        filterPreviewWrap.classList.remove('hidden');
      }
    }

    function syncStatusTextOnly(selected = options.find(option => option.name === selectedFieldName) || null) {
      if (!statusEl) {
        return;
      }

      if (!selected) {
        statusEl.textContent = 'No field selected.';
        return;
      }

      const state = getSelectedState();
      const statusParts = [];
      if (allowDisplay && displayChoice) {
        if (displayChoice.checked && !state.display) {
          statusParts.push(`Will ${labels.displayChoice.toLowerCase()}`);
        } else if (!displayChoice.checked && state.display) {
          statusParts.push(`Will remove ${labels.displayChoice.toLowerCase()}`);
        } else if (state.display) {
          statusParts.push(labels.displayBadge);
        }
      }

      if (allowFilter && filterChoice) {
        if (selected.filterable === false) {
          statusParts.push('Backend filtering unavailable');
        } else if (filterChoice.checked && !state.filter) {
          statusParts.push(`Will ${labels.filterChoice.toLowerCase()}`);
        } else if (!filterChoice.checked && state.filter) {
          statusParts.push(`Will remove ${labels.filterChoice.toLowerCase()}`);
        } else if (state.filter) {
          statusParts.push(labels.filterBadge);
        }
      } else if (allowFilter && autoAddFilterFromPreview) {
        if (selected.filterable === false) {
          statusParts.push('Backend filtering unavailable');
        } else if (state.filter) {
          statusParts.push(labels.filterBadge);
        } else {
          statusParts.push('Enter a filter value to add it');
        }
      }

      statusEl.textContent = statusParts.length > 0
        ? statusParts.join(' • ')
        : 'No changes for this field.';
    }

    function syncDetails() {
      if (!fieldNameEl || !fieldMetaEl || !statusEl) {
        return;
      }

      const selected = options.find(option => option.name === selectedFieldName) || null;
      if (!selected) {
        fieldNameEl.textContent = '';
        fieldMetaEl.textContent = '';
        fieldMetaEl.classList.add('hidden');
        statusEl.textContent = 'No field selected.';
        clearFilterPreview();
        return;
      }

      const metaParts = [];
      if (selected.type) metaParts.push(selected.type);
      if (selected.category) metaParts.push(selected.category);

      fieldNameEl.textContent = selected.name;
      fieldMetaEl.textContent = metaParts.join(' • ');
      fieldMetaEl.classList.toggle('hidden', metaParts.length === 0);

      syncStatusTextOnly(selected);
      syncFilterPreview();
    }

    async function handlePickerActionResult(result) {
      if (result && result.close) {
        cleanup();
        if (typeof result.afterClose === 'function') {
          window.setTimeout(() => result.afterClose(), 0);
        }
        return;
      }
      renderList();
      syncChoiceInputs();
      syncDetails();
    }

    async function applyDisplayChange(fieldName, nextChecked, options = {}) {
      if (!fieldName || typeof config.onDisplayChange !== 'function') {
        return;
      }

      const currentState = normalizePickerState(getFieldState(fieldName));
      if (currentState.display === nextChecked) {
        if (options.closeIfUnchanged) {
          cleanup();
        } else {
          renderList();
          syncChoiceInputs();
          syncDetails();
        }
        return;
      }

      selectedFieldName = fieldName;
      const result = await config.onDisplayChange(fieldName, nextChecked, { cleanup, modal, trigger: options.trigger });
      await handlePickerActionResult(result);

      if (options.closeAfterApply) {
        cleanup();
      }
    }

    async function applyFilterChange(fieldName, nextChecked, options = {}) {
      if (!fieldName || typeof config.onFilterChange !== 'function') {
        return;
      }

      const selected = optionsListFind(fieldName);
      if (selected && selected.filterable === false) {
        syncChoiceInputs();
        syncDetails();
        return;
      }

      const currentState = normalizePickerState(getFieldState(fieldName));
      if (currentState.filter === nextChecked) {
        renderList();
        syncChoiceInputs();
        syncDetails();
        return;
      }

      selectedFieldName = fieldName;
      const result = await config.onFilterChange(fieldName, nextChecked, {
        cleanup,
        modal,
        trigger: options.trigger,
        getFilterPreviewState: () => getCurrentFilterPreviewState()
      });
      if (options.trigger === 'preview-auto-add' && !(result && result.close)) {
        syncOptionBadges();
        syncChoiceInputs();
        syncStatusTextOnly(optionsListFind(fieldName));
        return;
      }
      await handlePickerActionResult(result);
    }

    function optionsListFind(fieldName) {
      return options.find(option => option.name === fieldName) || null;
    }

    async function applySelectedFieldChanges(changeType) {
      if (!selectedFieldName) return;

      if (changeType === 'display' && allowDisplay && displayChoice) {
        await applyDisplayChange(selectedFieldName, displayChoice.checked, { trigger: 'details-toggle' });
        return;
      }

      if (changeType === 'filter' && allowFilter && filterChoice) {
        await applyFilterChange(selectedFieldName, filterChoice.checked, { trigger: 'details-toggle' });
      }
    }

    async function applyDisplaySelectionFromOption(fieldName) {
      if (!fieldName) {
        return false;
      }

      const currentState = normalizePickerState(getFieldState(fieldName));
      if (currentState.display) {
        cleanup();
        if (window.showToastMessage) {
          window.showToastMessage(`${fieldName} is already in results.`, 'info');
        }
        return true;
      }

      await applyDisplayChange(fieldName, true, {
        trigger: 'option-click',
        closeAfterApply: true,
        closeIfUnchanged: true
      });
      return true;
    }

    function renderList() {
      const filteredOptions = options.filter(option => {
        const categoryMatch = !selectedCategory
          || String(option.category || '')
            .split(',')
            .map(category => category.trim())
            .filter(Boolean)
            .includes(selectedCategory);

        if (!categoryMatch) return false;
        if (!searchTerm) return true;

        const haystack = `${option.name} ${option.type} ${option.category} ${option.desc} ${option.description}`.toLowerCase();
        return haystack.includes(searchTerm);
      });

      if (filteredOptions.length === 0) {
        listEl.innerHTML = '<p class="form-mode-field-picker-empty">No fields match that search.</p>';
        selectedFieldName = '';
        syncDetails();
        return;
      }

      if (!filteredOptions.some(option => option.name === selectedFieldName)) {
        selectedFieldName = filteredOptions[0].name;
      }

      listEl.innerHTML = '';
      filteredOptions.forEach(option => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'form-mode-field-picker-option';
        button.dataset.fieldName = option.name;
        if (option.name === selectedFieldName) {
          button.classList.add('is-selected');
        }

        if (option.tooltipHtml) {
          button.setAttribute('data-tooltip-html', option.tooltipHtml);
        }

        const state = normalizePickerState(getFieldState(option.name));
        const badges = [];
        if (allowDisplay && state.display) {
          badges.push(`<span class="form-mode-field-picker-badge">${labels.displayBadge}</span>`);
        }
        if (allowFilter && state.filter) {
          badges.push(`<span class="form-mode-field-picker-badge">${labels.filterBadge}</span>`);
        }

        button.innerHTML = `
          <span class="form-mode-field-picker-option-name">${option.name}</span>
          <span class="form-mode-field-picker-option-meta">${[option.type, option.category].filter(Boolean).join(' • ')}</span>
          <span class="form-mode-field-picker-option-badges">${badges.join('')}</span>
        `;

        button.addEventListener('click', async () => {
          if (autoApplyDisplayOnOptionClick) {
            await applyDisplaySelectionFromOption(option.name);
            return;
          }

          selectedFieldName = option.name;
          renderList();
          syncChoiceInputs();
          syncDetails();
        });
        listEl.appendChild(button);
      });

      syncChoiceInputs();
      syncDetails();
    }

    if (displayChoice) {
      displayChoice.addEventListener('change', async () => {
        if (syncingControls) return;
        await applySelectedFieldChanges('display');
      });
    }

    if (filterChoice) {
      filterChoice.addEventListener('change', async () => {
        if (syncingControls) return;
        await applySelectedFieldChanges('filter');
      });
    }

    searchInput.addEventListener('input', event => {
      searchTerm = String(event.target.value || '').trim().toLowerCase();
      renderList();
    });

    if (categorySelect) {
      categorySelect.addEventListener('change', event => {
        selectedCategory = String(event.target.value || '').trim();
        renderList();
      });
    }

    [backdrop, closeButton].forEach(target => {
      if (!target) return;
      target.addEventListener('click', cleanup);
    });

    document.addEventListener('keydown', onKeyDown);
    renderList();
    window.requestAnimationFrame(() => {
      searchInput.focus();
      searchInput.select();
    });
  }

  function fieldMatchesBase(fieldName, targetField) {
    const getBaseFieldName = typeof window.getBaseFieldName === 'function'
      ? window.getBaseFieldName
      : value => String(value || '').trim();

    return getBaseFieldName(fieldName) === getBaseFieldName(targetField);
  }

  function openQueryFilterEditor(fieldName) {
    const fieldDef = window.fieldDefs && window.fieldDefs.get(fieldName);
    if (!fieldDef || !services.bubble || typeof services.bubble.Bubble !== 'function') {
      return false;
    }

    const bubble = new services.bubble.Bubble(fieldDef).getElement();
    const overlay = window.DOM?.overlay || document.getElementById('overlay');
    const conditionPanel = services.bubble?.getConditionPanelElement ? services.bubble.getConditionPanelElement() : null;
    const inputWrapper = services.getBubbleInputWrapperElement();
    let filterCard = services.getBubbleFilterCardElement();

    if (filterCard && !window.DOM?.filterCard) {
      document.body.appendChild(filterCard);
      filterCard.offsetHeight;
    }
    if (!window.filterCard && filterCard) {
      window.filterCard = filterCard;
    }
    if (filterCard) {
      services.prepareBubbleFilterCardForOpen(filterCard);
    }

    if (overlay) {
      overlay.classList.add('show');
    }

    services.buildBubbleConditionPanel(bubble);

    if (filterCard) {
      const titleEl = services.getBubbleFilterCardTitleElement(filterCard);
      if (titleEl) titleEl.textContent = fieldName;
    }

    if (window.renderConditionList) {
      window.renderConditionList(fieldName);
    }

    if (conditionPanel) {
      conditionPanel.classList.add('show');
    }
    if (filterCard) {
      if (!services.markBubbleFilterCardOpen(filterCard, { scrollReadyDelay: 240 })) {
        filterCard.classList.add('show', 'content-ready');
      }
    }
    if (inputWrapper && getFilterGroupForField(fieldName)) {
      inputWrapper.classList.add('show');
    }

    return true;
  }

  async function openQueryFieldPicker(options = {}) {
    const insertAt = Number.isInteger(options.insertAt) ? options.insertAt : -1;

    await openSharedFieldPicker({
      beforeOpen: async () => {
        if (typeof window.loadFieldDefinitions === 'function') {
          await window.loadFieldDefinitions();
        }
      },
      labels: {
        kicker: insertAt >= 0 ? '' : 'Add Field',
        title: 'Choose a field for this query',
        description: insertAt >= 0
          ? 'Click a field to insert it into results at this position.'
          : 'Add a field to the table results or jump straight into configuring a filter for it.',
        filterChoice: 'Open filter editor',
        footerNote: insertAt >= 0 ? 'Fields insert into results immediately.' : 'Changes apply automatically.'
      },
      autoApplyDisplayOnOptionClick: insertAt >= 0,
      compactLayout: insertAt >= 0,
      getOptions: getFieldPickerOptionsFromDefinitions,
      getFieldState: fieldName => ({
        display: getDisplayedFields().some(column => fieldMatchesBase(column, fieldName)),
        filter: Boolean(getFilterGroupForField(fieldName)?.filters?.length)
      }),
      onDisplayChange: async (fieldName, nextChecked) => {
        const currentFields = getDisplayedFields();
        const nextFields = nextChecked
          ? (() => {
              if (currentFields.some(column => fieldMatchesBase(column, fieldName))) {
                return currentFields;
              }

              if (insertAt >= 0 && insertAt <= currentFields.length) {
                const next = currentFields.slice();
                next.splice(insertAt, 0, fieldName);
                return next;
              }

              return [...currentFields, fieldName];
            })()
          : currentFields.filter(column => !fieldMatchesBase(column, fieldName));

        if (window.QueryChangeManager) {
          window.QueryChangeManager.replaceDisplayedFields(nextFields, {
            source: 'SharedFieldPicker.toggleDisplayedField'
          });
        }

        if (window.showToastMessage) {
          window.showToastMessage(
            nextChecked ? `${fieldName} added to results.` : `${fieldName} removed from results.`,
            'success'
          );
        }
      },
      onFilterChange: async (fieldName, nextChecked) => {
        if (!nextChecked) {
          if (window.QueryChangeManager) {
            window.QueryChangeManager.removeFilter(fieldName, {
              removeAll: true,
              source: 'SharedFieldPicker.removeQueryFilter'
            });
          }

          if (window.showToastMessage) {
            window.showToastMessage(`${fieldName} filters removed.`, 'success');
          }
          return;
        }

        return {
          close: true,
          afterClose: () => {
            openQueryFilterEditor(fieldName);
          }
        };
      }
    });
  }

  function initQueryFieldPickerButton() {
    const addFieldBtn = document.getElementById('table-add-field-btn');
    if (!addFieldBtn || addFieldBtn.dataset.fieldPickerBound === 'true') {
      return;
    }

    addFieldBtn.dataset.fieldPickerBound = 'true';
    addFieldBtn.addEventListener('click', () => {
      openQueryFieldPicker().catch(error => {
        console.error('Failed to open query field picker:', error);
        if (window.showToastMessage) {
          window.showToastMessage('Failed to open the field picker.', 'error');
        }
      });
    });
  }

  window.SharedFieldPicker = {
    getFieldOptions: getFieldPickerOptionsFromDefinitions,
    open: openSharedFieldPicker,
    openQueryFieldPicker,
    openQueryFilterEditor
  };

  initQueryFieldPickerButton();
})();
