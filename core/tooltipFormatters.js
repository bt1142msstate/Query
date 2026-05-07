import { OperatorLabels } from './operatorLabels.js';
import { appRuntime } from './appRuntime.js';

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
  Before: 'before',
  before: 'before',
  After: 'after',
  after: 'after',
  OnOrBefore: 'on_or_before',
  on_or_before: 'on_or_before',
  OnOrAfter: 'on_or_after',
  on_or_after: 'on_or_after'
};

function mapFieldOperatorToUiCond(operator) {
  const normalized = String(operator || '').trim();
  return FIELD_OPERATOR_TO_UI_COND[normalized] || normalized.toLowerCase();
}

function formatFieldOperatorForDisplay(operator) {
  const uiCond = mapFieldOperatorToUiCond(operator);
  switch (uiCond) {
    case 'equals': return '=';
    case 'does_not_equal': return '!=';
    case 'greater': return '>';
    case 'less': return '<';
    case 'greater_or_equal': return '>=';
    case 'less_or_equal': return '<=';
    case 'contains': return 'contains';
    case 'doesnotcontain': return 'does not contain';
    case 'between': return 'between';
    case 'before': return 'before';
    case 'after': return 'after';
    case 'on_or_before': return 'on or before';
    case 'on_or_after': return 'on or after';
    default: return String(operator || '');
  }
}

function resolveTooltipFieldName(fieldName) {
  if (typeof window !== 'undefined' && typeof appRuntime.resolveFieldName === 'function') {
    return appRuntime.resolveFieldName(fieldName);
  }
  return String(fieldName || '').trim();
}

