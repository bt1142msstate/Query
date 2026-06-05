import { QueryChangeManager, QueryStateReaders } from '../../core/queryState.js';
import { showToastMessage } from '../../core/toast.js';
import {
  fieldDefs,
  getFieldBuilderInputs,
  isFieldBackendFilterable,
  isFieldBuildable,
  loadFieldDefinitions,
  registerDynamicField
} from '../../features/filters/fieldDefs.js';
import {
  buildDynamicFieldDefinition,
  collectBuilderInputValues,
  isOptionalBuilderInput
} from '../../features/filters/buildableFilterFields.js';
import { SharedFieldPicker } from '../field-picker/fieldPicker.js';
import { FormModeControls as formModeControls } from './formModeControls.js';
import {
  assignInputSpecDefaultValues,
  getInputSpecDefaultValues,
  normalizeOperatorForField,
  syncInputSpecFromState
} from './formModeQuerySpec.js';

const {
  createControl: createFormControl,
  createFieldRow: createFormFieldRow
} = formModeControls;

export async function openFormModeFieldPicker({
  state,
  hasSpecColumn,
  hasSpecFilterInput,
  createGeneratedInputSpec,
  getCurrentInputValues,
  syncSpecColumnsWithDisplayedFields,
  refreshBrowserUrl,
  captureCurrentControlDefaults,
  rebuildFormCardFromSpec,
  removeSpecInputByKey,
  removeSpecFilterInputs,
  syncMountedControlFromInputSpec,
  applyFormState,
  syncValidationUi,
  updateButtonStates
}) {
  await SharedFieldPicker.open({
    beforeOpen: async () => {
      if (typeof loadFieldDefinitions === 'function') {
        await loadFieldDefinitions();
      }
      syncSpecColumnsWithDisplayedFields({ refreshUrl: false });
    },
    getOptions: () => SharedFieldPicker.getFieldOptions(),
    labels: {
      kicker: 'Add Field',
      title: 'Choose a field for this form',
      description: 'Select a field to add it to results, then optionally set a filter right away.',
      displayChoice: 'Display in results',
      displayBadge: 'Displayed',
      filterBadge: 'Filter',
      selectedFieldLabel: 'Selected field',
      footerNote: 'Filters are added automatically once the preview has a value.'
    },
    autoDisplayOnSelect: true,
    showDisplayChoice: false,
    autoAddFilterFromPreview: true,
    getFieldState: fieldName => ({
      display: hasSpecColumn(fieldName),
      filter: hasSpecFilterInput(fieldName)
    }),
    renderFilterPreview: (container, fieldName, context = {}) => renderFilterPreview({
      container,
      fieldName,
      context,
      state,
      createGeneratedInputSpec,
      getCurrentInputValues,
      removeSpecInputByKey,
      rebuildFormCardFromSpec,
      captureCurrentControlDefaults,
      applyFormState,
      refreshBrowserUrl,
      syncValidationUi,
      updateButtonStates
    }),
    onDisplayChange: async (fieldName, nextChecked) => {
      handleDisplayChange({
        state,
        fieldName,
        nextChecked,
        syncSpecColumnsWithDisplayedFields,
        refreshBrowserUrl
      });
    },
    onFilterChange: async (fieldName, nextChecked, options = {}) => {
      handleFilterChange({
        state,
        fieldName,
        nextChecked,
        options,
        hasSpecFilterInput,
  createGeneratedInputSpec,
  captureCurrentControlDefaults,
        rebuildFormCardFromSpec,
        removeSpecFilterInputs
      });
    },
    onFilterPreviewChange: async (fieldName, previewState, options = {}) => {
      handleFilterPreviewChange({
        state,
        fieldName,
        previewState,
        options,
        createGeneratedInputSpec,
        captureCurrentControlDefaults,
        rebuildFormCardFromSpec,
        syncMountedControlFromInputSpec,
        applyFormState,
        syncValidationUi,
        updateButtonStates
      });
    }
  });
}

