const DEMO_API_PATH = '/demo-api';
const DEMO_TOKEN = 'query-project-demo-session';

let dataPromise = null;

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
    case 'cancel': return json({ ok: true });
    case 'get_results': return json({ error: 'No saved demo result was found.' }, 404);
    default: return json({ error: `The demo backend does not support ${payload.action || 'this action'}.` }, 400);
  }
}

async function queryFetch(url, options = {}) {
  return isDemoApiUrl(url) ? handleDemoQueryRequest(options) : globalThis.fetch(url, options);
}

export { DEMO_API_PATH, handleDemoQueryRequest, isDemoApiUrl, queryFetch };
