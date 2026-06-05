import { escapeRegExp } from '../core/formatting/dataFormatters.js';
import { buildDynamicFieldDefinition, isOptionalBuilderInput } from '../filters/buildableFilterFields.js';
import { fieldDefsArray, registerDynamicField, resolveFieldName } from '../filters/fieldDefs.js';

function escapeRegExpFallback(value) {
  return escapeRegExp(value);
}

function getDefaultRequestMapperDependencies() {
  return {
    escapeRegExp,
    fieldDefsArray: fieldDefsArray,
    normalizeUiConfigFilters: null,
    registerDynamicField: registerDynamicField,
    resolveFieldName: resolveFieldName
  };
}

function appendUniqueColumn(target, fieldName, dependencies = getDefaultRequestMapperDependencies()) {
  const normalizedField = typeof dependencies.resolveFieldName === 'function'
    ? dependencies.resolveFieldName(fieldName)
    : fieldName;
  if (!normalizedField || target.includes(normalizedField)) return;
  target.push(normalizedField);
}

function deriveTemplateBindings(template, actual, bindings, escapeRegExp = escapeRegExpFallback) {
  if (typeof template !== 'string' || typeof actual !== 'string') {
    return false;
  }

  const keys = [];
  const pattern = escapeRegExp(template).replace(/\\\{([^}]+)\\\}/g, (_, key) => {
    keys.push(key);
    return '(.+?)';
  });

  if (!keys.length) {
    return template === actual;
  }

  const match = new RegExp(`^${pattern}$`, 'u').exec(actual);
  if (!match) {
    return false;
  }

  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    const value = match[index + 1];

    if (Object.prototype.hasOwnProperty.call(bindings, key) && bindings[key] !== value) {
      return false;
    }

    bindings[key] = value;
  }

  return true;
}

function isBuildableFieldDefinition(fieldDef) {
  return Boolean(fieldDef && (fieldDef.is_buildable || fieldDef.builder));
}

function normalizeBuilderKey(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/gu, '');
}

function getBuilderIdentityValues(fieldDef) {
  const builder = fieldDef && typeof fieldDef.builder === 'object' ? fieldDef.builder : {};
  return [
    fieldDef?.name,
    fieldDef?.id,
    fieldDef?.key,
    fieldDef?.field,
    fieldDef?.fieldName,
    builder.id,
    builder.key,
    builder.name,
    builder.type
  ]
    .map(normalizeBuilderKey)
    .filter(Boolean);
}

function payloadMatchesBuildableDefinition(payload, fieldDef) {
  const payloadType = normalizeBuilderKey(payload.type || payload.kind || payload.builder || payload.field);
  if (!payloadType) {
    return true;
  }

  return getBuilderIdentityValues(fieldDef).some(identity => (
    identity === payloadType
    || identity.startsWith(payloadType)
    || payloadType.startsWith(identity)
  ));
}

function getBuilderInputs(fieldDef) {
  const builder = fieldDef && typeof fieldDef.builder === 'object' ? fieldDef.builder : null;
  return Array.isArray(builder?.inputs)
    ? builder.inputs
    : (Array.isArray(fieldDef?.builder_inputs) ? fieldDef.builder_inputs : []);
}

function getPayloadBuilderValue(payload, input) {
  const candidateKeys = [
    input?.id,
    input?.name,
    input?.key
  ].filter(Boolean);

  for (const key of candidateKeys) {
    if (Object.prototype.hasOwnProperty.call(payload, key)) {
      return payload[key];
    }
  }

  return '';
}

function getPayloadBuilderValues(payload, inputs) {
  const values = {};
  let hasRequiredValues = true;

  inputs.forEach(input => {
    const inputId = input?.id || input?.name || input?.key;
    if (!inputId) {
      return;
    }

    const value = String(getPayloadBuilderValue(payload, input) ?? '').trim();
    values[inputId] = value;
    if (!value && !isOptionalBuilderInput(input)) {
      hasRequiredValues = false;
    }
  });

  return { hasRequiredValues, values };
}

function resolveFieldNameFromSpecialPayload(payload, dependencies = getDefaultRequestMapperDependencies()) {
  if (!payload || typeof payload !== 'object') {
    return '';
  }

  const buildableFieldDefs = (dependencies.fieldDefsArray || []).filter(isBuildableFieldDefinition);
  for (const fieldDef of buildableFieldDefs) {
    if (!payloadMatchesBuildableDefinition(payload, fieldDef)) {
      continue;
    }

    const inputs = getBuilderInputs(fieldDef);
    if (!inputs.length) {
      continue;
    }

    const { hasRequiredValues, values } = getPayloadBuilderValues(payload, inputs);
    if (!hasRequiredValues) {
      continue;
    }

    const { dynamicFieldName } = buildDynamicFieldDefinition(fieldDef, values);
    if (dynamicFieldName && dynamicFieldName !== fieldDef.name) {
      return dynamicFieldName;
    }
  }

  return '';
}

