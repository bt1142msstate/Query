import { createHash, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { buildDeploymentHeaders } from './queryDeployAuth.mjs';

const CHUNK_BYTES = 384 * 1024;

export async function postDeploymentAction({ deployUrl, payload, sessionHeaders, device, fetchImpl = fetch }) {
  const body = JSON.stringify(payload);
  const headers = await buildDeploymentHeaders({ apiUrl: deployUrl, body, sessionHeaders, device });
  const response = await fetchImpl(deployUrl, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...headers },
    body
  });
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (_error) {
    throw new Error(`Deployment server returned an unreadable HTTP ${response.status} response.`);
  }
  if (!response.ok) throw new Error(data.error || `Deployment server returned HTTP ${response.status}.`);
  return data;
}

export async function prepareDeployment({ deployUrl, target, archivePath, sessionHeaders, device, fetchImpl = fetch, onProgress = () => {} }) {
  if (!['query-frontend', 'query-backend'].includes(target)) throw new Error('Deployment target must be query-frontend or query-backend.');
  const archive = await readFile(archivePath);
  if (!archive.length || archive.length > 25 * 1024 * 1024) throw new Error('Deployment archive must be between 1 byte and 25 MiB.');
  const capabilities = await postDeploymentAction({
    deployUrl, payload: { action: 'capabilities' }, sessionHeaders, device, fetchImpl
  });
  if (!capabilities.capabilities?.guarded_targets?.includes(target)) {
    throw new Error(`The server does not yet support guarded ${target} deployment.`);
  }
  const baselineKey = target === 'query-frontend' ? 'frontend_baseline_sha256' : 'backend_baseline_sha256';
  const baseline = String(capabilities.capabilities[baselineKey] || '').toLowerCase();
  if (!/^[a-f0-9]{64}$/u.test(baseline)) throw new Error('The server did not return a valid production baseline.');
  const releaseId = randomBytes(16).toString('hex');
  const archiveHash = createHash('sha256').update(archive).digest('hex');
  await postDeploymentAction({
    deployUrl,
    payload: {
      action: 'upload_begin', release_id: releaseId, target,
      archive_sha256: archiveHash, archive_bytes: archive.length, baseline_sha256: baseline
    },
    sessionHeaders, device, fetchImpl
  });
  let sequence = 0;
  for (let offset = 0; offset < archive.length; offset += CHUNK_BYTES) {
    const chunk = archive.subarray(offset, Math.min(offset + CHUNK_BYTES, archive.length));
    await postDeploymentAction({
      deployUrl,
      payload: { action: 'upload_chunk', release_id: releaseId, sequence, data_base64: chunk.toString('base64') },
      sessionHeaders, device, fetchImpl
    });
    sequence += 1;
    onProgress({ releaseId, received: Math.min(offset + chunk.length, archive.length), total: archive.length });
  }
  await postDeploymentAction({
    deployUrl, payload: { action: 'upload_finalize', release_id: releaseId }, sessionHeaders, device, fetchImpl
  });
  const preflight = await postDeploymentAction({
    deployUrl, payload: { action: 'preflight', release_id: releaseId }, sessionHeaders, device, fetchImpl
  });
  return preflight.release;
}

export async function applyDeployment({ deployUrl, releaseId, sessionHeaders, device, fetchImpl = fetch }) {
  if (!/^[a-f0-9]{32}$/u.test(String(releaseId || ''))) throw new Error('Release ID must contain 32 lowercase hexadecimal characters.');
  const response = await postDeploymentAction({
    deployUrl, payload: { action: 'deploy', release_id: releaseId }, sessionHeaders, device, fetchImpl
  });
  return response.release;
}

export async function getDeploymentStatus({ deployUrl, releaseId, sessionHeaders, device, fetchImpl = fetch }) {
  if (!/^[a-f0-9]{32}$/u.test(String(releaseId || ''))) throw new Error('Release ID must contain 32 lowercase hexadecimal characters.');
  const response = await postDeploymentAction({
    deployUrl, payload: { action: 'release_status', release_id: releaseId }, sessionHeaders, device, fetchImpl
  });
  return response.release;
}
