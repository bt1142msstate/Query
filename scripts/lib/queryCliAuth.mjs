import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const KEYCHAIN_SERVICE = 'org.mlp.query-project.cli-session';
const KEYCHAIN_HELPER = fileURLToPath(new URL('./queryCliKeychain.swift', import.meta.url));
const sessionCache = new Map();

function runProcess(executable, args, { input = '' } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      stdio: ['pipe', 'pipe', 'pipe']
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on('data', chunk => stdout.push(chunk));
    child.stderr.on('data', chunk => stderr.push(chunk));
    child.on('error', reject);
    child.on('close', code => resolve({
      code,
      stderr: Buffer.concat(stderr).toString('utf8'),
      stdout: Buffer.concat(stdout).toString('utf8')
    }));
    if (input) child.stdin.write(input);
    child.stdin.end();
  });
}

function runKeychainHelper(operation, apiUrl, options = {}) {
  return runProcess('/usr/bin/swift', [KEYCHAIN_HELPER, operation, apiUrl, KEYCHAIN_SERVICE], options);
}

function assertKeychainAvailable() {
  if (process.platform !== 'darwin') {
    throw new Error('Persistent CLI sessions currently require macOS Keychain. Use QUERY_SESSION_TOKEN from an approved credential helper on other platforms.');
  }
}

function normalizeStoredSession(value = {}) {
  const token = String(value.token || '').trim();
  if (!token) return null;
  return {
    token,
    username: String(value.username || '').trim(),
    role: String(value.role || '').trim(),
    display_name: String(value.display_name || value.username || '').trim(),
    email: String(value.email || '').trim()
  };
}

async function readKeychainSession(apiUrl) {
  if (process.platform !== 'darwin') return null;
  const result = await runKeychainHelper('read', apiUrl);
  if (result.code === 44) return null;
  if (result.code !== 0) {
    throw new Error(`Could not read the Query CLI session from macOS Keychain: ${result.stderr.trim() || 'Keychain helper failed'}`);
  }
  try {
    return normalizeStoredSession(JSON.parse(result.stdout.trim()));
  } catch (_error) {
    throw new Error('The saved Query CLI session is invalid. Run query:logout, then sign in again.');
  }
}

async function writeKeychainSession(apiUrl, session) {
  assertKeychainAvailable();
  const normalized = normalizeStoredSession(session);
  if (!normalized) throw new Error('The backend did not return a reusable session token.');
  const result = await runKeychainHelper('write', apiUrl, {
    input: JSON.stringify(normalized)
  });
  if (result.code !== 0) {
    throw new Error(`Could not save the Query CLI session in macOS Keychain: ${result.stderr.trim() || 'Keychain helper failed'}`);
  }
  sessionCache.set(apiUrl, normalized);
  return normalized;
}

async function deleteKeychainSession(apiUrl) {
  if (process.platform !== 'darwin') {
    sessionCache.delete(apiUrl);
    return;
  }
  let result = await runKeychainHelper('delete', apiUrl);
  if (result.code !== 0 && /status -25244\b/u.test(result.stderr)) {
    result = await runProcess('/usr/bin/security', [
      'delete-generic-password',
      '-a', apiUrl,
      '-s', KEYCHAIN_SERVICE
    ]);
  }
  sessionCache.delete(apiUrl);
  if (result.code !== 0) {
    throw new Error(`Could not remove the Query CLI session from macOS Keychain: ${result.stderr.trim() || 'Keychain helper failed'}`);
  }
}

function getSessionStore(options = {}) {
  return options.sessionStore || {
    delete: deleteKeychainSession,
    read: readKeychainSession,
    write: writeKeychainSession
  };
}

async function getCliSession(apiUrl, options = {}) {
  if (options['no-auth'] || options.noAuth) return null;
  const environmentToken = String(process.env.QUERY_SESSION_TOKEN || '').trim();
  if (environmentToken) return { token: environmentToken };
  if (sessionCache.has(apiUrl)) return sessionCache.get(apiUrl);
  const session = await getSessionStore(options).read(apiUrl);
  if (session) sessionCache.set(apiUrl, session);
  return session;
}

async function getCliAuthorizationHeaders(apiUrl, options = {}) {
  const session = await getCliSession(apiUrl, options);
  return session?.token ? { 'X-Query-Session': session.token } : {};
}

async function saveCliSession(apiUrl, session, options = {}) {
  return getSessionStore(options).write(apiUrl, session);
}

async function clearCliSession(apiUrl, options = {}) {
  sessionCache.delete(apiUrl);
  return getSessionStore(options).delete(apiUrl);
}

async function readSecretFromStdin(stream = process.stdin) {
  if (stream.isTTY) {
    throw new Error('Refusing to echo a password in an interactive terminal. Pipe it to --password-stdin.');
  }
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks.map(chunk => Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
    .toString('utf8')
    .replace(/[\r\n]+$/u, '');
}

export {
  KEYCHAIN_SERVICE,
  clearCliSession,
  getCliAuthorizationHeaders,
  getCliSession,
  readSecretFromStdin,
  saveCliSession
};
