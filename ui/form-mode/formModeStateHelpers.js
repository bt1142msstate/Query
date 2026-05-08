import { isValidDateValue } from '../../core/dateValues.js';
import { fieldDefs, registerDynamicField } from '../../filters/fieldDefs.js';
import { DOM } from '../../core/domCache.js';
  function getFieldDef(fieldName) {
    return fieldDefs && fieldName ? fieldDefs.get(fieldName) : null;
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

      bindings[inputSpec.key] = isMultiValue ? values.filter(value => value !== '') : (values[0] ?? '');
    });

    return bindings;
  }

  function setTableName(state, bindings, interpolateValue) {
    const tableNameInput = DOM && DOM.tableNameInput;
    if (!tableNameInput) return;

    if (state.suppressAutoTableNameOnce) {
      state.suppressAutoTableNameOnce = false;
      state.lastSuggestedTableName = '';
      tableNameInput.value = '';
      tableNameInput.classList.remove('error');
      tableNameInput.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }

    const hasQueryNameOverride = state.searchParams.has('tableName');
    const queryNameOverride = hasQueryNameOverride ? state.searchParams.get('tableName') : null;
    const resolvedName = interpolateValue(state.spec.queryName || state.spec.title || '', bindings).trim();
    const nextName = hasQueryNameOverride ? String(queryNameOverride || '').trim() : resolvedName;
    const currentValue = tableNameInput.value.trim();
    const shouldForceSync = state.forceTableNameSyncOnce === true;
    const shouldUpdate = shouldForceSync || !currentValue || currentValue === state.lastSuggestedTableName;

    if (state.spec) {
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
    if (typeof registerDynamicField !== 'function') return;
    columns.forEach(column => registerDynamicField(column));
  }

  function appendFilter(targetFilters, fieldName, operator, values) {
    const normalizedValues = Array.isArray(values)
      ? values.map(value => String(value ?? '').trim()).filter(value => value !== '')
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

    const resolved = rawValues.map(value => interpolateValue(value, bindings)).filter(value => value !== '');
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
      titleEl.textContent = interpolateValue(spec.title || '', bindings).trim() || 'No name';
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
        const betweenValues = values.slice(0, 2).map(value => String(value ?? '').trim());
        if (betweenValues.every(Boolean)) {
          appendFilter(nextActiveFilters, inputSpec.field, 'between', betweenValues);
        }
        return;
      }

      const activeValues = isMultiValue
        ? values.filter(value => value !== '')
        : values.slice(0, 1).filter(value => value !== '');
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
        ? values.slice(0, 2).some(value => !String(value ?? '').trim())
        : values.filter(value => value !== '').length === 0;
      const hasInvalidDate = isDateField && values.some(value => {
        const normalized = String(value ?? '').trim();
        return normalized && !isValidDateValue(normalized);
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

const FormModeStateHelpers = Object.freeze({
  collectBindings,
  setTableName,
  ensureColumnsRegistered,
  buildActiveFilters,
  updateHeaderCopy,
  getValidationError
});

export {
  FormModeStateHelpers,
  buildActiveFilters,
  collectBindings,
  ensureColumnsRegistered,
  getValidationError,
  setTableName,
  updateHeaderCopy
};
