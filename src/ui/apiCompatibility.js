const DEFAULT_COMPATIBILITY_TIMEOUT_MS = 30000;
const DEFAULT_TEXT_LIMIT = 512 * 1024;
const OPTIONAL_ACTIONS = [
  {
    id: 'status',
    label: 'Query status',
    payload: () => ({ action: 'status' }),
    supportedDetail: () => 'Status endpoint responded.'
  },
  {
    id: 'cancel',
    label: 'Cancellation',
    payload: () => ({ action: 'cancel', id: 'query_0_0000', query_id: 'query_0_0000' }),
    recognizedErrorPattern: /query not found|valid query_id|required|already marked/i,
    supportedDetail: () => 'Cancel endpoint responded.'
  },
  {
    id: 'get_results',
    label: 'Saved results',
    payload: () => ({ action: 'get_results', id: 'query_0_0000', query_id: 'query_0_0000' }),
    recognizedErrorPattern: /query not found|result file not found|valid query_id|required/i,
    supportedDetail: () => 'Saved-result endpoint responded.'
  },
  {
    id: 'list_templates',
    label: 'Templates',
    payload: () => ({ action: 'list_templates' }),
    supportedDetail: () => 'Template endpoint responded.'
  }
];

function createCompatibilityCheck(id, label, status, detail = '') {
  return {
    detail,
    id,
    label,
    status
  };
}

function getStatusRank(status) {
  switch (status) {
    case 'failed':
      return 4;
    case 'missing':
      return 3;
    case 'warning':
      return 2;
    case 'supported':
      return 1;
    default:
      return 0;
  }
}

function getFieldName(field) {
  return String(field?.name || field?.id || field?.label || '').trim();
}

function fieldLooksBuildable(field) {
  return Boolean(field?.builder);
}

function fieldLooksMultiValue(field) {
  const metadata = `${field?.name || ''} ${field?.label || ''} ${field?.desc || ''} ${field?.description || ''}`.toLowerCase();
  return Boolean(
    field?.multiValue
    || field?.multi_value
    || field?.returnsMultiple
    || field?.returns_multiple
    || field?.arrayValues
    || field?.array_values
    || metadata.includes('multi-value')
    || metadata.includes('multiple values')
  );
}

function fieldLooksExpensive(field) {
  return Boolean(field?.performanceWarning || field?.retrievalWarning);
}

function scoreCompatibilityField(field, name) {
  const metadata = `${name || ''} ${field?.desc || ''} ${field?.description || ''} ${field?.category || ''} ${field?.type || ''}`.toLowerCase();
  let score = 0;

  score += fieldLooksExpensive(field) ? -20 : 10;
  score += fieldLooksMultiValue(field) ? 3 : 0;
  score += field?.allowValueList ? 4 : 0;
  score += /\b(?:key|identifier|barcode|id)\b/u.test(metadata) ? 8 : 0;
  score += /\bitem\b/u.test(metadata) ? 2 : 0;
  score += /\bstring\b/u.test(metadata) ? 1 : 0;
  score += Array.isArray(field?.filters) && field.filters.length <= 2 ? 1 : 0;

  return score;
}

function selectCompatibilityDisplayFields(fields = [], options = {}) {
  const maxFields = Math.max(1, Number(options.maxFields) || 1);
  const usableFields = fields
    .map(field => ({
      field,
      name: getFieldName(field)
    }))
    .filter(({ field, name }) => name && !fieldLooksBuildable(field));

  const selected = [];
  const addField = name => {
    if (name && !selected.includes(name) && selected.length < maxFields) {
      selected.push(name);
    }
  };

  const scoredFields = usableFields
    .map(entry => ({
      ...entry,
      score: scoreCompatibilityField(entry.field, entry.name)
    }))
    .sort((left, right) => right.score - left.score || left.name.localeCompare(right.name));

  const multiValueField = scoredFields.find(({ field }) => fieldLooksMultiValue(field));
  if (multiValueField) {
    addField(multiValueField.name);
  }

  scoredFields.forEach(({ name }) => addField(name));

  return selected;
}

function buildCompatibilityRunPayload(fields = [], options = {}) {
  return {
    action: 'run',
    compatibility_check: true,
    display_fields: selectCompatibilityDisplayFields(fields, options),
    filters: [],
    limit: Number(options.limit) || 5,
    max_rows: Number(options.maxRows) || 5,
    name: 'API compatibility check',
    result_format: 'jsonl'
  };
}

function extractFields(data) {
  if (Array.isArray(data)) {
    return data;
  }

  if (Array.isArray(data?.fields)) {
    return data.fields;
  }

  return [];
}

function parseJsonPayload(text) {
  if (!String(text || '').trim()) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch (_error) {
    return { error: text };
  }
}

