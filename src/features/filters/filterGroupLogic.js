import { fieldDefs, fieldDefsArray, resolveFieldName } from './fieldDefs.js';

const VALID_LOGIC = new Set(['all', 'any']);
const groupLogic = new Map();
const listeners = new Set();

function normalizeFilterGroupLogic(value, fallback = 'all') {
  const normalized = String(value || '').trim().toLowerCase();
  return VALID_LOGIC.has(normalized) ? normalized : fallback;
}

function normalizeFilterGroup(fieldDef) {
  const rawGroup = fieldDef?.filterGroup || fieldDef?.filter_group;
  if (!rawGroup || typeof rawGroup !== 'object') {
    return null;
  }

  const id = String(rawGroup.id || rawGroup.key || '').trim();
  if (!id) {
    return null;
  }

  const defaultLogic = normalizeFilterGroupLogic(
    rawGroup.defaultLogic || rawGroup.default_logic,
    'all'
  );

  return {
    id,
    label: String(rawGroup.label || rawGroup.name || 'Related conditions').trim(),
    description: String(
      rawGroup.description
      || rawGroup.helpText
      || rawGroup.help_text
      || 'Choose whether every related condition or at least one must match.'
    ).trim(),
    defaultLogic,
    minConditions: Math.max(
      2,
      Number(rawGroup.minConditions || rawGroup.min_conditions || 2) || 2
    ),
    legacyPayloadKeys: (
      Array.isArray(rawGroup.legacyPayloadKeys)
        ? rawGroup.legacyPayloadKeys
        : (Array.isArray(rawGroup.legacy_payload_keys) ? rawGroup.legacy_payload_keys : [])
    )
      .map(key => String(key || '').trim())
      .filter(Boolean)
  };
}

function getFieldFilterGroup(fieldOrName) {
  const fieldDef = typeof fieldOrName === 'string'
    ? fieldDefs.get(resolveFieldName(fieldOrName))
    : fieldOrName;
  return normalizeFilterGroup(fieldDef);
}

function getDeclaredFilterGroups() {
  const groups = new Map();

  fieldDefsArray.forEach(fieldDef => {
    const group = getFieldFilterGroup(fieldDef);
    if (group && !groups.has(group.id)) {
      groups.set(group.id, group);
    }
  });

  return groups;
}

function getFilterGroupLogic(groupOrId) {
  const group = typeof groupOrId === 'object'
    ? groupOrId
    : getDeclaredFilterGroups().get(String(groupOrId || ''));
  const id = typeof groupOrId === 'object'
    ? String(groupOrId?.id || '')
    : String(groupOrId || '');
  const fallback = group?.defaultLogic || 'all';
  return groupLogic.has(id) ? groupLogic.get(id) : fallback;
}

function setFilterGroupLogic(groupId, value, options = {}) {
  const id = String(groupId || '').trim();
  if (!id) {
    return false;
  }

  const group = getDeclaredFilterGroups().get(id);
  const nextValue = normalizeFilterGroupLogic(value, group?.defaultLogic || 'all');
  if (getFilterGroupLogic(group || id) === nextValue && groupLogic.has(id)) {
    return false;
  }

  groupLogic.set(id, nextValue);
  listeners.forEach(listener => listener(id, nextValue, options));
  return true;
}

function subscribeFilterGroupLogic(listener) {
  if (typeof listener !== 'function') {
    return () => {};
  }
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function collectActiveFilterGroups(activeFilters = {}) {
  const groups = new Map();

  Object.entries(activeFilters || {}).forEach(([fieldName, filterData]) => {
    const group = getFieldFilterGroup(fieldName);
    if (!group) {
      return;
    }

    const conditionCount = Array.isArray(filterData?.filters)
      ? filterData.filters.length
      : 0;
    if (!conditionCount) {
      return;
    }

    const current = groups.get(group.id) || { ...group, conditionCount: 0 };
    current.conditionCount += conditionCount;
    groups.set(group.id, current);
  });

  return Array.from(groups.values());
}

function getFilterGroupLogicPayload(activeFilters = {}) {
  const payload = {};

  collectActiveFilterGroups(activeFilters).forEach(group => {
    payload[group.id] = getFilterGroupLogic(group);
  });

  return payload;
}

function findConfiguredGroupLogic(group, sources = []) {
  for (const source of sources) {
    if (!source || typeof source !== 'object') {
      continue;
    }

    const grouped = source.FilterGroupLogic || source.filter_group_logic;
    if (grouped && typeof grouped === 'object' && grouped[group.id] !== undefined) {
      return grouped[group.id];
    }

    for (const legacyKey of group.legacyPayloadKeys) {
      if (source[legacyKey] !== undefined) {
        return source[legacyKey];
      }
    }
  }

  return group.defaultLogic;
}

function restoreFilterGroupLogic(sources = []) {
  getDeclaredFilterGroups().forEach(group => {
    setFilterGroupLogic(group.id, findConfiguredGroupLogic(group, sources), {
      source: 'restoreFilterGroupLogic'
    });
  });
}

export {
  collectActiveFilterGroups,
  getDeclaredFilterGroups,
  getFieldFilterGroup,
  getFilterGroupLogic,
  getFilterGroupLogicPayload,
  normalizeFilterGroup,
  normalizeFilterGroupLogic,
  restoreFilterGroupLogic,
  setFilterGroupLogic,
  subscribeFilterGroupLogic
};
