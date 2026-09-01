import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { buildDeploymentHeaders, canonicalDeploymentRequest } from '../../../scripts/lib/queryDeployAuth.mjs';

test('deployment requests are bound to the fixed endpoint, body, time, nonce, and approved Mac key', async () => {
  const body = JSON.stringify({ action: 'capabilities' });
  const nonce = 'ab'.repeat(32);
  const secretHex = '42'.repeat(32);
  const timestamp = '1788291000';
  const canonical = canonicalDeploymentRequest({
    path: '/uhtbin/deployment_api.pl', timestamp, nonce, body
  });
  const headers = await buildDeploymentHeaders({
    apiUrl: 'https://mlp.sirsi.net/uhtbin/deployment_api.pl',
    body,
    now: 1788291000000,
    nonce,
    device: { keyId: 'brandons-mac', secretHex },
    sessionHeaders: { 'X-Query-Session': 'session-value' }
  });
  assert.equal(headers['X-Query-Deploy-Key'], 'brandons-mac');
  assert.equal(headers['X-Query-Deploy-Timestamp'], timestamp);
  assert.equal(headers['X-Query-Deploy-Nonce'], nonce);
  assert.equal(headers['X-Query-Session'], 'session-value');
  assert.equal(
    headers['X-Query-Deploy-Signature'],
    createHmac('sha256', Buffer.from(secretHex, 'hex')).update(canonical).digest('hex')
  );
});

test('deployment signing refuses alternate hosts, paths, query strings, and plaintext HTTP', async () => {
  const options = { body: '{}', device: { keyId: 'brandons-mac', secretHex: '42'.repeat(32) } };
  for (const apiUrl of [
    'http://mlp.sirsi.net/uhtbin/deployment_api.pl',
    'https://example.test/uhtbin/deployment_api.pl',
    'https://mlp.sirsi.net/uhtbin/query_api.pl',
    'https://mlp.sirsi.net/uhtbin/deployment_api.pl?redirect=1'
  ]) {
    await assert.rejects(() => buildDeploymentHeaders({ ...options, apiUrl }), /fixed HTTPS/u);
  }
});
