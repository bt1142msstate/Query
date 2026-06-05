export function configureConditionInputsForType({
  type,
  inputs,
  currentFieldName,
  selectedCondition,
  customDatePicker,
  moneyUtils,
  valueFormatting
}) {
  const inputList = Array.isArray(inputs) ? inputs.filter(Boolean) : [];
  const isMoney = type === 'money';
  const isNumber = type === 'number';
  const numberFormat = valueFormatting?.getNumberFormat?.(currentFieldName) || '';
  const isDate = type === 'date';
  const htmlType = 'text';

  if (!isDate) {
    destroyDatePickers(inputList);
  }

  inputList.forEach(input => {
    input.type = htmlType;
  });

  if (isMoney || (isNumber && numberFormat === 'decimal')) {
    setNumericProps(inputList, true);
  } else if (isNumber) {
    setNumericProps(inputList, false);
  } else {
    clearNumericProps(inputList);
  }

  setNumericFieldAppearance(inputList, {
    moneyUtils,
    numericKind: isMoney
      ? 'money'
      : (isNumber
        ? (numberFormat === 'decimal' ? 'decimal' : (numberFormat !== 'year' ? 'integer' : 'plain'))
        : 'plain')
  });

  configureDateInputs(inputList, {
    customDatePicker,
    isDate,
    allowNever: conditionAllowsNeverDateValue(selectedCondition)
  });
}

export function conditionAllowsNeverDateValue(condition) {
  const normalized = String(condition || '').trim().toLowerCase();
  return normalized === 'equals' || normalized === 'does_not_equal' || normalized === 'never';
}

function setNumericProps(inputs, allowDecimal) {
  inputs.forEach(input => {
    input.setAttribute('inputmode', allowDecimal ? 'decimal' : 'numeric');
    input.setAttribute('step', allowDecimal ? '0.01' : '1');
    input.onkeypress = event => {
      const regex = allowDecimal ? /[0-9.]/ : /[0-9]/;
      if (!regex.test(event.key)) event.preventDefault();
    };
  });
}

function clearNumericProps(inputs) {
  inputs.forEach(input => {
    input.removeAttribute('inputmode');
    input.removeAttribute('step');
    input.onkeypress = null;
  });
}

function setNumericFieldAppearance(inputs, { numericKind, moneyUtils }) {
  inputs.forEach(input => {
    const isMoney = numericKind === 'money';
    const isInteger = numericKind === 'integer';
    const isDecimal = numericKind === 'decimal';
    input.classList.toggle('condition-field-money', isMoney);
    if (isMoney || isDecimal) {
      input.placeholder = '0.00';
    } else if (isInteger) {
      input.placeholder = '0';
    } else if (input.placeholder === '0.00' || input.placeholder === '0') {
      input.placeholder = 'Enter value...';
    }

    const mode = isMoney
      ? true
      : (isDecimal ? { kind: 'decimal' } : (isInteger ? { kind: 'integer' } : false));
    moneyUtils?.configureInputBehavior?.(input, mode);
  });
}

function configureDateInputs(inputs, { customDatePicker, isDate, allowNever }) {
  if (!customDatePicker || typeof customDatePicker.enhanceInput !== 'function') {
    return;
  }

  inputs.forEach(input => {
    if (isDate) {
      customDatePicker.enhanceInput(input, {
        variant: 'filter',
        enabled: true,
        allowNever,
        placeholder: 'M/D/YYYY'
      });
      input.dataset.errorMsg = 'Enter a date or Never';
      input.setAttribute('pattern', customDatePicker.inputPattern || '^(Never|\\d{1,2}\\/\\d{1,2}\\/\\d{4})$');
      return;
    }

    input.removeAttribute('pattern');
    if (input.dataset.errorMsg === 'Use M/D/YYYY' || input.dataset.errorMsg === 'Enter a date or Never') {
      delete input.dataset.errorMsg;
    }
  });
}

function destroyDatePickers(inputs) {
  inputs.forEach(input => {
    const datePickerApi = input._customDatePickerApi;
    if (datePickerApi && typeof datePickerApi.destroy === 'function') {
      datePickerApi.destroy();
    }
  });
}
