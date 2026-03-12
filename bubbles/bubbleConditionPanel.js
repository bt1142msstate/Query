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

    const standardConds = fieldDefInfo.filters && fieldDefInfo.filters.length > 0 ? fieldDefInfo.filters : ['contains', 'starts', 'equals'];
    standardConds.forEach(label => {
      const btn = document.createElement('button');
      btn.className = 'condition-btn';
      btn.dataset.cond = label.split(' ')[0];
      btn.textContent = label[0].toUpperCase() + label.slice(1);
      conditionPanel.appendChild(btn);
    });
  } else {
    const conds = perBubble
      ? perBubble
      : (listValues && listValues.length)
        ? ['equals']
        : (window.typeConditions[type] || window.typeConditions.string);

    conds.forEach(label => {
      const slug = label.split(' ')[0];
      const btnEl = document.createElement('button');
      btnEl.className = 'condition-btn';
      btnEl.dataset.cond = slug;
      btnEl.textContent = label[0].toUpperCase() + label.slice(1);
      conditionPanel.appendChild(btnEl);
    });
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

  const dynamicBtns = conditionPanel.querySelectorAll('.condition-btn, .toggle-half');
  dynamicBtns.forEach(btn => btn.addEventListener('click', isBuildable ? window.buildableConditionBtnHandler : window.handleConditionBtnClick));

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
      ? createBooleanPillSelector(listValues, currentLiteralValues[0] || '')
      : createGroupedSelector(listValues, isMultiSelect, currentLiteralValues, {
          enableGrouping: shouldGroupValues && hasDashes
        });
    inputWrapper.insertBefore(selector, confirmBtn);
    conditionInput.style.display = 'none';
  } else {
    const existingSelect = document.getElementById('condition-select');
    const existingContainer = document.getElementById('condition-select-container');
    if (existingSelect) existingSelect.style.display = 'none';
    if (existingContainer) existingContainer.style.display = 'none';
    window.configureInputsForType(type);
    conditionInput.style.display = 'block';
  }

  renderConditionList(selectedField);

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