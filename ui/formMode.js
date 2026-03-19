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
    unsubscribeQueryState: null,
    lastSuggestedTableName: '',
    hiddenNodes: []
  };
  const { getDisplayedFields, getActiveFilters } = window.QueryStateReaders;

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
    const columns = getDisplayedFields().slice();
    if (columns.length === 0) {
      return null;
    }

    const tableNameInput = window.DOM && window.DOM.tableNameInput;
    const title = tableNameInput && tableNameInput.value.trim()
      ? tableNameInput.value.trim()
      : 'Query Form';
    const seenKeys = new Set();
    const inputs = [];

    Object.entries(getActiveFilters()).forEach(([fieldName, fieldState]) => {
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
          label: hasMultipleFilters ? `${fieldName} (${window.OperatorLabels.get(operator)})` : fieldName,
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
    if (window.SharedFieldPicker && typeof window.SharedFieldPicker.getFieldOptions === 'function') {
      return window.SharedFieldPicker.getFieldOptions();
    }

    const source = Array.isArray(window.fieldDefsArray) && window.fieldDefsArray.length > 0
      ? window.fieldDefsArray
      : Array.from((window.fieldDefs && window.fieldDefs.values()) || []);

    return source
      .filter(fieldDef => fieldDef && fieldDef.name)
      .map(fieldDef => ({
        name: String(fieldDef.name),
        type: String(fieldDef.type || 'text'),
        desc: typeof fieldDef.desc === 'string'
          ? fieldDef.desc
          : '',
        description: typeof fieldDef.description === 'string'
          ? fieldDef.description
          : '',
        category: Array.isArray(fieldDef.category)
          ? fieldDef.category.filter(Boolean).join(', ')
          : String(fieldDef.category || '')
      }))
      .sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' }));
  }

  function syncSpecColumnsWithDisplayedFields(options = {}) {
    if (!state.active || !state.spec) return false;

    const nextColumns = getDisplayedFields().slice();
    const currentColumns = Array.isArray(state.spec.columns) ? state.spec.columns : [];
    const columnsChanged = currentColumns.length !== nextColumns.length
      || currentColumns.some((column, index) => column !== nextColumns[index]);

    if (!columnsChanged) return false;

    state.spec.columns = nextColumns;

    if (options.refreshUrl !== false) {
      window.history.replaceState({}, '', buildCurrentShareUrl());
    }

    return true;
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

  function clearFormControlDefaults() {
    if (!state.spec || !Array.isArray(state.spec.inputs)) {
      return;
    }

    state.spec.inputs.forEach(inputSpec => {
      if (inputSpec.operator === 'between') {
        inputSpec.defaultValue = ['', ''];
        return;
      }

      inputSpec.defaultValue = inputSpec.multiple ? [] : '';
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

  function supportsMultipleValues(inputSpec, fieldDef = null) {
    if (!inputSpec || inputSpec.operator === 'between') {
      return false;
    }

    const resolvedFieldDef = fieldDef || (window.fieldDefs && inputSpec.field ? window.fieldDefs.get(inputSpec.field) : null);
    return Boolean(
      inputSpec.multiple
      || (resolvedFieldDef && resolvedFieldDef.multiSelect)
      || (resolvedFieldDef && resolvedFieldDef.allowValueList)
    );
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
      multiple: operator !== 'between' && Boolean(fieldDef && (fieldDef.allowValueList || fieldDef.multiSelect)),
      hidden: false,
      type: fieldDef && fieldDef.type ? String(fieldDef.type) : '',
      defaultValue: operator === 'between' ? ['', ''] : '',
      options: null
    };
  }

  async function openFieldPicker() {
    if (!window.SharedFieldPicker || typeof window.SharedFieldPicker.open !== 'function') {
      throw new Error('SharedFieldPicker is not available.');
    }

    await window.SharedFieldPicker.open({
      beforeOpen: async () => {
        if (typeof window.loadFieldDefinitions === 'function') {
          await window.loadFieldDefinitions();
        }
        syncSpecColumnsWithDisplayedFields({ refreshUrl: false });
      },
      getOptions: getFieldPickerOptions,
      labels: {
        kicker: 'Add Field',
        title: 'Choose a field for this form',
        description: 'Select a field, then decide whether it should show in results, appear as a filter control, or both.',
        displayChoice: 'Display in results',
        filterChoice: 'Add filter control',
        displayBadge: 'Displayed',
        filterBadge: 'Filter',
        selectedFieldLabel: 'Selected field',
        footerNote: 'Changes apply automatically.'
      },
      getFieldState: fieldName => ({
        display: hasSpecColumn(fieldName),
        filter: hasSpecFilterInput(fieldName)
      }),
      onDisplayChange: async (fieldName, nextChecked) => {
        if (!state.spec) return;

        if (nextChecked) {
          if (!hasSpecColumn(fieldName)) {
            state.spec.columns.push(fieldName);
            rebuildFormCardFromSpec();
            if (window.showToastMessage) {
              window.showToastMessage(`${fieldName}: added results column.`, 'success');
            }
          }
          return;
        }

        if (hasSpecColumn(fieldName)) {
          removeSpecColumns(fieldName);
          rebuildFormCardFromSpec();
          if (window.showToastMessage) {
            window.showToastMessage(`${fieldName}: removed results column.`, 'success');
          }
        }
      },
      onFilterChange: async (fieldName, nextChecked) => {
        if (!state.spec) return;

        if (nextChecked) {
          if (!hasSpecFilterInput(fieldName)) {
            state.spec.inputs.push(createGeneratedInputSpec(fieldName));
            rebuildFormCardFromSpec();
            if (window.showToastMessage) {
              window.showToastMessage(`${fieldName}: added filter control.`, 'success');
            }
          }
          return;
        }

        if (hasSpecFilterInput(fieldName)) {
          removeSpecFilterInputs(fieldName);
          rebuildFormCardFromSpec();
          if (window.showToastMessage) {
            window.showToastMessage(`${fieldName}: removed filter control.`, 'success');
          }
        }
      }
    });
  }

  function getRawParamValues(searchParams, key) {
    if (!key) return [];
    return searchParams.getAll(key).map(value => String(value || '').trim()).filter(Boolean);
  }

  function resolveInputInitialValues(inputSpec, searchParams) {
    const fieldDef = window.fieldDefs && inputSpec && inputSpec.field ? window.fieldDefs.get(inputSpec.field) : null;
    const isMultiValue = supportsMultipleValues(inputSpec, fieldDef);
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
      return isMultiValue ? rawValues.flatMap(splitListValues) : [rawValues[0]];
    }

    if (inputSpec.defaultValue === undefined || inputSpec.defaultValue === null) {
      return [];
    }

    return isMultiValue ? splitListValues(inputSpec.defaultValue) : [String(inputSpec.defaultValue)];
  }

  function createTextControl(inputType, initialValues, inputSpec) {
    if (inputType === 'money') {
      const wrapper = document.createElement('div');
      wrapper.className = 'form-mode-money-input-wrap';

      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'form-mode-text-input form-mode-money-input';
      input.placeholder = inputSpec.placeholder || '0.00';
      input.value = window.MoneyUtils.formatInputValue(initialValues[0] || '');
      input.autocomplete = 'off';
      input.inputMode = 'decimal';
      window.MoneyUtils.configureInputBehavior(input, true);

      wrapper.appendChild(input);

      wrapper.getFormValues = function() {
        const value = window.MoneyUtils.sanitizeInputValue(input.value);
        return value ? [value] : [];
      };

      wrapper.setFormValues = function(values) {
        const rawValue = Array.isArray(values) && values.length ? String(values[0]) : '';
        input.value = window.MoneyUtils.formatInputValue(rawValue);
        window.MoneyUtils.configureInputBehavior(input, true);
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
    const isMultiSelect = supportsMultipleValues(inputSpec, fieldDef);
    const shouldGroupValues = Boolean(fieldDef && fieldDef.groupValues);
    const hasDashes = values.some(value => {
      const label = typeof value === 'object' ? (value.Name || value.RawValue) : value;
      return String(label).includes('-');
    });

    if (isBooleanField && values.length === 2 && typeof window.createBooleanPillSelector === 'function') {
      const selector = window.createBooleanPillSelector(values, initialValues[0] || '', {
        containerId: null
      });
      selector.getFormValues = function() {
        return typeof selector.getSelectedValues === 'function' ? selector.getSelectedValues() : [];
      };
      return selector;
    }

    if (typeof window.createGroupedSelector === 'function') {
      const selector = window.createGroupedSelector(values, isMultiSelect, initialValues, {
        enableGrouping: shouldGroupValues && hasDashes,
        containerId: null
      });
      return createPopupListControl(
        selector,
        inputSpec.label || (fieldDef && fieldDef.name) || 'Select values',
        inputSpec.placeholder || (isMultiSelect ? 'Click to select values\u2026' : 'Click to select a value\u2026')
      );
    }

    return createTextControl('text', initialValues, inputSpec);
  }

  function createPopupListControl(innerControl, label, placeholder) {
    if (typeof window.createPopupListControl === 'function') {
      return window.createPopupListControl(innerControl, label, placeholder);
    }

    return innerControl;
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

    if (supportsMultipleValues(inputSpec, fieldDef) && typeof window.createListPasteInput === 'function') {
      const listInput = window.createListPasteInput(initialValues, {
        containerId: null,
        placeholder: inputSpec.placeholder || 'Paste one value per line',
        hint: inputSpec.help || 'Paste values, separate them with commas or new lines, or upload a file.'
      });
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
      const fieldDef = window.fieldDefs && inputSpec.field ? window.fieldDefs.get(inputSpec.field) : null;
      const isMultiValue = supportsMultipleValues(inputSpec, fieldDef);
      const values = getControlValues(inputSpec);
      if (inputSpec.operator === 'between' && inputSpec.keys.length >= 2) {
        inputSpec.keys.slice(0, 2).forEach((key, index) => {
          bindings[key] = values[index] || '';
        });
      }

      bindings[inputSpec.key] = isMultiValue ? values.filter(Boolean) : (values[0] || '');
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

  function ensureColumnsRegistered(columns) {
    if (typeof window.registerDynamicField !== 'function') return;
    columns.forEach(column => window.registerDynamicField(column));
  }

  function appendFilter(targetFilters, fieldName, operator, values) {
    const normalizedValues = Array.isArray(values)
      ? values.map(value => String(value || '').trim()).filter(Boolean)
      : [];
    if (!fieldName || normalizedValues.length === 0) {
      return;
    }

    if (!targetFilters[fieldName]) {
      targetFilters[fieldName] = { filters: [] };
    }

    targetFilters[fieldName].filters.push({
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

    const nextActiveFilters = {};

    state.spec.lockedFilters.forEach(filterSpec => {
      appendFilter(nextActiveFilters, filterSpec.field, filterSpec.operator, resolveLockedFilterValues(filterSpec, bindings));
    });

    state.spec.inputs.forEach(inputSpec => {
      const fieldDef = window.fieldDefs && inputSpec.field ? window.fieldDefs.get(inputSpec.field) : null;
      const isMultiValue = supportsMultipleValues(inputSpec, fieldDef);
      const values = getControlValues(inputSpec);
      if (inputSpec.operator === 'between') {
        const betweenValues = values.slice(0, 2).map(value => String(value || '').trim());
        if (betweenValues.every(Boolean)) {
          appendFilter(nextActiveFilters, inputSpec.field, 'between', betweenValues);
        }
        return;
      }

      const activeValues = isMultiValue ? values.filter(Boolean) : values.slice(0, 1).filter(Boolean);
      if (activeValues.length > 0) {
        appendFilter(nextActiveFilters, inputSpec.field, inputSpec.operator, activeValues);
      }
    });

    window.QueryChangeManager.setQueryState({
      displayedFields: columns,
      activeFilters: nextActiveFilters
    }, { source: 'QueryFormMode.applyFormState' });

    if (typeof window.showExampleTable === 'function') {
      window.showExampleTable(getDisplayedFields(), { syncQueryState: false }).catch(console.error);
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
      const fieldDef = window.fieldDefs && inputSpec.field ? window.fieldDefs.get(inputSpec.field) : null;
      const isMultiValue = supportsMultipleValues(inputSpec, fieldDef);
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
      if (isMultiValue) {
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
    await window.ClipboardUtils.copy(url, {
      successMessage: 'Form link copied.',
      errorMessage: 'Failed to copy form link.'
    });
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

    if (window.FilterSidePanel && typeof window.FilterSidePanel.update === 'function') {
      window.FilterSidePanel.update();
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
      <svg viewBox="0 0 16 16" aria-hidden="true" width="16" height="16">
        <path fill="currentColor" d="M9.32 15.653a.812.812 0 0 1-.086-.855c.176-.342.245-.733.2-1.118a2.106 2.106 0 0 0-.267-.779 2.027 2.027 0 0 0-.541-.606 3.96 3.96 0 0 1-1.481-2.282c-1.708 2.239-1.053 3.51-.235 4.63a.748.748 0 0 1-.014.901.87.87 0 0 1-.394.283.838.838 0 0 1-.478.023c-1.105-.27-2.145-.784-2.85-1.603a4.686 4.686 0 0 1-.906-1.555 4.811 4.811 0 0 1-.263-1.797s-.133-2.463 2.837-4.876c0 0 3.51-2.978 2.292-5.18a.621.621 0 0 1 .112-.653.558.558 0 0 1 .623-.147l.146.058a7.63 7.63 0 0 1 2.96 3.5c.58 1.413.576 3.06.184 4.527.325-.292.596-.641.801-1.033l.029-.064c.198-.477.821-.325 1.055-.013.086.137 2.292 3.343 1.107 6.048a5.516 5.516 0 0 1-1.84 2.027 6.127 6.127 0 0 1-2.138.893.834.834 0 0 1-.472-.038.867.867 0 0 1-.381-.29zM7.554 7.892a.422.422 0 0 1 .55.146c.04.059.066.126.075.198l.045.349c.02.511.014 1.045.213 1.536.206.504.526.95.932 1.298a3.06 3.06 0 0 1 1.16 1.422c.22.564.25 1.19.084 1.773a4.123 4.123 0 0 0 1.39-.757l.103-.084c.336-.277.613-.623.813-1.017.201-.393.322-.825.354-1.269.065-1.025-.284-2.054-.827-2.972-.248.36-.59.639-.985.804-.247.105-.509.17-.776.19a.792.792 0 0 1-.439-.1.832.832 0 0 1-.321-.328.825.825 0 0 1-.035-.729c.412-.972.54-2.05.365-3.097a5.874 5.874 0 0 0-1.642-3.16c-.156 2.205-2.417 4.258-2.881 4.7a3.537 3.537 0 0 1-.224.194c-2.426 1.965-2.26 3.755-2.26 3.834a3.678 3.678 0 0 0 .459 2.043c.365.645.89 1.177 1.52 1.54C4.5 12.808 4.5 10.89 7.183 8.14l.372-.25z"></path>
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

    const availableOperators = getAvailableOperators(fieldDef, inputSpec);
    let operatorEl;

    if (!availableOperators || availableOperators.length <= 1) {
      operatorEl = document.createElement('span');
      operatorEl.className = 'form-mode-operator-chip';
      operatorEl.textContent = window.OperatorLabels.get(inputSpec.operator);
    } else {
      operatorEl = window.OperatorSelectUtils.createSelect(availableOperators, {
        selected: inputSpec.operator,
        className: 'form-mode-operator-chip form-mode-operator-select',
        ariaLabel: `Select operator for ${inputSpec.label}`,
        onChange: e => {
          captureCurrentControlDefaults();
          inputSpec.operator = e.target.value;
          rebuildFormCardFromSpec();
        }
      });
      operatorEl.style.appearance = 'none';
      operatorEl.style.cursor = 'pointer';
    }

    if (shouldShowFieldMeta) {
      const meta = document.createElement('span');
      meta.className = 'form-mode-meta';
      meta.textContent = inputSpec.field;
      metaRow.appendChild(meta);
    }
    metaRow.appendChild(operatorEl);

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
      state.searchParams = new URLSearchParams();
      clearFormControlDefaults();
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

    if (!state.unsubscribeQueryState) {
      state.unsubscribeQueryState = window.QueryStateSubscriptions.subscribe(event => {
        syncSpecColumnsWithDisplayedFields();
      }, {
        displayedFields: true,
        predicate: () => state.active
      });
    }

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