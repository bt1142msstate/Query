import { OperatorLabels } from '../../core/operatorLabels.js';
import { mapFieldOperatorToUiCond } from '../../filters/queryPayload.js';
import { slugify, splitListValues } from './formModeSpec.js';

function normalizeOperatorForField(fieldDef, operator) {
  const normalized = mapFieldOperatorToUiCond(operator);

  if (!fieldDef || !fieldDef.type) {
    return normalized;
  }

  if (fieldDef.type === 'date') {
    if (normalized === 'greater') return 'after';
    if (normalized === 'less') return 'before';
    if (normalized === 'greater_or_equal') return 'on_or_after';
    if (normalized === 'less_or_equal') return 'on_or_before';
  }

  return normalized;
}

function uniqueInputKey(baseKey, seenKeys) {
  const normalizedBase = slugify(baseKey) || 'field';
  let candidate = normalizedBase;
  let index = 2;
  while (seenKeys.has(candidate)) {
    candidate = `${normalizedBase}-${index}`;
    index += 1;
  }
  seenKeys.add(candidate);
  return candidate;
}

function readStoredFilterValues(filter) {
  if (!filter) return [];

  if (filter.cond === 'between') {
    return String(filter.val || '')
      .split('|')
      .map(value => value.trim())
      .filter(Boolean)
      .slice(0, 2);
  }

  return splitListValues(filter.val || '');
}

function getInputSpecDefaultValues(inputSpec) {
  if (!inputSpec) {
    return [];
  }

  if (inputSpec.operator === 'between') {
    return Array.isArray(inputSpec.defaultValue)
      ? inputSpec.defaultValue.slice(0, 2).map(value => String(value ?? ''))
      : ['', ''];
  }

  if (Array.isArray(inputSpec.defaultValue)) {
    return inputSpec.defaultValue.map(value => String(value ?? '')).filter(Boolean);
  }

  if (inputSpec.defaultValue === undefined || inputSpec.defaultValue === null) {
    return [];
  }

  return splitListValues(inputSpec.defaultValue);
}

function assignInputSpecDefaultValues(inputSpec, values, fieldDef = null) {
  if (!inputSpec) {
    return;
  }

  const normalizedValues = Array.isArray(values)
    ? values.map(value => String(value ?? '').trim())
    : [];

  if (inputSpec.operator === 'between') {
    inputSpec.defaultValue = [normalizedValues[0] || '', normalizedValues[1] || ''];
    inputSpec.multiple = false;
    return;
  }

  const shouldAllowMultiple = Boolean(
    inputSpec.multiple
    || (fieldDef && fieldDef.allowValueList)
    || (fieldDef && fieldDef.multiSelect)
    || normalizedValues.filter(Boolean).length > 1
  );

  inputSpec.multiple = shouldAllowMultiple;
  inputSpec.defaultValue = shouldAllowMultiple
    ? normalizedValues.filter(Boolean)
    : (normalizedValues[0] || '');
}

function syncInputSpecFromState(inputSpec, nextState, fieldDef = null) {
  if (!inputSpec) {
    return;
  }

  const normalizedState = nextState && typeof nextState === 'object' ? nextState : {};
  const nextOperator = normalizedState.operator || inputSpec.operator;
  inputSpec.operator = normalizeOperatorForField(fieldDef, nextOperator);
  assignInputSpecDefaultValues(inputSpec, normalizedState.values || [], fieldDef);
}

function clearInputSpecDefaultValue(inputSpec) {
  if (!inputSpec) {
    return;
  }

  if (inputSpec.operator === 'between') {
    inputSpec.defaultValue = ['', ''];
    return;
  }

  inputSpec.defaultValue = inputSpec.multiple ? [] : '';
}

function getFieldDefinition(fieldName, options = {}) {
  if (typeof options.getFieldDef === 'function') {
    return options.getFieldDef(fieldName);
  }

  if (options.fieldDefs && typeof options.fieldDefs.get === 'function') {
    return options.fieldDefs.get(fieldName);
  }

  return null;
}

function buildGeneratedInputSpecFromFilter(fieldName, filter, index, filters, seenKeys, options = {}) {
  const fieldDef = getFieldDefinition(fieldName, options);
  const operator = normalizeOperatorForField(fieldDef, String(filter && filter.cond || 'equals').trim() || 'equals');
  const values = readStoredFilterValues(filter);
  const hasMultipleFilters = filters.length > 1;
  const keyBase = `${fieldName}-${operator}${hasMultipleFilters ? `-${index + 1}` : ''}`;
  const shouldAllowMultiple = operator !== 'between' && Boolean(
    (fieldDef && fieldDef.allowValueList)
    || (fieldDef && fieldDef.multiSelect)
    || values.length > 1
  );

  return {
    key: uniqueInputKey(keyBase, seenKeys),
    field: fieldName,
    source: 'query-filter',
    label: hasMultipleFilters ? `${fieldName} (${OperatorLabels.get(operator)})` : fieldName,
    operator,
    multiple: shouldAllowMultiple,
    default: operator === 'between'
      ? values.slice(0, 2)
      : shouldAllowMultiple
        ? values
        : (values[0] || ''),
    defaultValue: operator === 'between'
      ? values.slice(0, 2)
      : shouldAllowMultiple
        ? values
        : (values[0] || ''),
    help: '',
    placeholder: '',
    required: false,
    hidden: false,
    type: fieldDef && fieldDef.type ? String(fieldDef.type) : '',
    options: null,
    keys: []
  };
}

function buildGeneratedInputSpecsFromActiveFilters(existingInputs = [], activeFiltersSnapshot = {}, options = {}) {
  const seenKeys = new Set(
    existingInputs
      .map(inputSpec => String(inputSpec && inputSpec.key || '').trim())
      .filter(Boolean)
  );
  const generatedInputs = [];

  Object.entries(activeFiltersSnapshot || {}).forEach(([fieldName, fieldState]) => {
    const filters = Array.isArray(fieldState && fieldState.filters) ? fieldState.filters : [];
    filters.forEach((filter, index) => {
      generatedInputs.push(buildGeneratedInputSpecFromFilter(fieldName, filter, index, filters, seenKeys, options));
    });
  });

  return generatedInputs;
}

function getInputSignature(inputSpec) {
  if (!inputSpec) {
    return '';
  }

  return `${String(inputSpec.field || '').trim()}::${String(inputSpec.operator || '').trim()}`;
}

export {
  assignInputSpecDefaultValues,
  buildGeneratedInputSpecFromFilter,
  buildGeneratedInputSpecsFromActiveFilters,
  clearInputSpecDefaultValue,
  getInputSignature,
  getInputSpecDefaultValues,
  normalizeOperatorForField,
  readStoredFilterValues,
  syncInputSpecFromState,
  uniqueInputKey
};
