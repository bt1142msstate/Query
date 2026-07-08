/**
 * Field definitions and field-group management.
 * Contains backend-provided field definitions and selector helpers.
 * @module FieldDefs
 */
import { BackendApi } from './backendApi.js';
import {
  getFieldAccessState,
  isFieldAccessAuthorized,
  isFieldAuthRequired,
  isFieldSensitive
} from './fieldAccess.js';
import { QueryStateReaders, registerQueryStateRuntimeAccessors } from './queryState.js';
import { showToastMessage } from './toast.js';
import {
  forgetDynamicFieldDefinition,
  readStoredDynamicFields,
  rememberDynamicFieldDefinition
} from './dynamicFieldStorage.js';

// Field definitions dynamically loaded from backend
let fieldDefsArray = [];
let fieldDefs = new Map();
let fieldAliases = new Map();
let filteredDefs = [];
let isFieldsLoaded = false;
let fieldDefinitionsLoadPromise = null;
let pendingAliasNotifications = new Map();
let aliasToastTimer = null;
const backendFieldNames = new Set();
const localDynamicFieldNames = new Set();
const FIELD_DEFINITION_TIMEOUT_MS = 12000;
const DEFAULT_DATE_FILTERS = Object.freeze([
  'equals',
  'does_not_equal',
  'before',
  'after',
  'on_or_before',
  'on_or_after',
  'between'
]);

function hasLoadedFieldDefinitions() {
  return isFieldsLoaded && fieldDefsArray.length > 0;
}

function scheduleAliasNotificationToast() {
  if (aliasToastTimer || pendingAliasNotifications.size === 0) {
    return;
  }

  aliasToastTimer = globalThis.setTimeout(() => {
    aliasToastTimer = null;

    const updates = Array.from(pendingAliasNotifications.entries());
    pendingAliasNotifications.clear();

    if (!updates.length) {
      return;
    }

    const details = updates
      .map(([alias, canonical]) => `${alias} -> ${canonical}`)
      .join('; ');
    const prefix = updates.length === 1
      ? 'Updated field name:'
      : 'Updated field names:';

    console.info('Normalized aliased field names:', details);
    showToastMessage(`${prefix} ${details}`, 'warning', 5000);
  }, 50);
}

function noteFieldAliasUsage(alias, canonical) {
  if (!alias || !canonical || alias === canonical) {
    return;
  }

  pendingAliasNotifications.set(alias, canonical);
  scheduleAliasNotificationToast();
}

function resolveFieldName(fieldName, options = {}) {
  const normalized = typeof fieldName === 'string' ? fieldName.trim() : '';
  if (!normalized) {
    return '';
  }

  if (fieldAliases.has(normalized)) {
    const canonical = fieldAliases.get(normalized);
    if (options.trackAlias) {
      noteFieldAliasUsage(normalized, canonical);
    }
    return canonical;
  }

  if (fieldDefs.has(normalized)) {
    return fieldDefs.get(normalized)?.name || normalized;
  }

  return normalized;
}

function upsertFieldDefinition(fieldDef) {
  if (!fieldDef || !fieldDef.name) {
    return false;
  }

  fieldDefs.set(fieldDef.name, fieldDef);

  const fieldIndex = fieldDefsArray.findIndex(definition => definition?.name === fieldDef.name);
  if (fieldIndex >= 0) {
    fieldDefsArray[fieldIndex] = { ...fieldDef };
  } else {
    fieldDefsArray.push({ ...fieldDef });
  }

  const filteredIndex = filteredDefs.findIndex(definition => definition?.name === fieldDef.name);
  if (filteredIndex >= 0) {
    filteredDefs[filteredIndex] = { ...fieldDef };
  } else {
    filteredDefs.push({ ...fieldDef });
  }

  return true;
}

function restoreStoredDynamicFields() {
  readStoredDynamicFields().forEach(fieldDef => {
    if (backendFieldNames.has(fieldDef.name) || fieldDefs.has(fieldDef.name)) {
      return;
    }

    upsertFieldDefinition(fieldDef);
    localDynamicFieldNames.add(fieldDef.name);
  });
}

