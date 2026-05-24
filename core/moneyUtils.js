function resolveInputBehaviorOptions(modeOrIsMoney) {
  if (modeOrIsMoney && typeof modeOrIsMoney === 'object') {
    const kind = String(modeOrIsMoney.kind || 'plain').toLowerCase();
    return {
      kind,
      allowDecimal: kind === 'money' || kind === 'decimal',
      symbolized: kind === 'money'
    };
  }

  return {
    kind: modeOrIsMoney ? 'money' : 'plain',
    allowDecimal: Boolean(modeOrIsMoney),
    symbolized: Boolean(modeOrIsMoney)
  };
}

function sanitizeInputValue(rawValue, options = {}) {
  const { allowDecimal = true } = options;
  const text = String(rawValue || '');
  const isNegative = text.trim().startsWith('-');
  const numeric = text.replace(allowDecimal ? /[^0-9.]/g : /[^0-9]/g, '');
  const firstDot = numeric.indexOf('.');
  const whole = firstDot >= 0 ? numeric.slice(0, firstDot) : numeric;
  const decimals = allowDecimal && firstDot >= 0
    ? numeric.slice(firstDot + 1).replace(/\./g, '').slice(0, 2)
    : '';
  const normalizedWhole = whole.replace(/^0+(?=\d)/, '');
  const hasDot = allowDecimal && firstDot >= 0;

  if (!normalizedWhole && !decimals && !hasDot) {
    return '';
  }

  const prefix = isNegative ? '-' : '';
  return hasDot
    ? `${prefix}${normalizedWhole || '0'}.${decimals}`
    : `${prefix}${normalizedWhole || '0'}`;
}

function formatInputValue(rawValue, options = {}) {
  const { allowDecimal = true } = options;
  const text = String(rawValue || '');
  const sanitized = sanitizeInputValue(text, { allowDecimal });
  const hadDot = allowDecimal && text.includes('.');

  if (!sanitized) {
    return '';
  }

  const isNegative = sanitized.startsWith('-');
  const unsignedValue = isNegative ? sanitized.slice(1) : sanitized;
  const parts = unsignedValue.split('.');
  const whole = parts[0] || '0';
  const decimals = parts[1] || '';
  const groupedWhole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const prefix = isNegative ? '-' : '';

  return hadDot
    ? `${prefix}${groupedWhole}.${decimals}`
    : `${prefix}${groupedWhole}`;
}

function parseNumber(rawValue, options = {}) {
  if (typeof rawValue === 'number') {
    return rawValue;
  }

  const { allowDecimal = true } = options;
  const sanitized = sanitizeInputValue(rawValue, { allowDecimal });
  if (!sanitized) {
    return Number.NaN;
  }

  return Number.parseFloat(sanitized);
}

function formatDisplayValue(rawValue, options = {}) {
  const {
    currencySymbol = '$',
    minimumFractionDigits = 2,
    maximumFractionDigits = 2
  } = options;

  const numericValue = parseNumber(rawValue);
  if (Number.isNaN(numericValue)) {
    return '';
  }

  const absoluteDisplay = Math.abs(numericValue).toLocaleString('en-US', {
    minimumFractionDigits,
    maximumFractionDigits
  });
  const sign = numericValue < 0 ? '-' : '';
  return `${sign}${currencySymbol}${absoluteDisplay}`;
}

const AUTO_NUMERIC_OPTIONS = Object.freeze({
  currencySymbol: '',
  digitGroupSeparator: ',',
  digitalGroupSpacing: '3',
  decimalCharacter: '.',
  decimalCharacterAlternative: '.',
  decimalPlaces: 2,
  decimalPlacesRawValue: 2,
  allowDecimalPadding: 'floats',
  emptyInputBehavior: 'focus',
  leadingZero: 'deny',
  modifyValueOnWheel: false,
  modifyValueOnUpDownArrow: false,
  selectNumberOnly: true,
  showOnlyNumbersOnFocus: false,
  showWarnings: false,
  formatOnPageLoad: true
});

