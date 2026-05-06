function escapeRegExpFallback(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function getDefaultRequestMapperDependencies() {
  return {
    escapeRegExp: window.escapeRegExp || escapeRegExpFallback,
    fieldDefsArray: window.fieldDefsArray,
    normalizeUiConfigFilters: window.normalizeUiConfigFilters,
    registerDynamicField: window.registerDynamicField,
    resolveFieldName: window.resolveFieldName
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

function resolveFieldNameFromSpecialPayload(payload, dependencies = getDefaultRequestMapperDependencies()) {
  const fieldDefsArray = dependencies.fieldDefsArray;
  if (!payload || typeof payload !== 'object' || !Array.isArray(fieldDefsArray)) {
    return '';
  }

  const exactMatch = fieldDefsArray.find(fieldDef => {
    if (!fieldDef || !fieldDef.special_payload) return false;
    return JSON.stringify(fieldDef.special_payload) === JSON.stringify(payload);
  });
  if (exactMatch?.name) {
    return exactMatch.name;
  }

  for (const fieldDef of fieldDefsArray) {
    if (!fieldDef?.is_buildable || !fieldDef.field_template || !fieldDef.special_payload_template) {
      continue;
    }

    const bindings = {};
    let isMatch = true;

    for (const [key, templateValue] of Object.entries(fieldDef.special_payload_template)) {
      const actualValue = payload[key];

      if (typeof templateValue === 'string' && templateValue.includes('{')) {
        if (!deriveTemplateBindings(templateValue, actualValue, bindings, dependencies.escapeRegExp || escapeRegExpFallback)) {
          isMatch = false;
          break;
        }
        continue;
      }

      if (templateValue !== actualValue) {
        isMatch = false;
        break;
      }
    }

    if (!isMatch) {
      continue;
    }

    const resolvedName = fieldDef.field_template.replace(/\{([^}]+)\}/g, (_, key) => bindings[key] || '');
    if (resolvedName && resolvedName !== fieldDef.name) {
      return resolvedName;
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
        dependencies.registerDynamicField(resolvedFieldName, {
          special_payload: payload && typeof payload === 'object' ? { ...payload } : payload
        });
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
    Filters: [],
    SpecialFields: specialFields
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
          : (Array.isArray(uiConfig.Filters) ? uiConfig.Filters.map(filter => ({ ...filter })) : []),
        SpecialFields: Array.isArray(uiConfig.SpecialFields)
          ? uiConfig.SpecialFields.map(field => (field && typeof field === 'object' ? { ...field } : field))
          : []
      }
    : {
        DesiredColumnOrder: [],
        Filters: [],
        SpecialFields: []
      };

  const requestUiConfig = buildUiConfigFromRequest(request, dependencies);
  if (!requestUiConfig) {
    return baseUiConfig;
  }

  requestUiConfig.DesiredColumnOrder.forEach(fieldName => appendUniqueColumn(baseUiConfig.DesiredColumnOrder, fieldName, dependencies));

  if (!baseUiConfig.Filters.length && requestUiConfig.Filters.length) {
    baseUiConfig.Filters = requestUiConfig.Filters.map(filter => ({ ...filter }));
  }

  if (!baseUiConfig.SpecialFields.length && requestUiConfig.SpecialFields.length) {
    baseUiConfig.SpecialFields = requestUiConfig.SpecialFields.map(field => (field && typeof field === 'object' ? { ...field } : field));
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
