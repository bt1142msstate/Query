import assert from 'node:assert/strict';
import test from 'node:test';

import { readFile } from 'node:fs/promises';

const originalFetch = globalThis.fetch;
globalThis.fetch = async url => {
  if (String(url).endsWith('/assets/demo/query-data.json')) {
    const data = await readFile(new URL('../../../assets/demo/query-data.json', import.meta.url), 'utf8');
    return Response.json(JSON.parse(data));
  }
  if (String(url).endsWith('/assets/demo/oclc-bib-data.json')) {
    const data = await readFile(new URL('../../../assets/demo/oclc-bib-data.json', import.meta.url), 'utf8');
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

test('demo backend supports authenticated local bib lookup and WorldCat comparison', async () => {
  const searchResponse = await handleDemoQueryRequest({
    body: JSON.stringify({
      action: 'search_bibs',
      lookup_type: 'title',
      query: 'hat full of sky'
    }),
    headers: authHeaders
  });
  const search = await searchResponse.json();
  assert.equal(search.returned, 1);
  assert.equal(search.results[0].catalog_key, '923278');

  const compareResponse = await handleDemoQueryRequest({
    body: JSON.stringify({
      action: 'compare_oclc_bib',
      catalog_key: '923278'
    }),
    headers: authHeaders
  });
  const comparison = await compareResponse.json();
  assert.equal(comparison.selection.oclc_number, '54005706');
  assert.equal(comparison.match.confidence, 'linked');
  assert.equal(comparison.comparison.counts.differences, 4);
  assert.equal(comparison.review.advice, 'recommended');
  assert.equal(comparison.review.identity_score, 98);
  assert.equal(comparison.review.mode, 'all_fields');

  const targetedResponse = await handleDemoQueryRequest({
    body: JSON.stringify({
      action: 'compare_oclc_bib',
      catalog_key: '923278',
      target_tags: ['521', '526']
    }),
    headers: authHeaders
  });
  const targeted = await targetedResponse.json();
  assert.equal(targeted.review.mode, 'selected_fields');
  assert.equal(targeted.review.target_field_score, 50);
  assert.equal(targeted.review.advice, 'review');
  assert.deepEqual(targeted.review.missing_tags, ['521']);
});

test('demo backend resolves mixed bulk bibliographic identifiers', async () => {
  const response = await handleDemoQueryRequest({
    body: JSON.stringify({
      action: 'resolve_oclc_bibs_bulk',
      entries: [
        { lookup_type: 'catalog_key', query: '923278' },
        { lookup_type: 'isbn', query: '9780060586607' },
        { lookup_type: 'title', query: 'missing title' }
      ]
    }),
    headers: authHeaders
  });
  const payload = await response.json();
  assert.equal(payload.counts.resolved, 2);
  assert.equal(payload.counts.not_found, 1);
  assert.equal(payload.results[0].selection.oclc_number, '54005706');
  assert.equal(payload.results[0].review.advice, 'recommended');
});

test('demo bulk comparison applies selected hydration fields', async () => {
  const response = await handleDemoQueryRequest({
    body: JSON.stringify({
      action: 'resolve_oclc_bibs_bulk',
      entries: [{ lookup_type: 'catalog_key', query: '923278' }],
      target_tags: ['521', '526']
    }),
    headers: authHeaders
  });
  const payload = await response.json();
  assert.equal(payload.results[0].review.advice, 'review');
  assert.equal(payload.results[0].review.target_field_score, 50);
  assert.deepEqual(payload.results[0].review.requested_tags, ['521', '526']);
});