const AUTO_NUMERIC_INTEGER_OPTIONS = Object.freeze({
  currencySymbol: '',
  digitGroupSeparator: ',',
  digitalGroupSpacing: '3',
  decimalCharacter: '.',
  decimalCharacterAlternative: '.',
  decimalPlaces: 0,
  decimalPlacesRawValue: 0,
  allowDecimalPadding: false,
  emptyInputBehavior: 'focus',
  leadingZero: 'deny',
  modifyValueOnWheel: false,
  modifyValueOnUpDownArrow: false,
  selectNumberOnly: true,
  showOnlyNumbersOnFocus: false,
  showWarnings: false,
  formatOnPageLoad: true
});

function isHtmlInputElement(input) {
  return typeof HTMLInputElement !== 'undefined' && input instanceof HTMLInputElement;
}

function destroyInputBehavior(input) {
  if (!isHtmlInputElement(input)) {
    return;
  }

  if (input._moneyAutoNumeric) {
    const rawValue = sanitizeInputValue(input._moneyAutoNumeric.getNumericString(), {
      allowDecimal: input.dataset.numericAllowDecimal !== 'false'
    });
    input._moneyAutoNumeric.remove();
    delete input._moneyAutoNumeric;
    input.value = rawValue;
    if (rawValue) {
      input.dataset.moneyRaw = rawValue;
    } else {
      delete input.dataset.moneyRaw;
    }
  }

  if (input._moneyAutoNumericSync) {
    input.removeEventListener('autoNumeric:rawValueModified', input._moneyAutoNumericSync);
    delete input._moneyAutoNumericSync;
  }
}

function configureInputBehavior(input, isMoney) {
  if (!isHtmlInputElement(input)) {
    return;
  }

  const behavior = resolveInputBehaviorOptions(isMoney);
  const shouldFormat = behavior.kind === 'money' || behavior.kind === 'integer';
  input.classList.toggle('money-input-symbolized', behavior.symbolized);

  destroyInputBehavior(input);

  if (!shouldFormat) {
    delete input.dataset.moneyRaw;
    delete input.dataset.numericAllowDecimal;
    return;
  }

  input.dataset.numericAllowDecimal = behavior.allowDecimal ? 'true' : 'false';

  if (!window.AutoNumeric) {
    const rawValue = sanitizeInputValue(input.value, { allowDecimal: behavior.allowDecimal });
    input.value = formatInputValue(rawValue, { allowDecimal: behavior.allowDecimal });
    if (rawValue) {
      input.dataset.moneyRaw = rawValue;
    } else {
      delete input.dataset.moneyRaw;
    }
    return;
  }

  const initialRawValue = sanitizeInputValue(input.value, { allowDecimal: behavior.allowDecimal });
  input.type = 'text';
  input.inputMode = behavior.allowDecimal ? 'decimal' : 'numeric';
  input._moneyAutoNumeric = new window.AutoNumeric(
    input,
    initialRawValue || '',
    behavior.allowDecimal ? AUTO_NUMERIC_OPTIONS : AUTO_NUMERIC_INTEGER_OPTIONS
  );
  input._moneyAutoNumericSync = () => {
    const rawValue = sanitizeInputValue(input._moneyAutoNumeric.getNumericString(), {
      allowDecimal: behavior.allowDecimal
    });
    if (rawValue) {
      input.dataset.moneyRaw = rawValue;
    } else {
      delete input.dataset.moneyRaw;
    }
  };
  input.addEventListener('autoNumeric:rawValueModified', input._moneyAutoNumericSync);
  input._moneyAutoNumericSync();
}

const MoneyUtils = Object.freeze({
  sanitizeInputValue,
  formatInputValue,
  parseNumber,
  formatDisplayValue,
  configureInputBehavior
});

export {
  MoneyUtils,
  configureInputBehavior,
  formatDisplayValue,
  formatInputValue,
  parseNumber,
  sanitizeInputValue
};
