import { createHash, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { buildSirsiOperationsHeaders } from './sirsiOpsAuth.mjs';

const CHUNK_BYTES = 384 * 1024;
const MAX_ARCHIVE_BYTES = 25 * 1024 * 1024;

function validateProfile(profile) {
  const value = String(profile || '').trim().toLowerCase();
  if (!/^[a-z][a-z0-9-]{2,63}$/u.test(value)) throw new Error('Operation profile is invalid.');
  return value;
}

function validateOperationId(operationId) {
  const value = String(operationId || '');
  if (!/^[a-f0-9]{32}$/u.test(value)) throw new Error('Operation ID must contain 32 lowercase hexadecimal characters.');
  return value;
}

export async function postSirsiOperationsAction({ apiUrl, payload, sessionHeaders, device, fetchImpl = fetch }) {
  const body = JSON.stringify(payload);
  const headers = await buildSirsiOperationsHeaders({ apiUrl, body, sessionHeaders, device });
  const response = await fetchImpl(apiUrl, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...headers },
    body
  });
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (_error) {
    throw new Error(`Sirsi operations server returned an unreadable HTTP ${response.status} response.`);
  }
  if (!response.ok) throw new Error(data.error || `Sirsi operations server returned HTTP ${response.status}.`);
  return data;
}

export async function prepareSirsiOperation({ apiUrl, profile, archivePath, sessionHeaders, device, fetchImpl = fetch, onProgress = () => {} }) {
  const operationProfile = validateProfile(profile);
  const archive = await readFile(archivePath);
  if (!archive.length || archive.length > MAX_ARCHIVE_BYTES) {
    throw new Error('Operation archive must be between 1 byte and 25 MiB.');
  }
  const capabilities = await postSirsiOperationsAction({
    apiUrl, payload: { action: 'capabilities' }, sessionHeaders, device, fetchImpl
  });
  if (!capabilities.capabilities?.operation_profiles?.includes(operationProfile)) {
    throw new Error(`The server does not allow the ${operationProfile} operation profile.`);
  }
  const operationId = randomBytes(16).toString('hex');
  const archiveHash = createHash('sha256').update(archive).digest('hex');
  await postSirsiOperationsAction({
    apiUrl,
    payload: {
      action: 'upload_begin', operation_id: operationId, profile: operationProfile,
      archive_sha256: archiveHash, archive_bytes: archive.length
    },
    sessionHeaders, device, fetchImpl
  });
  let sequence = 0;
  for (let offset = 0; offset < archive.length; offset += CHUNK_BYTES) {
    const chunk = archive.subarray(offset, Math.min(offset + CHUNK_BYTES, archive.length));
    await postSirsiOperationsAction({
      apiUrl,
      payload: { action: 'upload_chunk', operation_id: operationId, sequence, data_base64: chunk.toString('base64') },
      sessionHeaders, device, fetchImpl
    });
    sequence += 1;
    onProgress({ operationId, received: Math.min(offset + chunk.length, archive.length), total: archive.length });
  }
  await postSirsiOperationsAction({
    apiUrl, payload: { action: 'upload_finalize', operation_id: operationId }, sessionHeaders, device, fetchImpl
  });
  const planned = await postSirsiOperationsAction({
    apiUrl, payload: { action: 'plan', operation_id: operationId }, sessionHeaders, device, fetchImpl
  });
  return planned.operation;
}

export async function executeSirsiOperation({ apiUrl, operationId, sessionHeaders, device, fetchImpl = fetch }) {
  const response = await postSirsiOperationsAction({
    apiUrl,
    payload: { action: 'execute', operation_id: validateOperationId(operationId) },
    sessionHeaders, device, fetchImpl
  });
  return response.operation;
}

export async function getSirsiOperationStatus({ apiUrl, operationId, sessionHeaders, device, fetchImpl = fetch }) {
  const response = await postSirsiOperationsAction({
    apiUrl,
    payload: { action: 'status', operation_id: validateOperationId(operationId) },
    sessionHeaders, device, fetchImpl
  });
  return response.operation;
}

export async function rollbackSirsiOperation({ apiUrl, operationId, sessionHeaders, device, fetchImpl = fetch }) {
  const response = await postSirsiOperationsAction({
    apiUrl,
    payload: { action: 'rollback', operation_id: validateOperationId(operationId) },
    sessionHeaders, device, fetchImpl
  });
  return response.operation;
}
