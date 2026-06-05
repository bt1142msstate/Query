import { conditionAllowsNeverDateValue, configureConditionInputsForType } from './filterInputConfiguration.js';

function setConditionInputVisible(input, visible, customDatePicker = null) {
  if (!input) return;

  if (customDatePicker && typeof customDatePicker.setInputVisibility === 'function') {
    customDatePicker.setInputVisibility(input, visible);
    return;
  }

  input.style.display = visible ? '' : 'none';
}

function isConditionInputVisible(input, customDatePicker = null) {
  if (!input) return false;

  if (customDatePicker && typeof customDatePicker.isInputVisible === 'function') {
    return customDatePicker.isInputVisible(input);
  }

  return input.style.display !== 'none';
}

function getComparableDateValue(value, customDatePicker = null) {
  if (customDatePicker && typeof customDatePicker.getComparableValue === 'function') {
    return customDatePicker.getComparableValue(value);
  }

  return NaN;
}

function syncDatePickerNeverAvailability(inputs, cond) {
  (Array.isArray(inputs) ? inputs : [])
    .filter(Boolean)
    .forEach(input => {
      if (input._customDatePickerApi) {
        input._customDatePickerApi.allowNever = conditionAllowsNeverDateValue(cond);
      }
    });
}

function configureFilterInputsForType(options) {
  const {
    type,
    inputs,
    currentFieldName,
    selectedCondition,
    customDatePicker,
    moneyUtils,
    valueFormatting
  } = options;

  configureConditionInputsForType({
    type,
    inputs: Array.isArray(inputs) ? inputs.filter(Boolean) : [],
    currentFieldName,
    selectedCondition,
    customDatePicker,
    moneyUtils,
    valueFormatting
  });
}

export {
  configureFilterInputsForType,
  getComparableDateValue,
  isConditionInputVisible,
  setConditionInputVisible,
  syncDatePickerNeverAvailability
};
