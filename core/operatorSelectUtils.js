import { OperatorLabels } from './formatting/operatorLabels.js';

function createSelect(operators, options = {}) {
  const {
    selected = '',
    className = '',
    id = '',
    ariaLabel = 'Select operator',
    onChange = null
  } = options;

  const select = document.createElement('select');
  if (id) {
    select.id = id;
  }
  if (className) {
    select.className = className;
  }
  if (ariaLabel) {
    select.setAttribute('aria-label', ariaLabel);
  }

  (Array.isArray(operators) ? operators : []).forEach(operator => {
    const option = document.createElement('option');
    option.value = operator;
    option.textContent = OperatorLabels.get(operator);
    if (operator === selected) {
      option.selected = true;
    }
    select.appendChild(option);
  });

  if (typeof onChange === 'function') {
    select.addEventListener('change', event => {
      onChange(event, select);
    });
  }

  return select;
}

function createLabeledPicker(operators, options = {}) {
  const {
    label = 'Condition',
    wrapperClassName = 'condition-operator-picker',
    labelClassName = 'condition-operator-label',
    ...selectOptions
  } = options;

  const wrapper = document.createElement('label');
  if (wrapperClassName) {
    wrapper.className = wrapperClassName;
  }

  const labelEl = document.createElement('span');
  if (labelClassName) {
    labelEl.className = labelClassName;
  }
  labelEl.textContent = label;

  wrapper.appendChild(labelEl);
  wrapper.appendChild(createSelect(operators, selectOptions));
  return wrapper;
}

const OperatorSelectUtils = Object.freeze({
  createLabeledPicker,
  createSelect
});

export { OperatorSelectUtils, createLabeledPicker, createSelect };