function parseJsonlEvents(text, options = {}) {
  const errors = [];
  const events = [];
  let ignoredTruncatedLine = false;
  const lines = String(text || '')
    .split(/\r?\n/u)
    .map(line => line.trim())
    .filter(Boolean);

  lines.forEach((line, index) => {
    try {
      events.push(JSON.parse(line));
    } catch (error) {
      if (options.truncated && index === lines.length - 1) {
        ignoredTruncatedLine = true;
        return;
      }
      errors.push(`Line ${index + 1}: ${error.message}`);
    }
  });

  return { errors, events, ignoredTruncatedLine };
}

function validateJsonlEvents(events = [], options = {}) {
  const checks = [];
  const truncated = Boolean(options.truncated);
  const metaEvent = events[0] || null;
  const doneIndex = events.findIndex(event => event?.type === 'done');
  const rowEvents = events.filter(event => event?.type === 'row');
  const invalidRow = rowEvents.find(event => !Array.isArray(event.values));
  const secondMetaIndex = events.findIndex((event, index) => index > 0 && event?.type === 'meta');
  const eventsAfterDone = doneIndex === -1 ? [] : events.slice(doneIndex + 1);
  const rowsWithArrayValues = rowEvents.filter(event => event.values.some(value => Array.isArray(value)));

  if (!events.length) {
    return [
      createCompatibilityCheck('jsonl-stream', 'JSONL stream', 'failed', 'No JSONL events were returned.'),
      createCompatibilityCheck('jsonl-order', 'Event order', 'failed', 'Expected meta, row, and done events.'),
      createCompatibilityCheck('multi-values', 'Multi-value arrays', 'warning', 'No rows were available to inspect.')
    ];
  }

  const metaIsValid = metaEvent?.type === 'meta'
    && metaEvent.version === 1
    && metaEvent.format === 'jsonl'
    && Array.isArray(metaEvent.columns);

  checks.push(createCompatibilityCheck(
    'jsonl-stream',
    'JSONL stream',
    metaIsValid ? 'supported' : 'failed',
    metaIsValid
      ? `Protocol version ${metaEvent.version}; ${metaEvent.columns.length} column${metaEvent.columns.length === 1 ? '' : 's'}.`
      : 'First event must be a meta event with version 1, format jsonl, and columns.'
  ));

  const hasCanonicalOrder = metaIsValid
    && secondMetaIndex === -1
    && !invalidRow
    && doneIndex === events.length - 1
    && eventsAfterDone.length === 0;

  checks.push(createCompatibilityCheck(
    'jsonl-order',
    'Event order',
    hasCanonicalOrder ? 'supported' : truncated ? 'warning' : 'failed',
    hasCanonicalOrder
      ? `Received ${rowEvents.length} row event${rowEvents.length === 1 ? '' : 's'} before done.`
      : truncated
        ? 'Sample limit was reached before a done event was observed.'
        : 'Expected meta first, row values as arrays, and done last.'
  ));

  checks.push(createCompatibilityCheck(
    'multi-values',
    'Multi-value arrays',
    rowsWithArrayValues.length > 0 ? 'supported' : 'warning',
    rowsWithArrayValues.length > 0
      ? `Observed array values in ${rowsWithArrayValues.length} row event${rowsWithArrayValues.length === 1 ? '' : 's'}.`
      : rowEvents.length
        ? 'Rows streamed, but this sample did not include array-valued cells.'
        : 'No row events were available to inspect.'
  ));

  return checks;
}

function summarizeCompatibilityChecks(checks = []) {
  const summary = checks.reduce((acc, check) => {
    acc[check.status] = (acc[check.status] || 0) + 1;
    if (getStatusRank(check.status) > getStatusRank(acc.worstStatus)) {
      acc.worstStatus = check.status;
    }
    return acc;
  }, {
    failed: 0,
    missing: 0,
    supported: 0,
    warning: 0,
    worstStatus: 'supported'
  });

  summary.total = checks.length;
  return summary;
}

function getRequestErrorDetail(error) {
  if (error?.name === 'AbortError') {
    return 'Request timed out.';
  }

  return error?.message || 'Request failed.';
}

async function requestJson(apiUrl, payload, options = {}) {
  const timeoutMs = Number(options.timeoutMs) || DEFAULT_COMPATIBILITY_TIMEOUT_MS;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(apiUrl, {
      body: JSON.stringify(payload),
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json'
      },
      method: 'POST',
      signal: controller.signal
    });
    const text = await response.text();
    const data = parseJsonPayload(text);

    if (!response.ok) {
      throw new Error(data?.error || `Server error: ${response.status} ${response.statusText}`);
    }

    return { data, response, text };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function readLimitedResponseText(response, options = {}) {
  const maxChars = Number(options.maxChars) || DEFAULT_TEXT_LIMIT;
  if (!response.body || typeof response.body.getReader !== 'function') {
    const text = await response.text();
    return {
      text: text.slice(0, maxChars),
      truncated: text.length > maxChars
    };
  }

  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  let text = '';
  let truncated = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    text += decoder.decode(value, { stream: true });
    if (text.length >= maxChars) {
      truncated = true;
      await reader.cancel();
      break;
    }
  }

  text += decoder.decode();
  return {
    text: text.slice(0, maxChars),
    truncated
  };
}