function renderFilterPreview({
  container,
  fieldName,
  context,
  state,
  createGeneratedInputSpec,
  getCurrentInputValues,
  applyFormState,
  refreshBrowserUrl,
  syncValidationUi,
  updateButtonStates
}) {
  if (!container || !state.spec || !fieldDefs) {
    return null;
  }

  const fieldDef = fieldDefs.get(fieldName);
  if (isFieldBuildable(fieldDef)) {
    return renderBuildableFieldPreview({
      container,
      context,
      fieldDef,
      fieldName,
      state,
      applyFormState,
      refreshBrowserUrl,
      syncValidationUi,
      updateButtonStates
    });
  }

  if (!fieldDef || (typeof isFieldBackendFilterable === 'function' && !isFieldBackendFilterable(fieldDef))) {
    return null;
  }

  const existingInputSpec = Array.isArray(state.spec.inputs)
    ? state.spec.inputs.find(inputSpec => inputSpec && inputSpec.field === fieldName)
    : null;
  const draftPreviewState = context.previewState && context.previewState.fieldName === fieldName
    ? context.previewState
    : null;
  const previewInputSpec = existingInputSpec
    ? JSON.parse(JSON.stringify(existingInputSpec))
    : createGeneratedInputSpec(fieldName);

  if (!previewInputSpec) {
    return null;
  }

  previewInputSpec.operator = normalizeOperatorForField(
    fieldDef,
    (draftPreviewState && draftPreviewState.operator) || previewInputSpec.operator || 'equals'
  );
  assignInputSpecDefaultValues(
    previewInputSpec,
    draftPreviewState
      ? draftPreviewState.values
      : (existingInputSpec ? getCurrentInputValues(existingInputSpec) : getInputSpecDefaultValues(previewInputSpec)),
    fieldDef
  );

  let control = null;
  let previewRow = null;
  function getPreviewState() {
    const values = control && typeof control.getFormValues === 'function'
      ? control.getFormValues()
      : getInputSpecDefaultValues(previewInputSpec);
    return {
      fieldName,
      operator: previewInputSpec.operator,
      values: Array.isArray(values) ? values.map(value => String(value ?? '').trim()) : []
    };
  }

  function renderPreviewControl() {
    control = createFormControl(
      fieldDef,
      previewInputSpec,
      getInputSpecDefaultValues(previewInputSpec),
      previewInputSpec.operator,
      normalizeOperatorForField
    );
    previewRow = createFormFieldRow({
      inputSpec: previewInputSpec,
      fieldDef,
      control,
      normalizeOperatorForField,
      removeSpecInputByKey: () => {},
      rebuildFormCardFromSpec: () => {},
      captureCurrentControlDefaults: () => {},
      showRemoveButton: false,
      onOperatorChange: nextOperator => {
        const previousValues = getPreviewState().values;
        previewInputSpec.operator = normalizeOperatorForField(fieldDef, nextOperator);
        assignInputSpecDefaultValues(previewInputSpec, previousValues, fieldDef);
        renderPreviewControl();
      }
    });
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

function renderBuildableFieldPreview({
  container,
  context,
  fieldDef,
  fieldName,
  state,
  applyFormState,
  refreshBrowserUrl,
  syncValidationUi,
  updateButtonStates
}) {
  const builderInputs = getFieldBuilderInputs(fieldDef);
  if (!container || !state?.spec || !builderInputs.length) {
    return null;
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'form-mode-buildable-preview';

  const intro = document.createElement('p');
  intro.className = 'form-mode-buildable-preview-copy';
  intro.textContent = 'Enter the field details, then add the generated field to results.';
  wrapper.appendChild(intro);

  const inputEls = [];
  builderInputs.forEach(inputSpec => {
    const row = document.createElement('label');
    row.className = 'form-mode-buildable-input-row';

    const label = document.createElement('span');
    label.className = 'form-mode-buildable-input-label';
    label.textContent = inputSpec.label || inputSpec.id || 'Field value';

    const input = document.createElement('input');
    input.type = inputSpec.type || 'text';
    input.className = 'form-mode-text-input form-mode-buildable-input';
    input.placeholder = inputSpec.placeholder || '';
    input.autocomplete = 'off';
    input.dataset.inputId = inputSpec.id || '';
    input.dataset.errorMsg = inputSpec.error_msg || inputSpec.errorMessage || 'Invalid field value';
    input.dataset.optional = isOptionalBuilderInput(inputSpec) ? 'true' : 'false';
    input.required = input.dataset.optional !== 'true';
    if (inputSpec.pattern) {
      input.pattern = inputSpec.pattern;
    }

    input.addEventListener('input', () => {
      input.classList.remove('form-mode-control-invalid');
      error.classList.add('hidden');
      error.textContent = '';
    });

    row.appendChild(label);
    row.appendChild(input);
    wrapper.appendChild(row);
    inputEls.push(input);
  });

  const error = document.createElement('p');
  error.className = 'form-mode-buildable-error hidden';
  wrapper.appendChild(error);

  const actionRow = document.createElement('div');
  actionRow.className = 'form-mode-buildable-actions';

  const addButton = document.createElement('button');
  addButton.type = 'button';
  addButton.className = 'form-mode-add-filter-btn';
  addButton.textContent = 'Create and display field';
  actionRow.appendChild(addButton);
  wrapper.appendChild(actionRow);

  function showBuilderError(message, inputs = []) {
    error.textContent = message;
    error.classList.remove('hidden');
    inputs.forEach(input => input.classList.add('form-mode-control-invalid'));
    inputs[0]?.focus();
  }

  addButton.addEventListener('click', () => {
    inputEls.forEach(input => input.classList.remove('form-mode-control-invalid'));
    error.classList.add('hidden');
    error.textContent = '';

    const result = collectBuilderInputValues(inputEls, { showFilterError: showBuilderError });
    if (!result.ok) {
      return;
    }

    const { dynamicFieldName, displayLabel } = buildDynamicFieldDefinition(fieldDef, result.values);
    if (!dynamicFieldName || dynamicFieldName === fieldName) {
      showBuilderError('Enter enough information to create a real field.', inputEls);
      return;
    }

    registerDynamicField(dynamicFieldName, { label: displayLabel });

    if (!Array.isArray(state.spec.columns)) {
      state.spec.columns = [];
    }
    if (!state.spec.columns.includes(dynamicFieldName)) {
      state.spec.columns.push(dynamicFieldName);
    }

    applyFormState({ source: 'QueryFormMode.fieldPicker.addDynamicDisplayField' });
    refreshBrowserUrl();
    syncValidationUi();
    updateButtonStates();
    showToastMessage(`${dynamicFieldName}: added results column.`, 'success');

    if (typeof context.cleanup === 'function') {
      context.cleanup();
    }
  });

  container.replaceChildren(wrapper);
  window.setTimeout(() => inputEls[0]?.focus(), 0);

  return {
    getState() {
      return null;
    },
    cleanup() {}
  };
}

function handleDisplayChange({
  state,
  fieldName,
  nextChecked,
  syncSpecColumnsWithDisplayedFields,
  refreshBrowserUrl
}) {
  if (!state.spec) return;

  if (nextChecked) {
    if (!QueryStateReaders.hasDisplayedField(fieldName)) {
      QueryChangeManager.addDisplayedField(fieldName, {
        source: 'QueryFormMode.fieldPicker.addDisplayedField'
      });
      syncSpecColumnsWithDisplayedFields({ refreshUrl: false });
      refreshBrowserUrl();
      showToastMessage(`${fieldName}: added results column.`, 'success');
    }
    return;
  }

  if (QueryStateReaders.hasDisplayedField(fieldName)) {
    QueryChangeManager.hideField(fieldName, {
      source: 'QueryFormMode.fieldPicker.removeDisplayedField'
    });
    syncSpecColumnsWithDisplayedFields({ refreshUrl: false });
    refreshBrowserUrl();
    showToastMessage(`${fieldName}: removed results column.`, 'success');
  }
}

function handleFilterChange({
  state,
  fieldName,
  nextChecked,
  options,
  hasSpecFilterInput,
  createGeneratedInputSpec,
  captureCurrentControlDefaults,
  rebuildFormCardFromSpec,
  removeSpecFilterInputs
}) {
  if (!state.spec) return;

  if (nextChecked) {
    if (!hasSpecFilterInput(fieldName)) {
      captureCurrentControlDefaults();
      const inputSpec = createGeneratedInputSpec(fieldName);
      if (!inputSpec) {
        showToastMessage(`${fieldName}: backend filtering is not available for this field.`, 'warning');
        return;
      }

      const previewState = typeof options.getFilterPreviewState === 'function'
        ? options.getFilterPreviewState()
        : null;
      const fieldDef = fieldDefs ? fieldDefs.get(fieldName) : null;
      if (previewState && previewState.fieldName === fieldName) {
        syncInputSpecFromState(inputSpec, previewState, fieldDef);
      }

      state.spec.inputs.push(inputSpec);
      rebuildFormCardFromSpec({
        preserveCurrentDefaults: false,
        querySource: 'QueryFormMode.fieldPicker.addFilterInput'
      });
      showToastMessage(`${fieldName}: added filter control.`, 'success');
    }
    return;
  }

  if (hasSpecFilterInput(fieldName)) {
    removeSpecFilterInputs(fieldName);
    rebuildFormCardFromSpec({ querySource: 'QueryFormMode.fieldPicker.removeFilterInput' });
    showToastMessage(`${fieldName}: removed filter control.`, 'success');
  }
}

function handleFilterPreviewChange({
  state,
  fieldName,
  previewState,
  options,
  createGeneratedInputSpec,
  captureCurrentControlDefaults,
  rebuildFormCardFromSpec,
  syncMountedControlFromInputSpec,
  applyFormState,
  syncValidationUi,
  updateButtonStates
}) {
  if (!state.spec || !previewState) {
    return;
  }

  let targetInputSpec = state.spec.inputs.find(inputSpec => inputSpec && inputSpec.field === fieldName);
  const fieldDef = fieldDefs ? fieldDefs.get(fieldName) : null;

  if (!targetInputSpec) {
    captureCurrentControlDefaults();
    targetInputSpec = createGeneratedInputSpec(fieldName);
    if (!targetInputSpec) {
      return;
    }
    const previousOperator = targetInputSpec.operator;
    syncInputSpecFromState(targetInputSpec, previewState, fieldDef);
    state.spec.inputs.push(targetInputSpec);

    if (options.isNewFilter) {
      rebuildFormCardFromSpec({
        preserveCurrentDefaults: false,
        querySource: 'QueryFormMode.fieldPicker.addFilterInput'
      });
      syncMountedControlFromInputSpec(targetInputSpec, {
        previousOperator,
        querySource: 'QueryFormMode.fieldPicker.addFilterInput'
      });
      applyFormState({ source: 'QueryFormMode.fieldPicker.previewUpdate' });
      syncValidationUi();
      updateButtonStates();
      return;
    }
  }

  const previousOperator = targetInputSpec.operator;
  syncInputSpecFromState(targetInputSpec, previewState, fieldDef);
  syncMountedControlFromInputSpec(targetInputSpec, {
    previousOperator,
    querySource: 'QueryFormMode.fieldPicker.previewUpdate'
  });
  applyFormState({ source: 'QueryFormMode.fieldPicker.previewUpdate' });
  syncValidationUi();
  updateButtonStates();
}
