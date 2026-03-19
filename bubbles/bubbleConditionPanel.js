function getBubblePanelOverlayElement() {
  return window.DOM?.overlay || document.getElementById('overlay');
}

function getBubblePanelConditionPanelElement() {
  return window.DOM?.conditionPanel || document.getElementById('condition-panel');
}

function getBubblePanelInputWrapperElement() {
  return window.DOM?.inputWrapper || document.getElementById('condition-input-wrapper');
}

function getBubblePanelConditionInputElement() {
  return window.DOM?.conditionInput || document.getElementById('condition-input');
}

function getBubblePanelConfirmButtonElement() {
  return window.DOM?.confirmBtn || document.getElementById('confirm-btn');
}

function isListPasteField(fieldDef) {
  return Boolean(fieldDef && fieldDef.allowValueList && (!fieldDef.values || fieldDef.values.length === 0));
}

function createConditionOperatorPicker(conditions, handler) {
  const wrapper = document.createElement('label');
  wrapper.className = 'condition-operator-picker';

  const label = document.createElement('span');
  label.className = 'condition-operator-label';
  label.textContent = 'Condition';

  const select = document.createElement('select');
  select.id = 'condition-operator-select';
  select.className = 'condition-operator-select';
  select.setAttribute('aria-label', 'Select condition');

  conditions.forEach(condition => {
    const option = document.createElement('option');
    option.value = condition;
    option.textContent = window.OperatorLabels.get(condition);
    select.appendChild(option);
  });

  select.addEventListener('change', event => {
    if (typeof handler === 'function') {
      handler({
        currentTarget: event.currentTarget,
        stopPropagation() {},
        preventDefault() {}
      });
    }
  });

  wrapper.appendChild(label);
  wrapper.appendChild(select);
  return wrapper;
}

function getPreferredCondition(conditions, fieldName) {
  const available = Array.isArray(conditions) ? conditions.filter(Boolean) : [];
  if (!available.length) return '';

  const activeFieldFilters = window.activeFilters && fieldName
    ? window.activeFilters[fieldName]
    : null;
  const filterConds = activeFieldFilters && Array.isArray(activeFieldFilters.filters)
    ? activeFieldFilters.filters.map(filter => String(filter.cond || '').trim().toLowerCase())
    : [];

  const preferredFromActive = filterConds.find(cond => available.includes(cond));
  if (preferredFromActive) {
    return preferredFromActive;
  }

  if (available.includes('equals')) {
    return 'equals';
  }

  return available[0];
}

