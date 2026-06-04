export function buildDynamicFieldDefinition(fieldDef, inputValues) {
  const builder = fieldDef && typeof fieldDef.builder === 'object' ? fieldDef.builder : null;
  let dynamicFieldName = builder?.outputFieldIdTemplate
    || builder?.fieldTemplate
    || fieldDef.field_template
    || fieldDef.name;

  Object.entries(inputValues || {}).forEach(([key, value]) => {
    dynamicFieldName = dynamicFieldName.replace(`{${key}}`, value);
  });

  return { dynamicFieldName };
}

export function collectBuilderInputValues(inputs, {
  showFilterError,
  useFirstCsvValue = false
}) {
  const inputValues = {};

  for (const input of inputs) {
    const value = String(input.value || '').trim();
    const valueToValidate = useFirstCsvValue ? value.split(',')[0].trim() : value;
    const patternStr = input.getAttribute('pattern');
    const errorMsg = input.dataset.errorMsg || 'Invalid input';
    const inputId = input.dataset.inputId;

    if (!valueToValidate || (patternStr && !new RegExp(patternStr).test(valueToValidate))) {
      showFilterError(errorMsg, [input]);
      return { ok: false, values: {} };
    }

    inputValues[inputId] = value;
  }

  return { ok: true, values: inputValues };
}

export function createBuildableFilterFieldHandlers({
  appState,
  document,
  getDisplayedFields,
  getFilterBetweenLabelElement,
  getFilterConditionInput2Element,
  getFilterConditionInputElement,
  getFilterConditionPanelElement,
  getFilterErrorLabelElement,
  getFilterInputWrapperElement,
  getFilterQueryInputElement,
  getConditionFromControl,
  getFilterGroupForField,
  isMobileFilterEditorViewport,
  queryChangeManager,
  registerDynamicField,
  services,
  setConditionInputVisible,
  showFilterError,
  syncConditionSelection,
  updateFilteredDefs,
  uiActions
}) {
  function handleBuildableFieldConfirm(fieldDef, cond, val) {
    const inputs = document.querySelectorAll('.dynamic-builder-input');
    const result = collectBuilderInputValues(inputs, { showFilterError });
    if (!result.ok) return;

    const { dynamicFieldName } = buildDynamicFieldDefinition(fieldDef, result.values);
    if (dynamicFieldName === fieldDef.name) return;

    registerDynamicField(dynamicFieldName);

    services.restoreFieldWithDuplicates(dynamicFieldName);

    if (cond && val) {
      const alreadyExists = Boolean(getFilterGroupForField(dynamicFieldName)?.filters?.some(filter => filter.cond === cond && filter.val === val));
      if (!alreadyExists) {
        queryChangeManager.upsertFilter(dynamicFieldName, { cond, val }, {
          dedupe: true,
          source: 'FilterManager.addDynamicFieldFilter'
        });
      }
    }

    const queryInput = getFilterQueryInputElement();
    if (queryInput && queryInput.value.trim()) {
      queryInput.value = '';
      updateFilteredDefs('');
    }

    setTimeout(() => {
      appState.currentCategory = 'Selected';
      document.querySelectorAll('#category-bar .category-btn').forEach(btn =>
        btn.classList.toggle('active', btn.dataset.category === 'Selected')
      );
      services.rerenderBubbles();
    }, 200);

    if (getFilterGroupForField(fieldDef.name)) {
      queryChangeManager.removeFilter(fieldDef.name, {
        removeAll: true,
        source: 'FilterManager.clearBuildableBaseFilter'
      });
    }
  }

  function buildableConditionBtnHandler(event) {
    event.stopPropagation();
    const control = event.currentTarget;
    const conditionPanel = getFilterConditionPanelElement();
    const conditionInput = getFilterConditionInputElement();
    const inputWrapper = getFilterInputWrapperElement();
    const conditionInput2 = getFilterConditionInput2Element();
    const betweenLabel = getFilterBetweenLabelElement();

    if (!conditionPanel || !conditionInput || !conditionInput2 || !betweenLabel) return;

    const cond = getConditionFromControl(control);
    if (!cond) return;

    syncConditionSelection(conditionPanel, cond);

    const validation = collectBuilderInputValues(document.querySelectorAll('.dynamic-builder-input'), {
      showFilterError: message => {
        const errorLabel = getFilterErrorLabelElement();
        if (errorLabel) {
          errorLabel.textContent = message;
          errorLabel.style.display = 'block';
          setTimeout(() => { errorLabel.style.display = 'none'; }, 3000);
        }
      },
      useFirstCsvValue: true
    });
    if (!validation.ok) return;

    if (cond === 'between') {
      setConditionInputVisible(conditionInput2, true);
      betweenLabel.style.display = 'block';
      conditionInput2.type = conditionInput.type;
      if (inputWrapper) inputWrapper.classList.add('is-between');
    } else {
      setConditionInputVisible(conditionInput2, false);
      betweenLabel.style.display = 'none';
      if (inputWrapper) inputWrapper.classList.remove('is-between');
    }

    if (inputWrapper) {
      inputWrapper.classList.add('show');
      uiActions.positionInputWrapper();
    }

    if (conditionInput && !isMobileFilterEditorViewport()) conditionInput.focus();
    uiActions.positionInputWrapper();
  }

  return {
    buildableConditionBtnHandler,
    handleBuildableFieldConfirm,
    getDisplayedFields
  };
}
