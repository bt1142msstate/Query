(function() {
  const state = {
    active: false,
    spec: null,
    specSource: 'generated',
    searchParams: null,
    viewMode: 'bubbles',
    formCard: null,
    validationEl: null,
    runBtn: null,
    copyBtn: null,
    modeToggleBtn: null,
    mobileModeToggleBtn: null,
    formHost: null,
    controls: new Map(),
    originalClearCurrentQuery: null,
    originalUpdateButtonStates: null,
    lastSuggestedTableName: '',
    hiddenNodes: []
  };

  function slugify(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function normalizeStringArray(value) {
    if (Array.isArray(value)) {
      return value.map(item => String(item || '').trim()).filter(Boolean);
    }

    if (typeof value === 'string') {
      return value.split(',').map(item => item.trim()).filter(Boolean);
    }

    return [];
  }

  function decodeBase64Url(rawValue) {
    const normalized = String(rawValue || '').replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  function encodeBase64Url(rawValue) {
    const bytes = new TextEncoder().encode(String(rawValue || ''));
    let binary = '';
    bytes.forEach(byte => {
      binary += String.fromCharCode(byte);
    });
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  function decodeSpec(rawValue) {
    if (!rawValue) return null;

    try {
      if (rawValue.trim().startsWith('{')) {
        return JSON.parse(rawValue);
      }
    } catch (_) {}

    try {
      return JSON.parse(decodeURIComponent(rawValue));
    } catch (_) {}

    return JSON.parse(decodeBase64Url(rawValue));
  }

  function encodeSpec(spec) {
    return encodeBase64Url(JSON.stringify(spec));
  }

  function interpolateValue(template, bindings) {
    if (template === undefined || template === null) return '';
    return String(template).replace(/\{([^}]+)\}/g, (_, key) => {
      const binding = bindings[key];
      if (Array.isArray(binding)) {
        return binding.join(',');
      }
      return binding === undefined || binding === null ? '' : String(binding);
    });
  }

  function splitListValues(rawValue) {
    if (Array.isArray(rawValue)) {
      return rawValue.map(value => String(value || '').trim()).filter(Boolean);
    }

    return String(rawValue || '')
      .split(/[\n,]+/)
      .map(value => value.trim())
      .filter(Boolean);
  }

  function normalizeInputSpec(input, index) {
    if (!input || typeof input !== 'object') return null;

    const fieldName = String(input.field || input.fieldName || '').trim();
    if (!fieldName) return null;

    const operator = typeof window.mapFieldOperatorToUiCond === 'function'
      ? window.mapFieldOperatorToUiCond(input.operator || input.cond || 'equals')
      : String(input.operator || input.cond || 'equals').toLowerCase();
    const keys = Array.isArray(input.keys)
      ? input.keys.map(key => String(key || '').trim()).filter(Boolean)
      : [];
    const defaultKey = slugify(input.label || fieldName || `field-${index + 1}`) || `field-${index + 1}`;

    return {
      key: String(input.key || input.param || keys[0] || defaultKey).trim(),
      keys,
      field: fieldName,
      label: String(input.label || fieldName).trim(),
      help: String(input.help || input.description || '').trim(),
      placeholder: String(input.placeholder || '').trim(),
      operator,
      required: Boolean(input.required),
      multiple: Boolean(input.multiple),
      hidden: Boolean(input.hidden),
      type: String(input.type || '').trim(),
      defaultValue: input.default,
      options: Array.isArray(input.options) ? input.options.slice() : null
    };
  }

  function normalizeLockedFilter(filter) {
    if (!filter || typeof filter !== 'object') return null;
    const fieldName = String(filter.field || filter.fieldName || '').trim();
    if (!fieldName) return null;

    const operator = typeof window.mapFieldOperatorToUiCond === 'function'
      ? window.mapFieldOperatorToUiCond(filter.operator || filter.cond || 'equals')
      : String(filter.operator || filter.cond || 'equals').toLowerCase();

    return {
      field: fieldName,
      operator,
      value: filter.value,
      values: Array.isArray(filter.values) ? filter.values.slice() : null
    };
  }

  function normalizeSpec(rawSpec) {
    if (!rawSpec || typeof rawSpec !== 'object') return null;

    const inputs = Array.isArray(rawSpec.inputs)
      ? rawSpec.inputs.map(normalizeInputSpec).filter(Boolean)
      : [];

    const lockedFilters = Array.isArray(rawSpec.lockedFilters)
      ? rawSpec.lockedFilters.map(normalizeLockedFilter).filter(Boolean)
      : [];

    const columns = normalizeStringArray(
      rawSpec.columns || rawSpec.displayFields || rawSpec.display_fields || rawSpec.fields
    );

    return {
      title: String(rawSpec.title || rawSpec.name || 'Query Form').trim(),
      description: String(rawSpec.description || rawSpec.helpText || '').trim(),
      queryName: String(rawSpec.queryName || rawSpec.tableName || rawSpec.title || rawSpec.name || 'Query Form').trim(),
      columns,
      inputs,
      lockedFilters
    };
  }

  function getOperatorLabel(operator) {
    const labels = {
      contains: 'Contains',
      starts: 'Starts with',
      equals: 'Equals',
      does_not_equal: 'Does not equal',
      greater: 'Greater than',
      greater_or_equal: 'Greater than or equal',
      less: 'Less than',
      less_or_equal: 'Less than or equal',
      between: 'Between',
      before: 'Before',
      after: 'After',
      doesnotcontain: 'Does not contain',
      on_or_after: 'On or after',
      on_or_before: 'On or before'
    };
    return labels[operator] || String(operator || 'equals').replace(/_/g, ' ').replace(/^./, char => char.toUpperCase());
  }

  function normalizeOperatorForField(fieldDef, operator) {
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

  function uniqueInputKey(baseKey, seenKeys) {
    const normalizedBase = slugify(baseKey) || 'field';
    let candidate = normalizedBase;
    let index = 2;
    while (seenKeys.has(candidate)) {
      candidate = `${normalizedBase}-${index}`;
      index += 1;
    }
    seenKeys.add(candidate);
    return candidate;
  }

  function readStoredFilterValues(filter) {
    if (!filter) return [];

    if (filter.cond === 'between') {
      return String(filter.val || '')
        .split('|')
        .map(value => value.trim())
        .filter(Boolean)
        .slice(0, 2);
    }

    return splitListValues(filter.val || '');
  }

  function buildSpecFromCurrentQuery() {
    const columns = Array.isArray(window.displayedFields) ? window.displayedFields.slice() : [];
    if (columns.length === 0) {
      return null;
    }

    const tableNameInput = window.DOM && window.DOM.tableNameInput;
    const title = tableNameInput && tableNameInput.value.trim()
      ? tableNameInput.value.trim()
      : 'Query Form';
    const seenKeys = new Set();
    const inputs = [];

    Object.entries(window.activeFilters || {}).forEach(([fieldName, fieldState]) => {
      const filters = Array.isArray(fieldState && fieldState.filters) ? fieldState.filters : [];
      const fieldDef = window.fieldDefs ? window.fieldDefs.get(fieldName) : null;

      filters.forEach((filter, index) => {
        const operator = normalizeOperatorForField(fieldDef, String(filter && filter.cond || 'equals').trim() || 'equals');
        const values = readStoredFilterValues(filter);
        const hasMultipleFilters = filters.length > 1;
        const keyBase = `${fieldName}-${operator}${hasMultipleFilters ? `-${index + 1}` : ''}`;
        const shouldAllowMultiple = operator !== 'between' && (Boolean(fieldDef && fieldDef.allowValueList) || values.length > 1);

        inputs.push({
          key: uniqueInputKey(keyBase, seenKeys),
          field: fieldName,
          label: hasMultipleFilters ? `${fieldName} (${getOperatorLabel(operator)})` : fieldName,
          operator,
          multiple: shouldAllowMultiple,
          default: operator === 'between'
            ? values.slice(0, 2)
            : shouldAllowMultiple
              ? values
              : (values[0] || ''),
          help: ''
        });
      });
    });

    return normalizeSpec({
      title,
      queryName: title,
      description: '',
      columns,
      inputs,
      lockedFilters: []
    });
  }

  function getFieldPickerOptions() {
    const source = Array.isArray(window.fieldDefsArray) && window.fieldDefsArray.length > 0
      ? window.fieldDefsArray
      : Array.from((window.fieldDefs && window.fieldDefs.values()) || []);

    return source
      .filter(fieldDef => fieldDef && fieldDef.name)
      .map(fieldDef => ({
        name: String(fieldDef.name),
        type: String(fieldDef.type || 'text'),
        category: Array.isArray(fieldDef.category)
          ? fieldDef.category.filter(Boolean).join(', ')
          : String(fieldDef.category || '')
      }))
      .sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' }));
  }

  function hasSpecColumn(fieldName) {
    if (!state.spec || !Array.isArray(state.spec.columns)) return false;
    const baseFieldName = typeof window.getBaseFieldName === 'function'
      ? window.getBaseFieldName(fieldName)
      : fieldName;

    return state.spec.columns.some(column => {
      const baseColumnName = typeof window.getBaseFieldName === 'function'
        ? window.getBaseFieldName(column)
        : column;
      return baseColumnName === baseFieldName;
    });
  }

  function hasSpecFilterInput(fieldName) {
    if (!state.spec || !Array.isArray(state.spec.inputs)) return false;
    const baseFieldName = typeof window.getBaseFieldName === 'function'
      ? window.getBaseFieldName(fieldName)
      : fieldName;

    return state.spec.inputs.some(inputSpec => {
      const baseInputField = typeof window.getBaseFieldName === 'function'
        ? window.getBaseFieldName(inputSpec.field)
        : inputSpec.field;
      return baseInputField === baseFieldName;
    });
  }

  function removeSpecColumns(fieldName) {
    if (!state.spec || !Array.isArray(state.spec.columns)) return;
    const baseFieldName = typeof window.getBaseFieldName === 'function'
      ? window.getBaseFieldName(fieldName)
      : fieldName;

    state.spec.columns = state.spec.columns.filter(column => {
      const baseColumnName = typeof window.getBaseFieldName === 'function'
        ? window.getBaseFieldName(column)
        : column;
      return baseColumnName !== baseFieldName;
    });
  }

  function removeSpecFilterInputs(fieldName) {
    if (!state.spec || !Array.isArray(state.spec.inputs)) return;
    const baseFieldName = typeof window.getBaseFieldName === 'function'
      ? window.getBaseFieldName(fieldName)
      : fieldName;

    state.spec.inputs = state.spec.inputs.filter(inputSpec => {
      const baseInputField = typeof window.getBaseFieldName === 'function'
        ? window.getBaseFieldName(inputSpec.field)
        : inputSpec.field;
      return baseInputField !== baseFieldName;
    });
  }

  function removeSpecInputByKey(inputKey) {
    if (!state.spec || !Array.isArray(state.spec.inputs) || !inputKey) return;
    state.spec.inputs = state.spec.inputs.filter(inputSpec => inputSpec.key !== inputKey);
  }

  function captureCurrentControlDefaults() {
    if (!state.spec || !Array.isArray(state.spec.inputs) || state.controls.size === 0) {
      return;
    }

    state.spec.inputs.forEach(inputSpec => {
      const values = getControlValues(inputSpec);
      if (inputSpec.operator === 'between') {
        inputSpec.defaultValue = values.slice(0, 2);
        return;
      }

      inputSpec.defaultValue = inputSpec.multiple ? values.filter(Boolean) : (values[0] || '');
    });
  }

  function rebuildFormCardFromSpec() {
    captureCurrentControlDefaults();
    state.searchParams = new URLSearchParams();
    state.controls.clear();
    buildFormCard();
    applyFormState();
    syncPresentationMode();

    if (typeof window.updateButtonStates === 'function') {
      window.updateButtonStates();
    }

    window.history.replaceState({}, '', buildCurrentShareUrl());
  }

  async function activateGeneratedFormFromCurrentQuery() {
    if (typeof window.loadFieldDefinitions === 'function') {
      await window.loadFieldDefinitions();
    }

    const nextSpec = buildSpecFromCurrentQuery();
    if (!nextSpec || nextSpec.columns.length === 0) {
      if (window.showToastMessage) {
        window.showToastMessage('Add at least one output column before switching to form mode.', 'warning');
      }
      return false;
    }

    state.active = true;
    state.specSource = 'generated';
    state.spec = nextSpec;
    state.searchParams = new URLSearchParams();
    state.viewMode = 'form';
    state.controls.clear();

    buildFormCard();
    wrapUpdateButtonStates();
    wrapClearCurrentQuery();
    applyFormState();
    syncPresentationMode();

    if (typeof window.updateButtonStates === 'function') {
      window.updateButtonStates();
    }

    const nextUrl = buildCurrentShareUrl();
    window.history.replaceState({}, '', nextUrl);
    return true;
  }

  async function syncGeneratedFormFromCurrentQuery(options = {}) {
    if (typeof window.loadFieldDefinitions === 'function') {
      await window.loadFieldDefinitions();
    }

    const nextSpec = buildSpecFromCurrentQuery();
    if (!nextSpec || nextSpec.columns.length === 0) {
      return false;
    }

    state.active = true;
    state.specSource = 'generated';
    state.spec = nextSpec;
    state.searchParams = new URLSearchParams();

    if (options.forceFormMode) {
      state.viewMode = 'form';
    }

    if (state.viewMode === 'form' || options.rebuildCard) {
      state.controls.clear();
      buildFormCard();
      wrapUpdateButtonStates();
      wrapClearCurrentQuery();
      applyFormState();
      syncPresentationMode();

      if (typeof window.updateButtonStates === 'function') {
        window.updateButtonStates();
      }
    }

    window.history.replaceState({}, '', buildCurrentShareUrl());
    return true;
  }

  function parseFieldOptions(fieldDef, inputSpec) {
    const source = Array.isArray(inputSpec.options) && inputSpec.options.length > 0
      ? inputSpec.options
      : fieldDef && fieldDef.values;

    if (!source) {
      return { values: null, hasValuePairs: false };
    }

    try {
      const parsed = typeof source === 'string' ? JSON.parse(source) : source;
      if (!Array.isArray(parsed) || parsed.length === 0) {
        return { values: null, hasValuePairs: false };
      }

      const hasValuePairs = typeof parsed[0] === 'object' && parsed[0] && (parsed[0].Name || parsed[0].RawValue);
      const values = parsed.slice().sort((left, right) => {
        const leftLabel = hasValuePairs ? (left.Name || left.RawValue) : left;
        const rightLabel = hasValuePairs ? (right.Name || right.RawValue) : right;
        return String(leftLabel).localeCompare(String(rightLabel), undefined, { numeric: true, sensitivity: 'base' });
      });

      return { values, hasValuePairs };
    } catch (_) {
      return { values: null, hasValuePairs: false };
    }
  }

  function getFieldInputType(fieldDef, inputSpec) {
    if (inputSpec.type) return inputSpec.type;

    const fieldType = fieldDef && fieldDef.type;
    if (fieldType === 'date') return 'date';
    if (fieldType === 'money') return 'money';
    if (fieldType === 'number') return 'number';
    return 'text';
  }

  function getAvailableOperators(fieldDef, inputSpec) {
    const configured = Array.isArray(inputSpec.operatorOptions) && inputSpec.operatorOptions.length > 0
      ? inputSpec.operatorOptions
      : (Array.isArray(fieldDef && fieldDef.filters) ? fieldDef.filters : [inputSpec.operator || 'equals']);

    const normalized = configured
      .map(operator => normalizeOperatorForField(fieldDef, operator))
      .filter(Boolean)
      .filter((operator, index, list) => list.indexOf(operator) === index);

    const preferredOrder = [
      'contains',
      'starts',
      'equals',
      'doesnotcontain',
      'greater',
      'less',
      'before',
      'after',
      'on_or_before',
      'on_or_after',
      'between'
    ];

    return normalized.slice().sort((left, right) => {
      const leftIndex = preferredOrder.indexOf(left);
      const rightIndex = preferredOrder.indexOf(right);
      const normalizedLeft = leftIndex === -1 ? preferredOrder.length : leftIndex;
      const normalizedRight = rightIndex === -1 ? preferredOrder.length : rightIndex;
      if (normalizedLeft !== normalizedRight) {
        return normalizedLeft - normalizedRight;
      }
      return left.localeCompare(right);
    });
  }

  function getDefaultOperatorForField(fieldDef) {
    const availableOperators = getAvailableOperators(fieldDef, { operator: 'equals' });
    const preferredOperators = ['equals', 'contains', 'starts', 'greater', 'less', 'before', 'after', 'on_or_after', 'on_or_before', 'between'];
    return preferredOperators.find(operator => availableOperators.includes(operator)) || availableOperators[0] || 'equals';
  }

  function createGeneratedInputSpec(fieldName) {
    const fieldDef = window.fieldDefs ? window.fieldDefs.get(fieldName) : null;
    const operator = getDefaultOperatorForField(fieldDef);
    const existingKeys = new Set((state.spec && Array.isArray(state.spec.inputs) ? state.spec.inputs : []).map(inputSpec => inputSpec.key));

    return {
      key: uniqueInputKey(`${fieldName}-${operator}`, existingKeys),
      keys: [],
      field: fieldName,
      label: fieldName,
      help: '',
      placeholder: '',
      operator,
      required: false,
      multiple: operator !== 'between' && Boolean(fieldDef && fieldDef.allowValueList),
      hidden: false,
      type: fieldDef && fieldDef.type ? String(fieldDef.type) : '',
      defaultValue: operator === 'between' ? ['', ''] : '',
      options: null
    };
  }

  async function openFieldPicker() {
    if (typeof window.loadFieldDefinitions === 'function') {
      await window.loadFieldDefinitions();
    }

    const options = getFieldPickerOptions();
    if (options.length === 0) {
      if (window.showToastMessage) {
        window.showToastMessage('No fields are available to add right now.', 'warning');
      }
      return;
    }

    const backdrop = document.createElement('div');
    backdrop.className = 'form-mode-field-picker-backdrop';

    const modal = document.createElement('div');
    modal.className = 'form-mode-field-picker-modal';
    modal.innerHTML = `
      <div class="form-mode-field-picker-header">
        <div>
          <span class="form-mode-field-picker-kicker">Add Field</span>
          <h3 class="form-mode-field-picker-title">Choose a field for this form</h3>
          <p class="form-mode-field-picker-description">Select a field, then decide whether it should show in results, appear as a filter control, or both.</p>
        </div>
        <button type="button" class="form-mode-field-picker-close" aria-label="Close field picker">×</button>
      </div>
      <div class="form-mode-field-picker-body">
        <div class="form-mode-field-picker-list-panel">
          <input type="search" class="form-mode-field-picker-search" placeholder="Search fields..." aria-label="Search fields" />
          <div class="form-mode-field-picker-list" role="listbox" aria-label="Available fields"></div>
        </div>
        <div class="form-mode-field-picker-details">
          <p class="form-mode-field-picker-selected-label">Selected field</p>
          <h4 class="form-mode-field-picker-field-name"></h4>
          <p class="form-mode-field-picker-field-meta hidden"></p>
          <label class="form-mode-field-picker-choice">
            <input type="checkbox" data-field-picker-choice="display" />
            <span>Display in results</span>
          </label>
          <label class="form-mode-field-picker-choice">
            <input type="checkbox" data-field-picker-choice="filter" />
            <span>Add filter control</span>
          </label>
          <p class="form-mode-field-picker-status"></p>
        </div>
      </div>
      <div class="form-mode-field-picker-footer">
        <button type="button" class="form-mode-btn form-mode-field-picker-cancel">Cancel</button>
        <button type="button" class="form-mode-btn form-mode-btn-primary form-mode-field-picker-apply" disabled>Apply Changes</button>
      </div>
    `;

    document.body.appendChild(backdrop);
    document.body.appendChild(modal);

    const closeButton = modal.querySelector('.form-mode-field-picker-close');
    const cancelButton = modal.querySelector('.form-mode-field-picker-cancel');
    const applyButton = modal.querySelector('.form-mode-field-picker-apply');
    const searchInput = modal.querySelector('.form-mode-field-picker-search');
    const listEl = modal.querySelector('.form-mode-field-picker-list');
    const fieldNameEl = modal.querySelector('.form-mode-field-picker-field-name');
    const fieldMetaEl = modal.querySelector('.form-mode-field-picker-field-meta');
    const statusEl = modal.querySelector('.form-mode-field-picker-status');
    const displayChoice = modal.querySelector('[data-field-picker-choice="display"]');
    const filterChoice = modal.querySelector('[data-field-picker-choice="filter"]');

    let selectedFieldName = options[0].name;
    let searchTerm = '';

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

    function syncDetails() {
      const selected = options.find(option => option.name === selectedFieldName) || null;
      if (!selected) {
        fieldNameEl.textContent = '';
        fieldMetaEl.textContent = '';
        fieldMetaEl.classList.add('hidden');
        statusEl.textContent = 'No field selected.';
        applyButton.disabled = true;
        applyButton.textContent = 'Apply Changes';
        return;
      }

      const alreadyDisplayed = hasSpecColumn(selected.name);
      const alreadyFilterable = hasSpecFilterInput(selected.name);
      const metaParts = [];
      if (selected.type) metaParts.push(selected.type);
      if (selected.category) metaParts.push(selected.category);

      fieldNameEl.textContent = selected.name;
      fieldMetaEl.textContent = metaParts.join(' • ');
      fieldMetaEl.classList.toggle('hidden', metaParts.length === 0);

      const willAddDisplay = displayChoice.checked && !alreadyDisplayed;
      const willRemoveDisplay = !displayChoice.checked && alreadyDisplayed;
      const willAddFilter = filterChoice.checked && !alreadyFilterable;
      const willRemoveFilter = !filterChoice.checked && alreadyFilterable;
      const statusParts = [];

      if (willAddDisplay) statusParts.push('Will add to results');
      if (willRemoveDisplay) statusParts.push('Will remove from results');
      if (willAddFilter) statusParts.push('Will add filter control');
      if (willRemoveFilter) statusParts.push('Will remove filter control');

      if (!willAddDisplay && !willRemoveDisplay && alreadyDisplayed) {
        statusParts.push('Displayed');
      }
      if (!willAddFilter && !willRemoveFilter && alreadyFilterable) {
        statusParts.push('Filterable');
      }

      statusEl.textContent = statusParts.length > 0
        ? statusParts.join(' • ')
        : 'No changes for this field.';

      const hasChanges = willAddDisplay || willRemoveDisplay || willAddFilter || willRemoveFilter;
      applyButton.disabled = !hasChanges;

      if (willRemoveDisplay || willRemoveFilter) {
        applyButton.textContent = (willAddDisplay || willAddFilter) ? 'Apply Changes' : 'Remove Field';
      } else if (willAddDisplay || willAddFilter) {
        applyButton.textContent = 'Add Field';
      } else {
        applyButton.textContent = 'Apply Changes';
      }
    }

    function renderList() {
      const filteredOptions = options.filter(option => {
        if (!searchTerm) return true;
        const haystack = `${option.name} ${option.type} ${option.category}`.toLowerCase();
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
        displayChoice.checked = hasSpecColumn(selectedFieldName);
        filterChoice.checked = hasSpecFilterInput(selectedFieldName);
      }

      listEl.innerHTML = '';
      filteredOptions.forEach(option => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'form-mode-field-picker-option';
        if (option.name === selectedFieldName) {
          button.classList.add('is-selected');
        }

        const badges = [];
        if (hasSpecColumn(option.name)) {
          badges.push('<span class="form-mode-field-picker-badge">Displayed</span>');
        }
        if (hasSpecFilterInput(option.name)) {
          badges.push('<span class="form-mode-field-picker-badge">Filter</span>');
        }

        button.innerHTML = `
          <span class="form-mode-field-picker-option-name">${option.name}</span>
          <span class="form-mode-field-picker-option-meta">${[option.type, option.category].filter(Boolean).join(' • ')}</span>
          <span class="form-mode-field-picker-option-badges">${badges.join('')}</span>
        `;
        button.addEventListener('click', () => {
          selectedFieldName = option.name;
          displayChoice.checked = hasSpecColumn(option.name);
          filterChoice.checked = hasSpecFilterInput(option.name);
          renderList();
          syncDetails();
        });
        listEl.appendChild(button);
      });

      syncDetails();
    }

    displayChoice.addEventListener('change', syncDetails);
    filterChoice.addEventListener('change', syncDetails);
    searchInput.addEventListener('input', event => {
      searchTerm = String(event.target.value || '').trim().toLowerCase();
      renderList();
    });

    applyButton.addEventListener('click', () => {
      if (!selectedFieldName || !state.spec) {
        return;
      }

      const addedParts = [];
      const removedParts = [];

      const alreadyDisplayed = hasSpecColumn(selectedFieldName);
      const alreadyFilterable = hasSpecFilterInput(selectedFieldName);

      if (displayChoice.checked && !alreadyDisplayed) {
        state.spec.columns.push(selectedFieldName);
        addedParts.push('results column');
      } else if (!displayChoice.checked && alreadyDisplayed) {
        removeSpecColumns(selectedFieldName);
        removedParts.push('results column');
      }

      if (filterChoice.checked && !alreadyFilterable) {
        state.spec.inputs.push(createGeneratedInputSpec(selectedFieldName));
        addedParts.push('filter control');
      } else if (!filterChoice.checked && alreadyFilterable) {
        removeSpecFilterInputs(selectedFieldName);
        removedParts.push('filter control');
      }

      if (addedParts.length === 0 && removedParts.length === 0) {
        return;
      }

      rebuildFormCardFromSpec();
      cleanup();

      if (window.showToastMessage) {
        const messageParts = [];
        if (addedParts.length > 0) {
          messageParts.push(`added ${addedParts.join(' and ')}`);
        }
        if (removedParts.length > 0) {
          messageParts.push(`removed ${removedParts.join(' and ')}`);
        }
        window.showToastMessage(`${selectedFieldName}: ${messageParts.join(', ')}.`, 'success');
      }
    });

    [backdrop, closeButton, cancelButton].forEach(target => {
      if (!target) return;
      target.addEventListener('click', cleanup);
    });

    document.addEventListener('keydown', onKeyDown);
    displayChoice.checked = hasSpecColumn(selectedFieldName);
    filterChoice.checked = hasSpecFilterInput(selectedFieldName);
    renderList();
    window.requestAnimationFrame(() => {
      searchInput.focus();
      searchInput.select();
    });
  }

  function getRawParamValues(searchParams, key) {
    if (!key) return [];
    return searchParams.getAll(key).map(value => String(value || '').trim()).filter(Boolean);
  }

  function resolveInputInitialValues(inputSpec, searchParams) {
    const keys = inputSpec.keys.length ? inputSpec.keys : [inputSpec.key];

    if (inputSpec.operator === 'between' && keys.length >= 2) {
      const defaults = Array.isArray(inputSpec.defaultValue) ? inputSpec.defaultValue : [];
      return keys.slice(0, 2).map((key, index) => {
        const values = getRawParamValues(searchParams, key);
        const fallback = defaults[index];
        return values[0] || (fallback === undefined || fallback === null ? '' : String(fallback));
      });
    }

    const rawValues = keys.flatMap(key => getRawParamValues(searchParams, key));
    if (rawValues.length > 0) {
      return inputSpec.multiple ? rawValues.flatMap(splitListValues) : [rawValues[0]];
    }

    if (inputSpec.defaultValue === undefined || inputSpec.defaultValue === null) {
      return [];
    }

    return inputSpec.multiple ? splitListValues(inputSpec.defaultValue) : [String(inputSpec.defaultValue)];
  }

  function createTextControl(inputType, initialValues, inputSpec) {
    if (inputType === 'money') {
      const wrapper = document.createElement('div');
      wrapper.className = 'form-mode-money-input-wrap';

      const symbol = document.createElement('span');
      symbol.className = 'form-mode-money-symbol';
      symbol.textContent = '$';

      const input = document.createElement('input');
      input.type = 'number';
      input.className = 'form-mode-text-input form-mode-money-input';
      input.placeholder = inputSpec.placeholder || '0.00';
      input.value = initialValues[0] || '';
      input.autocomplete = 'off';
      input.inputMode = 'decimal';
      input.step = '0.01';

      input.addEventListener('keypress', event => {
        if (!/[0-9.\-]/.test(event.key) && event.key.length === 1) {
          event.preventDefault();
        }
      });

      wrapper.appendChild(symbol);
      wrapper.appendChild(input);

      wrapper.getFormValues = function() {
        const value = String(input.value || '').trim();
        return value ? [value] : [];
      };

      wrapper.setFormValues = function(values) {
        input.value = Array.isArray(values) && values.length ? String(values[0]) : '';
      };

      wrapper.focusInput = function() {
        input.focus();
      };

      return wrapper;
    }

    const input = document.createElement('input');
    input.type = inputType;
    input.className = 'form-mode-text-input';
    input.placeholder = inputSpec.placeholder || 'Enter value';
    input.value = initialValues[0] || '';
    input.autocomplete = 'off';

    if (inputType === 'number') {
      input.inputMode = 'numeric';
      input.step = '1';
      input.addEventListener('keypress', event => {
        if (!/[0-9\-]/.test(event.key) && event.key.length === 1) {
          event.preventDefault();
        }
      });
    }

    input.getFormValues = function() {
      const value = String(input.value || '').trim();
      return value ? [value] : [];
    };

    input.setFormValues = function(values) {
      input.value = Array.isArray(values) && values.length ? String(values[0]) : '';
    };

    return input;
  }

  function createBetweenControl(inputType, initialValues, inputSpec) {
    const wrapper = document.createElement('div');
    wrapper.className = 'form-mode-between';

    const startInput = createTextControl(inputType, [initialValues[0] || ''], { placeholder: inputSpec.placeholder || 'From' });
    const endInput = createTextControl(inputType, [initialValues[1] || ''], { placeholder: 'To' });
    startInput.classList.add('form-mode-between-input');
    endInput.classList.add('form-mode-between-input');

    const separator = document.createElement('span');
    separator.className = 'form-mode-between-separator';
    separator.textContent = 'to';

    wrapper.appendChild(startInput);
    wrapper.appendChild(separator);
    wrapper.appendChild(endInput);

    wrapper.getFormValues = function() {
      const startValues = typeof startInput.getFormValues === 'function' ? startInput.getFormValues() : [];
      const endValues = typeof endInput.getFormValues === 'function' ? endInput.getFormValues() : [];
      return [String(startValues[0] || '').trim(), String(endValues[0] || '').trim()];
    };

    wrapper.setFormValues = function(values) {
      const nextValues = Array.isArray(values) ? values : [];
      if (typeof startInput.setFormValues === 'function') {
        startInput.setFormValues([nextValues[0] || '']);
      }
      if (typeof endInput.setFormValues === 'function') {
        endInput.setFormValues([nextValues[1] || '']);
      }
    };

    return wrapper;
  }

  function createSelectorControl(values, fieldDef, inputSpec, initialValues) {
    const isBooleanField = Boolean(fieldDef && fieldDef.type === 'boolean');
    const isMultiSelect = Boolean(inputSpec.multiple || (fieldDef && fieldDef.multiSelect));
    const shouldGroupValues = Boolean(fieldDef && fieldDef.groupValues);
    const hasDashes = values.some(value => {
      const label = typeof value === 'object' ? (value.Name || value.RawValue) : value;
      return String(label).includes('-');
    });

    if (isBooleanField && values.length === 2 && typeof window.createBooleanPillSelector === 'function') {
      const selector = window.createBooleanPillSelector(values, initialValues[0] || '');
      selector.getFormValues = function() {
        return typeof selector.getSelectedValues === 'function' ? selector.getSelectedValues() : [];
      };
      return selector;
    }

    if (typeof window.createGroupedSelector === 'function') {
      const selector = window.createGroupedSelector(values, isMultiSelect, initialValues, {
        enableGrouping: shouldGroupValues && hasDashes
      });
      selector.getFormValues = function() {
        return typeof selector.getSelectedValues === 'function' ? selector.getSelectedValues() : [];
      };
      return createPopupListControl(
        selector,
        inputSpec.label || (fieldDef && fieldDef.name) || 'Select values',
        inputSpec.placeholder || (isMultiSelect ? 'Click to select values\u2026' : 'Click to select a value\u2026')
      );
    }

    return createTextControl('text', initialValues, inputSpec);
  }

  function createPopupListControl(innerControl, label, placeholder) {
    const resolvedLabel = label || 'Select values';
    const resolvedPlaceholder = placeholder || 'Click to select\u2026';

    const wrapper = document.createElement('div');
    wrapper.className = 'form-mode-popup-list-control';

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'form-mode-popup-list-trigger';
    trigger.setAttribute('aria-haspopup', 'dialog');
    trigger.setAttribute('aria-expanded', 'false');

    const summarySpan = document.createElement('span');
    summarySpan.className = 'form-mode-popup-list-summary';
    trigger.appendChild(summarySpan);
    trigger.insertAdjacentHTML('beforeend',
      '<svg class="form-mode-popup-chevron" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">' +
      '<path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>' +
      '</svg>'
    );

    const backdrop = document.createElement('div');
    backdrop.className = 'form-mode-popup-list-backdrop';
    backdrop.hidden = true;

    const popup = document.createElement('div');
    popup.className = 'form-mode-popup-list-popup';
    popup.setAttribute('role', 'dialog');
    popup.setAttribute('aria-label', resolvedLabel);
    popup.hidden = true;

    const popupHeader = document.createElement('div');
    popupHeader.className = 'form-mode-popup-list-popup-header';

    const popupTitle = document.createElement('span');
    popupTitle.className = 'form-mode-popup-list-popup-title';
    popupTitle.textContent = resolvedLabel;

    const doneBtn = document.createElement('button');
    doneBtn.type = 'button';
    doneBtn.className = 'form-mode-popup-list-done';
    doneBtn.textContent = 'Done';

    popupHeader.appendChild(popupTitle);
    popupHeader.appendChild(doneBtn);

    const popupBody = document.createElement('div');
    popupBody.className = 'form-mode-popup-list-popup-body';
    popupBody.appendChild(innerControl);

    popup.appendChild(popupHeader);
    popup.appendChild(popupBody);
  document.body.appendChild(backdrop);
    document.body.appendChild(popup);

    wrapper.appendChild(trigger);

    function getDisplayValues() {
      if (typeof innerControl.getSelectedDisplayValues === 'function') {
        return innerControl.getSelectedDisplayValues();
      }
      return typeof innerControl.getFormValues === 'function' ? innerControl.getFormValues() : [];
    }

    function updateSummary() {
      const displayValues = getDisplayValues();
      const escFn = window.escapeHtml || function(s) {
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      };
      if (!displayValues || displayValues.length === 0) {
        summarySpan.textContent = resolvedPlaceholder;
        summarySpan.classList.add('is-placeholder');
      } else if (displayValues.length <= 2) {
        summarySpan.textContent = displayValues.join(', ');
        summarySpan.classList.remove('is-placeholder');
      } else {
        summarySpan.innerHTML = escFn(displayValues[0]) + ' <span class="form-mode-popup-more">and ' + (displayValues.length - 1) + ' more</span>';
        summarySpan.classList.remove('is-placeholder');
      }
      trigger.setAttribute('aria-expanded', popup.hidden ? 'false' : 'true');
    }

    function openPopup() {
      backdrop.hidden = false;
      popup.hidden = false;
      trigger.setAttribute('aria-expanded', 'true');
      if (typeof innerControl.focusInput === 'function') {
        innerControl.focusInput();
      } else {
        const firstInput = innerControl.querySelector('input:not([type="file"]), textarea');
        if (firstInput) firstInput.focus();
      }
    }

    function closePopup() {
      backdrop.hidden = true;
      popup.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
      updateSummary();
      wrapper.dispatchEvent(new Event('change', { bubbles: true }));
    }

    trigger.addEventListener('click', function() {
      if (popup.hidden) openPopup();
      else closePopup();
    });

    doneBtn.addEventListener('click', closePopup);
    backdrop.addEventListener('click', closePopup);

    const onDocKey = function(e) {
      if (e.key === 'Escape' && !popup.hidden) {
        closePopup();
        trigger.focus();
      }
    };
    document.addEventListener('keydown', onDocKey);

    wrapper._popupEl = popup;
    wrapper._cleanupPopup = function() {
      backdrop.remove();
      popup.remove();
      document.removeEventListener('keydown', onDocKey);
    };

    wrapper.getFormValues = function() {
      return typeof innerControl.getFormValues === 'function' ? innerControl.getFormValues() : [];
    };

    wrapper.setFormValues = function(values) {
      if (typeof innerControl.setSelectedValues === 'function') {
        innerControl.setSelectedValues(values);
      } else if (typeof innerControl.setFormValues === 'function') {
        innerControl.setFormValues(values);
      }
      updateSummary();
    };

    updateSummary();
    return wrapper;
  }

  function createControl(fieldDef, inputSpec, initialValues, operatorOverride) {
    const activeOperator = operatorOverride || inputSpec.operator;
    const { values } = parseFieldOptions(fieldDef, inputSpec);

    if (activeOperator === 'between') {
      return createBetweenControl(getFieldInputType(fieldDef, inputSpec), initialValues, inputSpec);
    }

    if (values && values.length > 0) {
      return createSelectorControl(values, fieldDef, inputSpec, initialValues);
    }

    if ((inputSpec.multiple || (fieldDef && fieldDef.allowValueList)) && typeof window.createListPasteInput === 'function') {
      const listInput = window.createListPasteInput(initialValues, {
        placeholder: inputSpec.placeholder || 'Paste one value per line',
        hint: inputSpec.help || 'Paste values, separate them with commas or new lines, or upload a file.'
      });
      listInput.getFormValues = function() {
        return typeof listInput.getSelectedValues === 'function' ? listInput.getSelectedValues() : [];
      };
      return createPopupListControl(
        listInput,
        inputSpec.label || (fieldDef && fieldDef.name) || 'Enter values',
        inputSpec.placeholder || 'Click to enter values\u2026'
      );
    }

    return createTextControl(getFieldInputType(fieldDef, inputSpec), initialValues, inputSpec);
  }

  function getControlValues(inputSpec) {
    const control = state.controls.get(inputSpec.key);
    if (!control || typeof control.getFormValues !== 'function') {
      return [];
    }

    const values = control.getFormValues();
    if (!Array.isArray(values)) return [];
    return values.map(value => String(value || '').trim());
  }

  function collectBindings() {
    const bindings = {};

    state.spec.inputs.forEach(inputSpec => {
      const values = getControlValues(inputSpec);
      if (inputSpec.operator === 'between' && inputSpec.keys.length >= 2) {
        inputSpec.keys.slice(0, 2).forEach((key, index) => {
          bindings[key] = values[index] || '';
        });
      }

      bindings[inputSpec.key] = inputSpec.multiple ? values.filter(Boolean) : (values[0] || '');
    });

    return bindings;
  }

  function setTableName(bindings) {
    const tableNameInput = window.DOM && window.DOM.tableNameInput;
    if (!tableNameInput) return;

    const queryNameOverride = state.searchParams.get('tableName');
    const nextName = queryNameOverride || interpolateValue(state.spec.queryName || state.spec.title, bindings);
    const currentValue = tableNameInput.value.trim();
    const shouldUpdate = !currentValue || currentValue === state.lastSuggestedTableName;

    state.lastSuggestedTableName = nextName;

    if (!shouldUpdate) {
      return;
    }

    tableNameInput.value = nextName;
    tableNameInput.classList.remove('error');
    tableNameInput.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function clearActiveFilters() {
    Object.keys(window.activeFilters || {}).forEach(key => delete window.activeFilters[key]);
  }

  function ensureColumnsRegistered(columns) {
    if (typeof window.registerDynamicField !== 'function') return;
    columns.forEach(column => window.registerDynamicField(column));
  }

  function appendFilter(fieldName, operator, values) {
    const normalizedValues = Array.isArray(values)
      ? values.map(value => String(value || '').trim()).filter(Boolean)
      : [];
    if (!fieldName || normalizedValues.length === 0) {
      return;
    }

    if (!window.activeFilters[fieldName]) {
      window.activeFilters[fieldName] = { filters: [] };
    }

    window.activeFilters[fieldName].filters.push({
      cond: operator,
      val: operator === 'between' ? normalizedValues.slice(0, 2).join('|') : normalizedValues.join(',')
    });
  }

  function resolveLockedFilterValues(filterSpec, bindings) {
    const rawValues = Array.isArray(filterSpec.values)
      ? filterSpec.values
      : (filterSpec.value === undefined || filterSpec.value === null ? [] : [filterSpec.value]);

    const resolved = rawValues.map(value => interpolateValue(value, bindings)).filter(Boolean);
    if (filterSpec.operator === 'between') {
      return resolved.slice(0, 2);
    }
    return resolved;
  }

  function updateHeaderCopy(bindings) {
    if (!state.formCard) return;
    const titleEl = state.formCard.querySelector('[data-form-mode-title]');
    const descriptionEl = state.formCard.querySelector('[data-form-mode-description]');
    if (titleEl) {
      titleEl.textContent = interpolateValue(state.spec.title, bindings) || 'Query Form';
    }
    if (descriptionEl) {
      const resolved = interpolateValue(state.spec.description, bindings);
      descriptionEl.textContent = resolved;
      descriptionEl.classList.toggle('hidden', !resolved);
    }
  }

  function applyFormState() {
    if (!state.active || !state.spec) return;

    const bindings = collectBindings();
    updateHeaderCopy(bindings);
    setTableName(bindings);

    const columns = state.spec.columns.slice();
    ensureColumnsRegistered(columns);

    window.displayedFields.length = 0;
    window.displayedFields.push(...columns);

    clearActiveFilters();

    state.spec.lockedFilters.forEach(filterSpec => {
      appendFilter(filterSpec.field, filterSpec.operator, resolveLockedFilterValues(filterSpec, bindings));
    });

    state.spec.inputs.forEach(inputSpec => {
      const values = getControlValues(inputSpec);
      if (inputSpec.operator === 'between') {
        const betweenValues = values.slice(0, 2).map(value => String(value || '').trim());
        if (betweenValues.every(Boolean)) {
          appendFilter(inputSpec.field, 'between', betweenValues);
        }
        return;
      }

      const activeValues = inputSpec.multiple ? values.filter(Boolean) : values.slice(0, 1).filter(Boolean);
      if (activeValues.length > 0) {
        appendFilter(inputSpec.field, inputSpec.operator, activeValues);
      }
    });

    if (typeof window.showExampleTable === 'function') {
      window.showExampleTable(window.displayedFields).catch(console.error);
    }

    if (typeof window.updateQueryJson === 'function') {
      window.updateQueryJson();
    }
    if (window.FilterSidePanel) {
      if (state.viewMode === 'form' && typeof window.FilterSidePanel.close === 'function') {
        window.FilterSidePanel.close();
      } else if (typeof window.FilterSidePanel.update === 'function') {
        window.FilterSidePanel.update();
      }
    }
    if (window.updateCategoryCounts) {
      window.updateCategoryCounts();
    }
    if (window.BubbleSystem && typeof window.BubbleSystem.safeRenderBubbles === 'function') {
      window.BubbleSystem.safeRenderBubbles();
    }
  }

  function getValidationError() {
    if (!state.active || !state.spec) return '';

    const missingLabels = [];
    state.spec.inputs.forEach(inputSpec => {
      if (!inputSpec.required) return;

      const values = getControlValues(inputSpec);
      const isMissing = inputSpec.operator === 'between'
        ? values.slice(0, 2).some(value => !String(value || '').trim())
        : values.filter(Boolean).length === 0;

      const control = state.controls.get(inputSpec.key);
      if (control) {
        control.classList.toggle('form-mode-control-invalid', isMissing);
      }

      if (isMissing) {
        missingLabels.push(inputSpec.label);
      }
    });

    if (missingLabels.length === 0) return '';
    return `Fill required form fields: ${missingLabels.join(', ')}`;
  }

  function syncValidationUi() {
    const error = getValidationError();
    if (state.validationEl) {
      state.validationEl.textContent = error;
      state.validationEl.classList.toggle('hidden', !error);
    }

    if (state.runBtn) {
      state.runBtn.disabled = Boolean(error) || Boolean(window.DOM && window.DOM.runBtn && window.DOM.runBtn.disabled);
    }

    return error;
  }

  function buildCurrentShareUrl() {
    const nextUrl = new URL(window.location.href);
    nextUrl.search = '';
    nextUrl.searchParams.set('form', encodeSpec(state.spec));
    if (state.viewMode === 'bubbles') {
      nextUrl.searchParams.set('mode', 'bubbles');
    }

    state.spec.inputs.forEach(inputSpec => {
      const values = getControlValues(inputSpec).filter(Boolean);
      if (inputSpec.operator === 'between' && inputSpec.keys.length >= 2) {
        inputSpec.keys.slice(0, 2).forEach((key, index) => {
          if (values[index]) {
            nextUrl.searchParams.set(key, values[index]);
          }
        });
        return;
      }

      if (values.length === 0) return;
      if (inputSpec.multiple) {
        nextUrl.searchParams.set(inputSpec.key, values.join(','));
      } else {
        nextUrl.searchParams.set(inputSpec.key, values[0]);
      }
    });

    const tableName = window.DOM && window.DOM.tableNameInput ? window.DOM.tableNameInput.value.trim() : '';
    if (tableName) {
      nextUrl.searchParams.set('tableName', tableName);
    }

    return nextUrl.toString();
  }

  async function copyCurrentShareUrl() {
    const url = buildCurrentShareUrl();
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const scratch = document.createElement('textarea');
        scratch.value = url;
        scratch.setAttribute('readonly', '');
        scratch.style.position = 'fixed';
        scratch.style.opacity = '0';
        document.body.appendChild(scratch);
        scratch.select();
        document.execCommand('copy');
        scratch.remove();
      }
      if (window.showToastMessage) {
        window.showToastMessage('Form link copied.', 'success');
      }
    } catch (_) {
      if (window.showToastMessage) {
        window.showToastMessage('Failed to copy form link.', 'error');
      }
    }
  }

  function syncPresentationMode() {
    const querySearchBlock = document.getElementById('query-input') && document.getElementById('query-input').closest('.mb-6');
    const categoryBar = document.getElementById('category-bar');
    const mobileCategorySelector = document.getElementById('mobile-category-selector');
    const bubbleStage = document.getElementById('bubble-container') && document.getElementById('bubble-container').closest('.flex.items-start.justify-center');

    document.body.classList.toggle('form-mode-active', state.viewMode === 'form');

    [querySearchBlock, categoryBar, mobileCategorySelector].filter(Boolean).forEach(node => {
      node.classList.toggle('form-mode-hidden', state.viewMode === 'form');
    });

    if (bubbleStage) {
      bubbleStage.classList.toggle('form-mode-stage-active', state.viewMode === 'form');
    }

    if (state.formHost) {
      state.formHost.classList.toggle('hidden', state.viewMode !== 'form');
    }

    if (state.formCard) {
      state.formCard.classList.toggle('hidden', state.viewMode !== 'form');
    }

    if (state.modeToggleBtn) {
      state.modeToggleBtn.setAttribute('data-tooltip', state.viewMode === 'form' ? 'Switch to bubble builder' : 'Switch to form mode');
      state.modeToggleBtn.setAttribute('aria-label', state.viewMode === 'form' ? 'Switch to bubble builder' : 'Switch to form mode');
      const formIcon = state.modeToggleBtn.querySelector('[data-form-mode-icon="form"]');
      const bubbleIcon = state.modeToggleBtn.querySelector('[data-form-mode-icon="bubbles"]');
      if (formIcon) {
        formIcon.classList.toggle('hidden', state.viewMode === 'form');
      }
      if (bubbleIcon) {
        bubbleIcon.classList.toggle('hidden', state.viewMode !== 'form');
      }
    }

    if (state.mobileModeToggleBtn) {
      const label = state.mobileModeToggleBtn.querySelector('span');
      if (label) {
        label.textContent = state.viewMode === 'form' ? 'Bubble Mode' : 'Form Mode';
      }
      state.mobileModeToggleBtn.setAttribute('data-tooltip', state.viewMode === 'form' ? 'Switch to bubble builder' : 'Switch to form mode');
      state.mobileModeToggleBtn.setAttribute('aria-label', state.viewMode === 'form' ? 'Switch to bubble builder' : 'Switch to form mode');
      const formIcon = state.mobileModeToggleBtn.querySelector('[data-form-mode-icon="form"]');
      const bubbleIcon = state.mobileModeToggleBtn.querySelector('[data-form-mode-icon="bubbles"]');
      if (formIcon) {
        formIcon.classList.toggle('hidden', state.viewMode === 'form');
      }
      if (bubbleIcon) {
        bubbleIcon.classList.toggle('hidden', state.viewMode !== 'form');
      }
    }

    if (window.FilterSidePanel) {
      if (state.viewMode === 'form' && typeof window.FilterSidePanel.close === 'function') {
        window.FilterSidePanel.close();
      } else if (typeof window.FilterSidePanel.update === 'function') {
        window.FilterSidePanel.update();
      }
    }
  }

  async function setViewMode(nextMode, options = {}) {
    const requestedMode = nextMode === 'bubbles' ? 'bubbles' : 'form';
    const isEnteringFormFromBubbles = requestedMode === 'form' && state.viewMode === 'bubbles';

    if (requestedMode === 'form' && (isEnteringFormFromBubbles || !state.active || state.specSource === 'generated')) {
      const activated = await activateGeneratedFormFromCurrentQuery();
      if (!activated) {
        return;
      }
    }

    state.viewMode = requestedMode;
    syncPresentationMode();

    if (options.updateUrl !== false) {
      const nextUrl = new URL(window.location.href);
      if (state.viewMode === 'bubbles') {
        nextUrl.searchParams.set('mode', 'bubbles');
      } else {
        nextUrl.searchParams.delete('mode');
      }
      window.history.replaceState({}, '', nextUrl.toString());
    }
  }

  function toggleViewMode() {
    setViewMode(state.viewMode === 'form' ? 'bubbles' : 'form').catch(error => {
      console.error('Failed to toggle form mode:', error);
      if (window.showToastMessage) {
        window.showToastMessage('Failed to switch modes.', 'error');
      }
    });
  }

  function createFieldRow(inputSpec, fieldDef, control) {
    const row = document.createElement('div');
    row.className = 'form-mode-field';
    const shouldShowFieldMeta = String(inputSpec.field || '').trim() && String(inputSpec.label || '').trim() !== String(inputSpec.field || '').trim();

    const topRow = document.createElement('div');
    topRow.className = 'form-mode-field-top';

    const label = document.createElement('label');
    label.className = 'form-mode-label';
    label.textContent = inputSpec.label;

    if (inputSpec.required) {
      const requiredBadge = document.createElement('span');
      requiredBadge.className = 'form-mode-required';
      requiredBadge.textContent = 'Required';
      label.appendChild(requiredBadge);
    }

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'form-mode-field-remove';
    removeButton.setAttribute('aria-label', `Remove filter ${inputSpec.label}`);
    removeButton.setAttribute('title', `Remove filter ${inputSpec.label}`);
    removeButton.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true" width="16" height="16">
        <path d="M9 3h6a1 1 0 0 1 1 1v1h4v2H4V5h4V4a1 1 0 0 1 1-1Zm-3 6h12l-.8 11.2A2 2 0 0 1 15.2 22H8.8a2 2 0 0 1-1.99-1.8L6 9Z" fill="currentColor"></path>
      </svg>
    `;
    removeButton.addEventListener('click', () => {
      removeSpecInputByKey(inputSpec.key);
      rebuildFormCardFromSpec();
      if (window.showToastMessage) {
        window.showToastMessage(`Removed filter ${inputSpec.label}.`, 'info');
      }
    });

    topRow.appendChild(label);
    topRow.appendChild(removeButton);

    const metaRow = document.createElement('div');
    metaRow.className = 'form-mode-meta-row';

    const operatorValue = document.createElement('span');
    operatorValue.className = 'form-mode-operator-chip';
    operatorValue.textContent = getOperatorLabel(inputSpec.operator);

    if (shouldShowFieldMeta) {
      const meta = document.createElement('span');
      meta.className = 'form-mode-meta';
      meta.textContent = inputSpec.field;
      metaRow.appendChild(meta);
    }
    metaRow.appendChild(operatorValue);

    const controlWrap = document.createElement('div');
    controlWrap.className = 'form-mode-control';
    controlWrap.appendChild(control);

    row.appendChild(topRow);
    row.appendChild(metaRow);
    if (inputSpec.help) {
      const help = document.createElement('p');
      help.className = 'form-mode-help';
      help.textContent = inputSpec.help;
      row.appendChild(help);
    }
    row.appendChild(controlWrap);

    return row;
  }

  function scheduleApply() {
    applyFormState();
    if (typeof window.updateButtonStates === 'function') {
      window.updateButtonStates();
    }
    syncValidationUi();
  }

  function buildFormCard() {
    // Cleanup any previously body-appended popups from prior form card builds
    state.controls.forEach(function(control) {
      if (typeof control._cleanupPopup === 'function') control._cleanupPopup();
    });

    const bubbleStage = document.getElementById('bubble-container') && document.getElementById('bubble-container').closest('.flex.items-start.justify-center');
    if (!bubbleStage) return;

    let host = document.getElementById('form-mode-host');
    if (!host) {
      host = document.createElement('div');
      host.id = 'form-mode-host';
      host.className = 'form-mode-host hidden';
      bubbleStage.insertBefore(host, bubbleStage.firstChild);
    }

    state.formHost = host;
    if (!host) return;

    const card = document.createElement('section');
    card.id = 'form-mode-card';
    card.className = 'form-mode-card';
    card.innerHTML = `
      <div class="form-mode-header">
        <div>
          <span class="form-mode-kicker">URL Form Mode</span>
          <h2 class="form-mode-title" data-form-mode-title></h2>
          <p class="form-mode-description hidden" data-form-mode-description></p>
        </div>
        <div class="form-mode-actions">
          <button type="button" id="form-mode-add-field" class="form-mode-btn form-mode-btn-secondary">+ Add Field</button>
          <button type="button" id="form-mode-run" class="form-mode-btn form-mode-btn-primary">Run Form</button>
          <button type="button" id="form-mode-reset" class="form-mode-btn">Reset</button>
          <button type="button" id="form-mode-copy" class="form-mode-btn">Copy Link</button>
        </div>
      </div>
      <div class="form-mode-body">
        <div id="form-mode-fields" class="form-mode-fields"></div>
        <p id="form-mode-validation" class="form-mode-validation hidden"></p>
      </div>
    `;

    host.innerHTML = '';
    host.appendChild(card);
    state.formCard = card;
    state.validationEl = card.querySelector('#form-mode-validation');
    state.runBtn = card.querySelector('#form-mode-run');
    state.copyBtn = card.querySelector('#form-mode-copy');

    const fieldsWrap = card.querySelector('#form-mode-fields');

    state.spec.inputs.filter(inputSpec => !inputSpec.hidden).forEach(inputSpec => {
      const fieldDef = window.fieldDefs ? window.fieldDefs.get(inputSpec.field) : null;
      inputSpec.operator = normalizeOperatorForField(fieldDef, inputSpec.operator);
      const control = createControl(fieldDef, inputSpec, resolveInputInitialValues(inputSpec, state.searchParams), inputSpec.operator);
      control.addEventListener('change', scheduleApply);
      control.addEventListener('input', scheduleApply);
      control.addEventListener('click', () => window.requestAnimationFrame(scheduleApply));
      state.controls.set(inputSpec.key, control);
      fieldsWrap.appendChild(createFieldRow(inputSpec, fieldDef, control));
    });

    state.runBtn.addEventListener('click', () => {
      const error = syncValidationUi();
      if (error) {
        if (window.showToastMessage) {
          window.showToastMessage(error, 'warning');
        }
        return;
      }
      window.DOM && window.DOM.runBtn && window.DOM.runBtn.click();
    });

    card.querySelector('#form-mode-add-field').addEventListener('click', () => {
      openFieldPicker().catch(error => {
        console.error('Failed to open field picker:', error);
        if (window.showToastMessage) {
          window.showToastMessage('Failed to open the field picker.', 'error');
        }
      });
    });

    card.querySelector('#form-mode-reset').addEventListener('click', async () => {
      if (typeof window.clearCurrentQuery === 'function') {
        await window.clearCurrentQuery();
      }
    });

    state.copyBtn.addEventListener('click', () => {
      copyCurrentShareUrl();
    });
  }

  function ensureModeToggleButtons() {
    const headerControls = document.getElementById('header-controls');
    if (headerControls && !state.modeToggleBtn) {
      const button = document.createElement('button');
      button.id = 'form-mode-toggle-btn';
      button.type = 'button';
      button.className = 'p-2 rounded-full bg-white hover:bg-gray-100 text-black focus:outline-none transition-colors border border-gray-200';
      button.innerHTML = `
        <svg data-form-mode-icon="form" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5 pointer-events-none">
          <rect x="4" y="4" width="16" height="16" rx="2"></rect>
          <path d="M8 8h8"></path>
          <path d="M8 12h8"></path>
          <path d="M8 16h5"></path>
        </svg>
        <svg data-form-mode-icon="bubbles" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5 pointer-events-none hidden">
          <circle cx="12" cy="12" r="7"></circle>
          <path d="M9 17.4c.95.72 2.13 1.1 3.4 1.1 3.09 0 5.68-2.26 6.2-5.2"></path>
          <path d="M8 9.2c.62-2.02 2.49-3.5 4.7-3.5 1.17 0 2.25.42 3.08 1.12"></path>
          <circle cx="9.3" cy="8.7" r="1.15" fill="currentColor" stroke="none" opacity="0.32"></circle>
        </svg>
      `;
      button.addEventListener('click', toggleViewMode);
      headerControls.insertBefore(button, document.getElementById('toggle-json'));
      state.modeToggleBtn = button;
    }

    const mobileMenu = document.getElementById('mobile-menu-dropdown');
    if (mobileMenu && !state.mobileModeToggleBtn) {
      const item = document.createElement('div');
      item.id = 'mobile-form-mode-toggle';
      item.className = 'mobile-menu-item border-b border-gray-200 hover:bg-gray-100';
      item.innerHTML = `
        <svg data-form-mode-icon="form" class="w-5 h-5 text-teal-600" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="4" y="4" width="16" height="16" rx="2"></rect>
          <path d="M8 8h8"></path>
          <path d="M8 12h8"></path>
          <path d="M8 16h5"></path>
        </svg>
        <svg data-form-mode-icon="bubbles" class="w-5 h-5 text-teal-600 hidden" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="7"></circle>
          <path d="M9 17.4c.95.72 2.13 1.1 3.4 1.1 3.09 0 5.68-2.26 6.2-5.2"></path>
          <path d="M8 9.2c.62-2.02 2.49-3.5 4.7-3.5 1.17 0 2.25.42 3.08 1.12"></path>
          <circle cx="9.3" cy="8.7" r="1.15" fill="currentColor" stroke="none" opacity="0.32"></circle>
        </svg>
        <span></span>
      `;
      item.addEventListener('click', () => {
        toggleViewMode();
        if (window.modalManager && typeof window.modalManager.closePanel === 'function') {
          window.modalManager.closePanel('mobile-menu-dropdown');
        }
      });
      const mobileHelp = document.getElementById('mobile-toggle-help');
      if (mobileHelp && mobileHelp.parentNode) {
        mobileHelp.parentNode.insertBefore(item, mobileHelp);
      } else {
        mobileMenu.appendChild(item);
      }
      state.mobileModeToggleBtn = item;
    }

    syncPresentationMode();
  }

  function wrapUpdateButtonStates() {
    if (state.originalUpdateButtonStates || typeof window.updateButtonStates !== 'function') return;

    state.originalUpdateButtonStates = window.updateButtonStates;
    window.updateButtonStates = function() {
      state.originalUpdateButtonStates();
      if (!state.active) return;

      const error = syncValidationUi();
      if (error && window.DOM && window.DOM.runBtn) {
        window.DOM.runBtn.disabled = true;
        window.updateRunButtonIcon && window.updateRunButtonIcon(error);
      }
    };
  }

  function wrapClearCurrentQuery() {
    if (state.originalClearCurrentQuery || typeof window.clearCurrentQuery !== 'function') return;

    state.originalClearCurrentQuery = window.clearCurrentQuery;
    window.clearCurrentQuery = async function() {
      await state.originalClearCurrentQuery();
      if (!state.active) return;
      state.controls.clear();
      if (state.formCard && state.formCard.parentNode) {
        state.formCard.parentNode.removeChild(state.formCard);
      }
      buildFormCard();
      applyFormState();
      syncPresentationMode();
      if (typeof window.updateButtonStates === 'function') {
        window.updateButtonStates();
      }
    };
  }

  async function initialize() {
    const searchParams = new URLSearchParams(window.location.search);
    state.searchParams = searchParams;

    wrapUpdateButtonStates();
    wrapClearCurrentQuery();
    ensureModeToggleButtons();

    const rawFormSpec = searchParams.get('form');
    if (!rawFormSpec) return;

    let decodedSpec;
    try {
      decodedSpec = normalizeSpec(decodeSpec(rawFormSpec));
    } catch (error) {
      console.error('Failed to parse form mode spec:', error);
      if (window.showToastMessage) {
        window.showToastMessage('Invalid form URL. Opening standard builder.', 'error');
      }
      return;
    }

    if (!decodedSpec || decodedSpec.columns.length === 0) {
      if (window.showToastMessage) {
        window.showToastMessage('Form mode requires at least one output column.', 'warning');
      }
      return;
    }

    state.active = true;
    state.specSource = 'url';
    state.spec = decodedSpec;
    state.searchParams = searchParams;
    state.viewMode = searchParams.get('mode') === 'bubbles' ? 'bubbles' : 'form';

    if (typeof window.loadFieldDefinitions === 'function') {
      await window.loadFieldDefinitions();
    }

    state.controls.clear();
    buildFormCard();
    ensureModeToggleButtons();
    applyFormState();
    syncPresentationMode();
    if (typeof window.updateButtonStates === 'function') {
      window.updateButtonStates();
    }
  }

  window.QueryFormMode = {
    encodeSpec,
    decodeSpec,
    async activateFromCurrentQuery() {
      return activateGeneratedFormFromCurrentQuery();
    },
    async syncFromCurrentQuery(options = {}) {
      return syncGeneratedFormFromCurrentQuery(options);
    },
    isActive() {
      return state.active;
    },
    getValidationError,
    buildCurrentShareUrl
  };

  window.onDOMReady(() => {
    initialize().catch(error => {
      console.error('Failed to initialize form mode:', error);
      if (window.showToastMessage) {
        window.showToastMessage('Failed to initialize form mode.', 'error');
      }
    });
  });
})();