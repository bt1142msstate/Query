import { getDateFilterValidationMessage } from '../../filters/filterConditionLogic.js';

function postFilterDateOperatorAllowsNever(cond) {
  const normalized = String(cond || '').trim().toLowerCase();
  return normalized === 'equals' || normalized === 'does_not_equal';
}

function getPostFilterDateValidationMessage({ cond, customDatePicker, field, value, value2 }) {
  const invalidPrimaryDate = value && (!customDatePicker || !customDatePicker.isValidDateValue(value));
  const invalidSecondaryDate = cond === 'between' && value2 && (!customDatePicker || !customDatePicker.isValidDateValue(value2));
  if (invalidPrimaryDate || invalidSecondaryDate) {
    return 'Enter a date or Never for post filter dates.';
  }

  return getDateFilterValidationMessage({
    cond,
    val: cond === 'between' ? `${value}|${value2}` : value
  }, field, {
    getComparableDateValue: customDatePicker?.getComparableValue
  });
}

export {
  getPostFilterDateValidationMessage,
  postFilterDateOperatorAllowsNever
};
