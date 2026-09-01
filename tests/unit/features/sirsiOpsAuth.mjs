import test from 'node:test';
import assert from 'node:assert/strict';
import { createSign, createVerify, generateKeyPairSync } from 'node:crypto';
import {
  buildSirsiOperationsHeaders,
  canonicalSirsiOperationsRequest,
  enrollSirsiOperationsDevice
} from '../../../scripts/lib/sirsiOpsAuth.mjs';

const keys = generateKeyPairSync('ec', {
  namedCurve: 'prime256v1',
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' }
});

const device = {
  sign(canonical) {
    const signer = createSign('SHA256');
    signer.update(canonical, 'utf8');
    signer.end();
    return signer.sign(keys.privateKey).toString('base64');
  }
};

test('Sirsi operations requests bind account session, fixed endpoint, body, time, nonce, and device signature', async () => {
  const body = JSON.stringify({ action: 'capabilities' });
  const nonce = 'ab'.repeat(32);
  const timestamp = '1788291000';
  const canonical = canonicalSirsiOperationsRequest({
    path: '/uhtbin/sirsi_ops_api.pl', timestamp, nonce, body
  });
  const headers = await buildSirsiOperationsHeaders({
    apiUrl: 'https://mlp.sirsi.net/uhtbin/sirsi_ops_api.pl',
    body, now: 1788291000000, nonce, device,
    sessionHeaders: { 'X-Query-Session': 'session-value' }
  });
  assert.equal(headers['X-Sirsi-Ops-Key'], 'brandons-mac');
  assert.equal(headers['X-Sirsi-Ops-Timestamp'], timestamp);
  assert.equal(headers['X-Sirsi-Ops-Nonce'], nonce);
  assert.equal(headers['X-Query-Session'], 'session-value');
  const verifier = createVerify('SHA256');
  verifier.update(canonical, 'utf8');
  verifier.end();
  assert.equal(verifier.verify(keys.publicKey, Buffer.from(headers['X-Sirsi-Ops-Signature'], 'base64')), true);
});

test('Sirsi operations signing refuses alternate hosts, paths, query strings, and plaintext HTTP', async () => {
  for (const apiUrl of [
    'http://mlp.sirsi.net/uhtbin/sirsi_ops_api.pl',
    'https://example.test/uhtbin/sirsi_ops_api.pl',
    'https://mlp.sirsi.net/uhtbin/query_api.pl',
    'https://mlp.sirsi.net/uhtbin/sirsi_ops_api.pl?redirect=1'
  ]) {
    await assert.rejects(() => buildSirsiOperationsHeaders({ apiUrl, body: '{}', device }), /fixed HTTPS/u);
  }
});

test('device enrollment accepts only a hardware-bound public bootstrap key', async () => {
  const result = await enrollSirsiOperationsDevice({
    deviceHelper: async () => ({
      code: 0,
      stderr: '',
      stdout: JSON.stringify({
        key_id: 'brandons-mac',
        hardware_bound: true,
        public_key_pem: keys.publicKey
      })
    })
  });
  assert.equal(result.hardwareBound, true);
  assert.match(result.publicKeyPem, /^-----BEGIN PUBLIC KEY-----/u);
  assert.doesNotMatch(result.publicKeyPem, /PRIVATE KEY/u);
});

test('device enrollment rejects software or exportable credential reports', async () => {
  await assert.rejects(() => enrollSirsiOperationsDevice({
    deviceHelper: async () => ({
      code: 0,
      stderr: '',
      stdout: JSON.stringify({ key_id: 'brandons-mac', hardware_bound: false, public_key_pem: keys.publicKey })
    })
  }), /invalid public key/u);
});
