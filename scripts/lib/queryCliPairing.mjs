import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { saveCliSession } from './queryCliAuth.mjs';

const DEFAULT_BROWSER_URL = 'https://mlp.sirsi.net/query/';
const CALLBACK_PATH = '/query-cli/callback';
const COMPLETE_PATH = '/query-cli/complete';

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

function createPkcePairingRequest() {
  const codeVerifier = base64url(randomBytes(32));
  return {
    codeChallenge: createHash('sha256').update(codeVerifier, 'ascii').digest('base64url'),
    codeVerifier,
    state: randomBytes(32).toString('hex')
  };
}

function buildBrowserPairingUrl(browserUrl, { codeChallenge, port, state }) {
  const url = new URL(browserUrl || DEFAULT_BROWSER_URL);
  if (url.protocol !== 'https:') {
    throw new Error('The Query browser authorization page must use HTTPS.');
  }
  url.searchParams.set('cli_pair_port', String(port));
  url.searchParams.set('cli_pair_state', state);
  url.searchParams.set('cli_pair_challenge', codeChallenge);
  return url.href;
}

function openDefaultBrowser(url) {
  return new Promise((resolve, reject) => {
    const child = spawn('/usr/bin/open', [url], { stdio: 'ignore' });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve() : reject(new Error('The browser authorization page could not be opened.')));
  });
}

function htmlPage(title, message) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title}</title><style>body{font:16px system-ui;margin:0;padding:48px;background:#f8fafc;color:#0f172a}main{max-width:560px;margin:auto;padding:28px;border:1px solid #cbd5e1;border-radius:12px;background:white}h1{font-size:1.4rem}</style></head><body><main><h1>${title}</h1><p>${message}</p></main></body></html>`;
}

function writeLoopbackResponse(response, status, headers, body = '') {
  response.writeHead(status, {
    'Cache-Control': 'no-store',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'",
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    ...headers
  });
  response.end(body);
}

function receiveLoopbackAuthorization({ onReady, state, timeoutMs = 120000 }) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let cleanupTimer;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      callback(value);
      cleanupTimer = setTimeout(() => server.close(), 2000);
      cleanupTimer.unref?.();
    };
    const server = createServer((request, response) => {
      const requestUrl = new URL(request.url || '/', 'http://127.0.0.1');
      if (request.method !== 'GET') {
        writeLoopbackResponse(response, 405, { 'Content-Type': 'text/plain; charset=utf-8' }, 'Method not allowed.');
        return;
      }
      if (requestUrl.pathname === COMPLETE_PATH) {
        writeLoopbackResponse(response, 200, { 'Content-Type': 'text/html; charset=utf-8' }, htmlPage(
          'Query CLI connected',
          'The command line is now authorized. You may close this tab.'
        ));
        server.close();
        return;
      }
      if (requestUrl.pathname !== CALLBACK_PATH) {
        writeLoopbackResponse(response, 404, { 'Content-Type': 'text/plain; charset=utf-8' }, 'Not found.');
        return;
      }
      const returnedState = requestUrl.searchParams.get('state') || '';
      const code = requestUrl.searchParams.get('code') || '';
      if (returnedState !== state || !/^[a-f0-9]{64}$/u.test(code)) {
        writeLoopbackResponse(response, 400, { 'Content-Type': 'text/html; charset=utf-8' }, htmlPage(
          'Authorization failed',
          'The CLI authorization response was invalid. Return to Terminal and try again.'
        ));
        finish(reject, new Error('The browser returned an invalid CLI authorization response.'));
        return;
      }
      writeLoopbackResponse(response, 303, { Location: COMPLETE_PATH });
      finish(resolve, code);
    });
    const timeout = setTimeout(() => {
      server.close();
      finish(reject, new Error('Browser authorization timed out. Run query:pair again.'));
    }, timeoutMs);
    timeout.unref?.();
    server.on('error', error => finish(reject, error));
    server.listen(0, '127.0.0.1', async () => {
      try {
        const address = server.address();
        await onReady(address.port);
      } catch (error) {
        server.close();
        finish(reject, error);
      }
    });
  });
}

async function exchangeAuthorization(apiUrl, code, codeVerifier, options = {}) {
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'exchange_cli_authorization',
      code,
      code_verifier: codeVerifier
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.token) {
    throw new Error(data.error || `CLI authorization exchange failed with HTTP ${response.status}.`);
  }
  await saveCliSession(apiUrl, data, options);
  return data;
}

async function pairCliSession(options = {}) {
  const apiUrl = String(options.apiUrl || '').trim();
  if (!apiUrl) throw new Error('An API URL is required for browser pairing.');
  const pairing = options.pairing || createPkcePairingRequest();
  const browserOpener = options.openBrowser || openDefaultBrowser;
  const code = await receiveLoopbackAuthorization({
    state: pairing.state,
    timeoutMs: Number(options.timeoutMs) || 120000,
    onReady: async port => {
      const url = buildBrowserPairingUrl(options.browserUrl || DEFAULT_BROWSER_URL, {
        codeChallenge: pairing.codeChallenge,
        port,
        state: pairing.state
      });
      options.onAuthorizationUrl?.(url);
      await browserOpener(url);
    }
  });
  return exchangeAuthorization(apiUrl, code, pairing.codeVerifier, options);
}

export {
  CALLBACK_PATH,
  COMPLETE_PATH,
  DEFAULT_BROWSER_URL,
  buildBrowserPairingUrl,
  createPkcePairingRequest,
  pairCliSession,
  receiveLoopbackAuthorization
};