async function requestText(apiUrl, payload, options = {}) {
  const timeoutMs = Number(options.timeoutMs) || DEFAULT_COMPATIBILITY_TIMEOUT_MS;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(apiUrl, {
      body: JSON.stringify(payload),
      credentials: 'same-origin',
      headers: {
        Accept: 'application/x-ndjson, text/plain;q=0.9, */*;q=0.1',
        'Content-Type': 'application/json'
      },
      method: 'POST',
      signal: controller.signal
    });
    const { text, truncated } = await readLimitedResponseText(response, options);

    if (!response.ok) {
      const payloadText = parseJsonPayload(text);
      throw new Error(payloadText?.error || `Server error: ${response.status} ${response.statusText}`);
    }

    return { response, text, truncated };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function probeOptionalAction(apiUrl, actionConfig, options = {}) {
  try {
    const { data } = await requestJson(apiUrl, actionConfig.payload(), options);
    const errorText = String(data?.error || '').trim();
    if (errorText && actionConfig.recognizedErrorPattern?.test(errorText)) {
      return createCompatibilityCheck(
        `optional-${actionConfig.id}`,
        actionConfig.label,
        'supported',
        'Endpoint recognized the action; a real query id is needed for a live workflow check.'
      );
    }
    if (data?.error || data?.unsupported) {
      throw new Error(data.error || 'Action is not supported.');
    }
    return createCompatibilityCheck(
      `optional-${actionConfig.id}`,
      actionConfig.label,
      'supported',
      actionConfig.supportedDetail()
    );
  } catch (error) {
    return createCompatibilityCheck(
      `optional-${actionConfig.id}`,
      actionConfig.label,
      'missing',
      getRequestErrorDetail(error)
    );
  }
}

async function runApiCompatibilityCheck(apiUrl, options = {}) {
  const checks = [];
  let fields = [];

  try {
    const { data } = await requestJson(apiUrl, { action: 'get_fields' }, options);
    fields = extractFields(data);
    checks.push(createCompatibilityCheck(
      'cors',
      'CORS / browser access',
      'supported',
      'Browser request completed.'
    ));
    checks.push(createCompatibilityCheck(
      'get-fields',
      'Field metadata',
      fields.length ? 'supported' : 'failed',
      fields.length
        ? `Loaded ${fields.length} field${fields.length === 1 ? '' : 's'}.`
        : 'The API responded, but no fields were returned.'
    ));
  } catch (error) {
    const detail = getRequestErrorDetail(error);
    checks.push(createCompatibilityCheck('cors', 'CORS / browser access', 'failed', detail));
    checks.push(createCompatibilityCheck('get-fields', 'Field metadata', 'failed', detail));
    return {
      checks,
      fields,
      summary: summarizeCompatibilityChecks(checks)
    };
  }

  try {
    const runPayload = buildCompatibilityRunPayload(fields, options);
    const { text, truncated } = await requestText(apiUrl, runPayload, options);
    const { errors, events, ignoredTruncatedLine } = parseJsonlEvents(text, { truncated });
    if (errors.length) {
      checks.push(createCompatibilityCheck('jsonl-stream', 'JSONL stream', 'failed', errors.slice(0, 2).join(' ')));
      checks.push(createCompatibilityCheck('jsonl-order', 'Event order', 'failed', 'Stream contained invalid JSON lines.'));
      checks.push(createCompatibilityCheck('multi-values', 'Multi-value arrays', 'warning', 'No valid rows were available to inspect.'));
    } else {
      checks.push(...validateJsonlEvents(events, { ignoredTruncatedLine, truncated }));
    }
  } catch (error) {
    const detail = getRequestErrorDetail(error);
    checks.push(createCompatibilityCheck('jsonl-stream', 'JSONL stream', 'failed', detail));
    checks.push(createCompatibilityCheck('jsonl-order', 'Event order', 'failed', 'Run action did not return a valid JSONL stream.'));
    checks.push(createCompatibilityCheck('multi-values', 'Multi-value arrays', 'warning', 'No run stream was available to inspect.'));
  }

  for (const optionalAction of OPTIONAL_ACTIONS) {
    checks.push(await probeOptionalAction(apiUrl, optionalAction, options));
  }

  return {
    checks,
    fields,
    summary: summarizeCompatibilityChecks(checks)
  };
}

const ApiCompatibility = Object.freeze({
  buildCompatibilityRunPayload,
  runApiCompatibilityCheck,
  selectCompatibilityDisplayFields,
  summarizeCompatibilityChecks,
  validateJsonlEvents
});

export {
  ApiCompatibility,
  buildCompatibilityRunPayload,
  createCompatibilityCheck,
  extractFields,
  parseJsonlEvents,
  runApiCompatibilityCheck,
  selectCompatibilityDisplayFields,
  summarizeCompatibilityChecks,
  validateJsonlEvents
};
