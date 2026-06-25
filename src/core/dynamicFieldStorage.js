const DYNAMIC_FIELD_STORAGE_KEY = 'query-project.dynamic-fields.v1';
const COPIED_DYNAMIC_FIELD_KEYS = Object.freeze([
  'allowValueList',
  'category',
  'desc',
  'description',
  'dynamic_parent',
  'fieldWarning',
  'filters',
  'label',
  'multiValue',
  'numberFormat',
  'numericFormat',
  'operators',
  'parts',
  'performanceWarning',
  'retrievalWarning',
  'type',
  'values'
]);

function getStorage() {
  try {
    return globalThis.window?.localStorage || globalThis.localStorage || null;
  } catch (_error) {
    return null;
  }
}

function cloneStoredValue(value) {
  if (value === undefined) {
    return undefined;
  }

  try {
    return JSON.parse(JSON.stringify(value));
  } catch (_error) {
    return undefined;
  }
}

function normalizeStoredDynamicField(fieldDef) {
  const name = String(fieldDef?.name || '').trim();
  const dynamicParent = String(fieldDef?.dynamic_parent || fieldDef?.dynamicParent || '').trim();
  if (!name || !dynamicParent) {
    return null;
  }

  const normalized = {
    name,
    dynamic_parent: dynamicParent
  };

  COPIED_DYNAMIC_FIELD_KEYS.forEach(key => {
    const value = key === 'dynamic_parent' ? dynamicParent : cloneStoredValue(fieldDef[key]);
    if (value !== undefined) {
      normalized[key] = value;
    }
  });

  if (!normalized.label) {
    normalized.label = name;
  }

  return normalized;
}

function readStoredDynamicFields() {
  const storage = getStorage();
  if (!storage) {
    return [];
  }

  try {
    const parsed = JSON.parse(storage.getItem(DYNAMIC_FIELD_STORAGE_KEY) || '[]');
    if (!Array.isArray(parsed)) {
      return [];
    }

    const byName = new Map();
    parsed.forEach(fieldDef => {
      const normalized = normalizeStoredDynamicField(fieldDef);
      if (normalized) {
        byName.set(normalized.name, normalized);
      }
    });

    return Array.from(byName.values());
  } catch (_error) {
    return [];
  }
}

function writeStoredDynamicFields(fieldDefs) {
  const storage = getStorage();
  if (!storage) {
    return false;
  }

  const normalizedFields = Array.isArray(fieldDefs)
    ? fieldDefs.map(normalizeStoredDynamicField).filter(Boolean)
    : [];
  const byName = new Map(normalizedFields.map(fieldDef => [fieldDef.name, fieldDef]));

  if (byName.size === 0) {
    storage.removeItem(DYNAMIC_FIELD_STORAGE_KEY);
    return true;
  }

  storage.setItem(DYNAMIC_FIELD_STORAGE_KEY, JSON.stringify(Array.from(byName.values())));
  return true;
}

function rememberDynamicFieldDefinition(fieldDef) {
  const normalized = normalizeStoredDynamicField(fieldDef);
  if (!normalized) {
    return false;
  }

  const nextFields = readStoredDynamicFields().filter(stored => stored.name !== normalized.name);
  nextFields.push(normalized);
  return writeStoredDynamicFields(nextFields);
}

function forgetDynamicFieldDefinition(fieldName) {
  const normalizedName = String(fieldName || '').trim();
  if (!normalizedName) {
    return false;
  }

  const existingFields = readStoredDynamicFields();
  const nextFields = existingFields.filter(fieldDef => fieldDef.name !== normalizedName);
  if (nextFields.length === existingFields.length) {
    return false;
  }

  writeStoredDynamicFields(nextFields);
  return true;
}

export {
  DYNAMIC_FIELD_STORAGE_KEY,
  forgetDynamicFieldDefinition,
  readStoredDynamicFields,
  rememberDynamicFieldDefinition
};
