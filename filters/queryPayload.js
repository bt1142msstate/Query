import { getBaseFieldName, QueryStateReaders } from '../core/queryState.js';
import { toBackendDateValue } from '../core/dateValues.js';
import { fieldDefs, isFieldBackendFilterable, resolveFieldName } from './fieldDefs.js';
import { getDateFilterValidationMessage } from './filterConditionLogic.js';

const FIELD_OPERATOR_TO_UI_COND = {
  Equals: 'equals',
  equals: 'equals',
  '=': 'equals',
  DoesNotEqual: 'does_not_equal',
  does_not_equal: 'does_not_equal',
  doesnotequal: 'does_not_equal',
  '!=': 'does_not_equal',
  GreaterThan: 'greater',
  greater: 'greater',
  '>': 'greater',
  LessThan: 'less',
  less: 'less',
  '<': 'less',
  GreaterThanOrEqual: 'greater_or_equal',
  greater_or_equal: 'greater_or_equal',
  '>=': 'greater_or_equal',
  LessThanOrEqual: 'less_or_equal',
  less_or_equal: 'less_or_equal',
  '<=': 'less_or_equal',
  Contains: 'contains',
  contains: 'contains',
  DoesNotContain: 'doesnotcontain',
  does_not_contain: 'doesnotcontain',
  doesnotcontain: 'doesnotcontain',
  Between: 'between',
  between: 'between',
  Never: 'never',
  never: 'never',
  Before: 'before',
  before: 'before',
  After: 'after',
  after: 'after',
  OnOrBefore: 'on_or_before',
  on_or_before: 'on_or_before',
  OnOrAfter: 'on_or_after',
  on_or_after: 'on_or_after'
};

const UI_COND_TO_FIELD_OPERATOR = {
  greater: 'GreaterThan',
  after: 'GreaterThan',
  less: 'LessThan',
  before: 'LessThan',
  equals: 'Equals',
  does_not_equal: 'DoesNotEqual',
  doesnotequal: 'DoesNotEqual',
  greater_or_equal: 'GreaterThanOrEqual',
  on_or_after: 'GreaterThanOrEqual',
  less_or_equal: 'LessThanOrEqual',
  on_or_before: 'LessThanOrEqual',
  between: 'Between',
  never: 'Never',
  contains: 'Contains',
  starts: 'Contains',
  starts_with: 'Contains',
  does_not_contain: 'DoesNotContain',
  doesnotcontain: 'DoesNotContain'
};

const UI_FILTER_TO_BACKEND = {
  equals: [{ operator: '=', valueTransform: value => value }],
  does_not_equal: [{ operator: '!=', valueTransform: value => value }],
  greater: [{ operator: '>', valueTransform: value => value }],
  after: [{ operator: '>', valueTransform: value => value }],
  less: [{ operator: '<', valueTransform: value => value }],
  before: [{ operator: '<', valueTransform: value => value }],
  greater_or_equal: [{ operator: '>=', valueTransform: value => value }],
  on_or_after: [{ operator: '>=', valueTransform: value => value }],
  less_or_equal: [{ operator: '<=', valueTransform: value => value }],
  on_or_before: [{ operator: '<=', valueTransform: value => value }],
  never: [{ operator: '=', valueTransform: () => 'NEVER' }],
  starts: [{ operator: '=', valueTransform: value => `${value}*` }],
  starts_with: [{ operator: '=', valueTransform: value => `${value}*` }],
  contains: [{ operator: '=', valueTransform: value => `*${value}*` }],
  does_not_contain: [{ operator: '!=', valueTransform: value => `*${value}*` }]
};
const getDisplayedFields = QueryStateReaders.getDisplayedFields.bind(QueryStateReaders);
const getActiveFilters = QueryStateReaders.getActiveFilters.bind(QueryStateReaders);

