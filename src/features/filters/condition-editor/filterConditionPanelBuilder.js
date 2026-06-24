function parseBubbleListValues(rawValues) {
  if (!rawValues) {
    return { hasValuePairs: false, listValues: null };
  }

  try {
    const parsedValues = JSON.parse(rawValues);
    if (!Array.isArray(parsedValues) || parsedValues.length === 0) {
      return { hasValuePairs: false, listValues: null };
    }

    const hasValuePairs = typeof parsedValues[0] === 'object'
      && parsedValues[0]?.Name
      && parsedValues[0]?.RawValue;
    const listValues = parsedValues.slice().sort((left, right) => {
      const leftValue = hasValuePairs ? left.Name : left.toString();
      const rightValue = hasValuePairs ? right.Name : right.toString();
      return leftValue.localeCompare(rightValue, undefined, { numeric: true, sensitivity: 'base' });
    });
    return { hasValuePairs, listValues };
  } catch (error) {
    console.error('Error parsing values:', error);
    return { hasValuePairs: false, listValues: null };
  }
}

function getPerBubbleOperators(bubble) {
  if (!bubble?.dataset?.filters) {
    return [];
  }

  try {
    const parsedFilters = JSON.parse(bubble.dataset.filters);
    return Array.isArray(parsedFilters)
      ? parsedFilters.map(label => String(label).split(' ')[0].toLowerCase())
      : [];
  } catch {
    return [];
  }
}

function resolveBackendOperators({ bubble, fieldDefInfo, getFieldFilterOperators }) {
  return typeof getFieldFilterOperators === 'function'
    ? getFieldFilterOperators(fieldDefInfo)
    : getPerBubbleOperators(bubble);
}

function resolveOperatorConditions(backendOperators) {
  return Array.isArray(backendOperators) ? backendOperators.slice() : [];
}

function createBuildableInputGroup({ document, input, isOptionalBuilderInput }) {
  const group = document.createElement('div');
  group.className = 'dynamic-input-group buildable-input-group';

  const label = document.createElement('label');
  const inputId = input.id || input.name || input.key || '';
  label.textContent = input.label || inputId;
  label.className = 'dynamic-label buildable-input-label';

  const inputEl = document.createElement('input');
  inputEl.type = input.type || 'text';
  if (input.pattern) inputEl.pattern = input.pattern;
  if (input.placeholder) inputEl.placeholder = input.placeholder;
  inputEl.dataset.inputId = inputId;
  inputEl.dataset.errorMsg = input.error_msg || input.errorMessage || 'Invalid input';
  inputEl.dataset.optional = isOptionalBuilderInput(input) ? 'true' : 'false';
  inputEl.required = inputEl.dataset.optional !== 'true';
  inputEl.className = 'dynamic-builder-input condition-field buildable-field-input';

  group.append(label, inputEl);
  return group;
}

function insertBuildableInputs({
  conditionInput,
  document,
  getFieldBuilderInputs,
  inputWrapper,
  isOptionalBuilderInput,
  fieldDefInfo
}) {
  const builderInputs = getFieldBuilderInputs(fieldDefInfo);
  [...builderInputs].reverse().forEach(input => {
    const group = createBuildableInputGroup({ document, input, isOptionalBuilderInput });
    inputWrapper.insertBefore(group, conditionInput.nextSibling);
  });
}

function removeConditionSelectControls(document) {
  const existingSelect = document.getElementById('condition-select');
  const existingContainer = document.getElementById('condition-select-container');
  existingSelect?.parentNode?.removeChild(existingSelect);
  existingContainer?.parentNode?.removeChild(existingContainer);
}

function hideConditionSelectControls(document) {
  const existingSelect = document.getElementById('condition-select');
  const existingContainer = document.getElementById('condition-select-container');
  if (existingSelect) existingSelect.style.display = 'none';
  existingContainer?.parentNode?.removeChild(existingContainer);
}

function resetConditionPanel({ context, document, removeConditionPanelNote }) {
  context.conditionPanel.innerHTML = '';
  removeConditionPanelNote();
  document.querySelectorAll('.dynamic-input-group').forEach(el => el.remove());
}

function getCurrentLiteralValues({
  condition,
  getFilterGroupForField,
  fieldName,
  supportsListSelectorCondition
}) {
  const selectedFieldFilters = getFilterGroupForField(fieldName);
  if (!selectedFieldFilters || !supportsListSelectorCondition(condition)) {
    return [];
  }

  const filter = selectedFieldFilters.filters.find(f => String(f.cond || '').trim().toLowerCase() === condition);
  return filter ? String(filter.val).split(',').map(value => value.trim()).filter(Boolean) : [];
}

function hasGroupedValueDashes(listValues, hasValuePairs) {
  return hasValuePairs
    ? listValues.some(value => value.Name.includes('-'))
    : listValues.some(value => value.includes('-'));
}

function getPreferredLiteralValues({
  fieldName,
  getFilterGroupForField,
  getPreferredCondition,
  operatorConditions,
  supportsListSelectorCondition
}) {
  const condition = getPreferredCondition(operatorConditions, fieldName);
  return getCurrentLiteralValues({
    condition,
    fieldName,
    getFilterGroupForField,
    supportsListSelectorCondition
  });
}

function createConditionValueSelector({
  SelectorControls,
  confirmBtn,
  currentLiteralValues,
  fieldDef,
  hasValuePairs,
  listValues
}) {
  const isMultiSelect = fieldDef && fieldDef.multiSelect;
  const shouldGroupValues = Boolean(fieldDef && fieldDef.groupValues);
  const isBooleanField = Boolean(fieldDef && fieldDef.type === 'boolean');
  const hasDashes = hasGroupedValueDashes(listValues, hasValuePairs);
  const selector = isBooleanField && listValues.length === 2
    ? SelectorControls.createBooleanPillSelector(listValues, currentLiteralValues[0] || '', {
      onChange: () => {
        confirmBtn.click();
      }
    })
    : SelectorControls.createGroupedSelector(listValues, isMultiSelect, currentLiteralValues, {
      enableGrouping: shouldGroupValues && hasDashes
    });

  return {
    hideConfirm: isBooleanField && listValues.length === 2,
    selector
  };
}

function createConditionListPasteInput({ SelectorControls, currentLiteralValues }) {
  return SelectorControls.createListPasteInput(currentLiteralValues, {
    placeholder: 'Paste one key per line',
    hint: 'Paste keys one per line, paste comma-separated keys, or upload a text/CSV file.'
  });
}

function focusBuildableInputWhenReady({ document, isMobileFilterEditorViewport }) {
  setTimeout(() => {
    if (isMobileFilterEditorViewport()) return;
    document.querySelector('.dynamic-builder-input')?.focus();
  }, 300);
}

export {
  createConditionListPasteInput,
  createConditionValueSelector,
  focusBuildableInputWhenReady,
  getCurrentLiteralValues,
  getPreferredLiteralValues,
  hasGroupedValueDashes,
  hideConditionSelectControls,
  insertBuildableInputs,
  parseBubbleListValues,
  resetConditionPanel,
  removeConditionSelectControls,
  resolveBackendOperators,
  resolveOperatorConditions
};
