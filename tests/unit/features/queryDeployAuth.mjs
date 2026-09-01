import test from 'node:test';
import assert from 'node:assert/strict';
import { createVerify, generateKeyPairSync } from 'node:crypto';
import { buildDeploymentHeaders, canonicalDeploymentRequest, enrollDeploymentDevice } from '../../../scripts/lib/queryDeployAuth.mjs';

const keys = generateKeyPairSync('ec', {
  namedCurve: 'prime256v1',
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' }
});

test('deployment requests are bound to the fixed endpoint, body, time, nonce, and approved Mac key', async () => {
  const body = JSON.stringify({ action: 'capabilities' });
  const nonce = 'ab'.repeat(32);
  const timestamp = '1788291000';
  const canonical = canonicalDeploymentRequest({
    path: '/uhtbin/deployment_api.pl', timestamp, nonce, body
  });
  const headers = await buildDeploymentHeaders({
    apiUrl: 'https://mlp.sirsi.net/uhtbin/deployment_api.pl',
    body,
    now: 1788291000000,
    nonce,
    device: { keyId: 'brandons-mac', privateKeyPem: keys.privateKey },
    sessionHeaders: { 'X-Query-Session': 'session-value' }
  });
  assert.equal(headers['X-Query-Deploy-Key'], 'brandons-mac');
  assert.equal(headers['X-Query-Deploy-Timestamp'], timestamp);
  assert.equal(headers['X-Query-Deploy-Nonce'], nonce);
  assert.equal(headers['X-Query-Session'], 'session-value');
  const verifier = createVerify('SHA256');
  verifier.update(canonical, 'utf8');
  verifier.end();
  assert.equal(verifier.verify(keys.publicKey, Buffer.from(headers['X-Query-Deploy-Signature'], 'base64')), true);
});

test('deployment signing refuses alternate hosts, paths, query strings, and plaintext HTTP', async () => {
  const options = { body: '{}', device: { keyId: 'brandons-mac', privateKeyPem: keys.privateKey } };
  for (const apiUrl of [
    'http://mlp.sirsi.net/uhtbin/deployment_api.pl',
    'https://example.test/uhtbin/deployment_api.pl',
    'https://mlp.sirsi.net/uhtbin/query_api.pl',
    'https://mlp.sirsi.net/uhtbin/deployment_api.pl?redirect=1'
  ]) {
    await assert.rejects(() => buildDeploymentHeaders({ ...options, apiUrl }), /fixed HTTPS/u);
  }
});

test('device enrollment writes only the private key to Keychain and returns a public bootstrap key', async () => {
  let stored = '';
  const result = await enrollDeploymentDevice('https://mlp.sirsi.net/uhtbin/deployment_api.pl', {
    keychainStore: {
      async read() { return { code: 44 }; },
      async write(_account, value) { stored = value; return { code: 0 }; }
    }
  });
  assert.match(result.publicKeyPem, /^-----BEGIN PUBLIC KEY-----/u);
  assert.doesNotMatch(result.publicKeyPem, /PRIVATE KEY/u);
  assert.match(stored, /BEGIN PRIVATE KEY/u);
  assert.doesNotMatch(stored, /BEGIN PUBLIC KEY/u);
});
