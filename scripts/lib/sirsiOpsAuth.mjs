import { createHash, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const DEVICE_KEY_ID = 'brandons-mac';
const DEVICE_HELPER = fileURLToPath(new URL('./sirsiOpsDevice.swift', import.meta.url));
const APPROVED_PATHS = new Set(['/uhtbin/sirsi_ops_api.pl', '/uhtbin/sirsi_ops_recovery.pl']);

function runDeviceHelper(operation, input = '', options = {}) {
  return new Promise((resolve, reject) => {
    const args = [DEVICE_HELPER, operation, DEVICE_KEY_ID];
    if (options.replace) args.push('replace');
    const child = spawn('/usr/bin/swift', args, { stdio: ['pipe', 'pipe', 'pipe'] });
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

export function canonicalSirsiOperationsRequest({ method = 'POST', path, timestamp, nonce, body }) {
  const normalizedMethod = String(method).trim().toUpperCase();
  const normalizedPath = String(path || '').trim();
  const normalizedTimestamp = String(timestamp || '').trim();
  const normalizedNonce = String(nonce || '').trim().toLowerCase();
  if (normalizedMethod !== 'POST') throw new Error('Sirsi operations requests must use POST.');
  if (!APPROVED_PATHS.has(normalizedPath)) throw new Error('Sirsi operations requests must use an approved fixed path.');
  if (!/^\d{10}$/u.test(normalizedTimestamp)) throw new Error('Sirsi operations request timestamp is invalid.');
  if (!/^[a-f0-9]{64}$/u.test(normalizedNonce)) throw new Error('Sirsi operations request nonce is invalid.');
  const bodyHash = createHash('sha256').update(String(body || ''), 'utf8').digest('hex');
  return ['sirsi-ops-v1', normalizedMethod, normalizedPath, normalizedTimestamp, normalizedNonce, bodyHash].join('\n');
}

export async function enrollSirsiOperationsDevice(options = {}) {
  if (process.platform !== 'darwin' && !options.deviceHelper) {
    throw new Error('Sirsi operations enrollment requires Brandon’s approved Mac and Secure Enclave.');
  }
  const result = options.deviceHelper
    ? await options.deviceHelper('enroll', '', { replace: options.replace })
    : await runDeviceHelper('enroll', '', { replace: options.replace });
  if (result.code !== 0) throw new Error(result.stderr.trim() || 'Secure Enclave enrollment failed.');
  const record = JSON.parse(result.stdout);
  if (record.key_id !== DEVICE_KEY_ID || record.hardware_bound !== true
    || !/^-----BEGIN PUBLIC KEY-----[\s\S]+-----END PUBLIC KEY-----\s*$/u.test(record.public_key_pem || '')) {
    throw new Error('Secure Enclave enrollment returned an invalid public key.');
  }
  return { keyId: record.key_id, hardwareBound: true, publicKeyPem: record.public_key_pem };
}

async function signWithDevice(canonical, options = {}) {
  if (options.device?.sign) return options.device.sign(canonical);
  if (process.platform !== 'darwin') {
    throw new Error('Sirsi operations require Brandon’s approved Mac and Secure Enclave.');
  }
  const result = await runDeviceHelper('sign', canonical);
  if (result.code === 44) throw new Error('This Mac is not enrolled for Sirsi operations.');
  if (result.code !== 0) throw new Error(result.stderr.trim() || 'Secure Enclave signing failed.');
  const signature = result.stdout.trim();
  if (!/^[A-Za-z0-9+/]+={0,2}$/u.test(signature)) throw new Error('Secure Enclave returned an invalid signature.');
  return signature;
}

export async function buildSirsiOperationsHeaders({ apiUrl, body, sessionHeaders = {}, now = Date.now(), nonce, device }) {
  const url = new URL(apiUrl);
  if (url.protocol !== 'https:' || url.hostname !== 'mlp.sirsi.net' || url.port
    || !APPROVED_PATHS.has(url.pathname) || url.search || url.hash) {
    throw new Error('Sirsi operations API URL must use an approved fixed HTTPS endpoint.');
  }
  const timestamp = String(Math.floor(now / 1000));
  const requestNonce = nonce || randomBytes(32).toString('hex');
  const canonical = canonicalSirsiOperationsRequest({ path: url.pathname, timestamp, nonce: requestNonce, body });
  const signature = await signWithDevice(canonical, { device });
  return {
    ...sessionHeaders,
    'X-Sirsi-Ops-Key': DEVICE_KEY_ID,
    'X-Sirsi-Ops-Timestamp': timestamp,
    'X-Sirsi-Ops-Nonce': requestNonce,
    'X-Sirsi-Ops-Signature': signature
  };
}