function replaceFieldDefinitions(nextFieldDefsArray, options = {}) {
  fieldDefsArray = Array.isArray(nextFieldDefsArray) ? [...nextFieldDefsArray] : [];

  fieldDefs.clear();
  fieldAliases.clear();
  backendFieldNames.clear();
  localDynamicFieldNames.clear();

  fieldDefsArray.forEach(field => {
    if (!field?.name) return;
    backendFieldNames.add(field.name);
    fieldDefs.set(field.name, field);
  });
  fieldDefsArray.forEach(field => {
    if (!field?.name) return;
    const aliases = Array.isArray(field.aliases) ? field.aliases : [];
    aliases.forEach(alias => {
      const normalizedAlias = typeof alias === 'string' ? alias.trim() : '';
      if (!normalizedAlias || fieldDefs.has(normalizedAlias) || fieldAliases.has(normalizedAlias)) {
        return;
      }

      fieldAliases.set(normalizedAlias, field.name);
      fieldDefs.set(normalizedAlias, field);
    });
  });

  filteredDefs = [...fieldDefsArray];
  if (options.restoreDynamicFields !== false) {
    restoreStoredDynamicFields();
  }

  isFieldsLoaded = options.markLoaded === false ? isFieldsLoaded : true;
  return fieldDefsArray;
}

registerQueryStateRuntimeAccessors({
  resolveFieldName,
  getFieldDefinition(fieldName) {
    return fieldDefs.get(fieldName) || null;
  }
});

async function fetchFieldDefinitions() {
    try {
        const { data } = await BackendApi.postJson(
          { action: 'get_fields' },
          { timeoutMs: FIELD_DEFINITION_TIMEOUT_MS }
        );
        
        let errorMsg = null;
        if (data.error) {
            errorMsg = data.error;
            console.error("Backend reported an issue when loading fields:", errorMsg);
            showToastMessage("Warning: " + errorMsg, "warning");
        }
        
        const loadedFieldDefs = Array.isArray(data) ? data : (data.fields ? data.fields : []);
        
        if (loadedFieldDefs.length === 0) {
           console.warn("Received empty field definitions", data);
        }

        return replaceFieldDefinitions(loadedFieldDefs, { restoreDynamicFields: true });
    } catch (e) {
        if (e?.isRateLimited) {
            return [];
        }
        if (e?.isTimeout) {
            console.error("Timed out loading backend field mappings.", e);
            showToastMessage("Field settings took too long to load. Check API Settings and retry.", "error");
            return [];
        }
        console.error("Failed to load backend field mappings.", e);
        showToastMessage("Could not load field settings from backend", "error");
        return [];
    }
}

async function loadFieldDefinitions() {
    if (isFieldsLoaded) return fieldDefsArray;
    if (fieldDefinitionsLoadPromise) return fieldDefinitionsLoadPromise;

    fieldDefinitionsLoadPromise = fetchFieldDefinitions()
      .finally(() => {
        fieldDefinitionsLoadPromise = null;
      });

    return fieldDefinitionsLoadPromise;
}

/**
 * Updates the filtered definitions array based on search term.
 * Filters field definitions by name matching the search term.
 * @function updateFilteredDefs
 * @param {string} searchTerm - The search term to filter by
 * @returns {Object[]} Array of filtered field definition objects
 */
