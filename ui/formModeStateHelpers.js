(function initializeFormModeStateHelpers() {
  function getFieldDef(fieldName) {
    return window.fieldDefs && fieldName ? window.fieldDefs.get(fieldName) : null;
  }

  function collectBindings(spec, getCurrentInputValues, supportsMultipleValues, getInputParamKeys) {
    const bindings = {};

    spec.inputs.forEach(inputSpec => {
      const fieldDef = getFieldDef(inputSpec.field);
      const isMultiValue = supportsMultipleValues(inputSpec, fieldDef);
      const values = getCurrentInputValues(inputSpec);
      const keys = getInputParamKeys(inputSpec);

      if (inputSpec.operator === 'between' && keys.length >= 2) {
        keys.slice(0, 2).forEach((key, index) => {
          bindings[key] = values[index] || '';
        });
      }

      bindings[inputSpec.key] = isMultiValue ? values.filter(Boolean) : (values[0] || '');
    });

    return bindings;
  }

  function setTableName(state, bindings, interpolateValue) {
    const tableNameInput = window.DOM && window.DOM.tableNameInput;
    if (!tableNameInput) return;

    if (state.suppressAutoTableNameOnce) {
      state.suppressAutoTableNameOnce = false;
      state.lastSuggestedTableName = '';
      tableNameInput.value = '';
      tableNameInput.classList.remove('error');
      tableNameInput.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }

    const queryNameOverride = state.searchParams.get('tableName');
    const nextName = queryNameOverride || interpolateValue(state.spec.queryName || state.spec.title, bindings);
    const currentValue = tableNameInput.value.trim();
    const shouldForceSync = state.forceTableNameSyncOnce === true;
    const shouldUpdate = shouldForceSync || !currentValue || currentValue === state.lastSuggestedTableName;

    if (state.spec && nextName) {
      state.spec.title = nextName;
      state.spec.queryName = nextName;
    }

    state.lastSuggestedTableName = nextName;
    state.forceTableNameSyncOnce = false;

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

  function resolveLockedFilterValues(filterSpec, bindings, interpolateValue) {
    const rawValues = Array.isArray(filterSpec.values)
      ? filterSpec.values
      : (filterSpec.value === undefined || filterSpec.value === null ? [] : [filterSpec.value]);

    const resolved = rawValues.map(value => interpolateValue(value, bindings)).filter(Boolean);
    if (filterSpec.operator === 'between') {
      return resolved.slice(0, 2);
    }

    return resolved;
  }

  function updateHeaderCopy(formCard, spec, bindings, interpolateValue) {
    if (!formCard) return;

    const titleEl = formCard.querySelector('[data-form-mode-title]');
    const descriptionEl = formCard.querySelector('[data-form-mode-description]');

    if (titleEl) {
      titleEl.textContent = interpolateValue(spec.title, bindings) || 'Query Form';
    }

    if (descriptionEl) {
      const resolved = interpolateValue(spec.description, bindings);
      descriptionEl.textContent = resolved;
      descriptionEl.classList.toggle('hidden', !resolved);
    }
  }

  function buildActiveFilters(spec, bindings, getCurrentInputValues, supportsMultipleValues, interpolateValue) {
    const nextActiveFilters = {};

    spec.lockedFilters.forEach(filterSpec => {
      appendFilter(
        nextActiveFilters,
        filterSpec.field,
        filterSpec.operator,
        resolveLockedFilterValues(filterSpec, bindings, interpolateValue)
      );
    });

    spec.inputs.forEach(inputSpec => {
      const fieldDef = getFieldDef(inputSpec.field);
      const isMultiValue = supportsMultipleValues(inputSpec, fieldDef);
      const values = getCurrentInputValues(inputSpec);

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

    return nextActiveFilters;
  }

  function getValidationError(state, controls, getControlValues, getFieldInputType) {
    if (!state.active || !state.spec) return '';

    const missingLabels = [];
    const invalidDateLabels = [];

    state.spec.inputs.forEach(inputSpec => {
      const values = getControlValues(inputSpec);
      const fieldDef = getFieldDef(inputSpec.field);
      const isDateField = getFieldInputType(fieldDef, inputSpec) === 'date';
      const isMissing = inputSpec.operator === 'between'
        ? values.slice(0, 2).some(value => !String(value || '').trim())
        : values.filter(Boolean).length === 0;
      const hasInvalidDate = isDateField && values.some(value => {
        const normalized = String(value || '').trim();
        return normalized && (!window.CustomDatePicker || !window.CustomDatePicker.isValidDateValue(normalized));
      });

      const control = controls.get(inputSpec.key);
      if (control) {
        control.classList.toggle('form-mode-control-invalid', (inputSpec.required && isMissing) || hasInvalidDate);
      }

      if (inputSpec.required && isMissing) {
        missingLabels.push(inputSpec.label);
        return;
      }

      if (hasInvalidDate) {
        invalidDateLabels.push(inputSpec.label);
      }
    });

    if (missingLabels.length > 0) {
      return `Fill required form fields: ${missingLabels.join(', ')}`;
    }

    if (invalidDateLabels.length > 0) {
      return `Use M/D/YYYY for: ${invalidDateLabels.join(', ')}`;
    }

    return '';
  }

  window.FormModeStateHelpers = Object.freeze({
    collectBindings,
    setTableName,
    ensureColumnsRegistered,
    buildActiveFilters,
    updateHeaderCopy,
    getValidationError
  });
})();
