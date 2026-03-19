(function() {
  let equalsValueControl = null;

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
      logicSelect: document.getElementById('post-filter-logic'),
      valueInput: document.getElementById('post-filter-value'),
      valueInput2: document.getElementById('post-filter-value-2'),
      valuePickerHost: document.getElementById('post-filter-value-picker-host'),
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

  function formatFilterValue(filter, fieldName) {
    const type = getFieldType(fieldName);
    const rawValue = String(filter?.val || '');

    if (Array.isArray(filter?.vals) && filter.vals.length > 0) {
      const labels = filter.vals.map(value => isBlankSentinel(value)
        ? '(Blank values)'
        : formatFilterValue({ cond: 'equals', val: value }, fieldName));

      if (labels.length <= 2) {
        return labels.join(', ');
      }

      return `${labels[0]}, ${labels[1]} and ${labels.length - 2} more`;
    }

    if (isBlankSentinel(rawValue)) {
      return '(Blank values)';
    }

    if (String(filter?.cond || '').toLowerCase() === 'between') {
      const [left, right] = rawValue.split('|');
      return `${left || ''} - ${right || ''}`;
    }

    if (type === 'money') {
      const displayValue = window.MoneyUtils.formatDisplayValue(rawValue);
      return displayValue || rawValue;
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

  function getCurrentEqualsValues(fieldName) {
    const snapshot = getSnapshot();
    const fieldFilters = Array.isArray(snapshot[fieldName]?.filters) ? snapshot[fieldName].filters : [];
    const equalsFilter = fieldFilters.find(filter => String(filter?.cond || '').toLowerCase() === 'equals');

    if (!equalsFilter) {
      return [];
    }

    if (Array.isArray(equalsFilter.vals)) {
      return equalsFilter.vals.map(value => String(value || '')).filter(value => value || isBlankSentinel(value));
    }

    const scalarValue = String(equalsFilter.val || '');
    return scalarValue || isBlankSentinel(scalarValue) ? [scalarValue] : [];
  }

  function getFieldLogic(fieldName) {
    const snapshot = getSnapshot();
    return String(snapshot[fieldName]?.logic || 'all').toLowerCase() === 'any' ? 'any' : 'all';
  }

  function getFieldRuleCount(fieldName) {
    const snapshot = getSnapshot();
    return Array.isArray(snapshot[fieldName]?.filters) ? snapshot[fieldName].filters.length : 0;
  }

  function syncLogicSelect() {
    const elements = getElements();
    if (!elements.fieldSelect || !elements.logicSelect) {
      return;
    }

    const fieldName = String(elements.fieldSelect.value || '').trim();
    const ruleCount = getFieldRuleCount(fieldName);
    const showLogic = ruleCount > 0;
    const logicShell = elements.logicSelect.closest('.post-filter-field');

    elements.logicSelect.value = getFieldLogic(fieldName);
    if (logicShell) {
      logicShell.classList.toggle('hidden', !showLogic);
    }
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
    elements.operatorSelect.innerHTML = options.map(option => `<option value="${option}">${window.OperatorLabels.get(option)}</option>`).join('');

    if (options.includes(previousValue)) {
      elements.operatorSelect.value = previousValue;
    }

    syncLogicSelect();
    syncValueInputs();
  }

  function buildEqualsValueControl(fieldName) {
    const elements = getElements();
    if (!elements.valuePickerHost) return;

    const options = getFieldValueOptions(fieldName).map(option => ({
      Name: `${formatLoadedOptionLabel(option, fieldName)} (${Number(option.count || 0).toLocaleString()})`,
      RawValue: option.value,
      Description: `${Number(option.count || 0).toLocaleString()} loaded rows`
    }));

    elements.valuePickerHost.innerHTML = '';
    equalsValueControl = null;

    if (!options.length || typeof window.createGroupedSelector !== 'function') {
      return;
    }

    const selector = window.createGroupedSelector(options, true, getCurrentEqualsValues(fieldName), {
      enableGrouping: false,
      containerId: null
    });

    const control = typeof window.createPopupListControl === 'function'
      ? window.createPopupListControl(selector, `${fieldName} values`, 'Choose one or more loaded values...')
      : selector;

    control.classList.add('post-filter-value-control');
    elements.valuePickerHost.appendChild(control);
    equalsValueControl = control;
  }

  function syncValuePicker() {
    const elements = getElements();
    if (!elements.operatorSelect || !elements.valuePickerHost || !elements.fieldSelect) {
      return;
    }

    const isEquals = elements.operatorSelect.value === 'equals';
    const field = String(elements.fieldSelect.value || '').trim();
    const options = isEquals ? getFieldValueOptions(field) : [];
    const shouldShowPicker = isEquals && options.length > 0;

    elements.valuePickerHost.classList.toggle('hidden', !shouldShowPicker);
    elements.valueInput.classList.toggle('hidden', shouldShowPicker);

    if (!shouldShowPicker) {
      if (isBlankSentinel(elements.valueInput.value)) {
        elements.valueInput.value = '';
      }
      elements.valuePickerHost.innerHTML = '';
      equalsValueControl = null;
      return;
    }

    buildEqualsValueControl(field);
  }

  function syncValueInputs() {
    const elements = getElements();
    if (!elements.valueInput || !elements.valueInput2 || !elements.operatorSelect || !elements.fieldSelect || !elements.betweenLabel) return;

    const fieldType = getFieldType(elements.fieldSelect.value);
    const isBetween = elements.operatorSelect.value === 'between';
    const inputType = fieldType === 'date' ? 'date' : (fieldType === 'money' ? 'text' : (fieldType === 'number' ? 'number' : 'text'));

    [elements.valueInput, elements.valueInput2].forEach(input => {
      input.type = inputType;
      input.step = fieldType === 'money' ? '0.01' : (fieldType === 'number' ? '1' : 'any');
      input.inputMode = fieldType === 'money' ? 'decimal' : (fieldType === 'number' ? 'numeric' : 'text');
      input.placeholder = fieldType === 'date' ? '' : 'Value';
      if (fieldType === 'money') {
        window.MoneyUtils.configureInputBehavior(input, true);
      } else {
        window.MoneyUtils.configureInputBehavior(input, false);
      }
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
    const entries = Object.entries(snapshot)
      .filter(([, data]) => Array.isArray(data?.filters) && data.filters.length > 0)
      .map(([field, data]) => ({
        field,
        logic: String(data?.logic || 'all').toLowerCase() === 'any' ? 'any' : 'all',
        showLogic: data.filters.length > 1,
        filters: data.filters.map((filter, index) => ({ filter, index }))
      }));

    elements.empty.classList.toggle('hidden', entries.length > 0);
    elements.list.innerHTML = entries.map(entry => {
      const safeField = window.escapeHtml ? window.escapeHtml(entry.field) : entry.field;
      const ruleLabel = entry.logic === 'any' ? 'Rows can match any rule below' : 'Rows must match every rule below';
      const safeRuleLabel = window.escapeHtml ? window.escapeHtml(ruleLabel) : ruleLabel;
      const filterMarkup = entry.filters.map(({ filter, index }) => {
        const label = `${window.OperatorLabels.get(filter.cond)} ${formatFilterValue(filter, entry.field)}`;
        const safeLabel = window.escapeHtml ? window.escapeHtml(label) : label;
        return `
          <div class="post-filter-pill">
            <span class="post-filter-pill__text">${safeLabel}</span>
            <button type="button" class="post-filter-pill__remove" data-field="${entry.field}" data-index="${index}" aria-label="Remove post filter">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4 pointer-events-none">
                <line x1="5" y1="5" x2="15" y2="15"></line>
                <line x1="15" y1="5" x2="5" y2="15"></line>
              </svg>
            </button>
          </div>`;
      }).join('');

      return `
        <section class="post-filter-group" data-field="${entry.field}">
          <div class="post-filter-group__header">
            <div>
              <h4 class="post-filter-group__title">${safeField}</h4>
              <p class="post-filter-group__meta">${entry.filters.length} ${entry.filters.length === 1 ? 'rule' : 'rules'}</p>
            </div>
            ${entry.showLogic ? `
            <label class="post-filter-group__logic">
              <span class="post-filter-group__logic-label">${safeRuleLabel}</span>
              <select class="post-filter-group__logic-select" data-field-logic="${entry.field}" aria-label="Change logic for ${safeField}">
                <option value="all" ${entry.logic === 'all' ? 'selected' : ''}>Require all</option>
                <option value="any" ${entry.logic === 'any' ? 'selected' : ''}>Allow any</option>
              </select>
            </label>` : ''}
          </div>
          <div class="post-filter-group__rules">${filterMarkup}</div>
        </section>`;
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
    const logic = elements.logicSelect ? String(elements.logicSelect.value || 'all').trim().toLowerCase() : 'all';
    let value = String(elements.valueInput.value || '').trim();
    let value2 = String(elements.valueInput2.value || '').trim();
    let selectedValues = [];
    const fieldType = getFieldType(field);

    if (!field || !cond) {
      return;
    }

    if (fieldType === 'money') {
      value = window.MoneyUtils.sanitizeInputValue(value);
      value2 = window.MoneyUtils.sanitizeInputValue(value2);
    }

    if (cond === 'equals' && equalsValueControl && typeof equalsValueControl.getSelectedValues === 'function') {
      selectedValues = equalsValueControl.getSelectedValues()
        .map(entry => String(entry || ''))
        .filter(entry => entry || isBlankSentinel(entry));

      if (!selectedValues.length) {
        window.showToastMessage && window.showToastMessage('Choose one or more loaded values for the post filter.', 'warning');
        return;
      }
    } else if (cond === 'between') {
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
      snapshot[field] = { logic: 'all', filters: [] };
    }

    if (snapshot[field].filters.length > 0) {
      snapshot[field].logic = logic === 'any' ? 'any' : 'all';
    }

    if (cond === 'equals' && selectedValues.length) {
      snapshot[field].filters = snapshot[field].filters.filter(filter => String(filter?.cond || '').toLowerCase() !== 'equals');
      snapshot[field].filters.push({ cond, val: selectedValues[0], vals: selectedValues });
      writeSnapshot(snapshot, { refreshView: true, notify: true, resetScroll: true });
      renderSummary();
      renderFilterList();
      syncValueInputs();
      updateToolbarButton();
      window.showToastMessage && window.showToastMessage('Post filter applied.', 'success');
      return;
    }

    const alreadyExists = snapshot[field].filters.some(filter => filter.cond === cond && filter.val === value);
    if (alreadyExists) {
      window.showToastMessage && window.showToastMessage('That post filter is already active.', 'info');
      return;
    }

    snapshot[field].filters.push({ cond, val: value });
    if (snapshot[field].filters.length === 1) {
      snapshot[field].logic = 'all';
    }
    writeSnapshot(snapshot, { refreshView: true, notify: true, resetScroll: true });

    elements.valueInput.value = '';
    elements.valueInput2.value = '';
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

  function updateFieldLogic(field, logic) {
    const snapshot = getSnapshot();
    if (!snapshot[field] || !Array.isArray(snapshot[field].filters) || !snapshot[field].filters.length) {
      return;
    }

    snapshot[field].logic = String(logic || 'all').toLowerCase() === 'any' ? 'any' : 'all';
    writeSnapshot(snapshot, { refreshView: true, notify: true, resetScroll: false });
    renderSummary();
    renderFilterList();
    syncLogicSelect();
    updateToolbarButton();
  }

  function clearAllFilters() {
    if (window.VirtualTable?.clearPostFilters) {
      window.VirtualTable.clearPostFilters({ refreshView: true, notify: true, resetScroll: true });
    }
    refreshOverlay();
  }

  function handleListClick(event) {
    const logicSelect = event.target.closest('.post-filter-group__logic-select');
    if (logicSelect) {
      return;
    }

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
    elements.logicSelect?.addEventListener('change', () => {
      const field = String(elements.fieldSelect?.value || '').trim();
      if (!field) {
        return;
      }
      const snapshot = getSnapshot();
      if (snapshot[field] && Array.isArray(snapshot[field].filters) && snapshot[field].filters.length) {
        updateFieldLogic(field, elements.logicSelect.value);
      }
    });
    elements.list?.addEventListener('click', handleListClick);
    elements.list?.addEventListener('change', event => {
      const logicSelect = event.target.closest('.post-filter-group__logic-select');
      if (!logicSelect) {
        return;
      }

      const field = String(logicSelect.getAttribute('data-field-logic') || '').trim();
      if (!field) {
        return;
      }

      updateFieldLogic(field, logicSelect.value);
    });

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