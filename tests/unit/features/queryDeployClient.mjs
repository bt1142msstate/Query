import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateKeyPairSync } from 'node:crypto';
import { prepareDeployment, applyDeployment } from '../../../scripts/lib/queryDeployClient.mjs';

function jsonResponse(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() { return JSON.stringify(data); }
  };
}

const privateKeyPem = generateKeyPairSync('ec', {
  namedCurve: 'prime256v1',
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' }
}).privateKey;

test('deployment client separates signed preparation from production mutation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'query-deploy-client-'));
  const archivePath = join(root, 'frontend.tar.gz');
  await writeFile(archivePath, Buffer.alloc(900_000, 7));
  const actions = [];
  const fetchImpl = async (_url, request) => {
    const payload = JSON.parse(request.body);
    actions.push(payload.action);
    if (payload.action === 'capabilities') {
      return jsonResponse({ capabilities: {
        guarded_targets: ['query-frontend'],
        frontend_baseline_sha256: '42'.repeat(32)
      } });
    }
    if (payload.action === 'preflight') return jsonResponse({ release: { release_id: payload.release_id, state: 'preflighted' } });
    return jsonResponse({ release: { release_id: payload.release_id, state: payload.action } });
  };
  const device = { keyId: 'brandons-mac', privateKeyPem };
  const prepared = await prepareDeployment({
    deployUrl: 'https://mlp.sirsi.net/uhtbin/deployment_api.pl',
    target: 'query-frontend', archivePath,
    sessionHeaders: { 'X-Query-Session': 'session' }, device, fetchImpl
  });
  assert.equal(prepared.state, 'preflighted');
  assert.deepEqual(actions, [
    'capabilities', 'upload_begin', 'upload_chunk', 'upload_chunk', 'upload_chunk',
    'upload_finalize', 'preflight'
  ]);
  assert.ok(!actions.includes('deploy'), 'preparation must not mutate production');
  await applyDeployment({
    deployUrl: 'https://mlp.sirsi.net/uhtbin/deployment_api.pl',
    releaseId: prepared.release_id,
    sessionHeaders: { 'X-Query-Session': 'session' }, device, fetchImpl
  });
  assert.equal(actions.at(-1), 'deploy', 'explicit apply is the only production mutation request');
});

test('deployment client refuses a target the server has not enabled', async () => {
  const root = await mkdtemp(join(tmpdir(), 'query-deploy-client-'));
  const archivePath = join(root, 'backend.tar.gz');
  await writeFile(archivePath, 'archive');
  await assert.rejects(() => prepareDeployment({
    deployUrl: 'https://mlp.sirsi.net/uhtbin/deployment_api.pl',
    target: 'query-backend', archivePath,
    sessionHeaders: { 'X-Query-Session': 'session' },
    device: { keyId: 'brandons-mac', privateKeyPem },
    fetchImpl: async () => jsonResponse({ capabilities: { guarded_targets: ['query-frontend'] } })
  }), /does not yet support/u);
});
