import { showToastMessage } from '../core/toast.js';
import { Icons } from '../core/icons.js';
import { OperatorLabels } from '../core/operatorLabels.js';
import { SelectorControls } from './selectorControls.js';

  function parseFieldOptions(fieldDef, inputSpec, normalizeOperatorForField) {
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
    if (fieldType === 'boolean') return 'boolean';
    if (fieldType === 'date') return 'date';
    if (fieldType === 'money') return 'money';
    if (fieldType === 'number') return 'number';
    return 'text';
  }

  function getAvailableOperators(fieldDef, inputSpec, normalizeOperatorForField) {
    if (fieldDef && typeof window.isFieldBackendFilterable === 'function' && !window.isFieldBackendFilterable(fieldDef)) {
      return [];
    }

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
      'does_not_equal',
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

  function getDefaultOperatorForField(fieldDef, normalizeOperatorForField) {
    const availableOperators = getAvailableOperators(fieldDef, { operator: 'equals' }, normalizeOperatorForField);
    const preferredOperators = ['equals', 'does_not_equal', 'contains', 'starts', 'greater', 'less', 'before', 'after', 'on_or_after', 'on_or_before', 'between'];
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

  function createGeneratedInputSpec(fieldName, specInputs, uniqueInputKey, normalizeOperatorForField) {
    const fieldDef = window.fieldDefs ? window.fieldDefs.get(fieldName) : null;
    if (fieldDef && typeof window.isFieldBackendFilterable === 'function' && !window.isFieldBackendFilterable(fieldDef)) {
      return null;
    }

    const operator = getDefaultOperatorForField(fieldDef, normalizeOperatorForField);
    const existingKeys = new Set((Array.isArray(specInputs) ? specInputs : []).map(inputSpec => inputSpec.key));

    return {
      key: uniqueInputKey(`${fieldName}-${operator}`, existingKeys),
      keys: [],
      field: fieldName,
      source: 'manual',
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

  function getRawParamValues(searchParams, key) {
    if (!key) return [];
    return searchParams.getAll(key).map(value => String(value || '').trim()).filter(Boolean);
  }

  function resolveInputInitialValues(inputSpec, searchParams, getInputParamKeys, splitListValues) {
    const fieldDef = window.fieldDefs && inputSpec && inputSpec.field ? window.fieldDefs.get(inputSpec.field) : null;
    const isMultiValue = supportsMultipleValues(inputSpec, fieldDef);
    const keys = getInputParamKeys(inputSpec);

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
        if (input._moneyAutoNumeric && typeof input._moneyAutoNumeric.set === 'function') {
          input._moneyAutoNumeric.set(rawValue || '');
          if (rawValue) {
            input.dataset.moneyRaw = rawValue;
          } else {
            delete input.dataset.moneyRaw;
          }
          return;
        }
        input.value = window.MoneyUtils.formatInputValue(rawValue);
        window.MoneyUtils.configureInputBehavior(input, true);
      };

      wrapper.focusInput = function() {
        input.focus();
      };

      return wrapper;
    }

    if (inputType === 'number') {
      const numberFormat = window.ValueFormatting?.getNumberFormat?.(inputSpec.field || '') || '';
      const isDecimalNumber = numberFormat === 'decimal';
      const useGroupedIntegerFormatting = !isDecimalNumber && numberFormat !== 'year';
      const allowDecimal = isDecimalNumber;
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'form-mode-text-input';
      input.placeholder = inputSpec.placeholder || (allowDecimal ? '0.00' : '0');
      input.value = useGroupedIntegerFormatting || allowDecimal
        ? window.MoneyUtils.formatInputValue(initialValues[0] || '', { allowDecimal })
        : window.MoneyUtils.sanitizeInputValue(initialValues[0] || '', { allowDecimal: false });
      input.autocomplete = 'off';
      input.inputMode = allowDecimal ? 'decimal' : 'numeric';
      window.MoneyUtils.configureInputBehavior(
        input,
        allowDecimal ? { kind: 'decimal' } : (useGroupedIntegerFormatting ? { kind: 'integer' } : false)
      );

      input.getFormValues = function() {
        const value = window.MoneyUtils.sanitizeInputValue(input.value, { allowDecimal });
        return value ? [value] : [];
      };

      input.setFormValues = function(values) {
        const rawValue = Array.isArray(values) && values.length ? String(values[0]) : '';
        if (input._moneyAutoNumeric && typeof input._moneyAutoNumeric.set === 'function') {
          input._moneyAutoNumeric.set(rawValue || '');
          if (rawValue) {
            input.dataset.moneyRaw = rawValue;
          } else {
            delete input.dataset.moneyRaw;
          }
          return;
        }
        input.value = useGroupedIntegerFormatting || allowDecimal
          ? window.MoneyUtils.formatInputValue(rawValue, { allowDecimal })
          : window.MoneyUtils.sanitizeInputValue(rawValue, { allowDecimal: false });
        window.MoneyUtils.configureInputBehavior(
          input,
          allowDecimal ? { kind: 'decimal' } : (useGroupedIntegerFormatting ? { kind: 'integer' } : false)
        );
      };

      input.focusInput = function() {
        input.focus();
      };

      return input;
    }

    if (inputType === 'date') {
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'form-mode-text-input';
      input.placeholder = inputSpec.placeholder || 'M/D/YYYY';
      input.value = (window.CustomDatePicker && typeof window.CustomDatePicker.normalizeDateValue === 'function')
        ? window.CustomDatePicker.normalizeDateValue(initialValues[0] || '')
        : (initialValues[0] || '');
      input.autocomplete = 'off';

      const api = window.CustomDatePicker && typeof window.CustomDatePicker.enhanceInput === 'function'
        ? window.CustomDatePicker.enhanceInput(input, {
            variant: 'form',
            enabled: true,
            placeholder: input.placeholder
          })
        : null;
      const control = api ? api.shell : input;

      control.getFormValues = function() {
        const value = String(input.value || '').trim();
        return value ? [value] : [];
      };

      control.setFormValues = function(values) {
        const nextValue = Array.isArray(values) && values.length ? String(values[0]) : '';
        input.value = (window.CustomDatePicker && typeof window.CustomDatePicker.normalizeDateValue === 'function')
          ? window.CustomDatePicker.normalizeDateValue(nextValue)
          : nextValue;
      };

      control.focusInput = function() {
        input.focus();
      };

      control._cleanupPopup = function() {
        if (api && typeof api.closeIfActive === 'function') {
          api.closeIfActive();
        }
      };

      return control;
    }

    const input = document.createElement('input');
    input.type = inputType;
    input.className = 'form-mode-text-input';
    input.placeholder = inputSpec.placeholder || 'Enter value';
    input.value = initialValues[0] || '';
    input.autocomplete = 'off';

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

    const startInput = createTextControl(inputType, [initialValues[0] || ''], {
      ...inputSpec,
      placeholder: inputSpec.placeholder || 'From'
    });
    const endInput = createTextControl(inputType, [initialValues[1] || ''], {
      ...inputSpec,
      placeholder: 'To'
    });
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
    const isBooleanField = getFieldInputType(fieldDef, inputSpec) === 'boolean';
    const isMultiSelect = supportsMultipleValues(inputSpec, fieldDef);
    const shouldGroupValues = Boolean(fieldDef && fieldDef.groupValues);
    const hasDashes = values.some(value => {
      const label = typeof value === 'object' ? (value.Name || value.RawValue) : value;
      return String(label).includes('-');
    });

    if (isBooleanField && values.length === 2) {
      const selector = SelectorControls.createBooleanPillSelector(values, initialValues[0] || '', {
        containerId: null
      });
      selector.getFormValues = function() {
        return typeof selector.getSelectedValues === 'function' ? selector.getSelectedValues() : [];
      };
      selector.setFormValues = function(valuesToSet) {
        if (typeof selector.setSelectedValues === 'function') {
          selector.setSelectedValues(valuesToSet);
        }
      };
      return selector;
    }

    if (SelectorControls.createGroupedSelector) {
      const selector = SelectorControls.createGroupedSelector(values, isMultiSelect, initialValues, {
        enableGrouping: shouldGroupValues && hasDashes,
        containerId: null
      });
      return createPopupListControl(
        selector,
        inputSpec.label || (fieldDef && fieldDef.name) || 'Select values',
        inputSpec.placeholder || (isMultiSelect ? 'Click to select values…' : 'Click to select a value…')
      );
    }

    return createTextControl('text', initialValues, inputSpec);
  }

  function createPopupListControl(innerControl, label, placeholder) {
    return SelectorControls.createPopupListControl(innerControl, label, placeholder);
  }

  function createControl(fieldDef, inputSpec, initialValues, operatorOverride, normalizeOperatorForField) {
    const activeOperator = operatorOverride || inputSpec.operator;
    const { values } = parseFieldOptions(fieldDef, inputSpec, normalizeOperatorForField);

    if (activeOperator === 'between') {
      return createBetweenControl(getFieldInputType(fieldDef, inputSpec), initialValues, inputSpec);
    }

    if (values && values.length > 0) {
      return createSelectorControl(values, fieldDef, inputSpec, initialValues);
    }

    if (supportsMultipleValues(inputSpec, fieldDef)) {
      const listInput = SelectorControls.createListPasteInput(initialValues, {
        containerId: null,
        placeholder: inputSpec.placeholder || 'Paste one value per line',
        hint: inputSpec.help || 'Paste values, separate them with commas or new lines, or upload a file.'
      });
      return createPopupListControl(
        listInput,
        inputSpec.label || (fieldDef && fieldDef.name) || 'Enter values',
        inputSpec.placeholder || 'Click to enter values…'
      );
    }

    return createTextControl(getFieldInputType(fieldDef, inputSpec), initialValues, inputSpec);
  }

  function createFieldRow(options) {
    const {
      inputSpec,
      fieldDef,
      control,
      normalizeOperatorForField,
      removeSpecInputByKey,
      rebuildFormCardFromSpec,
      captureCurrentControlDefaults,
      showRemoveButton = true,
      onOperatorChange = null
    } = options;

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
    removeButton.innerHTML = Icons.trashSVG(16, 16);
    if (showRemoveButton) {
      removeButton.addEventListener('click', () => {
        removeSpecInputByKey(inputSpec.key);
        rebuildFormCardFromSpec({ querySource: 'QueryFormMode.removeFilterInput' });
        showToastMessage(`Removed filter ${inputSpec.label}.`, 'info');
      });
    } else {
      removeButton.hidden = true;
      removeButton.setAttribute('aria-hidden', 'true');
      removeButton.tabIndex = -1;
    }

    topRow.appendChild(label);
    if (showRemoveButton) {
      topRow.appendChild(removeButton);
    }

    const metaRow = document.createElement('div');
    metaRow.className = 'form-mode-meta-row';

    const availableOperators = getAvailableOperators(fieldDef, inputSpec, normalizeOperatorForField);
    let operatorEl;

    if (!availableOperators || availableOperators.length <= 1) {
      operatorEl = document.createElement('span');
      operatorEl.className = 'form-mode-operator-chip';
      operatorEl.textContent = OperatorLabels.get(inputSpec.operator);
    } else {
      operatorEl = window.OperatorSelectUtils.createSelect(availableOperators, {
        selected: inputSpec.operator,
        className: 'form-mode-operator-chip form-mode-operator-select',
        ariaLabel: `Select operator for ${inputSpec.label}`,
        onChange: e => {
          if (typeof onOperatorChange === 'function') {
            onOperatorChange(e.target.value);
            return;
          }
          captureCurrentControlDefaults();
          inputSpec.operator = e.target.value;
          rebuildFormCardFromSpec({ querySource: 'QueryFormMode.changeOperator' });
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

const FormModeControls = Object.freeze({
  getFieldInputType,
  getAvailableOperators,
  supportsMultipleValues,
  createGeneratedInputSpec,
  resolveInputInitialValues,
  createControl,
  createFieldRow
});

export {
  FormModeControls,
  createControl,
  createFieldRow,
  createGeneratedInputSpec,
  getAvailableOperators,
  getFieldInputType,
  resolveInputInitialValues,
  supportsMultipleValues
};
