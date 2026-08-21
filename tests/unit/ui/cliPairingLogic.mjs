import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCliCallbackUrl,
  cleanPairingUrl,
  parseCliPairingRequest
} from '../../../src/ui/cliPairing.js';

const validSearch = `?cli_pair_port=49152&cli_pair_state=${'a'.repeat(64)}&cli_pair_challenge=${'B'.repeat(43)}`;

test('browser pairing parser accepts only a loopback port, state, and S256 challenge', () => {
  assert.deepEqual(parseCliPairingRequest(validSearch), {
    codeChallenge: 'B'.repeat(43),
    port: 49152,
    state: 'a'.repeat(64)
  });
  assert.equal(parseCliPairingRequest('?unrelated=true'), null);
  assert.match(parseCliPairingRequest(validSearch.replace('49152', '443')).error, /port/u);
  assert.match(parseCliPairingRequest(validSearch.replace('a'.repeat(64), 'bad')).error, /state/u);
});

test('browser pairing callback is fixed to IPv4 loopback and removes pairing parameters', () => {
  const request = parseCliPairingRequest(validSearch);
  const callback = new URL(buildCliCallbackUrl(request, 'c'.repeat(64)));
  assert.equal(callback.origin, 'http://127.0.0.1:49152');
  assert.equal(callback.pathname, '/query-cli/callback');
  assert.equal(callback.searchParams.get('state'), request.state);
  assert.equal(callback.searchParams.get('code'), 'c'.repeat(64));

  const cleaned = new URL(cleanPairingUrl(`https://mlp.sirsi.net/query/${validSearch}&kept=yes`));
  assert.equal(cleaned.searchParams.get('kept'), 'yes');
  assert.equal(cleaned.searchParams.has('cli_pair_port'), false);
  assert.equal(cleaned.searchParams.has('cli_pair_state'), false);
  assert.equal(cleaned.searchParams.has('cli_pair_challenge'), false);
});