function normalizeUiConfigFilters(input) {
  if (!input) return [];

  const normalizeFilter = filter => {
    if (!filter || typeof filter !== 'object') return null;
    const fieldName = resolveTooltipFieldName(filter.FieldName || filter.field);
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
  if (Array.isArray(input.Filters)) return input.Filters.map(normalizeFilter).filter(Boolean);
  if (Array.isArray(input.FilterGroups)) return input.FilterGroups.flatMap(group => (group.Filters || []).map(normalizeFilter).filter(Boolean));
  return [];
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getFilterValueMap(fieldDef) {
  if (!fieldDef || !fieldDef.values || fieldDef.values.length === 0) {
    return new Map();
  }

  if (typeof fieldDef.values[0] === 'object') {
    return new Map(fieldDef.values.map(value => [value.RawValue, value.Name]));
  }

  return new Map();
}

function getTooltipFilterDisplayValues(filter, fieldDef) {
  const rawValues = filter && filter.cond && filter.cond.toLowerCase() === 'between'
    ? String(filter.val || '').split('|')
    : String(filter && filter.val || '').split(',');
  const valueMap = getFilterValueMap(fieldDef);

  return rawValues
    .map(value => String(value).trim())
    .filter(Boolean)
    .map(value => valueMap.get(value) || value);
}

function formatStandardFilterTooltipHTML(filtersInput, title = '') {
  const filters = normalizeUiConfigFilters(filtersInput);
  if (!filters || filters.length === 0) return '';

  let hasFilters = false;
  let html = '<div class="tt-filter-container">';
  if (title) {
    html += '<div class="tt-filter-title">' + title + '</div>';
  }
  html += '<ul class="tt-filter-list">';

  filters.forEach(f => {
    hasFilters = true;
    const fieldDef = appRuntime.fieldDefs ? appRuntime.fieldDefs.get(f.FieldName) : null;
    const op = formatFieldOperatorForDisplay(f.FieldOperator);
    const uiCond = mapFieldOperatorToUiCond(f.FieldOperator);
    let valStr = '';

    if (f.Values && f.Values.length > 0) {
      if (uiCond === 'between' && f.Values.length >= 2) {
        valStr = '<span class="tt-val">' + escapeHtml(f.Values[0]) + '</span> <span class="tt-op">and</span> <span class="tt-val">' + escapeHtml(f.Values[1]) + '</span>';
      } else if (fieldDef && fieldDef.allowValueList && f.Values.length > 1) {
        const values = getTooltipFilterDisplayValues({ cond: uiCond, val: f.Values.join(',') }, fieldDef);
        const summary = values[0] ? escapeHtml(values[0]) + ' <span class="tt-value-more">and ' + (values.length - 1) + ' more</span>' : '';
        valStr = '<div class="tt-val-stack"><div class="tt-val tt-val-summary">' + summary + '</div></div>';
      } else {
        valStr = '<span class="tt-val">' + escapeHtml(f.Values.join(', ')) + '</span>';
      }
    }

    html += '<li class="tt-filter-item">';
    html += '  <span class="tt-field">' + escapeHtml(f.FieldName || '') + '</span>';
    html += '  <span class="tt-op">' + escapeHtml(op) + '</span>';
    html += '  ' + valStr;
    html += '</li>';
  });

  html += '</ul></div>';
  return hasFilters ? html : '';
}

function formatFieldDefinitionTooltipHTML(fieldDef, options = {}) {
  if (!fieldDef || typeof fieldDef !== 'object') {
    return '';
  }

  const normalizedType = String(fieldDef.type || '').trim().toLowerCase();
  const normalizedNumberFormat = String(fieldDef.numberFormat || fieldDef.numericFormat || '').trim().toLowerCase();
  const categoryValue = typeof fieldDef.category === 'string' ? fieldDef.category.trim() : '';
  const descSource = typeof fieldDef.desc === 'string' && fieldDef.desc.trim()
    ? fieldDef.desc
    : (typeof fieldDef.description === 'string' ? fieldDef.description : '');
  const descValue = typeof descSource === 'string' ? descSource.trim() : '';
  const title = typeof options.title === 'string' ? options.title.trim() : '';
  const isFilterable = typeof appRuntime.isFieldBackendFilterable === 'function'
    ? appRuntime.isFieldBackendFilterable(fieldDef)
    : Array.isArray(fieldDef.filters) && fieldDef.filters.length > 0;
  const filterOperators = typeof appRuntime.getFieldFilterOperators === 'function'
    ? appRuntime.getFieldFilterOperators(fieldDef)
    : (Array.isArray(fieldDef.filters) ? fieldDef.filters : []);
  const typeLabel = (() => {
    if (normalizedType === 'money' || normalizedNumberFormat === 'currency') return 'Money';
    if (normalizedType === 'date') return 'Date';
    if (normalizedType === 'boolean') return 'Boolean';
    if (normalizedType === 'number') {
      if (normalizedNumberFormat === 'year') return 'Year';
      if (normalizedNumberFormat === 'decimal') return 'Decimal';
      return 'Integer';
    }
    if (normalizedType === 'string') return 'Text';
    return normalizedType ? normalizedType.charAt(0).toUpperCase() + normalizedType.slice(1) : '';
  })();

  if (!title && !categoryValue && !descValue && !typeLabel && filterOperators.length === 0) {
    return '';
  }

  let html = '<div class="tt-filter-container tt-field-definition">';
  if (title) {
    html += '<div class="tt-filter-title">' + escapeHtml(title) + '</div>';
  }
  if (categoryValue) {
    html += '<div class="tt-field-definition-category">' + escapeHtml(categoryValue) + '</div>';
  }

  html += '<div class="tt-field-definition-meta">';
  if (typeLabel) {
    html += '<span class="tt-field-definition-badge data-type">' + escapeHtml(typeLabel) + '</span>';
  }
  html += '<span class="tt-field-definition-badge ' + (isFilterable ? 'filterable' : 'display-only') + '">';
  html += isFilterable ? 'Filterable' : 'Display only';
  html += '</span>';
  if (filterOperators.length > 0) {
    html += '<span class="tt-field-definition-meta-text">';
    html += filterOperators.length === 1 ? '1 backend operator' : filterOperators.length + ' backend operators';
    html += '</span>';
  }
  html += '</div>';

  if (descValue) {
    html += '<div class="tt-field-definition-desc">' + escapeHtml(descValue) + '</div>';
  }

  if (filterOperators.length > 0) {
    html += '<div class="tt-field-definition-operators">';
    html += filterOperators.map(operator => {
      const label = OperatorLabels.get(operator, operator);
      return '<span class="tt-field-definition-operator">' + escapeHtml(label) + '</span>';
    }).join('');
    html += '</div>';
  }

  html += '</div>';
  return html;
}

export {
  formatFieldDefinitionTooltipHTML,
  formatStandardFilterTooltipHTML
};
