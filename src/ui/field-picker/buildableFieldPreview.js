import { showToastMessage } from '../../core/toast.js';
import {
  getFieldBuilderInputs,
  registerDynamicField
} from '../../features/filters/fieldDefs.js';
import {
  buildDynamicFieldDefinition,
  collectBuilderInputValues,
  isOptionalBuilderInput
} from '../../features/filters/buildableFilterFields.js';
import { getFieldPerformanceWarning } from '../../features/filters/fieldWarnings.js';

function focusFirstInput(inputs) {
  window.setTimeout(() => inputs[0]?.focus(), 0);
}

export function renderBuildableFieldPreview({
  container,
  context = {},
  fieldDef,
  fieldName,
  introText = 'Enter the field details, then add the generated field to results.',
  actionLabel = 'Create and display field',
  onCreated
}) {
  const builderInputs = getFieldBuilderInputs(fieldDef);
  if (!container || !fieldDef || !builderInputs.length || typeof onCreated !== 'function') {
    return null;
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'form-mode-buildable-preview';

  const intro = document.createElement('p');
  intro.className = 'form-mode-buildable-preview-copy';
  intro.textContent = introText;
  wrapper.appendChild(intro);

  const inputEls = [];
  const error = document.createElement('p');
  error.className = 'form-mode-buildable-error hidden';

  function showBuilderError(message, inputs = []) {
    error.textContent = message;
    error.classList.remove('hidden');
    inputs.forEach(input => input.classList.add('form-mode-control-invalid'));
    inputs[0]?.focus();
  }

  builderInputs.forEach(inputSpec => {
    const inputId = inputSpec.id || inputSpec.name || inputSpec.key || '';
    const row = document.createElement('label');
    row.className = 'form-mode-buildable-input-row';

    const label = document.createElement('span');
    label.className = 'form-mode-buildable-input-label';
    label.textContent = inputSpec.label || inputId || 'Field value';

    const input = document.createElement('input');
    input.type = inputSpec.type || 'text';
    input.className = 'form-mode-text-input form-mode-buildable-input';
    input.placeholder = inputSpec.placeholder || '';
    input.autocomplete = 'off';
    input.dataset.inputId = inputId;
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

  wrapper.appendChild(error);

  const actionRow = document.createElement('div');
  actionRow.className = 'form-mode-buildable-actions';

  const addButton = document.createElement('button');
  addButton.type = 'button';
  addButton.className = 'form-mode-add-filter-btn';
  addButton.textContent = actionLabel;
  actionRow.appendChild(addButton);
  wrapper.appendChild(actionRow);

  addButton.addEventListener('click', async () => {
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

    addButton.disabled = true;
    let createdResult;
    try {
      createdResult = await onCreated(dynamicFieldName, {
        context,
        displayLabel,
        fieldDef,
        inputValues: result.values
      });
    } catch (error) {
      console.error('Failed to create dynamic field:', error);
      showBuilderError('Could not create this field. Try again after checking the field details.', inputEls);
      return;
    } finally {
      addButton.disabled = false;
    }

    if (createdResult === false) {
      return;
    }

    const successMessage = typeof createdResult?.successMessage === 'string'
      ? createdResult.successMessage
      : `${dynamicFieldName}: added results column.`;
    showToastMessage(successMessage, 'success');

    const performanceWarning = getFieldPerformanceWarning(fieldDef);
    if (performanceWarning) {
      const level = performanceWarning.level === 'info' ? 'info' : 'warning';
      showToastMessage(`${dynamicFieldName}: ${performanceWarning.message}`, level, 8500);
    }

    if (createdResult?.close !== false && typeof context.cleanup === 'function') {
      context.cleanup();
    }
  });

  container.replaceChildren(wrapper);
  focusFirstInput(inputEls);

  return {
    label: 'Field builder',
    getState() {
      return null;
    },
    cleanup() {}
  };
}
