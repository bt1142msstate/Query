function normalizeFieldName(value) {
  return String(value || '').trim().toLocaleLowerCase();
}

function getActiveFilterFieldNames(activeFilters = {}) {
  return Object.entries(activeFilters || {})
    .filter(([, data]) => Array.isArray(data?.filters) && data.filters.length > 0)
    .map(([fieldName]) => fieldName);
}

function buildPlannedFilterFieldOrder(plan = {}, activeFilters = {}) {
  const currentOrder = getActiveFilterFieldNames(activeFilters);
  if (currentOrder.length < 2 || !Array.isArray(plan?.order)) {
    return currentOrder;
  }

  const currentFieldsByName = new Map(
    currentOrder.map(fieldName => [normalizeFieldName(fieldName), fieldName])
  );
  const plannedEntries = plan.order
    .map((entry, index) => ({
      entry,
      index,
      position: Number(entry?.planned_position)
    }))
    .sort((left, right) => {
      const leftPosition = Number.isFinite(left.position) ? left.position : left.index + 1;
      const rightPosition = Number.isFinite(right.position) ? right.position : right.index + 1;
      return leftPosition - rightPosition || left.index - right.index;
    });

  const nextOrder = [];
  const seen = new Set();
  plannedEntries.forEach(({ entry }) => {
    const normalizedField = normalizeFieldName(entry?.field);
    const currentField = currentFieldsByName.get(normalizedField);
    if (!currentField || seen.has(normalizedField)) return;
    seen.add(normalizedField);
    nextOrder.push(currentField);
  });

  currentOrder.forEach(fieldName => {
    const normalizedField = normalizeFieldName(fieldName);
    if (seen.has(normalizedField)) return;
    seen.add(normalizedField);
    nextOrder.push(fieldName);
  });

  return nextOrder;
}

function areFilterFieldOrdersEqual(left = [], right = []) {
  return left.length === right.length
    && left.every((fieldName, index) => fieldName === right[index]);
}

export { areFilterFieldOrdersEqual, buildPlannedFilterFieldOrder, getActiveFilterFieldNames };
