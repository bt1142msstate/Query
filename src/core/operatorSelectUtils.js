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

const OperatorSelectUtils = Object.freeze({
  createSelect
});

export { OperatorSelectUtils, createSelect };
