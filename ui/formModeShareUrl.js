import { encodeSpec, getInputParamKeys } from './formModeSpec.js';

function isShareableFormSpec(spec) {
  if (!spec || typeof spec !== 'object') {
    return false;
  }

  const hasColumns = Array.isArray(spec.columns) && spec.columns.length > 0;
  const hasInputs = Array.isArray(spec.inputs) && spec.inputs.length > 0;
  const hasLockedFilters = Array.isArray(spec.lockedFilters) && spec.lockedFilters.length > 0;
  return hasColumns || hasInputs || hasLockedFilters;
}

function buildClearedBrowserUrl(currentUrl) {
  const nextUrl = new URL(currentUrl);
  nextUrl.search = '';
  return nextUrl.toString();
}

function getFieldDefinition(fieldName, options = {}) {
  if (typeof options.getFieldDef === 'function') {
    return options.getFieldDef(fieldName);
  }

  if (options.fieldDefs && typeof options.fieldDefs.get === 'function') {
    return options.fieldDefs.get(fieldName);
  }

  return null;
}

function getShareInputValues(inputSpec, options = {}) {
  if (typeof options.getInputValues !== 'function') {
    return [];
  }

  const rawValues = options.getInputValues(inputSpec);
  return Array.isArray(rawValues)
    ? rawValues.map(value => String(value ?? ''))
    : [];
}

function buildFormShareUrl(currentUrl, spec, options = {}) {
  if (!isShareableFormSpec(spec)) {
    return '';
  }

  const nextUrl = new URL(currentUrl);
  nextUrl.search = '';
  nextUrl.searchParams.set('form', encodeSpec(spec));
  nextUrl.searchParams.set('limited', '1');

  (Array.isArray(spec.inputs) ? spec.inputs : []).forEach(inputSpec => {
    const fieldDef = inputSpec.field ? getFieldDefinition(inputSpec.field, options) : null;
    const isMultiValue = typeof options.supportsMultipleValues === 'function'
      ? options.supportsMultipleValues(inputSpec, fieldDef)
      : Boolean(inputSpec.multiple);
    const rawValues = getShareInputValues(inputSpec, options);
    const keys = getInputParamKeys(inputSpec);

    if (inputSpec.operator === 'between' && keys.length >= 2) {
      rawValues.slice(0, 2).forEach((value, index) => {
        if (value) {
          nextUrl.searchParams.set(keys[index], value);
        }
      });
      return;
    }

    const values = rawValues.filter(value => value !== '');
    if (values.length === 0) return;

    if (isMultiValue) {
      nextUrl.searchParams.set(inputSpec.key, values.join(','));
    } else {
      nextUrl.searchParams.set(inputSpec.key, values[0]);
    }
  });

  const tableName = String(options.tableName || '').trim();
  if (tableName) {
    nextUrl.searchParams.set('tableName', tableName);
  }

  return nextUrl.toString();
}

export {
  buildClearedBrowserUrl,
  buildFormShareUrl,
  isShareableFormSpec
};
