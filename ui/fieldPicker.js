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
          <div class="form-mode-field-picker-field-header">
            <h4 class="form-mode-field-picker-field-name"></h4>
            <button type="button" class="form-mode-field-picker-field-info hidden" aria-label="Show field details">i</button>
          </div>
          <p class="form-mode-field-picker-field-meta hidden"></p>
          ${allowDisplay && config.showDisplayChoice !== false ? `<label class="form-mode-field-picker-choice"><input type="checkbox" data-field-picker-choice="display" /><span>${labels.displayChoice}</span></label>` : ''}
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
    const fieldInfoEl = modal.querySelector('.form-mode-field-picker-field-info');
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
      if (listEl.virtualList) {
        listEl.virtualList.destroy();
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

      const values = previewState.values.map(value => String(value ?? '').trim());
      if (String(previewState.operator || '').trim().toLowerCase() === 'between') {
        return values[0] !== '' && values[1] !== '';
      }

      return values.some(value => value !== '');
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
      const currentState = normalizePickerState(getFieldState(selectedFieldName));
      const isReady = isFilterPreviewReady(previewState);

      if (!isReady && !currentState.filter) {
        return;
      }

      if (typeof config.onFilterPreviewChange === 'function') {
        await config.onFilterPreviewChange(selectedFieldName, previewState, {
          modal,
          cleanup,
          isNewFilter: !currentState.filter
        });
        syncOptionBadges();
        syncChoiceInputs();
        syncStatusTextOnly(selected);
        
        if (filterPreviewHost) {
          const removeBtn = filterPreviewHost.querySelector('.form-mode-field-remove');
          if (removeBtn) {
            const hasFilterNow = normalizePickerState(getFieldState(selectedFieldName)).filter;
            if (!hasFilterNow) {
              removeBtn.hidden = true;
              removeBtn.setAttribute('aria-hidden', 'true');
              removeBtn.tabIndex = -1;
              removeBtn.style.display = 'none';
            } else {
              removeBtn.hidden = false;
              removeBtn.removeAttribute('aria-hidden');
              removeBtn.removeAttribute('tabindex');
              removeBtn.style.display = '';
            }
          }
        }
        return;
      }
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
        onPreviewChange: scheduleAutoFilterSync,
        onRemoveFilter: () => {
          filterPreviewDrafts.delete(selectedFieldName);
          syncOptionBadges();
          syncChoiceInputs();
          syncDetails();
        }
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
      if (allowDisplay) {
        if (displayChoice) {
          if (displayChoice.checked && !state.display) {
            statusParts.push(`Will ${labels.displayChoice.toLowerCase()}`);
          } else if (!displayChoice.checked && state.display) {
            statusParts.push(`Will remove ${labels.displayChoice.toLowerCase()}`);
          } else if (state.display) {
            statusParts.push(labels.displayBadge);
          }
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
        if (fieldInfoEl) {
          fieldInfoEl.classList.add('hidden');
          fieldInfoEl.removeAttribute('data-tooltip-html');
        }
        fieldMetaEl.textContent = '';
        fieldMetaEl.classList.add('hidden');
        statusEl.textContent = 'No field selected.';
        clearFilterPreview();
        return;
      }

      fieldNameEl.textContent = selected.name;
      if (fieldInfoEl) {
        if (selected.tooltipHtml) {
          fieldInfoEl.classList.remove('hidden');
          fieldInfoEl.setAttribute('data-tooltip-html', selected.tooltipHtml);
          fieldInfoEl.setAttribute('aria-label', `Show details for ${selected.name}`);
        } else {
          fieldInfoEl.classList.add('hidden');
          fieldInfoEl.removeAttribute('data-tooltip-html');
          fieldInfoEl.setAttribute('aria-label', 'Show field details');
        }
      }
      fieldMetaEl.textContent = '';
      fieldMetaEl.classList.add('hidden');

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
        getFilterPreviewState: () => options.previewState || getCurrentFilterPreviewState()
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
        if (window.showToastMessage) {
          window.showToastMessage(`${fieldName} is already in results. Double-click to remove.`, 'info');
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

    function createOptionButton(option) {
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

      const nameSpan = document.createElement('span');
      nameSpan.className = 'form-mode-field-picker-option-name';
      nameSpan.textContent = option.name;
      nameSpan.style.display = 'block';
      nameSpan.style.overflow = 'hidden';
      nameSpan.style.textOverflow = 'ellipsis';
      nameSpan.style.whiteSpace = 'nowrap';
      nameSpan.style.flex = '1 1 auto';
      nameSpan.style.minWidth = '0';
      nameSpan.addEventListener('mouseover', function() {
        if (this.offsetWidth < this.scrollWidth) {
          this.setAttribute('data-tooltip', option.name);
        } else {
          this.removeAttribute('data-tooltip');
        }
      });

      const badgesSpan = document.createElement('span');
      badgesSpan.className = 'form-mode-field-picker-option-badges';
      badgesSpan.innerHTML = badges.join('');

      button.innerHTML = '';
      button.appendChild(nameSpan);
      button.appendChild(badgesSpan);

      button.addEventListener('click', async () => {
        if (autoApplyDisplayOnOptionClick) {
          await applyDisplaySelectionFromOption(option.name);
          return;
        }

        const wasAlreadySelected = selectedFieldName === option.name;
        selectedFieldName = option.name;

        if (config.autoDisplayOnSelect) {
          const state = normalizePickerState(getFieldState(option.name));
          if (!state.display) {
            await applyDisplayChange(option.name, true, { trigger: 'option-click' });
          } else {
            renderList();
            syncChoiceInputs();
            syncDetails();
            if (wasAlreadySelected && window.showToastMessage) {
              window.showToastMessage(`Double-click to remove ${option.name} from results.`, 'info');
            }
          }
        } else {
          renderList();
          syncChoiceInputs();
          syncDetails();
        }
      });

      button.addEventListener('dblclick', async () => {
        if (autoApplyDisplayOnOptionClick) {
          const state = normalizePickerState(getFieldState(option.name));
          if (state.display) {
            await applyDisplayChange(option.name, false, {
              trigger: 'option-dblclick',
              closeAfterApply: true,
              closeIfUnchanged: true
            });
          }
          return;
        }

        selectedFieldName = option.name;

        if (config.autoDisplayOnSelect) {
          const state = normalizePickerState(getFieldState(option.name));
          if (state.display) {
            await applyDisplayChange(option.name, false, { trigger: 'option-dblclick' });
          }
        }
      });
      
      return button;
    }

    if (window.VirtualList && !listEl.virtualList) {
      listEl.virtualList = new window.VirtualList({
        container: listEl,
        itemHeight: 44, // Approximate height of the option button
        renderItem: createOptionButton
      });
      listEl.style.overflowY = 'auto';
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

      let emptyState = listEl.parentNode.querySelector('.form-mode-field-picker-empty');
      if (!emptyState) {
        emptyState = document.createElement('div');
        emptyState.className = 'form-mode-field-picker-empty';
        emptyState.style.padding = '1rem';
        emptyState.style.textAlign = 'center';
        emptyState.textContent = 'No fields match that search.';
        listEl.parentNode.appendChild(emptyState);
      }

      if (filteredOptions.length === 0) {
        listEl.innerHTML = '<p class="form-mode-field-picker-empty">No fields match that search.</p>';
        if (listEl.virtualList) listEl.virtualList.setItems([]);
        emptyState.style.display = 'block';
        listEl.style.display = 'none';
        selectedFieldName = '';
        syncDetails();
        return;
      }

      emptyState.style.display = 'none';
      listEl.style.display = 'block';

      if (!filteredOptions.some(option => option.name === selectedFieldName)) {
        selectedFieldName = filteredOptions[0].name;
      }

      listEl.innerHTML = '';
      if (listEl.virtualList) {
        listEl.virtualList.setItems(filteredOptions);
        
        listEl.querySelectorAll('.form-mode-field-picker-option').forEach(btn => {
          btn.classList.toggle('is-selected', btn.dataset.fieldName === selectedFieldName);
        });
      } else {
        filteredOptions.forEach(option => {
          listEl.appendChild(createOptionButton(option));
        });
      }

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
      : value => String(value ?? '').trim();

    return getBaseFieldName(fieldName) === getBaseFieldName(targetField);
  }

  function normalizeQueryPreviewOperator(fieldDef, operator) {
    const normalized = typeof window.mapFieldOperatorToUiCond === 'function'
      ? window.mapFieldOperatorToUiCond(operator)
      : String(operator || '').toLowerCase();

    if (!fieldDef || !fieldDef.type) {
      return normalized;
    }

    if (fieldDef.type === 'date') {
      if (normalized === 'greater') return 'after';
      if (normalized === 'less') return 'before';
      if (normalized === 'greater_or_equal') return 'on_or_after';
      if (normalized === 'less_or_equal') return 'on_or_before';
    }

    return normalized;
  }

  function splitQueryPreviewValues(rawValue) {
    if (Array.isArray(rawValue)) {
      return rawValue.map(value => String(value ?? '').trim()).filter(Boolean);
    }

    return String(rawValue || '')
      .split(/[\n,]+/)
      .map(value => value.trim())
      .filter(Boolean);
  }

  function readQueryPreviewFilterValues(filter) {
    if (!filter) {
      return [];
    }

    if (String(filter.cond || '').toLowerCase() === 'between') {
      return String(filter.val || '')
        .split('|')
        .map(value => value.trim())
        .filter(Boolean)
        .slice(0, 2);
    }

    return splitQueryPreviewValues(filter.val || '');
  }

  function getQueryPreviewDefaultValues(inputSpec) {
    if (!inputSpec) {
      return [];
    }

    if (inputSpec.operator === 'between') {
      return Array.isArray(inputSpec.defaultValue)
        ? inputSpec.defaultValue.slice(0, 2).map(value => String(value ?? ''))
        : ['', ''];
    }

    if (Array.isArray(inputSpec.defaultValue)) {
      return inputSpec.defaultValue.map(value => String(value ?? '')).filter(Boolean);
    }

    if (inputSpec.defaultValue === undefined || inputSpec.defaultValue === null || inputSpec.defaultValue === '') {
      return [];
    }

    return splitQueryPreviewValues(inputSpec.defaultValue);
  }

  function assignQueryPreviewDefaultValues(inputSpec, values, fieldDef) {
    if (!inputSpec) {
      return;
    }

    const normalizedValues = Array.isArray(values)
      ? values.map(value => String(value ?? '').trim())
      : [];

    if (inputSpec.operator === 'between') {
      inputSpec.defaultValue = [normalizedValues[0] || '', normalizedValues[1] || ''];
      inputSpec.multiple = false;
      return;
    }

    const supportsMultiple = Boolean(
      inputSpec.multiple
      || (fieldDef && fieldDef.allowValueList)
      || (fieldDef && fieldDef.multiSelect)
      || normalizedValues.filter(Boolean).length > 1
    );

    inputSpec.multiple = supportsMultiple;
    inputSpec.defaultValue = supportsMultiple
      ? normalizedValues.filter(Boolean)
      : (normalizedValues[0] || '');
  }

  function createQueryFilterPreview(container, fieldName, context = {}) {
    const controls = window.FormModeControls;
    if (
      !container
      || !window.fieldDefs
      || !controls
      || typeof controls.createGeneratedInputSpec !== 'function'
      || typeof controls.createControl !== 'function'
      || typeof controls.createFieldRow !== 'function'
    ) {
      return null;
    }

    const fieldDef = window.fieldDefs.get(fieldName);
    if (!fieldDef || (typeof window.isFieldBackendFilterable === 'function' && !window.isFieldBackendFilterable(fieldDef))) {
      return null;
    }

    const activeFilterGroup = getFilterGroupForField(fieldName);
    const existingFilter = Array.isArray(activeFilterGroup?.filters) && activeFilterGroup.filters.length > 0
      ? activeFilterGroup.filters[0]
      : null;
    const draftPreviewState = context.previewState && context.previewState.fieldName === fieldName
      ? context.previewState
      : null;
    const previewInputSpec = controls.createGeneratedInputSpec(
      fieldName,
      [],
      baseKey => String(baseKey || 'field'),
      normalizeQueryPreviewOperator
    );

    if (!previewInputSpec) {
      return null;
    }

    previewInputSpec.operator = normalizeQueryPreviewOperator(
      fieldDef,
      (draftPreviewState && draftPreviewState.operator)
        || (existingFilter && existingFilter.cond)
        || previewInputSpec.operator
        || 'equals'
    );
    assignQueryPreviewDefaultValues(
      previewInputSpec,
      draftPreviewState
        ? draftPreviewState.values
        : readQueryPreviewFilterValues(existingFilter),
      fieldDef
    );

    let control = null;
    let previewRow = null;

    function getPreviewState() {
      const values = control && typeof control.getFormValues === 'function'
        ? control.getFormValues()
        : getQueryPreviewDefaultValues(previewInputSpec);
      return {
        fieldName,
        operator: previewInputSpec.operator,
        values: Array.isArray(values) ? values.map(value => String(value ?? '').trim()) : []
      };
    }

    function renderPreviewControl() {
      const activeFilterGroup = getFilterGroupForField(fieldName);
      const isCurrentlyFiltered = Array.isArray(activeFilterGroup?.filters) && activeFilterGroup.filters.length > 0;

      control = controls.createControl(
        fieldDef,
        previewInputSpec,
        getQueryPreviewDefaultValues(previewInputSpec),
        previewInputSpec.operator,
        normalizeQueryPreviewOperator
      );
      previewRow = controls.createFieldRow({
        inputSpec: previewInputSpec,
        fieldDef,
        control,
        normalizeOperatorForField: normalizeQueryPreviewOperator,
        removeSpecInputByKey: () => {
          if (window.QueryChangeManager) {
            window.QueryChangeManager.removeFilter(fieldName, {
              removeAll: true,
              source: 'SharedFieldPicker.previewRemove'
            });
            if (typeof context.onRemoveFilter === 'function') {
              context.onRemoveFilter();
            }
          }
        },
        rebuildFormCardFromSpec: () => {},
        captureCurrentControlDefaults: () => {},
        showRemoveButton: true,
        onOperatorChange: nextOperator => {
          const previousValues = getPreviewState().values;
          previewInputSpec.operator = normalizeQueryPreviewOperator(fieldDef, nextOperator);
          assignQueryPreviewDefaultValues(previewInputSpec, previousValues, fieldDef);
          renderPreviewControl();
        }
      });

      const removeBtn = previewRow.querySelector('.form-mode-field-remove');
      if (removeBtn) {
        if (!isCurrentlyFiltered) {
          removeBtn.hidden = true;
          removeBtn.setAttribute('aria-hidden', 'true');
          removeBtn.tabIndex = -1;
          removeBtn.style.display = 'none';
        } else {
          removeBtn.hidden = false;
          removeBtn.removeAttribute('aria-hidden');
          removeBtn.removeAttribute('tabindex');
          removeBtn.style.display = '';
        }
      }

      previewRow.classList.add('form-mode-field-picker-preview-row');
      container.replaceChildren(previewRow);

      const notifyPreviewChange = typeof context.onPreviewChange === 'function'
        ? context.onPreviewChange
        : null;
      if (notifyPreviewChange) {
        const emitPreviewChange = () => {
          window.setTimeout(() => notifyPreviewChange(getPreviewState()), 0);
        };
        ['input', 'change', 'click'].forEach(eventName => {
          previewRow.addEventListener(eventName, emitPreviewChange);
        });
      }
    }

    renderPreviewControl();

    return {
      getState: getPreviewState,
      cleanup() {
        if (control && typeof control._cleanupPopup === 'function') {
          control._cleanupPopup();
        }
      }
    };
  }

  function applyQueryPreviewFilterState(fieldName, previewState) {
    if (!fieldName || !previewState || !window.QueryChangeManager || typeof window.QueryChangeManager.setQueryState !== 'function') {
      return;
    }

    const rawValues = Array.isArray(previewState.values)
      ? previewState.values.map(value => String(value ?? '').trim())
      : [];
    const isBetween = String(previewState.operator || '').trim().toLowerCase() === 'between';
    const hasActiveValue = isBetween
      ? Boolean(rawValues[0] || rawValues[1])
      : rawValues.some(Boolean);

    if (!hasActiveValue) {
      if (typeof window.QueryChangeManager.removeFilter === 'function') {
        window.QueryChangeManager.removeFilter(fieldName, {
          removeAll: true,
          source: 'SharedFieldPicker.previewUpdateEmpty'
        });
      }
      return;
    }

    const validValues = isBetween ? rawValues.slice(0, 2) : rawValues.filter(Boolean);
    const nextActiveFilters = JSON.parse(JSON.stringify(window.QueryStateReaders?.getActiveFilters?.() || {}));
    nextActiveFilters[fieldName] = {
      filters: [{
        cond: previewState.operator,
        val: isBetween
          ? `${validValues[0] || ''}|${validValues[1] || ''}`
          : validValues.join(',')
      }]
    };

    window.QueryChangeManager.setQueryState({
      activeFilters: nextActiveFilters
    }, {
      source: 'SharedFieldPicker.previewUpdate'
    });
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
    const parsedInsertAt = Number.isInteger(options.insertAt)
      ? options.insertAt
      : Number.parseInt(String(options.insertAt ?? ''), 10);
    const insertAt = Number.isInteger(parsedInsertAt) ? parsedInsertAt : -1;

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
          : 'Select a field to add it to results, then optionally set a filter right away.',
        filterChoice: 'Open filter editor',
        footerNote: insertAt >= 0 ? 'Fields insert into results immediately.' : 'Filters are added automatically once the preview has a value.'
      },
      autoApplyDisplayOnOptionClick: insertAt >= 0,
      autoDisplayOnSelect: insertAt < 0,
      showDisplayChoice: false,
      compactLayout: insertAt >= 0,
      autoAddFilterFromPreview: insertAt < 0,
      getOptions: getFieldPickerOptionsFromDefinitions,
      getFieldState: fieldName => ({
        display: getDisplayedFields().some(column => fieldMatchesBase(column, fieldName)),
        filter: Boolean(getFilterGroupForField(fieldName)?.filters?.length)
      }),
      renderFilterPreview: insertAt < 0 ? createQueryFilterPreview : undefined,
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
      onFilterPreviewChange: insertAt < 0 ? async (fieldName, previewState) => {
        applyQueryPreviewFilterState(fieldName, previewState);
      } : undefined,
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
