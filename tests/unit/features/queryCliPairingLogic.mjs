import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CALLBACK_PATH,
  buildBrowserPairingUrl,
  createPkcePairingRequest,
  pairCliSession,
  receiveLoopbackAuthorization
} from '../../../scripts/lib/queryCliPairing.mjs';

test('CLI pairing creates a valid S256 request and bounded HTTPS authorization URL', () => {
  const pairing = createPkcePairingRequest();
  assert.match(pairing.codeVerifier, /^[A-Za-z0-9_-]{43}$/u);
  assert.match(pairing.codeChallenge, /^[A-Za-z0-9_-]{43}$/u);
  assert.match(pairing.state, /^[a-f0-9]{64}$/u);

  const url = new URL(buildBrowserPairingUrl('https://mlp.sirsi.net/query/', {
    codeChallenge: pairing.codeChallenge,
    port: 49152,
    state: pairing.state
  }));
  assert.equal(url.origin, 'https://mlp.sirsi.net');
  assert.equal(url.searchParams.get('cli_pair_port'), '49152');
  assert.equal(url.searchParams.get('cli_pair_state'), pairing.state);
  assert.equal(url.searchParams.get('cli_pair_challenge'), pairing.codeChallenge);
  assert.throws(
    () => buildBrowserPairingUrl('http://mlp.sirsi.net/query/', { ...pairing, port: 49152 }),
    /must use HTTPS/u
  );
});

test('loopback receiver accepts the expected state and one-time code', async () => {
  const state = 'a'.repeat(64);
  const code = 'b'.repeat(64);
  const received = await receiveLoopbackAuthorization({
    state,
    timeoutMs: 2000,
    onReady: async port => {
      const url = new URL(`http://127.0.0.1:${port}${CALLBACK_PATH}`);
      url.searchParams.set('state', state);
      url.searchParams.set('code', code);
      const response = await fetch(url, { redirect: 'manual' });
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), '/query-cli/complete');
    }
  });
  assert.equal(received, code);
});

test('browser pairing exchanges the code and stores only the independent CLI session', async () => {
  const originalFetch = globalThis.fetch;
  const pairing = {
    codeChallenge: 'C'.repeat(43),
    codeVerifier: 'V'.repeat(43),
    state: 'd'.repeat(64)
  };
  let storedSession;
  let exchangePayload;
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    if (url.startsWith('http://127.0.0.1:')) return originalFetch(input, init);
    exchangePayload = JSON.parse(init.body || '{}');
    return Response.json({
      token: 'independent-cli-token',
      username: 'bt1142',
      display_name: 'Brandon',
      role: 'admin'
    });
  };

  try {
    const session = await pairCliSession({
      apiUrl: 'https://mlp.sirsi.net/uhtbin/query_api.pl',
      browserUrl: 'https://mlp.sirsi.net/query/',
      pairing,
      timeoutMs: 2000,
      openBrowser: async authorizationUrl => {
        const browserUrl = new URL(authorizationUrl);
        const callback = new URL(`http://127.0.0.1:${browserUrl.searchParams.get('cli_pair_port')}${CALLBACK_PATH}`);
        callback.searchParams.set('state', pairing.state);
        callback.searchParams.set('code', 'e'.repeat(64));
        const response = await originalFetch(callback, { redirect: 'manual' });
        assert.equal(response.status, 303);
      },
      sessionStore: {
        write: async (_apiUrl, value) => {
          storedSession = value;
          return value;
        }
      }
    });

    assert.equal(session.username, 'bt1142');
    assert.equal(storedSession.token, 'independent-cli-token');
    assert.deepEqual(exchangePayload, {
      action: 'exchange_cli_authorization',
      code: 'e'.repeat(64),
      code_verifier: pairing.codeVerifier
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
