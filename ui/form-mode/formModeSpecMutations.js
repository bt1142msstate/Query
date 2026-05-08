function normalizeFieldName(fieldName, normalizeBaseFieldName) {
  const normalizedName = typeof normalizeBaseFieldName === 'function'
    ? normalizeBaseFieldName(fieldName)
    : fieldName;
  return String(normalizedName || '');
}

function hasSpecColumn(spec, fieldName, normalizeBaseFieldName) {
  if (!spec || !Array.isArray(spec.columns)) return false;
  const baseFieldName = normalizeFieldName(fieldName, normalizeBaseFieldName);

  return spec.columns.some(column => {
    const baseColumnName = normalizeFieldName(column, normalizeBaseFieldName);
    return baseColumnName === baseFieldName;
  });
}

function hasSpecFilterInput(spec, fieldName, normalizeBaseFieldName) {
  if (!spec || !Array.isArray(spec.inputs)) return false;
  const baseFieldName = normalizeFieldName(fieldName, normalizeBaseFieldName);

  return spec.inputs.some(inputSpec => {
    const baseInputField = normalizeFieldName(inputSpec?.field, normalizeBaseFieldName);
    return baseInputField === baseFieldName;
  });
}

function removeSpecFilterInputs(spec, fieldName, normalizeBaseFieldName) {
  if (!spec || !Array.isArray(spec.inputs)) return false;

  const baseFieldName = normalizeFieldName(fieldName, normalizeBaseFieldName);
  const previousLength = spec.inputs.length;
  spec.inputs = spec.inputs.filter(inputSpec => {
    const baseInputField = normalizeFieldName(inputSpec?.field, normalizeBaseFieldName);
    return baseInputField !== baseFieldName;
  });

  return spec.inputs.length !== previousLength;
}

function removeSpecInputByKey(spec, inputKey) {
  if (!spec || !Array.isArray(spec.inputs) || !inputKey) return false;

  const previousLength = spec.inputs.length;
  spec.inputs = spec.inputs.filter(inputSpec => inputSpec?.key !== inputKey);
  return spec.inputs.length !== previousLength;
}

function clearFormSpecControlDefaults(spec) {
  if (!spec || !Array.isArray(spec.inputs)) {
    return false;
  }

  spec.inputs.forEach(inputSpec => {
    if (inputSpec.operator === 'between') {
      inputSpec.defaultValue = ['', ''];
      return;
    }

    inputSpec.defaultValue = inputSpec.multiple ? [] : '';
  });

  return true;
}

function resetFormSpecToEmptyQuery(spec) {
  if (!spec) {
    return false;
  }

  spec.title = '';
  spec.queryName = '';
  spec.inputs = [];
  spec.columns = [];
  spec.lockedFilters = [];
  return true;
}

export {
  clearFormSpecControlDefaults,
  hasSpecColumn,
  hasSpecFilterInput,
  removeSpecFilterInputs,
  removeSpecInputByKey,
  resetFormSpecToEmptyQuery
};