function resolveSpecialPayloadFieldNames(specialFields, dependencies = getDefaultRequestMapperDependencies()) {
  if (!Array.isArray(specialFields) || !Array.isArray(dependencies.fieldDefsArray)) {
    return [];
  }

  return specialFields.reduce((resolved, payload) => {
    const resolvedFieldName = resolveFieldNameFromSpecialPayload(payload, dependencies);
    if (resolvedFieldName) {
      if (typeof dependencies.registerDynamicField === 'function') {
        dependencies.registerDynamicField(resolvedFieldName);
      }
      appendUniqueColumn(resolved, resolvedFieldName, dependencies);
    }

    return resolved;
  }, []);
}

function mapRequestOperatorToUiOperator(operator, value) {
  if (operator === '>') return 'GreaterThan';
  if (operator === '<') return 'LessThan';
  if (operator === '>=') return 'GreaterThanOrEqual';
  if (operator === '<=') return 'LessThanOrEqual';
  if (operator === '!=') return String(value || '').includes('*') ? 'DoesNotContain' : 'DoesNotEqual';
  if (operator === '=' && (String(value || '').startsWith('*') || String(value || '').endsWith('*'))) {
    return 'Contains';
  }

  return 'Equals';
}

function buildUiConfigFromRequest(request, dependencies = getDefaultRequestMapperDependencies()) {
  if (!request || typeof request !== 'object') {
    return null;
  }

  const desiredColumns = [];
  const specialFields = Array.isArray(request.special_fields)
    ? request.special_fields.map(field => (field && typeof field === 'object' ? { ...field } : field))
    : [];

  (request.display_fields || []).forEach(fieldName => appendUniqueColumn(
    desiredColumns,
    typeof dependencies.resolveFieldName === 'function'
      ? dependencies.resolveFieldName(fieldName, { trackAlias: true })
      : fieldName,
    dependencies
  ));
  resolveSpecialPayloadFieldNames(specialFields, dependencies).forEach(fieldName => appendUniqueColumn(desiredColumns, fieldName, dependencies));

  const uiConfig = {
    DesiredColumnOrder: desiredColumns,
    Filters: []
  };

  if (Array.isArray(request.filters)) {
    request.filters.forEach(filter => {
      uiConfig.Filters.push({
        FieldName: typeof dependencies.resolveFieldName === 'function'
          ? dependencies.resolveFieldName(filter.field, { trackAlias: true })
          : filter.field,
        FieldOperator: mapRequestOperatorToUiOperator(filter.operator, filter.value),
        Values: [filter.value]
      });
    });
  }

  return uiConfig;
}

function mergeUiConfigWithRequest(uiConfig, request, dependencies = getDefaultRequestMapperDependencies()) {
  const baseUiConfig = uiConfig && typeof uiConfig === 'object'
    ? {
        ...uiConfig,
        DesiredColumnOrder: Array.isArray(uiConfig.DesiredColumnOrder) ? [...uiConfig.DesiredColumnOrder] : [],
        Filters: typeof dependencies.normalizeUiConfigFilters === 'function'
          ? dependencies.normalizeUiConfigFilters(uiConfig, { trackAliases: true })
          : (Array.isArray(uiConfig.Filters) ? uiConfig.Filters.map(filter => ({ ...filter })) : [])
      }
    : {
      DesiredColumnOrder: [],
      Filters: []
    };

  resolveSpecialPayloadFieldNames(
    uiConfig?.SpecialFields || uiConfig?.specialFields || [],
    dependencies
  ).forEach(fieldName => appendUniqueColumn(baseUiConfig.DesiredColumnOrder, fieldName, dependencies));

  const requestUiConfig = buildUiConfigFromRequest(request, dependencies);
  if (!requestUiConfig) {
    return baseUiConfig;
  }

  requestUiConfig.DesiredColumnOrder.forEach(fieldName => appendUniqueColumn(baseUiConfig.DesiredColumnOrder, fieldName, dependencies));

  if (!baseUiConfig.Filters.length && requestUiConfig.Filters.length) {
    baseUiConfig.Filters = requestUiConfig.Filters.map(filter => ({ ...filter }));
  }

  return baseUiConfig;
}

export {
  appendUniqueColumn,
  buildUiConfigFromRequest,
  deriveTemplateBindings,
  escapeRegExpFallback,
  mapRequestOperatorToUiOperator,
  mergeUiConfigWithRequest,
  resolveFieldNameFromSpecialPayload,
  resolveSpecialPayloadFieldNames
};