function updateFilteredDefs(searchTerm) {
  if (searchTerm === '') {
    filteredDefs = [...fieldDefsArray];
  } else {
    filteredDefs = fieldDefsArray.filter(d => d.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }
  return filteredDefs;
}

function getFieldFilterOperators(fieldOrName) {
  const fieldDef = typeof fieldOrName === 'string'
    ? fieldDefs.get(fieldOrName)
    : fieldOrName;

  if (!fieldDef || typeof fieldDef !== 'object') {
    return [];
  }

  if (!isFieldAccessAuthorized(fieldDef)) {
    return [];
  }

  const configured = Array.isArray(fieldDef.filters)
    ? fieldDef.filters
    : (Array.isArray(fieldDef.operators) ? fieldDef.operators : []);

  const isDateField = String(fieldDef.type || '').trim().toLowerCase() === 'date';
  const operators = configured
    .map(operator => String(operator || '').trim().toLowerCase())
    .filter(Boolean)
    .filter(operator => !(isDateField && operator === 'never'))
    .filter((operator, index, list) => list.indexOf(operator) === index);
  if (isDateField) {
    DEFAULT_DATE_FILTERS.forEach(operator => {
      if (!operators.includes(operator)) {
        operators.push(operator);
      }
    });
  }
  return operators;
}

function isFieldBackendFilterable(fieldOrName) {
  return getFieldFilterOperators(fieldOrName).length > 0;
}

function isFieldBuildable(fieldOrName) {
  const fieldDef = typeof fieldOrName === 'string'
    ? fieldDefs.get(fieldOrName)
    : fieldOrName;

  return Boolean(fieldDef && (fieldDef.is_buildable || fieldDef.builder));
}

function isFieldDisplayable(fieldOrName) {
  const fieldDef = typeof fieldOrName === 'string'
    ? fieldDefs.get(fieldOrName)
    : fieldOrName;

  return !isFieldBuildable(fieldDef) && isFieldAccessAuthorized(fieldDef);
}

function getFieldBuilderInputs(fieldOrName) {
  const fieldDef = typeof fieldOrName === 'string'
    ? fieldDefs.get(fieldOrName)
    : fieldOrName;
  const builder = fieldDef && typeof fieldDef.builder === 'object' ? fieldDef.builder : null;

  return Array.isArray(builder?.inputs)
    ? builder.inputs
    : (Array.isArray(fieldDef?.builder_inputs) ? fieldDef.builder_inputs : []);
}

function getDynamicFieldTemplate(fieldDef) {
  const builder = fieldDef && typeof fieldDef.builder === 'object' ? fieldDef.builder : null;

  return builder?.outputFieldIdTemplate
    || builder?.fieldTemplate
    || fieldDef?.field_template
    || '';
}

function getDynamicFieldMatchPatterns(fieldDef) {
  const builder = fieldDef && typeof fieldDef.builder === 'object' ? fieldDef.builder : null;
  const rawPatterns = builder?.matchPattern || builder?.matchPatterns || fieldDef?.matchPattern || [];
  return Array.isArray(rawPatterns) ? rawPatterns : [rawPatterns].filter(Boolean);
}

function escapeRegExpLiteral(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildTemplateRegex(template) {
  let pattern = '';
  let lastIndex = 0;

  String(template || '').replace(/\{([^}]+)\}/g, (match, _key, offset) => {
    pattern += escapeRegExpLiteral(template.slice(lastIndex, offset));
    pattern += '(.+)';
    lastIndex = offset + match.length;
    return match;
  });

  pattern += escapeRegExpLiteral(template.slice(lastIndex));
  return new RegExp(`^${pattern}$`);
}

function registerDynamicField(fieldName, opts = {}) {
  if (!fieldName) return null;
  if (fieldDefs.has(fieldName)) {
    const existingField = fieldDefs.get(fieldName);
    if (
      opts.persist !== false
      && localDynamicFieldNames.has(fieldName)
      && existingField?.dynamic_parent
    ) {
      rememberDynamicFieldDefinition(existingField);
    }
    return existingField;
  }

  let parentDef = null;
  if (Array.isArray(fieldDefsArray)) {
    parentDef = fieldDefsArray.find(definition => {
      if (!isFieldBuildable(definition)) return false;
      const matchPatterns = getDynamicFieldMatchPatterns(definition);
      if (matchPatterns.some(pattern => {
        try {
          return new RegExp(pattern, 'u').test(fieldName);
        } catch (_error) {
          return false;
        }
      })) {
        return true;
      }

      const template = getDynamicFieldTemplate(definition);
      if (!template) return false;
      return buildTemplateRegex(template).test(fieldName);
    });
  }

  const newDef = {
    name: fieldName,
    type: opts.type ?? (parentDef ? parentDef.type : null),
    category: opts.category ?? (parentDef ? parentDef.category : null),
    desc: opts.desc ?? (parentDef ? parentDef.desc : ''),
    label: opts.label || fieldName,
    dynamic_parent: parentDef ? parentDef.name : null
  };

  [
    'allowValueList',
    'description',
    'filters',
    'numberFormat',
    'numericFormat',
    'operators',
    'parts',
    'fieldWarning',
    'access',
    'accessGranted',
    'accessMessage',
    'authMessage',
    'authRequired',
    'performanceWarning',
    'requiredScopes',
    'requiresAuth',
    'retrievalWarning',
    'sensitive',
    'values'
  ].forEach(key => {
    if (opts[key] !== undefined) {
      newDef[key] = opts[key];
    } else if (parentDef && parentDef[key] !== undefined) {
      newDef[key] = parentDef[key];
    }
  });

  fieldDefs.set(fieldName, newDef);

  upsertFieldDefinition(newDef);

  if (newDef.dynamic_parent) {
    localDynamicFieldNames.add(fieldName);
    if (opts.persist !== false) {
      rememberDynamicFieldDefinition(newDef);
    }
  }

  return newDef;
}

function isLocalDynamicField(fieldOrName) {
  const fieldName = typeof fieldOrName === 'string'
    ? fieldOrName
    : String(fieldOrName?.name || '');
  return localDynamicFieldNames.has(fieldName);
}

function removeDynamicField(fieldName, opts = {}) {
  const normalizedFieldName = String(fieldName || '').trim();
  if (!normalizedFieldName || backendFieldNames.has(normalizedFieldName)) {
    return false;
  }

  const fieldDef = fieldDefs.get(normalizedFieldName);
  if (!fieldDef || (!localDynamicFieldNames.has(normalizedFieldName) && !fieldDef.dynamic_parent)) {
    return false;
  }

  fieldDefs.delete(normalizedFieldName);
  localDynamicFieldNames.delete(normalizedFieldName);

  const fieldIndex = fieldDefsArray.findIndex(definition => definition?.name === normalizedFieldName);
  if (fieldIndex >= 0) {
    fieldDefsArray.splice(fieldIndex, 1);
  }

  const filteredIndex = filteredDefs.findIndex(definition => definition?.name === normalizedFieldName);
  if (filteredIndex >= 0) {
    filteredDefs.splice(filteredIndex, 1);
  }

  if (opts.persist !== false) {
    forgetDynamicFieldDefinition(normalizedFieldName);
  }

  return true;
}

/**
 * Checks if a field should have purple styling (filtered or displayed).
 * @function shouldFieldHavePurpleStylingBase
 * @param {string} fieldName - The name of the field to check
 * @param {string[]} displayedFields - Array of currently displayed field names
 * @param {Object} activeFilters - Object containing active filter configurations
 * @returns {boolean} True if field should have purple styling
 */
function shouldFieldHavePurpleStylingBase(fieldName, displayedFields, activeFilters) {
  // Check if the field has active filters
  const hasFilters = activeFilters[fieldName] && 
                    activeFilters[fieldName].filters && 
                    activeFilters[fieldName].filters.length > 0;
  
  // Check if the field is displayed as a column
  const isDisplayed = displayedFields.includes(fieldName);
  
  return hasFilters || isDisplayed;
}

function shouldFieldHavePurpleStyling(fieldName) {
  if (!fieldName) return false;

  const displayedFields = QueryStateReaders?.getDisplayedFields?.() || [];
  const activeFilters = QueryStateReaders?.getActiveFilters?.() || {};

  return shouldFieldHavePurpleStylingBase(fieldName, displayedFields, activeFilters);
}

export {
  fieldAliases,
  fieldDefs,
  fieldDefsArray,
  filteredDefs,
  getFieldBuilderInputs,
  getFieldAccessState,
  getFieldFilterOperators,
  hasLoadedFieldDefinitions,
  isFieldAccessAuthorized,
  isFieldAuthRequired,
  isFieldBuildable,
  isFieldBackendFilterable,
  isFieldDisplayable,
  isFieldSensitive,
  isLocalDynamicField,
  loadFieldDefinitions,
  registerDynamicField,
  removeDynamicField,
  replaceFieldDefinitions,
  resolveFieldName,
  shouldFieldHavePurpleStyling,
  shouldFieldHavePurpleStylingBase,
  updateFilteredDefs
};
