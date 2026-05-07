function supportsListSelectorCondition(cond) {
  const normalized = String(cond || '').trim().toLowerCase();
  return normalized === 'equals' || normalized === 'does_not_equal';
}

function isListPasteField(fieldDef) {
  return Boolean(fieldDef && fieldDef.allowValueList && (!fieldDef.values || fieldDef.values.length === 0));
}

function parseFilterValues(filter) {
  return filter.cond === 'between'
    ? String(filter.val || '').split('|').map(value => value.trim())
    : [String(filter.val || '').trim()];
}

function getFilterPhrase(filter) {
  const values = parseFilterValues(filter);
  switch (filter.cond) {
    case 'equals':
      return `equal ${values[0]}`;
    case 'does_not_equal':
      return `not equal ${values[0]}`;
    case 'contains':
      return `contain ${values[0]}`;
    case 'starts':
      return `start with ${values[0]}`;
    case 'doesnotcontain':
      return `not contain ${values[0]}`;
    case 'greater':
      return `be greater than ${values[0]}`;
    case 'less':
      return `be less than ${values[0]}`;
    case 'between':
      return `be between ${values[0]} and ${values[1]}`;
    case 'before':
      return `be before ${values[0]}`;
    case 'on_or_before':
      return `be on or before ${values[0]}`;
    case 'after':
      return `be after ${values[0]}`;
    case 'on_or_after':
      return `be on or after ${values[0]}`;
    default:
      return `${filter.cond} ${values.join(' and ')}`;
  }
}

function getComparableFilterValues(filter, fieldType, getComparableDateValue) {
  return parseFilterValues(filter).map(value => {
    if (fieldType === 'date') {
      return getComparableDateValue(value);
    }
    return parseFloat(value);
  });
}

function getContradictionMessage(existing, newFilter, fieldType, fieldLabel, options = {}) {
  if (!existing || !Array.isArray(existing.filters)) return null;

  const getComparableDateValue = typeof options.getComparableDateValue === 'function'
    ? options.getComparableDateValue
    : () => NaN;

  const newLabel = getFilterPhrase(newFilter);
  const newValues = getComparableFilterValues(newFilter, fieldType, getComparableDateValue);
  const newLow = Math.min(...newValues);
  const newHigh = Math.max(...newValues);

  for (const filter of existing.filters) {
    const filterLabel = getFilterPhrase(filter);
    const filterValues = getComparableFilterValues(filter, fieldType, getComparableDateValue);
    const low = Math.min(...filterValues);
    const high = Math.max(...filterValues);
    const message = `${fieldLabel} cannot ${newLabel} and ${filterLabel}`;

    if (newFilter.cond === 'equals') {
      if (filter.cond === 'does_not_equal' && newValues[0] === filterValues[0]) return message;
      if (filter.cond === 'equals' && newValues[0] !== filterValues[0]) return message;
      if (filter.cond === 'greater' && newValues[0] <= filterValues[0]) return message;
      if (filter.cond === 'less' && newValues[0] >= filterValues[0]) return message;
      if (filter.cond === 'between' && (newValues[0] < low || newValues[0] > high)) return message;
    }

    if (filter.cond === 'equals') {
      if (newFilter.cond === 'does_not_equal' && filterValues[0] === newValues[0]) return message;
      if (newFilter.cond === 'greater' && filterValues[0] <= newValues[0]) return message;
      if (newFilter.cond === 'less' && filterValues[0] >= newValues[0]) return message;
      if (newFilter.cond === 'between' && (filterValues[0] < newLow || filterValues[0] > newHigh)) return message;
    }

    if (newFilter.cond === 'greater') {
      if (filter.cond === 'less' && newValues[0] >= filterValues[0]) return message;
      if (filter.cond === 'between' && newValues[0] >= high) return message;
    }

    if (newFilter.cond === 'less') {
      if (filter.cond === 'greater' && newValues[0] <= filterValues[0]) return message;
      if (filter.cond === 'between' && newValues[0] <= low) return message;
    }

    if (newFilter.cond === 'between') {
      if (filter.cond === 'greater' && newHigh <= filterValues[0]) return message;
      if (filter.cond === 'less' && newLow >= filterValues[0]) return message;
      if (filter.cond === 'between' && (high < newLow || low > newHigh)) return message;
    }
  }

  return null;
}

export {
  getContradictionMessage,
  isListPasteField,
  supportsListSelectorCondition
};