function buildBubbleConditionPanel(bubble) {
  const conditionPanel = getBubblePanelConditionPanelElement();
  const inputWrapper = getBubblePanelInputWrapperElement();
  const conditionInput = getBubblePanelConditionInputElement();
  const confirmBtn = getBubblePanelConfirmButtonElement();

  if (!conditionPanel || !inputWrapper || !conditionInput || !confirmBtn) {
    console.warn('buildConditionPanel skipped: missing condition panel DOM nodes');
    return;
  }

  selectedField = bubble.textContent.trim();
  const type = bubble.dataset.type || 'string';
  let listValues = null;
  let hasValuePairs = false;

  try {
    if (bubble.dataset.values) {
      const parsedValues = JSON.parse(bubble.dataset.values);
      if (parsedValues.length > 0) {
        if (typeof parsedValues[0] === 'object' && parsedValues[0].Name && parsedValues[0].RawValue) {
          hasValuePairs = true;
          listValues = parsedValues.sort((a, b) => a.Name.localeCompare(b.Name, undefined, { numeric: true, sensitivity: 'base' }));
        } else {
          listValues = parsedValues.sort((a, b) => a.toString().localeCompare(b.toString(), undefined, { numeric: true, sensitivity: 'base' }));
        }
      }
    }
  } catch (e) {
    console.error('Error parsing values:', e);
  }

  const perBubble = bubble.dataset.filters ? JSON.parse(bubble.dataset.filters) : null;
  const fieldDefInfo = window.fieldDefs ? window.fieldDefs.get(selectedField) : null;
  const isBuildable = fieldDefInfo && fieldDefInfo.is_buildable;
  let operatorConditions = [];
  conditionPanel.innerHTML = '';

  const oldMarcInput = document.getElementById('marc-field-input');
  if (oldMarcInput && oldMarcInput.parentNode) oldMarcInput.parentNode.remove();
  document.querySelectorAll('.dynamic-input-group').forEach(el => el.remove());

  if (isBuildable) {
    if (fieldDefInfo.builder_inputs) {
      [...fieldDefInfo.builder_inputs].reverse().forEach(input => {
        const group = document.createElement('div');
        group.className = 'dynamic-input-group marc-input-group';

        const label = document.createElement('label');
        label.textContent = input.label;
        label.className = 'dynamic-label marc-label';

        const inputEl = document.createElement('input');
        inputEl.type = input.type;
        inputEl.pattern = input.pattern;
        inputEl.placeholder = input.placeholder;
        inputEl.dataset.inputId = input.id;
        inputEl.dataset.errorMsg = input.error_msg || 'Invalid input';
        inputEl.className = 'dynamic-builder-input condition-field';
        if (input.id === 'tag') {
          inputEl.id = 'marc-field-input';
          inputEl.classList.add('marc-field-input');
        }

        group.appendChild(label);
        group.appendChild(inputEl);

        const refNode = conditionInput;
        if (refNode && inputWrapper) {
          inputWrapper.insertBefore(group, refNode.nextSibling);
        }
      });
    }

    operatorConditions = (fieldDefInfo.filters && fieldDefInfo.filters.length > 0 ? fieldDefInfo.filters : ['contains', 'starts', 'equals'])
      .map(label => String(label).split(' ')[0].toLowerCase());
    conditionPanel.appendChild(createConditionOperatorPicker(operatorConditions, window.buildableConditionBtnHandler));
  } else {
    operatorConditions = (perBubble
      ? perBubble
      : (listValues && listValues.length)
        ? ['equals']
        : (window.typeConditions[type] || window.typeConditions.string))
      .map(label => String(label).split(' ')[0].toLowerCase());
    conditionPanel.appendChild(createConditionOperatorPicker(operatorConditions, window.handleConditionBtnClick));
  }

  if (!isBuildable) {
    const toggleGroup = document.createElement('div');
    toggleGroup.className = 'inline-flex';
    ['Show', 'Hide'].forEach(label => {
      const btn = document.createElement('button');
      btn.className = 'toggle-half';
      btn.dataset.cond = label.toLowerCase();
      btn.textContent = label;
      if (label === 'Show' ? displayedFields.includes(selectedField) : !displayedFields.includes(selectedField)) {
        btn.classList.add('active');
      }
      toggleGroup.appendChild(btn);
    });
    conditionPanel.appendChild(toggleGroup);
  }

  const toggleButtons = conditionPanel.querySelectorAll('.toggle-half');
  toggleButtons.forEach(btn => btn.addEventListener('click', window.handleConditionBtnClick));
  confirmBtn.style.display = '';

  if (listValues && listValues.length) {
    const fieldDef = fieldDefs.get(selectedField);
    const isMultiSelect = fieldDef && fieldDef.multiSelect;
    const shouldGroupValues = Boolean(fieldDef && fieldDef.groupValues);
    const isBooleanField = Boolean(fieldDef && fieldDef.type === 'boolean');
    const existingSelect = document.getElementById('condition-select');
    const existingContainer = document.getElementById('condition-select-container');
    if (existingSelect) existingSelect.parentNode.removeChild(existingSelect);
    if (existingContainer) existingContainer.parentNode.removeChild(existingContainer);

    let currentLiteralValues = [];
    if (activeFilters[selectedField]) {
      const filter = activeFilters[selectedField].filters.find(f => f.cond === 'equals');
      if (filter) {
        currentLiteralValues = filter.val.split(',').map(v => v.trim());
      }
    }

    const hasDashes = hasValuePairs
      ? listValues.some(val => val.Name.includes('-'))
      : listValues.some(val => val.includes('-'));

    const selector = isBooleanField && listValues.length === 2
      ? createBooleanPillSelector(listValues, currentLiteralValues[0] || '', {
          onChange: () => {
            confirmBtn.click();
          }
        })
      : createGroupedSelector(listValues, isMultiSelect, currentLiteralValues, {
          enableGrouping: shouldGroupValues && hasDashes
        });
    inputWrapper.insertBefore(selector, confirmBtn);
    conditionInput.style.display = 'none';
    if (isBooleanField && listValues.length === 2) {
      confirmBtn.style.display = 'none';
    }
  } else {
    const existingSelect = document.getElementById('condition-select');
    const existingContainer = document.getElementById('condition-select-container');
    if (existingSelect) existingSelect.style.display = 'none';
    if (existingContainer) existingContainer.parentNode.removeChild(existingContainer);
    window.configureInputsForType(type);

    if (isListPasteField(fieldDefInfo) && typeof window.createListPasteInput === 'function') {
      let currentLiteralValues = [];
      if (activeFilters[selectedField]) {
        const filter = activeFilters[selectedField].filters.find(f => f.cond === 'equals');
        if (filter) {
          currentLiteralValues = String(filter.val).split(',').map(v => v.trim()).filter(Boolean);
        }
      }

      const listInput = window.createListPasteInput(currentLiteralValues, {
        placeholder: 'Paste one key per line',
        hint: 'Paste keys one per line, paste comma-separated keys, or upload a text/CSV file.'
      });
      inputWrapper.insertBefore(listInput, confirmBtn);
      conditionInput.style.display = 'none';
    } else {
      conditionInput.style.display = 'block';
    }
    confirmBtn.style.display = '';
  }

  renderConditionList(selectedField);

  const operatorSelect = conditionPanel.querySelector('#condition-operator-select');
  const preferredCondition = getPreferredCondition(operatorConditions, selectedField);
  if (operatorSelect && preferredCondition) {
    operatorSelect.value = preferredCondition;
    const handler = window.handleConditionBtnClick;
    if (typeof handler === 'function') {
      handler({
        currentTarget: operatorSelect,
        stopPropagation() {},
        preventDefault() {}
      });
    }
  }

  if (isBuildable) {
    setTimeout(() => {
      const firstInput = document.querySelector('.dynamic-builder-input');
      if (firstInput) firstInput.focus();
    }, 300);
  }
}

window.BubbleConditionPanel = {
  buildConditionPanel: buildBubbleConditionPanel,
  getOverlayElement: getBubblePanelOverlayElement,
  getConditionPanelElement: getBubblePanelConditionPanelElement,
  getInputWrapperElement: getBubblePanelInputWrapperElement,
  getConditionInputElement: getBubblePanelConditionInputElement,
  getConfirmButtonElement: getBubblePanelConfirmButtonElement
};