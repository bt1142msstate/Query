const VALID_LOGIC = new Set(['all', 'any']);

let marcFilterLogic = 'all';
const listeners = new Set();

function normalizeMarcFilterLogic(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return VALID_LOGIC.has(normalized) ? normalized : 'all';
}

function getMarcFilterLogic() {
  return marcFilterLogic;
}

function setMarcFilterLogic(value, options = {}) {
  const nextValue = normalizeMarcFilterLogic(value);
  if (nextValue === marcFilterLogic) {
    return false;
  }

  marcFilterLogic = nextValue;
  listeners.forEach(listener => listener(nextValue, options));
  return true;
}

function subscribeMarcFilterLogic(listener) {
  if (typeof listener !== 'function') {
    return () => {};
  }
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function isMarcFieldName(fieldName) {
  return /^MARC\s+\d{3}(?:\b|$)/i.test(String(fieldName || '').trim());
}

function countActiveMarcFilters(activeFilters = {}) {
  return Object.entries(activeFilters || {}).reduce((count, [fieldName, group]) => {
    if (!isMarcFieldName(fieldName)) {
      return count;
    }
    return count + (Array.isArray(group?.filters) ? group.filters.length : 0);
  }, 0);
}

export {
  countActiveMarcFilters,
  getMarcFilterLogic,
  isMarcFieldName,
  normalizeMarcFilterLogic,
  setMarcFilterLogic,
  subscribeMarcFilterLogic
};
