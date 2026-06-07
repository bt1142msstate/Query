import { RESULT_VIEW_URL_PARAM } from './resultViewState.js';

const RESULT_QUERY_URL_PARAM = 'result';
const FORM_QUERY_URL_PARAM = 'form';
const LIMITED_FORM_QUERY_URL_PARAM = 'limited';
const TABLE_NAME_QUERY_URL_PARAM = 'tableName';
const LEGACY_FORM_VIEW_QUERY_URL_PARAMS = ['mode', 'view', 'limitedView'];

function parseQueryUrlBooleanFlag(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  return normalized === ''
    || normalized === '1'
    || normalized === 'true'
    || normalized === 'yes'
    || normalized === 'on'
    || normalized === 'limited';
}

function hasLimitedFormUrlFlag(searchParams) {
  if (!(searchParams instanceof URLSearchParams)) {
    return false;
  }

  if (String(searchParams.get('view') || '').trim().toLowerCase() === 'limited') {
    return true;
  }

  if (String(searchParams.get('mode') || '').trim().toLowerCase() === 'limited') {
    return true;
  }

  if (searchParams.has(LIMITED_FORM_QUERY_URL_PARAM)) {
    return parseQueryUrlBooleanFlag(searchParams.get(LIMITED_FORM_QUERY_URL_PARAM));
  }

  if (searchParams.has('limitedView')) {
    return parseQueryUrlBooleanFlag(searchParams.get('limitedView'));
  }

  return false;
}

function decodeBase64UrlJson(rawValue) {
  const normalized = String(rawValue || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

function encodeBase64UrlJson(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = '';
  bytes.forEach(byte => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeFormSpecParam(rawValue) {
  const value = String(rawValue || '').trim();
  if (!value) {
    return null;
  }

  try {
    if (value.startsWith('{')) {
      return JSON.parse(value);
    }
  } catch (_error) {}

  try {
    return JSON.parse(decodeURIComponent(value));
  } catch (_error) {}

  try {
    return decodeBase64UrlJson(value);
  } catch (_error) {
    return null;
  }
}

function buildSerializableFormSpec(spec) {
  if (!spec || typeof spec !== 'object') {
    return null;
  }

  const nextSpec = { ...spec };
  delete nextSpec.limited;
  delete nextSpec.limitedView;
  delete nextSpec.viewMode;
  return nextSpec;
}

function getInputParamKeys(inputSpec) {
  if (!inputSpec || typeof inputSpec !== 'object') {
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

function buildCanonicalFormSearchParams(searchParams) {
  const decodedSpec = decodeFormSpecParam(searchParams.get(FORM_QUERY_URL_PARAM));
  const serializableSpec = buildSerializableFormSpec(decodedSpec);
  if (!serializableSpec) {
    return null;
  }

  const nextParams = new URLSearchParams();
  nextParams.set(FORM_QUERY_URL_PARAM, encodeBase64UrlJson(serializableSpec));

  if (searchParams.has(TABLE_NAME_QUERY_URL_PARAM)) {
    nextParams.set(TABLE_NAME_QUERY_URL_PARAM, searchParams.get(TABLE_NAME_QUERY_URL_PARAM));
  }

  if (searchParams.has(RESULT_VIEW_URL_PARAM)) {
    nextParams.set(RESULT_VIEW_URL_PARAM, searchParams.get(RESULT_VIEW_URL_PARAM));
  }

  (Array.isArray(decodedSpec.inputs) ? decodedSpec.inputs : []).forEach(inputSpec => {
    getInputParamKeys(inputSpec).forEach(paramName => {
      if (searchParams.has(paramName)) {
        nextParams.set(paramName, searchParams.get(paramName));
      }
    });
  });

  return nextParams;
}

function normalizeResultQueryUrl(currentUrl, options = {}) {
  const nextUrl = new URL(currentUrl);
  const hasForm = nextUrl.searchParams.has(FORM_QUERY_URL_PARAM);
  const limited = hasForm && hasLimitedFormUrlFlag(nextUrl.searchParams);
  const resultQueryId = String(options.resultQueryId || '').trim();
  const clearResult = options.clearResult === true;
  const existingResultViewParam = String(nextUrl.searchParams.get(RESULT_VIEW_URL_PARAM) || '').trim();
  const resultViewParam = options.resultViewParam === undefined
    ? existingResultViewParam
    : String(options.resultViewParam || '').trim();

  if (!hasForm) {
    nextUrl.search = '';
  } else {
    const canonicalFormParams = buildCanonicalFormSearchParams(nextUrl.searchParams);
    if (canonicalFormParams) {
      nextUrl.search = canonicalFormParams.toString();
    } else {
      LEGACY_FORM_VIEW_QUERY_URL_PARAMS.forEach(paramName => {
        nextUrl.searchParams.delete(paramName);
      });
    }

    if (limited) {
      nextUrl.searchParams.set(LIMITED_FORM_QUERY_URL_PARAM, '1');
    } else {
      nextUrl.searchParams.delete(LIMITED_FORM_QUERY_URL_PARAM);
    }
  }

  if (resultQueryId && !clearResult) {
    nextUrl.searchParams.set(RESULT_QUERY_URL_PARAM, resultQueryId);
    if (resultViewParam) {
      nextUrl.searchParams.set(RESULT_VIEW_URL_PARAM, resultViewParam);
    } else {
      nextUrl.searchParams.delete(RESULT_VIEW_URL_PARAM);
    }
  } else if (clearResult) {
    nextUrl.searchParams.delete(RESULT_QUERY_URL_PARAM);
    nextUrl.searchParams.delete(RESULT_VIEW_URL_PARAM);
  }

  return nextUrl.toString();
}

export {
  FORM_QUERY_URL_PARAM,
  hasLimitedFormUrlFlag,
  LIMITED_FORM_QUERY_URL_PARAM,
  normalizeResultQueryUrl,
  parseQueryUrlBooleanFlag,
  RESULT_QUERY_URL_PARAM,
  RESULT_VIEW_URL_PARAM,
  TABLE_NAME_QUERY_URL_PARAM
};