function mapFieldOperatorToUiCond(operator) {
  const normalized = String(operator || '').trim();
  return FIELD_OPERATOR_TO_UI_COND[normalized] || normalized.toLowerCase();
}

function formatFieldOperatorForDisplay(operator) {
  const uiCond = mapFieldOperatorToUiCond(operator);
  switch (uiCond) {
    case 'equals':
      return '=';
    case 'does_not_equal':
      return '!=';
    case 'greater':
      return '>';
    case 'less':
      return '<';
    case 'greater_or_equal':
      return '>=';
    case 'less_or_equal':
      return '<=';
    case 'contains':
      return 'contains';
    case 'doesnotcontain':
      return 'does not contain';
    case 'between':
      return 'between';
    case 'never':
      return 'never';
    case 'before':
      return 'before';
    case 'after':
      return 'after';
    case 'on_or_before':
      return 'on or before';
    case 'on_or_after':
      return 'on or after';
    default:
      return String(operator || '');
  }
}

function mapUiCondToFieldOperator(cond) {
  const normalized = String(cond || '').trim();
  return UI_COND_TO_FIELD_OPERATOR[normalized] || (normalized.charAt(0).toUpperCase() + normalized.slice(1));
}

function mapActiveFilterToBackend(condition, rawValue) {
  if (condition === 'between') {
    const parts = String(rawValue).split('|');
    if (parts.length >= 2) {
      return [
        { operator: '>=', value: parts[0] },
        { operator: '<=', value: parts[1] }
      ];
    }

    return [{ operator: '=', value: rawValue }];
  }

  const mappings = UI_FILTER_TO_BACKEND[String(condition || '').trim()];
  if (!mappings) {
    return [{ operator: '=', value: rawValue }];
  }

  return mappings.map(({ operator, valueTransform }) => ({
    operator,
    value: valueTransform(rawValue)
  }));
}

function splitKeyFilterValues(rawValue) {
  return String(rawValue || '')
    .split(/[\n,]+/)
    .map(value => value.trim())
    .filter(Boolean);
}

function getCanonicalPayloadFieldName(fieldName) {
  const normalizedFieldName = resolveFieldName(fieldName);

  return getBaseFieldName(normalizedFieldName);
}

function getNormalizedDisplayedFields(fields = getDisplayedFields()) {
  return [...fields]
    .map(field => getCanonicalPayloadFieldName(field))
    .filter(field => {
      const def = fieldDefs.get(field);
      return !(def && def.is_buildable);
    })
    .filter((field, index, array) => array.indexOf(field) === index);
}

function normalizeUiConfigFilters(input, options = {}) {
  if (!input) return [];

  const normalizeFilter = filter => {
    if (!filter || typeof filter !== 'object') return null;

    const rawFieldName = filter.FieldName || filter.field;
    const fieldName = resolveFieldName(rawFieldName, { trackAlias: Boolean(options.trackAliases) });
    if (!fieldName) return null;

    let values = filter.Values;
    if (!Array.isArray(values)) {
      if (values === undefined || values === null) {
        values = filter.value !== undefined ? [filter.value] : [];
      } else {
        values = [values];
      }
    }

    return {
      FieldName: fieldName,
      FieldOperator: filter.FieldOperator || filter.operator || 'Equals',
      Values: values.map(value => String(value ?? ''))
    };
  };

  if (Array.isArray(input)) {
    if (input.some(item => item && Array.isArray(item.Filters))) {
      return input.flatMap(group => (group.Filters || []).map(normalizeFilter).filter(Boolean));
    }

    return input.map(normalizeFilter).filter(Boolean);
  }

  if (Array.isArray(input.Filters)) {
    return input.Filters.map(normalizeFilter).filter(Boolean);
  }

  if (Array.isArray(input.FilterGroups)) {
    return input.FilterGroups.flatMap(group => (group.Filters || []).map(normalizeFilter).filter(Boolean));
  }

  return [];
}

