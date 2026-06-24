function preparePostFilterGroup(snapshot, field, logic) {
  if (!snapshot[field]) {
    snapshot[field] = { logic: 'all', filters: [] };
  }

  if (snapshot[field].filters.length > 0) {
    snapshot[field].logic = logic === 'any' ? 'any' : 'all';
  }

  return snapshot[field];
}

function getSelectedValuesKey(values) {
  return values.map(entry => String(entry || '')).join('\u001F');
}

function getExistingValuePickerFilterKey(filter) {
  if (!filter) {
    return '';
  }

  return Array.isArray(filter.vals) && filter.vals.length
    ? getSelectedValuesKey(filter.vals)
    : String(filter.val || '');
}

function showDuplicateFilterToast(options) {
  if (options.showDuplicateToast !== false && typeof options.showToastMessage === 'function') {
    options.showToastMessage('That post filter is already active.', 'info');
  }
}

function applyValuePickerFilterToSnapshot(snapshot, context, prepared, options = {}) {
  const group = preparePostFilterGroup(snapshot, context.field, context.logic);
  const nextValuesKey = getSelectedValuesKey(prepared.selectedValues);
  const existingSameCond = group.filters.find(filter => String(filter?.cond || '').toLowerCase() === context.cond);
  if (getExistingValuePickerFilterKey(existingSameCond) === nextValuesKey) {
    showDuplicateFilterToast(options);
    return false;
  }

  group.filters = group.filters.filter(filter => String(filter?.cond || '').toLowerCase() !== context.cond);
  group.filters.push({
    cond: context.cond,
    val: prepared.value,
    vals: prepared.selectedValues
  });

  if (group.filters.length === 1) {
    group.logic = 'all';
  }
  return true;
}

function applyScalarFilterToSnapshot(snapshot, context, prepared, options = {}) {
  const group = preparePostFilterGroup(snapshot, context.field, context.logic);
  const alreadyExists = group.filters.some(filter => filter.cond === context.cond && filter.val === prepared.value);
  if (alreadyExists) {
    showDuplicateFilterToast(options);
    return false;
  }

  if (options.replaceSameCondition === true) {
    group.filters = group.filters.filter(filter => filter.cond !== context.cond);
  }
  group.filters.push({ cond: context.cond, val: prepared.value });
  if (group.filters.length === 1) {
    group.logic = 'all';
  }
  return true;
}

export {
  applyScalarFilterToSnapshot,
  applyValuePickerFilterToSnapshot
};
