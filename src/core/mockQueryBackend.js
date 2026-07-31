const DEMO_API_PATH = '/demo-api';
const DEMO_TOKEN = 'query-project-demo-session';

let dataPromise = null;
let bibDataPromise = null;

function loadDemoData() {
  if (!dataPromise) {
    const url = new URL('../../assets/demo/query-data.json', import.meta.url);
    dataPromise = globalThis.fetch(url).then(response => {
      if (!response.ok) throw new Error('The sample catalog could not be loaded.');
      return response.json();
    });
  }
  return dataPromise;
}

function loadDemoBibData() {
  if (!bibDataPromise) {
    const url = new URL('../../assets/demo/oclc-bib-data.json', import.meta.url);
    bibDataPromise = globalThis.fetch(url).then(response => {
      if (!response.ok) throw new Error('The sample bibliographic records could not be loaded.');
      return response.json();
    });
  }
  return bibDataPromise;
}

function isDemoApiUrl(url) {
  try {
    return new URL(String(url), globalThis.location?.href || 'https://example.invalid/').pathname.endsWith(DEMO_API_PATH);
  } catch (_) {
    return false;
  }
}

function json(payload, status = 200) {
  return Response.json(payload, { status, headers: { 'Cache-Control': 'no-store' } });
}

function isAuthenticated(options = {}) {
  const headers = new Headers(options.headers || {});
  return headers.get('X-Query-Session') === DEMO_TOKEN;
}

function wildcardMatch(actual, expected) {
  const escaped = String(expected).replace(/[|\\{}()[\]^$+?.]/gu, '\\$&').replaceAll('*', '.*');
  return new RegExp(`^${escaped}$`, 'iu').test(String(actual ?? ''));
}

function matchesFilter(row, filter = {}) {
  const values = Array.isArray(row[filter.field]) ? row[filter.field] : [row[filter.field]];
  const expected = filter.value ?? '';
  const operator = filter.operator || '=';
  const matches = values.some(value => wildcardMatch(value, expected));
  if (operator === '!=') return !matches;
  if (operator === '>') return values.some(value => String(value) > String(expected));
  if (operator === '>=') return values.some(value => String(value) >= String(expected));
  if (operator === '<') return values.some(value => String(value) < String(expected));
  if (operator === '<=') return values.some(value => String(value) <= String(expected));
  return matches;
}

function runQuery(payload, data) {
  const fields = data.fields || [];
  const rows = (data.rows || []).map(values => Object.fromEntries(fields.map((field, index) => [field.name, values[index]])));
  const columns = payload.display_fields?.length ? payload.display_fields : data.defaultColumns;
  const limit = Math.max(1, Math.min(Number(payload.limit || payload.max_rows || rows.length), rows.length));
  const resultRows = rows.filter(row => (payload.filters || []).every(filter => matchesFilter(row, filter))).slice(0, limit);
  const queryId = `demo-${Date.now()}`;
  const events = [
    { type: 'meta', version: 1, format: 'jsonl', query_id: queryId, columns },
    ...resultRows.map(row => ({ type: 'row', values: columns.map(column => row[column] ?? '') })),
    { type: 'done', rows: resultRows.length }
  ];
  return new Response(`${events.map(event => JSON.stringify(event)).join('\n')}\n`, {
    status: 200,
    headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'X-Query-Id': queryId }
  });
}

function searchDemoBibs(payload, data) {
  const query = String(payload.query || '').trim().toLocaleLowerCase();
  const lookupType = payload.lookup_type || 'title';
  const limit = Math.max(1, Math.min(Number(payload.limit || 20), 25));
  const records = (data.records || []).filter(record => {
    const summary = record.local?.summary || {};
    if (lookupType === 'catalog_key') return String(summary.catalog_key || '') === query;
    if (lookupType === 'item_id') {
      return (record.item_ids || []).some(itemId => String(itemId).toLocaleLowerCase() === query);
    }
    return [
      summary.title,
      summary.creator,
      summary.isbn?.join(' ')
    ].some(value => String(value || '').toLocaleLowerCase().includes(query));
  }).slice(0, limit);

  return {
    lookup: { type: lookupType, query: payload.query || '' },
    results: records.map(record => structuredClone(record.local.summary)),
    returned: records.length,
    truncated: 0
  };
}

function compareDemoBib(payload, data) {
  const record = (data.records || []).find(candidate => (
    String(candidate.local?.summary?.catalog_key || '') === String(payload.catalog_key || '')
  ));
  if (!record) return null;
  if (payload.oclc_number && String(payload.oclc_number) !== String(record.selection?.oclc_number || '')) {
    return null;
  }
  return structuredClone(record);
}

async function handleDemoQueryRequest(options = {}) {
  let payload = {};
  try { payload = JSON.parse(String(options.body || '{}')); } catch (_) { return json({ error: 'Invalid JSON request.' }, 400); }

  if (payload.action === 'login') {
    return payload.username === 'demo' && payload.password === 'library'
      ? json({ token: DEMO_TOKEN, username: 'demo', role: 'demo', demo: true })
      : json({ error: 'Invalid username or password.' }, 401);
  }
  if (payload.action === 'whoami') {
    return json(isAuthenticated(options)
      ? { authenticated: true, username: 'demo', role: 'demo', demo: true }
      : { authenticated: false, username: null, role: 'public' });
  }
  if (!isAuthenticated(options)) return json({ error: 'Sign in with the demo account to continue.' }, 403);

  const data = await loadDemoData();
  switch (payload.action) {
    case 'logout': return json({ status: 'signed_out' });
    case 'change_password': return json({ error: 'The shared demo password cannot be changed.' }, 403);
    case 'get_fields': return json({ fields: data.fields || [] });
    case 'run': return runQuery(payload, data);
    case 'status': return json({ queries: {} });
    case 'list': return json({ queries: [] });
    case 'list_templates': return json({ categories: [], templates: [] });
    case 'search_bibs': {
      const bibData = await loadDemoBibData();
      return json(searchDemoBibs(payload, bibData));
    }
    case 'compare_oclc_bib': {
      const bibData = await loadDemoBibData();
      const comparison = compareDemoBib(payload, bibData);
      return comparison
        ? json(comparison)
        : json({ error: 'The sample bibliographic record was not found.' }, 404);
    }
    case 'cancel': return json({ ok: true });
    case 'get_results': return json({ error: 'No saved demo result was found.' }, 404);
    default: return json({ error: `The demo backend does not support ${payload.action || 'this action'}.` }, 400);
  }
}

async function queryFetch(url, options = {}) {
  return isDemoApiUrl(url) ? handleDemoQueryRequest(options) : globalThis.fetch(url, options);
}

export { DEMO_API_PATH, handleDemoQueryRequest, isDemoApiUrl, queryFetch };