function buildQueryUiConfig() {
  const backendFilters = buildBackendFilters();
  const specialFields = collectCurrentSpecialFields();

  const query = {
    DesiredColumnOrder: getNormalizedDisplayedFields(),
    Filters: backendFilters.map(filter => ({ ...filter })),
    SpecialFields: specialFields.map(field => (field && typeof field === 'object' ? { ...field } : field))
  };

  return query;
}

function collectCurrentSpecialFields() {
  const specialFields = [];

  const appendSpecialPayload = fieldName => {
    const canonicalFieldName = getCanonicalPayloadFieldName(fieldName);
    if (!canonicalFieldName) return;

    const fieldDef = fieldDefs.get(canonicalFieldName);
    if (!fieldDef || !fieldDef.special_payload) return;

    const isDuplicate = specialFields.some(existing => JSON.stringify(existing) === JSON.stringify(fieldDef.special_payload));
    if (!isDuplicate) {
      specialFields.push(fieldDef.special_payload);
    }
  };

  getDisplayedFields().forEach(appendSpecialPayload);

  Object.entries(getActiveFilters()).forEach(([fieldName, filterGroup]) => {
    if (!filterGroup || !Array.isArray(filterGroup.filters) || filterGroup.filters.length === 0) {
      return;
    }
    appendSpecialPayload(fieldName);
  });

  return specialFields;
}

function buildBackendFilters() {
  const filters = [];

  Object.entries(getActiveFilters()).forEach(([fieldName, filterGroup]) => {
    const canonicalFieldName = getCanonicalPayloadFieldName(fieldName);
    const fieldDef = fieldDefs.get(canonicalFieldName);
    if (fieldDef && fieldDef.is_buildable) return;
    if (fieldDef && !isFieldBackendFilterable(fieldDef)) return;

    (filterGroup?.filters || []).forEach(filter => {
      if (filter.val === '') return;
      if (fieldDef?.type === 'date' && getDateFilterValidationMessage(filter, canonicalFieldName)) {
        return;
      }

      if (fieldDef && fieldDef.allowValueList && filter.cond === 'equals') {
        const keyValues = splitKeyFilterValues(filter.val);
        filters.push({
          field: canonicalFieldName,
          operator: '=',
          value: keyValues.length > 1 ? keyValues : (keyValues[0] || '')
        });
        return;
      }

      mapActiveFilterToBackend(filter.cond, filter.val).forEach(({ operator, value }) => {
        // Convert M/D/YYYY display values to YYYYMMDD for date fields
        let backendValue = value;
        if (fieldDef && fieldDef.type === 'date') {
          backendValue = toBackendDateValue(value);
        }
        filters.push({
          field: canonicalFieldName,
          operator,
          value: backendValue
        });
      });
    });
  });

  return filters;
}

function buildBackendQueryPayload(queryName = '') {
  const standardDisplayFields = [];
  const specialFields = collectCurrentSpecialFields();

  getNormalizedDisplayedFields().forEach(field => {
    const canonicalFieldName = getCanonicalPayloadFieldName(field);
    const fieldDef = fieldDefs.get(canonicalFieldName);
    if (fieldDef && fieldDef.special_payload) {
      return;
    }

    if (canonicalFieldName && !standardDisplayFields.includes(canonicalFieldName)) {
      standardDisplayFields.push(canonicalFieldName);
    }
  });

  const payload = {
    action: 'run',
    name: queryName || undefined,
    filters: buildBackendFilters(),
    display_fields: standardDisplayFields,
    special_fields: specialFields.map(field => (field && typeof field === 'object' ? { ...field } : field))
  };

  return payload;
}

export {
  buildBackendFilters,
  buildBackendQueryPayload,
  buildQueryUiConfig,
  collectCurrentSpecialFields,
  formatFieldOperatorForDisplay,
  getNormalizedDisplayedFields,
  mapFieldOperatorToUiCond,
  mapUiCondToFieldOperator,
  normalizeUiConfigFilters
};
