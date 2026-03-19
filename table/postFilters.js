(function() {
  function getElements() {
    return {
      button: document.getElementById('post-filter-btn'),
      overlay: document.getElementById('post-filter-overlay'),
      backdrop: document.getElementById('post-filter-overlay-backdrop'),
      closeBtn: document.getElementById('post-filter-overlay-close'),
      doneBtn: document.getElementById('post-filter-done-btn'),
      clearBtn: document.getElementById('post-filter-clear-btn'),
      fieldSelect: document.getElementById('post-filter-field'),
      operatorSelect: document.getElementById('post-filter-operator'),
      valueInput: document.getElementById('post-filter-value'),
      valueInput2: document.getElementById('post-filter-value-2'),
      valuePicker: document.getElementById('post-filter-value-picker'),
      valuePickerSearch: document.getElementById('post-filter-value-search'),
      valuePickerSelect: document.getElementById('post-filter-value-select'),
      valuePickerMeta: document.getElementById('post-filter-value-meta'),
      betweenLabel: document.getElementById('post-filter-between-label'),
      addBtn: document.getElementById('post-filter-add-btn'),
      summaryRows: document.getElementById('post-filter-summary-rows'),
      summaryBaseRows: document.getElementById('post-filter-summary-base-rows'),
      summaryCount: document.getElementById('post-filter-summary-count'),
      list: document.getElementById('post-filter-list'),
      empty: document.getElementById('post-filter-empty')
    };
  }

  function getBlankSentinel() {
    return window.VirtualTable?.postFilterBlankValue || '__QUERY_POST_FILTER_BLANK__';
  }

  function isBlankSentinel(value) {
    return String(value || '') === getBlankSentinel();
  }

  function getAvailableFields() {
    const displayedFields = Array.isArray(window.displayedFields) ? window.displayedFields : [];
    const columnMap = window.VirtualTable?.baseViewData?.columnMap;

    return displayedFields.filter(field => columnMap instanceof Map && columnMap.has(field));
  }

  function getFieldType(fieldName) {
    if (!window.fieldDefs) return 'string';

    const normalizedField = String(fieldName || '').trim();
    const baseField = typeof window.getBaseFieldName === 'function'
      ? window.getBaseFieldName(normalizedField)
      : normalizedField.replace(/ \d+$/, '');
    return window.fieldDefs.get(normalizedField)?.type || window.fieldDefs.get(baseField)?.type || 'string';
  }

  function getOperatorOptions(fieldName) {
    const type = getFieldType(fieldName);

    if (type === 'number' || type === 'money') {
      return ['greater', 'less', 'equals', 'between'];
    }

    if (type === 'date') {
      return ['equals', 'before', 'after', 'on_or_before', 'on_or_after', 'between'];
    }

    if (type === 'boolean') {
      return ['equals'];
    }

    return ['contains', 'starts', 'equals'];
  }

  function formatOperatorLabel(operator) {
    switch (String(operator || '').trim().toLowerCase()) {
      case 'greater':
        return 'Greater than';
      case 'less':
        return 'Less than';
      case 'starts':
        return 'Starts with';
      case 'before':
        return 'Before';
      case 'after':
        return 'After';
      case 'on_or_before':
        return 'On or before';
      case 'on_or_after':
        return 'On or after';
      case 'between':
        return 'Between';
      default:
        return String(operator || '')
          .replace(/_/g, ' ')
          .replace(/\b\w/g, character => character.toUpperCase());
    }
  }

  function formatFilterValue(filter, fieldName) {
    const type = getFieldType(fieldName);
    const rawValue = String(filter?.val || '');

    if (isBlankSentinel(rawValue)) {
      return '(Blank values)';
    }

    if (String(filter?.cond || '').toLowerCase() === 'between') {
      const [left, right] = rawValue.split('|');
      return `${left || ''} - ${right || ''}`;
    }

    if (type === 'money') {
      const numericValue = window.sanitizeMoneyInputValue ? window.sanitizeMoneyInputValue(rawValue) : rawValue.replace(/[$,]/g, '');
      return numericValue ? `$${numericValue}` : rawValue;
    }

    if (type === 'date') {
      const normalizedValue = rawValue.trim();
      const compactMatch = normalizedValue.match(/^(\d{4})(\d{2})(\d{2})$/);
      if (compactMatch) {
        return `${compactMatch[2]}/${compactMatch[3]}/${compactMatch[1]}`;
      }
    }

    return rawValue;
  }

  function formatLoadedOptionLabel(option, fieldName) {
    if (!option) {
      return '';
    }

    if (option.isBlank) {
      return '(Blank values)';
    }

    return formatFilterValue({ cond: 'equals', val: option.value }, fieldName);
  }

  function getSnapshot() {
    return window.VirtualTable?.getPostFilterState ? window.VirtualTable.getPostFilterState() : {};
  }

  function getFieldValueOptions(fieldName) {
    return window.VirtualTable?.getPostFilterFieldOptions
      ? window.VirtualTable.getPostFilterFieldOptions(fieldName)
      : [];
  }

  function getActiveFilterCount(snapshot = getSnapshot()) {
    return Object.values(snapshot).reduce((total, data) => total + (Array.isArray(data?.filters) ? data.filters.length : 0), 0);
  }

  function updateToolbarButton() {
    const { button } = getElements();
    if (!button) return;

    const hasFilters = window.VirtualTable?.hasPostFilters && window.VirtualTable.hasPostFilters();
    button.classList.toggle('table-toolbar-btn-active', Boolean(hasFilters));
  }

  function syncOperatorOptions() {
    const elements = getElements();
    if (!elements.fieldSelect || !elements.operatorSelect) return;

    const selectedField = elements.fieldSelect.value;
    const options = getOperatorOptions(selectedField);
    const previousValue = elements.operatorSelect.value;
    elements.operatorSelect.innerHTML = options.map(option => `<option value="${option}">${formatOperatorLabel(option)}</option>`).join('');

    if (options.includes(previousValue)) {
      elements.operatorSelect.value = previousValue;
    }

    syncValueInputs();
  }

  function renderValuePickerOptions(searchTerm = '') {
    const elements = getElements();
    if (!elements.valuePickerSelect || !elements.valuePickerMeta || !elements.fieldSelect) return;

    const field = String(elements.fieldSelect.value || '').trim();
    const normalizedSearch = String(searchTerm || '').trim().toLowerCase();
    const allOptions = getFieldValueOptions(field);
    const visibleOptions = normalizedSearch
      ? allOptions.filter(option => String(option.label || '').toLowerCase().includes(normalizedSearch))
      : allOptions;

    elements.valuePickerSelect.innerHTML = visibleOptions.map(option => {
      const text = `${formatLoadedOptionLabel(option, field)} (${Number(option.count || 0).toLocaleString()})`;
      const safeText = window.escapeHtml ? window.escapeHtml(text) : text;
      const safeValue = window.escapeHtml ? window.escapeHtml(option.value) : option.value;
      return `<option value="${safeValue}">${safeText}</option>`;
    }).join('');

    if (visibleOptions.length) {
      const currentValue = String(elements.valueInput.value || '').trim();
      const matchingOption = visibleOptions.find(option => option.value === currentValue) || visibleOptions[0];
      elements.valuePickerSelect.value = matchingOption.value;
      elements.valueInput.value = matchingOption.value;
      elements.valuePickerMeta.textContent = `${visibleOptions.length.toLocaleString()} of ${allOptions.length.toLocaleString()} loaded values`;
    } else {
      elements.valueInput.value = '';
      elements.valuePickerMeta.textContent = `0 of ${allOptions.length.toLocaleString()} loaded values`;
    }
  }

  function syncValuePicker() {
    const elements = getElements();
    if (!elements.operatorSelect || !elements.valuePicker || !elements.valuePickerSearch || !elements.valuePickerSelect || !elements.fieldSelect) {
      return;
    }

    const isEquals = elements.operatorSelect.value === 'equals';
    const field = String(elements.fieldSelect.value || '').trim();
    const options = isEquals ? getFieldValueOptions(field) : [];
    const shouldShowPicker = isEquals && options.length > 0;

    elements.valuePicker.classList.toggle('hidden', !shouldShowPicker);
    elements.valueInput.classList.toggle('hidden', shouldShowPicker);

    if (!shouldShowPicker) {
      if (isBlankSentinel(elements.valueInput.value)) {
        elements.valueInput.value = '';
      }
      elements.valuePickerSearch.value = '';
      elements.valuePickerSelect.innerHTML = '';
      elements.valuePickerMeta.textContent = '';
      return;
    }

    renderValuePickerOptions(elements.valuePickerSearch.value);
  }

  function syncValueInputs() {
    const elements = getElements();
    if (!elements.valueInput || !elements.valueInput2 || !elements.operatorSelect || !elements.fieldSelect || !elements.betweenLabel) return;

    const fieldType = getFieldType(elements.fieldSelect.value);
    const isBetween = elements.operatorSelect.value === 'between';
    const inputType = fieldType === 'date' ? 'date' : (fieldType === 'number' || fieldType === 'money' ? 'number' : 'text');

    [elements.valueInput, elements.valueInput2].forEach(input => {
      input.type = inputType;
      input.step = fieldType === 'money' ? '0.01' : (fieldType === 'number' ? '1' : 'any');
      input.placeholder = fieldType === 'date' ? '' : 'Value';
    });

    elements.valueInput2.classList.toggle('hidden', !isBetween);
    elements.betweenLabel.classList.toggle('hidden', !isBetween);
    syncValuePicker();
  }

  function populateFieldOptions() {
    const elements = getElements();
    if (!elements.fieldSelect) return;

    const fields = getAvailableFields();
    const currentValue = elements.fieldSelect.value;
    elements.fieldSelect.innerHTML = fields.map(field => `<option value="${field}">${window.escapeHtml ? window.escapeHtml(field) : field}</option>`).join('');

    if (!fields.length) {
      elements.fieldSelect.innerHTML = '<option value="">No result fields available</option>';
      elements.fieldSelect.value = '';
    } else if (fields.includes(currentValue)) {
      elements.fieldSelect.value = currentValue;
    }

    syncOperatorOptions();
  }

  function renderSummary() {
    const elements = getElements();
    if (!elements.summaryRows || !elements.summaryBaseRows || !elements.summaryCount) return;

    const stats = window.VirtualTable?.getPostFilterStats ? window.VirtualTable.getPostFilterStats() : { filteredRows: 0, totalRows: 0 };
    const activeCount = getActiveFilterCount();

    elements.summaryRows.textContent = Number(stats.filteredRows || 0).toLocaleString();
    elements.summaryBaseRows.textContent = Number(stats.totalRows || 0).toLocaleString();
    elements.summaryCount.textContent = activeCount.toLocaleString();
  }

  function renderFilterList() {
    const elements = getElements();
    if (!elements.list || !elements.empty) return;

    const snapshot = getSnapshot();
    const entries = Object.entries(snapshot).flatMap(([field, data]) => (
      Array.isArray(data?.filters)
        ? data.filters.map((filter, index) => ({ field, filter, index }))
        : []
    ));

    elements.empty.classList.toggle('hidden', entries.length > 0);
    elements.list.innerHTML = entries.map(entry => {
      const label = `${entry.field} ${formatOperatorLabel(entry.filter.cond)} ${formatFilterValue(entry.filter, entry.field)}`;
      const safeLabel = window.escapeHtml ? window.escapeHtml(label) : label;
      return `
        <div class="post-filter-pill">
          <span class="post-filter-pill__text">${safeLabel}</span>
          <button type="button" class="post-filter-pill__remove" data-field="${entry.field}" data-index="${entry.index}" aria-label="Remove post filter">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4 pointer-events-none">
              <line x1="5" y1="5" x2="15" y2="15"></line>
              <line x1="15" y1="5" x2="5" y2="15"></line>
            </svg>
          </button>
        </div>`;
    }).join('');
  }

  function refreshOverlay() {
    populateFieldOptions();
    renderSummary();
    renderFilterList();
    updateToolbarButton();
  }

  function closeOverlay() {
    const elements = getElements();
    if (!elements.overlay) return;
    elements.overlay.classList.add('hidden');
    elements.overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('post-filter-overlay-open');
  }

  function openOverlay() {
    const elements = getElements();
    if (!elements.overlay) return;

    const stats = window.VirtualTable?.getPostFilterStats ? window.VirtualTable.getPostFilterStats() : null;
    const totalRows = Number(stats?.totalRows || 0);

    if (totalRows <= 0) {
      if (window.showToastMessage) {
        window.showToastMessage('Run a query before adding post filters.', 'warning');
      }
      return;
    }

    refreshOverlay();
    elements.overlay.classList.remove('hidden');
    elements.overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('post-filter-overlay-open');
    window.requestAnimationFrame(() => elements.fieldSelect?.focus());
  }

  function writeSnapshot(snapshot, options = {}) {
    if (window.VirtualTable?.replacePostFilters) {
      window.VirtualTable.replacePostFilters(snapshot, options);
    }
  }

  function addFilter() {
    const elements = getElements();
    if (!elements.fieldSelect || !elements.operatorSelect || !elements.valueInput || !elements.valueInput2) return;

    const field = String(elements.fieldSelect.value || '').trim();
    const cond = String(elements.operatorSelect.value || '').trim();
    let value = String(elements.valueInput.value || '').trim();
    let value2 = String(elements.valueInput2.value || '').trim();

    if (!field || !cond) {
      return;
    }

    if (cond === 'between') {
      if (!value || !value2) {
        window.showToastMessage && window.showToastMessage('Enter both values for a between filter.', 'warning');
        return;
      }
      value = `${value}|${value2}`;
    } else if (!value && !isBlankSentinel(value)) {
      window.showToastMessage && window.showToastMessage('Enter a value for the post filter.', 'warning');
      return;
    }

    const snapshot = getSnapshot();
    if (!snapshot[field]) {
      snapshot[field] = { filters: [] };
    }

    const alreadyExists = snapshot[field].filters.some(filter => filter.cond === cond && filter.val === value);
    if (alreadyExists) {
      window.showToastMessage && window.showToastMessage('That post filter is already active.', 'info');
      return;
    }

    snapshot[field].filters.push({ cond, val: value });
    writeSnapshot(snapshot, { refreshView: true, notify: true, resetScroll: true });

    elements.valueInput.value = '';
    elements.valueInput2.value = '';
    if (elements.valuePickerSearch) {
      elements.valuePickerSearch.value = '';
    }
    renderSummary();
    renderFilterList();
    syncValueInputs();
    updateToolbarButton();

    window.showToastMessage && window.showToastMessage('Post filter applied.', 'success');
  }

  function removeFilter(field, index) {
    const snapshot = getSnapshot();
    if (!snapshot[field] || !Array.isArray(snapshot[field].filters) || !snapshot[field].filters[index]) {
      return;
    }

    snapshot[field].filters.splice(index, 1);
    if (!snapshot[field].filters.length) {
      delete snapshot[field];
    }

    writeSnapshot(snapshot, { refreshView: true, notify: true, resetScroll: true });
    renderSummary();
    renderFilterList();
    updateToolbarButton();
  }

  function clearAllFilters() {
    if (window.VirtualTable?.clearPostFilters) {
      window.VirtualTable.clearPostFilters({ refreshView: true, notify: true, resetScroll: true });
    }
    refreshOverlay();
  }

  function handleListClick(event) {
    const button = event.target.closest('.post-filter-pill__remove');
    if (!button) return;

    const field = button.getAttribute('data-field') || '';
    const index = Number.parseInt(button.getAttribute('data-index') || '', 10);
    if (!field || Number.isNaN(index)) return;
    removeFilter(field, index);
  }

  function attachListeners() {
    const elements = getElements();
    elements.button?.addEventListener('click', openOverlay);
    elements.backdrop?.addEventListener('click', closeOverlay);
    elements.closeBtn?.addEventListener('click', closeOverlay);
    elements.doneBtn?.addEventListener('click', closeOverlay);
    elements.clearBtn?.addEventListener('click', clearAllFilters);
    elements.addBtn?.addEventListener('click', addFilter);
    elements.fieldSelect?.addEventListener('change', syncOperatorOptions);
    elements.operatorSelect?.addEventListener('change', syncValueInputs);
    elements.valuePickerSearch?.addEventListener('input', event => {
      renderValuePickerOptions(event.target.value);
    });
    elements.valuePickerSelect?.addEventListener('change', event => {
      if (elements.valueInput) {
        elements.valueInput.value = String(event.target.value || '');
      }
    });
    elements.valuePickerSelect?.addEventListener('dblclick', addFilter);
    elements.list?.addEventListener('click', handleListClick);

    window.addEventListener('postfilters:updated', () => {
      refreshOverlay();
    });

    if (window.QueryChangeManager?.subscribe) {
      window.QueryChangeManager.subscribe(event => {
        if (!event?.changes?.displayedFields) {
          return;
        }

        if (window.VirtualTable?.replacePostFilters) {
          window.VirtualTable.replacePostFilters(getSnapshot(), {
            refreshView: true,
            notify: true,
            resetScroll: false
          });
        }
      });
    }

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        const { overlay } = getElements();
        if (overlay && !overlay.classList.contains('hidden')) {
          closeOverlay();
        }
      }
    });

    refreshOverlay();
  }

  window.PostFilterSystem = {
    open: openOverlay,
    close: closeOverlay,
    refresh: refreshOverlay,
    syncToolbarButton: updateToolbarButton,
    clearAll: clearAllFilters
  };

  window.onDOMReady(attachListeners);
})();