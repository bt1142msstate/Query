import { resolveFieldName } from './fieldDefs.js';

function cloneFilterEntry(filter) {
  if (!filter || typeof filter !== 'object') {
    return { cond: '', val: '' };
  }

  return {
    cond: String(filter.cond || '').trim().toLowerCase(),
    val: String(filter.val || '').trim()
  };
}

function normalizeResolvedFieldName(fieldName) {
  const normalizedField = String(fieldName || '').trim();
  if (!normalizedField) {
    return '';
  }

  return typeof resolveFieldName === 'function'
    ? resolveFieldName(normalizedField)
    : normalizedField;
}

function normalizeFieldList(fieldNames) {
  const values = Array.isArray(fieldNames) ? fieldNames : [fieldNames];
  return values
    .map(field => normalizeResolvedFieldName(field))
    .filter(Boolean);
}

function normalizeFieldFilters(filters) {
  if (!Array.isArray(filters)) {
    return [];
  }

  return filters
    .map(cloneFilterEntry)
    .filter(filter => filter.cond || filter.val);
}

function cloneDisplayedFields(snapshot) {
  return Array.isArray(snapshot?.displayedFields) ? snapshot.displayedFields.slice() : [];
}

function cloneActiveFilters(snapshot) {
  if (!snapshot?.activeFilters || typeof snapshot.activeFilters !== 'object') {
    return {};
  }

  return Object.fromEntries(
    Object.entries(snapshot.activeFilters).map(([field, data]) => [
      field,
      {
        filters: normalizeFieldFilters(data?.filters)
      }
    ])
  );
}

function getOptions(args, index) {
  return args[index] && typeof args[index] === 'object' ? args[index] : {};
}

function buildStateResult(draft) {
  return {
    displayedFields: draft.displayedFields,
    activeFilters: draft.activeFilters
  };
}

function addDisplayedFields(draft, args) {
  const normalizedFields = normalizeFieldList(args[0]);
  const options = getOptions(args, 1);
  const insertAt = Number.isInteger(options.insertAt) ? options.insertAt : -1;
  normalizedFields.forEach((fieldName, index) => {
    if (insertAt >= 0 && insertAt <= draft.displayedFields.length) {
      draft.displayedFields.splice(insertAt + index, 0, fieldName);
      return;
    }
    draft.displayedFields.push(fieldName);
  });
}

function removeDisplayedFields(draft, args) {
  const normalizedFields = new Set(normalizeFieldList(args[0]));
  const options = getOptions(args, 1);
  if (options.all !== false) {
    draft.displayedFields = draft.displayedFields.filter(fieldName => !normalizedFields.has(fieldName));
    return;
  }

  const removeIndex = draft.displayedFields.findIndex(fieldName => normalizedFields.has(fieldName));
  if (removeIndex !== -1) {
    draft.displayedFields.splice(removeIndex, 1);
  }
}

function getMoveFieldCount(fields, fromIndex, options) {
  const count = Math.max(1, Number.isInteger(options.count) ? options.count : 1);
  return Math.min(count, fields.length - fromIndex);
}

function getGroupMoveInsertIndex({ fromIndex, safeCount, targetIndex }) {
  let insertAt = targetIndex;
  for (let offset = 0; offset < safeCount; offset += 1) {
    if (fromIndex + offset < targetIndex) {
      insertAt -= 1;
    }
  }
  return insertAt;
}

function moveDisplayedFields(draft, args) {
  const fromIndex = args[0];
  const toIndex = args[1];
  const options = getOptions(args, 2);
  if (
    !Number.isInteger(fromIndex)
    || !Number.isInteger(toIndex)
    || fromIndex === toIndex
    || fromIndex < 0
    || fromIndex >= draft.displayedFields.length
  ) {
    return;
  }

  const safeCount = getMoveFieldCount(draft.displayedFields, fromIndex, options);
  const movedFields = draft.displayedFields.splice(fromIndex, safeCount);
  const adjustedTarget = options.behavior === 'group'
    ? getGroupMoveInsertIndex({ fromIndex, safeCount, targetIndex: toIndex })
    : toIndex;
  const insertAt = Math.max(0, Math.min(adjustedTarget, draft.displayedFields.length));
  draft.displayedFields.splice(insertAt, 0, ...movedFields);
}

