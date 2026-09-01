import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSign, generateKeyPairSync } from 'node:crypto';
import {
  executeSirsiOperation,
  getSirsiOperationOutput,
  prepareSirsiOperation,
  rollbackSirsiOperation
} from '../../../scripts/lib/sirsiOpsClient.mjs';

function jsonResponse(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() { return JSON.stringify(data); }
  };
}

const privateKey = generateKeyPairSync('ec', {
  namedCurve: 'prime256v1',
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' }
}).privateKey;

const device = {
  sign(canonical) {
    const signer = createSign('SHA256');
    signer.update(canonical);
    signer.end();
    return signer.sign(privateKey).toString('base64');
  }
};

test('Sirsi operation preparation uploads immutable bytes and plans without executing', async () => {
  const root = await mkdtemp(join(tmpdir(), 'sirsi-ops-client-'));
  const archivePath = join(root, 'operation.tar.gz');
  await writeFile(archivePath, Buffer.alloc(900_000, 7));
  const actions = [];
  const fetchImpl = async (_url, request) => {
    const payload = JSON.parse(request.body);
    actions.push(payload.action);
    if (payload.action === 'capabilities') {
      return jsonResponse({ capabilities: { operation_profiles: ['managed-release'] } });
    }
    if (payload.action === 'plan') {
      return jsonResponse({ operation: { operation_id: payload.operation_id, state: 'planned' } });
    }
    return jsonResponse({ operation: { operation_id: payload.operation_id, state: payload.action } });
  };
  const prepared = await prepareSirsiOperation({
    apiUrl: 'https://mlp.sirsi.net/uhtbin/sirsi_ops_api.pl',
    profile: 'managed-release', archivePath,
    sessionHeaders: { 'X-Query-Session': 'session' }, device, fetchImpl
  });
  assert.equal(prepared.state, 'planned');
  assert.deepEqual(actions, [
    'capabilities', 'upload_begin', 'upload_chunk', 'upload_chunk', 'upload_chunk',
    'upload_finalize', 'plan'
  ]);
  assert.ok(!actions.includes('execute'));
});

test('execute and rollback are separate explicit mutation requests', async () => {
  const actions = [];
  const fetchImpl = async (_url, request) => {
    const payload = JSON.parse(request.body);
    actions.push(payload.action);
    return jsonResponse({ operation: { operation_id: payload.operation_id, state: payload.action } });
  };
  const common = {
    apiUrl: 'https://mlp.sirsi.net/uhtbin/sirsi_ops_api.pl',
    operationId: 'ab'.repeat(16), sessionHeaders: { 'X-Query-Session': 'session' }, device, fetchImpl
  };
  assert.equal((await executeSirsiOperation(common)).state, 'execute');
  assert.equal((await rollbackSirsiOperation(common)).state, 'rollback');
  assert.deepEqual(actions, ['execute', 'rollback']);
});

test('client refuses malformed profiles, unsupported profiles, and malformed operation IDs', async () => {
  const root = await mkdtemp(join(tmpdir(), 'sirsi-ops-client-'));
  const archivePath = join(root, 'operation.tar.gz');
  await writeFile(archivePath, 'archive');
  await assert.rejects(() => prepareSirsiOperation({
    apiUrl: 'https://mlp.sirsi.net/uhtbin/sirsi_ops_api.pl',
    profile: '../shell', archivePath, sessionHeaders: {}, device
  }), /profile is invalid/u);
  await assert.rejects(() => prepareSirsiOperation({
    apiUrl: 'https://mlp.sirsi.net/uhtbin/sirsi_ops_api.pl',
    profile: 'unapproved-operation', archivePath,
    sessionHeaders: {}, device,
    fetchImpl: async () => jsonResponse({ capabilities: { operation_profiles: ['managed-release'] } })
  }), /does not allow/u);
  await assert.rejects(() => executeSirsiOperation({
    apiUrl: 'https://mlp.sirsi.net/uhtbin/sirsi_ops_api.pl',
    operationId: 'not-valid', sessionHeaders: {}, device
  }), /32 lowercase/u);
});

test('operation output is reassembled from bounded authenticated chunks', async () => {
  const source = Buffer.from('first chunk\nsecond chunk\n');
  const fetchImpl = async (_url, request) => {
    const payload = JSON.parse(request.body);
    const chunk = source.subarray(payload.offset, Math.min(payload.offset + 7, source.length));
    return jsonResponse({ output: {
      stream: payload.stream,
      offset: payload.offset,
      bytes: chunk.length,
      data_base64: chunk.toString('base64'),
      next_offset: payload.offset + chunk.length,
      eof: payload.offset + chunk.length >= source.length
    } });
  };
  const output = await getSirsiOperationOutput({
    apiUrl: 'https://mlp.sirsi.net/uhtbin/sirsi_ops_api.pl',
    operationId: 'fa'.repeat(16), stream: 'stdout', sessionHeaders: {}, device, fetchImpl
  });
  assert.deepEqual(output, source);
});
