import { createHash, createSign, generateKeyPairSync, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const KEYCHAIN_SERVICE = 'org.mlp.query-project.deploy-device';
const KEYCHAIN_HELPER = fileURLToPath(new URL('./queryCliKeychain.swift', import.meta.url));

function runKeychain(operation, account, input = '') {
  return new Promise((resolve, reject) => {
    const child = spawn('/usr/bin/swift', [KEYCHAIN_HELPER, operation, account, KEYCHAIN_SERVICE], {
      stdio: ['pipe', 'pipe', 'pipe']
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on('data', chunk => stdout.push(chunk));
    child.stderr.on('data', chunk => stderr.push(chunk));
    child.on('error', reject);
    child.on('close', code => resolve({
      code,
      stdout: Buffer.concat(stdout).toString('utf8'),
      stderr: Buffer.concat(stderr).toString('utf8')
    }));
    if (input) child.stdin.write(input);
    child.stdin.end();
  });
}

export function canonicalDeploymentRequest({ method = 'POST', path, timestamp, nonce, body }) {
  const normalizedMethod = String(method).trim().toUpperCase();
  const normalizedPath = String(path || '').trim();
  const normalizedTimestamp = String(timestamp || '').trim();
  const normalizedNonce = String(nonce || '').trim().toLowerCase();
  if (normalizedMethod !== 'POST') throw new Error('Deployment requests must use POST.');
  if (normalizedPath !== '/uhtbin/deployment_api.pl') throw new Error('Deployment requests must use the fixed deployment API path.');
  if (!/^\d{10}$/u.test(normalizedTimestamp)) throw new Error('Deployment request timestamp is invalid.');
  if (!/^[a-f0-9]{64}$/u.test(normalizedNonce)) throw new Error('Deployment request nonce is invalid.');
  const bodyHash = createHash('sha256').update(String(body || ''), 'utf8').digest('hex');
  return ['query-deploy-v1', normalizedMethod, normalizedPath, normalizedTimestamp, normalizedNonce, bodyHash].join('\n');
}

export async function readDeploymentDevice(apiUrl, options = {}) {
  if (options.device) return options.device;
  if (process.platform !== 'darwin') throw new Error('Query deployment requires the approved Mac and its Keychain device credential.');
  const result = await runKeychain('read', apiUrl);
  if (result.code === 44) throw new Error('This Mac is not enrolled for Query deployment.');
  if (result.code !== 0) throw new Error(`Could not read the deployment credential from Keychain: ${result.stderr.trim() || 'Keychain helper failed'}`);
  const record = JSON.parse(result.stdout);
  const keyId = String(record.key_id || '').trim().toLowerCase();
  const privateKeyPem = String(record.private_key_pem || '').trim();
  if (!/^[a-z0-9][a-z0-9._-]{2,63}$/u.test(keyId)
    || !/^-----BEGIN PRIVATE KEY-----[\s\S]+-----END PRIVATE KEY-----$/u.test(privateKeyPem)) {
    throw new Error('The saved deployment credential is invalid.');
  }
  return { keyId, privateKeyPem };
}

export async function enrollDeploymentDevice(apiUrl, options = {}) {
  if (process.platform !== 'darwin' && !options.keychainStore) {
    throw new Error('Query deployment enrollment requires macOS Keychain.');
  }
  const keyId = String(options.keyId || 'brandons-mac').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{2,63}$/u.test(keyId)) throw new Error('Deployment key ID is invalid.');
  if (!options.replace) {
    const existing = options.keychainStore
      ? await options.keychainStore.read(apiUrl)
      : await runKeychain('read', apiUrl);
    if (existing && existing.code !== 44) throw new Error('This Mac already has a deployment credential. Use explicit replacement only during key rotation.');
  }
  const { privateKey, publicKey } = generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' }
  });
  const record = JSON.stringify({ key_id: keyId, private_key_pem: privateKey });
  const result = options.keychainStore
    ? await options.keychainStore.write(apiUrl, record)
    : await runKeychain('write', apiUrl, record);
  if (result?.code !== undefined && result.code !== 0) {
    throw new Error(`Could not save the deployment credential in Keychain: ${result.stderr?.trim() || 'Keychain helper failed'}`);
  }
  return { keyId, publicKeyPem: publicKey };
}

export async function buildDeploymentHeaders({ apiUrl, body, sessionHeaders = {}, now = Date.now(), nonce, device }) {
  const url = new URL(apiUrl);
  if (url.protocol !== 'https:' || url.hostname !== 'mlp.sirsi.net' || url.port
    || url.pathname !== '/uhtbin/deployment_api.pl' || url.search || url.hash) {
    throw new Error('Deployment API URL must be the fixed HTTPS /uhtbin/deployment_api.pl endpoint.');
  }
  const credential = await readDeploymentDevice(apiUrl, { device });
  const timestamp = String(Math.floor(now / 1000));
  const requestNonce = nonce || randomBytes(32).toString('hex');
  const canonical = canonicalDeploymentRequest({ path: url.pathname, timestamp, nonce: requestNonce, body });
  const signer = createSign('SHA256');
  signer.update(canonical, 'utf8');
  signer.end();
  const signature = signer.sign(credential.privateKeyPem).toString('base64');
  return {
    ...sessionHeaders,
    'X-Query-Deploy-Key': credential.keyId,
    'X-Query-Deploy-Timestamp': timestamp,
    'X-Query-Deploy-Nonce': requestNonce,
    'X-Query-Deploy-Signature': signature
  };
}