function upsertFilter(draft, args) {
  const fieldName = normalizeResolvedFieldName(args[0]);
  const filter = cloneFilterEntry(args[1]);
  const options = getOptions(args, 2);
  if (!fieldName || !(filter.cond || filter.val)) {
    return;
  }

  if (!draft.activeFilters[fieldName]) {
    draft.activeFilters[fieldName] = { filters: [] };
  }

  let filters = draft.activeFilters[fieldName].filters.slice();
  if (options.replaceByCond) {
    filters = filters.filter(existingFilter => existingFilter.cond !== filter.cond);
  }

  const hasMatch = filters.some(existingFilter => existingFilter.cond === filter.cond && existingFilter.val === filter.val);
  if (!(options.dedupe && hasMatch)) {
    filters.push(filter);
  }
  draft.activeFilters[fieldName].filters = normalizeFieldFilters(filters);
}

function getFilterRemovalIndex(filters, options) {
  if (Number.isInteger(options.index) && options.index >= 0 && options.index < filters.length) {
    return options.index;
  }

  const targetCond = options.cond === undefined ? null : String(options.cond || '');
  const targetVal = options.val === undefined ? null : String(options.val || '');
  return filters.findIndex(filter => {
    if (targetCond !== null && filter.cond !== targetCond) return false;
    if (targetVal !== null && filter.val !== targetVal) return false;
    return true;
  });
}

function removeFilter(draft, args) {
  const fieldName = normalizeResolvedFieldName(args[0]);
  const options = getOptions(args, 1);
  if (!fieldName || !draft.activeFilters[fieldName]) {
    return;
  }

  if (options.removeAll) {
    delete draft.activeFilters[fieldName];
    return;
  }

  const filters = draft.activeFilters[fieldName].filters.slice();
  const removeIndex = getFilterRemovalIndex(filters, options);
  if (removeIndex !== -1) {
    filters.splice(removeIndex, 1);
  }

  if (filters.length > 0) {
    draft.activeFilters[fieldName].filters = normalizeFieldFilters(filters);
    return;
  }
  delete draft.activeFilters[fieldName];
}

function reorderFilterGroups(draft, args) {
  const normalizedOrder = normalizeFieldList(args[0]);
  if (normalizedOrder.length === 0) {
    return;
  }

  const reordered = {};
  normalizedOrder.forEach(fieldName => {
    if (draft.activeFilters[fieldName]) {
      reordered[fieldName] = draft.activeFilters[fieldName];
    }
  });
  Object.keys(draft.activeFilters).forEach(fieldName => {
    if (!reordered[fieldName]) {
      reordered[fieldName] = draft.activeFilters[fieldName];
    }
  });
  draft.activeFilters = reordered;
}

function setQueryState(draft, args) {
  const nextState = args[0] && typeof args[0] === 'object' ? args[0] : {};
  if (nextState.displayedFields !== undefined) {
    draft.displayedFields = normalizeFieldList(nextState.displayedFields);
  }
  if (nextState.activeFilters !== undefined) {
    draft.activeFilters = cloneActiveFilters({ activeFilters: nextState.activeFilters });
  }
}

const stateOperationHandlers = Object.freeze({
  addDisplayedField: addDisplayedFields,
  moveDisplayedField: moveDisplayedFields,
  removeDisplayedField: removeDisplayedFields,
  reorderFilterGroups,
  setQueryState,
  upsertFilter,
  removeFilter,
  replaceActiveFilters(draft, args) {
    draft.activeFilters = cloneActiveFilters({ activeFilters: args[0] });
  },
  replaceDisplayedFields(draft, args) {
    draft.displayedFields = normalizeFieldList(args[0]);
  }
});

function buildNextState(currentState, operation, args = []) {
  const draft = {
    displayedFields: cloneDisplayedFields(currentState),
    activeFilters: cloneActiveFilters(currentState)
  };
  stateOperationHandlers[operation]?.(draft, args);
  return buildStateResult(draft);
}

export {
  buildNextState,
  cloneActiveFilters,
  cloneDisplayedFields,
  cloneFilterEntry,
  normalizeFieldFilters,
  normalizeFieldList,
  normalizeResolvedFieldName
};
