import assert from 'node:assert/strict';
import test from 'node:test';

import { readFile } from 'node:fs/promises';

const originalFetch = globalThis.fetch;
globalThis.fetch = async url => {
  if (String(url).endsWith('/assets/demo/query-data.json')) {
    const data = await readFile(new URL('../../../assets/demo/query-data.json', import.meta.url), 'utf8');
    return Response.json(JSON.parse(data));
  }
  return originalFetch(url);
};

const { handleDemoQueryRequest, isDemoApiUrl } = await import('../../../src/core/mockQueryBackend.js');

const authHeaders = { 'X-Query-Session': 'query-project-demo-session' };

test('demo backend requires its documented sample account', async () => {
  const denied = await handleDemoQueryRequest({ body: JSON.stringify({ action: 'get_fields' }) });
  assert.equal(denied.status, 403);

  const invalid = await handleDemoQueryRequest({ body: JSON.stringify({ action: 'login', username: 'demo', password: 'wrong' }) });
  assert.equal(invalid.status, 401);

  const login = await handleDemoQueryRequest({ body: JSON.stringify({ action: 'login', username: 'demo', password: 'library' }) });
  const session = await login.json();
  assert.equal(session.username, 'demo');
  assert.equal(session.demo, true);
});

test('demo backend exposes sample fields and filtered JSONL rows after sign-in', async () => {
  const fieldResponse = await handleDemoQueryRequest({
    body: JSON.stringify({ action: 'get_fields' }),
    headers: authHeaders
  });
  const fieldPayload = await fieldResponse.json();
  assert.ok(fieldPayload.fields.some(field => field.name === 'Library'));

  const runResponse = await handleDemoQueryRequest({
    body: JSON.stringify({
      action: 'run',
      display_fields: ['Title', 'Library'],
      filters: [{ field: 'Library', operator: '=', value: 'EAST' }]
    }),
    headers: authHeaders
  });
  assert.match(runResponse.headers.get('Content-Type'), /ndjson/u);
  const events = (await runResponse.text()).trim().split('\n').map(line => JSON.parse(line));
  assert.equal(events[0].type, 'meta');
  assert.ok(events.filter(event => event.type === 'row').every(event => event.values[1] === 'EAST'));
  assert.equal(events.at(-1).type, 'done');
});

test('demo endpoint detection is limited to the explicit path', () => {
  assert.equal(isDemoApiUrl('https://bt1142msstate.github.io/Query/demo-api'), true);
  assert.equal(isDemoApiUrl('https://example.org/query-api'), false);
});
