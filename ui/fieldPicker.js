(function() {
  function getFieldPickerOptionsFromDefinitions() {
    const source = Array.isArray(window.fieldDefsArray) && window.fieldDefsArray.length > 0
      ? window.fieldDefsArray
      : Array.from((window.fieldDefs && window.fieldDefs.values()) || []);

    return source
      .filter(fieldDef => fieldDef && fieldDef.name)
      .map(fieldDef => ({
        name: String(fieldDef.name),
        type: String(fieldDef.type || 'text'),
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
    const getFieldState = typeof config.getFieldState === 'function'
      ? config.getFieldState
      : (() => ({ display: false, filter: false }));

    const backdrop = document.createElement('div');
    backdrop.className = 'form-mode-field-picker-backdrop';

    const modal = document.createElement('div');
    modal.className = 'form-mode-field-picker-modal';
    modal.innerHTML = `
      <div class="form-mode-field-picker-header">
        <div>
          <span class="form-mode-field-picker-kicker">${labels.kicker}</span>
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
        <div class="form-mode-field-picker-details">
          <p class="form-mode-field-picker-selected-label">${labels.selectedFieldLabel}</p>
          <h4 class="form-mode-field-picker-field-name"></h4>
          <p class="form-mode-field-picker-field-meta hidden"></p>
          ${allowDisplay ? `<label class="form-mode-field-picker-choice"><input type="checkbox" data-field-picker-choice="display" /><span>${labels.displayChoice}</span></label>` : ''}
          ${allowFilter ? `<label class="form-mode-field-picker-choice"><input type="checkbox" data-field-picker-choice="filter" /><span>${labels.filterChoice}</span></label>` : ''}
          <p class="form-mode-field-picker-status"></p>
        </div>
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

    function cleanup() {
      document.removeEventListener('keydown', onKeyDown);
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
      syncingControls = true;
      if (displayChoice) displayChoice.checked = state.display;
      if (filterChoice) filterChoice.checked = state.filter;
      syncingControls = false;
    }

    function syncDetails() {
      const selected = options.find(option => option.name === selectedFieldName) || null;
      if (!selected) {
        fieldNameEl.textContent = '';
        fieldMetaEl.textContent = '';
        fieldMetaEl.classList.add('hidden');
        statusEl.textContent = 'No field selected.';
        return;
      }

      const state = getSelectedState();
      const metaParts = [];
      if (selected.type) metaParts.push(selected.type);
      if (selected.category) metaParts.push(selected.category);

      fieldNameEl.textContent = selected.name;
      fieldMetaEl.textContent = metaParts.join(' • ');
      fieldMetaEl.classList.toggle('hidden', metaParts.length === 0);

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
        if (filterChoice.checked && !state.filter) {
          statusParts.push(`Will ${labels.filterChoice.toLowerCase()}`);
        } else if (!filterChoice.checked && state.filter) {
          statusParts.push(`Will remove ${labels.filterChoice.toLowerCase()}`);
        } else if (state.filter) {
          statusParts.push(labels.filterBadge);
        }
      }

      statusEl.textContent = statusParts.length > 0
        ? statusParts.join(' • ')
        : 'No changes for this field.';
    }

    async function applySelectedFieldChanges(changeType) {
      if (!selectedFieldName) return;

      const currentState = getSelectedState();

      if (changeType === 'display' && allowDisplay && displayChoice && displayChoice.checked !== currentState.display && typeof config.onDisplayChange === 'function') {
        const result = await config.onDisplayChange(selectedFieldName, displayChoice.checked, { cleanup, modal });
        if (result && result.close) {
          cleanup();
          if (typeof result.afterClose === 'function') {
            window.setTimeout(() => result.afterClose(), 0);
          }
          return;
        }
      }

      const updatedState = getSelectedState();
      if (changeType === 'filter' && allowFilter && filterChoice && filterChoice.checked !== updatedState.filter && typeof config.onFilterChange === 'function') {
        const result = await config.onFilterChange(selectedFieldName, filterChoice.checked, { cleanup, modal });
        if (result && result.close) {
          cleanup();
          if (typeof result.afterClose === 'function') {
            window.setTimeout(() => result.afterClose(), 0);
          }
          return;
        }
      }

      renderList();
      syncChoiceInputs();
      syncDetails();
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

        button.addEventListener('click', () => {
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
    if (!fieldDef || !window.BubbleSystem || typeof window.BubbleSystem.Bubble !== 'function') {
      return false;
    }

    const bubble = new window.BubbleSystem.Bubble(fieldDef).getElement();
    const overlay = window.DOM?.overlay || document.getElementById('overlay');
    const conditionPanel = window.BubbleSystem.getConditionPanelElement ? window.BubbleSystem.getConditionPanelElement() : null;
    const inputWrapper = window.BubbleSystem.getInputWrapperElement ? window.BubbleSystem.getInputWrapperElement() : null;
    let filterCard = window.BubbleSystem.getFilterCardElement ? window.BubbleSystem.getFilterCardElement() : null;

    if (filterCard && !document.getElementById('filter-card')) {
      document.body.appendChild(filterCard);
      filterCard.offsetHeight;
    }
    if (!window.filterCard && filterCard) {
      window.filterCard = filterCard;
    }
    if (filterCard) {
      if (filterCard._showTimer) {
        clearTimeout(filterCard._showTimer);
        filterCard._showTimer = null;
      }
      if (filterCard._scrollReadyTimer) {
        clearTimeout(filterCard._scrollReadyTimer);
        filterCard._scrollReadyTimer = null;
      }
      if (filterCard._contentRevealTimer) {
        clearTimeout(filterCard._contentRevealTimer);
        filterCard._contentRevealTimer = null;
      }
      filterCard.classList.remove('content-ready', 'scroll-ready', 'show');
    }

    if (overlay) {
      overlay.classList.add('show');
    }

    window.BubbleSystem.buildConditionPanel(bubble);

    if (filterCard && window.BubbleSystem.getFilterCardTitleElement) {
      const titleEl = window.BubbleSystem.getFilterCardTitleElement(filterCard);
      if (titleEl) titleEl.textContent = fieldName;
    }

    const defaultBtn = conditionPanel
      ? (conditionPanel.querySelector('.condition-btn[data-cond="equals"]') || conditionPanel.querySelector('.condition-btn'))
      : null;

    if (defaultBtn) {
      defaultBtn.classList.add('active');
      if (window.handleConditionBtnClick) {
        window.handleConditionBtnClick({ currentTarget: defaultBtn, stopPropagation() {}, preventDefault() {} });
      }
    }

    if (window.renderConditionList) {
      window.renderConditionList(fieldName);
    }

    if (conditionPanel) {
      conditionPanel.classList.add('show');
    }
    if (filterCard) {
      filterCard.classList.add('show');
      filterCard.classList.add('content-ready');
      window.setTimeout(() => {
        if (filterCard.classList.contains('show')) {
          filterCard.classList.add('scroll-ready');
        }
      }, 240);
    }
    if (inputWrapper && window.activeFilters[fieldName]) {
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
        kicker: 'Add Field',
        title: 'Choose a field for this query',
        description: 'Add a field to the table results or jump straight into configuring a filter for it.',
        filterChoice: 'Open filter editor',
        footerNote: 'Changes apply automatically.'
      },
      getOptions: getFieldPickerOptionsFromDefinitions,
      getFieldState: fieldName => ({
        display: Array.isArray(window.displayedFields) && window.displayedFields.some(column => fieldMatchesBase(column, fieldName)),
        filter: Boolean(window.activeFilters && window.activeFilters[fieldName] && Array.isArray(window.activeFilters[fieldName].filters) && window.activeFilters[fieldName].filters.length > 0)
      }),
      onDisplayChange: async (fieldName, nextChecked) => {
        const currentFields = Array.from(window.displayedFields || []);
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

        await window.showExampleTable(nextFields, { syncQueryState: true });

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