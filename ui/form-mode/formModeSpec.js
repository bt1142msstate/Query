import { mapFieldOperatorToUiCond } from '../../filters/queryPayload.js';

function slugify(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeStringArray(value) {
  if (Array.isArray(value)) {
    return value.map(item => String(item ?? '').trim()).filter(Boolean);
  }

  if (typeof value === 'string') {
    return value.split(',').map(item => item.trim()).filter(Boolean);
  }

  return [];
}

function parseBooleanFlag(value) {
  if (typeof value === 'boolean') {
    return value;
  }

  const normalized = String(value ?? '').trim().toLowerCase();
  return normalized === '1'
    || normalized === 'true'
    || normalized === 'yes'
    || normalized === 'on'
    || normalized === 'limited';
}

function resolveLimitedView(rawSpec, searchParams) {
  if (searchParams instanceof URLSearchParams) {
    const viewValue = searchParams.get('view');
    if (String(viewValue || '').trim().toLowerCase() === 'limited') {
      return true;
    }

    if (searchParams.has('limited')) {
      return parseBooleanFlag(searchParams.get('limited'));
    }

    if (searchParams.has('limitedView')) {
      return parseBooleanFlag(searchParams.get('limitedView'));
    }
  }

  if (!rawSpec || typeof rawSpec !== 'object') {
    return false;
  }

  if (Object.prototype.hasOwnProperty.call(rawSpec, 'limitedView')) {
    return parseBooleanFlag(rawSpec.limitedView);
  }

  if (Object.prototype.hasOwnProperty.call(rawSpec, 'limited')) {
    return parseBooleanFlag(rawSpec.limited);
  }

  if (String(rawSpec.viewMode || '').trim().toLowerCase() === 'limited') {
    return true;
  }

  return false;
}

function decodeBase64Url(rawValue) {
  const normalized = String(rawValue || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function encodeBase64Url(rawValue) {
  const bytes = new TextEncoder().encode(String(rawValue || ''));
  let binary = '';
  bytes.forEach(byte => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeSpec(rawValue) {
  if (!rawValue) return null;

  try {
    if (rawValue.trim().startsWith('{')) {
      return JSON.parse(rawValue);
    }
  } catch (_) {}

  try {
    return JSON.parse(decodeURIComponent(rawValue));
  } catch (_) {}

  return JSON.parse(decodeBase64Url(rawValue));
}

function encodeSpec(spec) {
  return encodeBase64Url(JSON.stringify(spec));
}

function interpolateValue(template, bindings) {
  if (template === undefined || template === null) return '';
  return String(template).replace(/\{([^}]+)\}/g, (_, key) => {
    const binding = bindings[key];
    if (Array.isArray(binding)) {
      return binding.join(',');
    }
    return binding === undefined || binding === null ? '' : String(binding);
  });
}

function splitListValues(rawValue) {
  if (Array.isArray(rawValue)) {
    return rawValue.map(value => String(value ?? '').trim()).filter(Boolean);
  }

  return String(rawValue || '')
    .split(/[\n,]+/)
    .map(value => value.trim())
    .filter(Boolean);
}

function getInputParamKeys(inputSpec) {
  if (!inputSpec) {
    return [];
  }

  const explicitKeys = Array.isArray(inputSpec.keys)
    ? inputSpec.keys.map(key => String(key || '').trim()).filter(Boolean)
    : [];

  if (explicitKeys.length > 0) {
    return explicitKeys;
  }

  const baseKey = String(inputSpec.key || '').trim();
  if (!baseKey) {
    return [];
  }

  if (inputSpec.operator === 'between') {
    return [baseKey, `${baseKey}-end`];
  }

  return [baseKey];
}

function normalizeInputSpec(input, index) {
  if (!input || typeof input !== 'object') return null;

  const fieldName = String(input.field || input.fieldName || '').trim();
  if (!fieldName) return null;

  const operator = mapFieldOperatorToUiCond(input.operator || input.cond || 'equals');
  const keys = Array.isArray(input.keys)
    ? input.keys.map(key => String(key || '').trim()).filter(Boolean)
    : [];
  const defaultKey = slugify(input.label || fieldName || `field-${index + 1}`) || `field-${index + 1}`;

  return {
    key: String(input.key || input.param || keys[0] || defaultKey).trim(),
    keys,
    field: fieldName,
    source: String(input.source || '').trim(),
    label: String(input.label || fieldName).trim(),
    help: String(input.help || input.description || '').trim(),
    placeholder: String(input.placeholder || '').trim(),
    operator,
    required: Boolean(input.required),
    multiple: Boolean(input.multiple),
    hidden: Boolean(input.hidden),
    type: String(input.type || '').trim(),
    defaultValue: input.default !== undefined ? input.default : input.defaultValue,
    options: Array.isArray(input.options) ? input.options.slice() : null
  };
}

function normalizeLockedFilter(filter) {
  if (!filter || typeof filter !== 'object') return null;
  const fieldName = String(filter.field || filter.fieldName || '').trim();
  if (!fieldName) return null;

  const operator = mapFieldOperatorToUiCond(filter.operator || filter.cond || 'equals');

  return {
    field: fieldName,
    operator,
    value: filter.value,
    values: Array.isArray(filter.values) ? filter.values.slice() : null
  };
}

function normalizeSpec(rawSpec) {
  if (!rawSpec || typeof rawSpec !== 'object') return null;

  const inputs = Array.isArray(rawSpec.inputs)
    ? rawSpec.inputs.map(normalizeInputSpec).filter(Boolean)
    : [];

  const lockedFilters = Array.isArray(rawSpec.lockedFilters)
    ? rawSpec.lockedFilters.map(normalizeLockedFilter).filter(Boolean)
    : [];

  const columns = normalizeStringArray(
    rawSpec.columns || rawSpec.displayFields || rawSpec.display_fields || rawSpec.fields
  );

  const hasTitle = Object.prototype.hasOwnProperty.call(rawSpec, 'title') || Object.prototype.hasOwnProperty.call(rawSpec, 'name');
  const hasQueryName = Object.prototype.hasOwnProperty.call(rawSpec, 'queryName')
    || Object.prototype.hasOwnProperty.call(rawSpec, 'tableName')
    || Object.prototype.hasOwnProperty.call(rawSpec, 'title')
    || Object.prototype.hasOwnProperty.call(rawSpec, 'name');

  return {
    title: hasTitle ? String(rawSpec.title ?? rawSpec.name ?? '').trim() : '',
    description: String(rawSpec.description || rawSpec.helpText || '').trim(),
    queryName: hasQueryName ? String(rawSpec.queryName ?? rawSpec.tableName ?? rawSpec.title ?? rawSpec.name ?? '').trim() : '',
    columns,
    inputs,
    lockedFilters,
    limitedView: resolveLimitedView(rawSpec)
  };
}

function cloneSpec(spec) {
  if (!spec || typeof spec !== 'object') {
    return null;
  }

  try {
    return normalizeSpec(JSON.parse(JSON.stringify(spec)));
  } catch (_) {
    return normalizeSpec(spec);
  }
}

export {
  cloneSpec,
  decodeSpec,
  encodeSpec,
  getInputParamKeys,
  interpolateValue,
  normalizeSpec,
  resolveLimitedView,
  slugify,
  splitListValues
};
