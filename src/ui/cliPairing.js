import { postJson } from '../core/backendApi.js';
import { getSession } from '../core/authSession.js';
import { getClientErrorMessage } from '../core/clientErrorMessages.js';

const PAIRING_PARAMS = ['cli_pair_port', 'cli_pair_state', 'cli_pair_challenge'];

function parseCliPairingRequest(search = '') {
  const params = new URLSearchParams(search);
  const present = PAIRING_PARAMS.some(name => params.has(name));
  if (!present) return null;
  const port = Number(params.get('cli_pair_port'));
  const state = params.get('cli_pair_state') || '';
  const codeChallenge = params.get('cli_pair_challenge') || '';
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    return { error: 'The CLI callback port is invalid.' };
  }
  if (!/^[a-f0-9]{64}$/u.test(state)) {
    return { error: 'The CLI pairing state is invalid.' };
  }
  if (!/^[A-Za-z0-9_-]{43}$/u.test(codeChallenge)) {
    return { error: 'The CLI PKCE challenge is invalid.' };
  }
  return { codeChallenge, port, state };
}

function buildCliCallbackUrl(request, code) {
  if (!request || !/^[a-f0-9]{64}$/u.test(String(code || ''))) {
    throw new Error('The backend returned an invalid CLI authorization code.');
  }
  const url = new URL(`http://127.0.0.1:${request.port}/query-cli/callback`);
  url.searchParams.set('code', code);
  url.searchParams.set('state', request.state);
  return url.href;
}

function cleanPairingUrl(locationUrl = globalThis.location?.href || '') {
  const url = new URL(locationUrl);
  PAIRING_PARAMS.forEach(name => url.searchParams.delete(name));
  return url.href;
}

function createButton(label, className = '') {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  if (className) button.className = className;
  return button;
}

function initializeCliPairing() {
  if (typeof document === 'undefined' || typeof globalThis.location?.href !== 'string') return;
  const request = parseCliPairingRequest(globalThis.location.search);
  if (!request) return;

  const dialog = document.createElement('dialog');
  dialog.className = 'auth-dialog';
  dialog.id = 'query-cli-pairing-dialog';
  const heading = document.createElement('h2');
  heading.textContent = request.error ? 'CLI authorization error' : 'Authorize Query CLI';
  const message = document.createElement('p');
  message.textContent = request.error
    ? request.error
    : 'Allow the Query command line on this Mac to use your current signed-in account? The CLI receives its own revocable session; your browser cookie and password are never copied.';
  const identity = document.createElement('p');
  identity.className = 'auth-dialog__note';
  const actions = document.createElement('div');
  actions.className = 'auth-dialog__actions';
  const cancel = createButton(request.error ? 'Close' : 'Cancel');
  const approve = request.error ? null : createButton('Authorize CLI', 'auth-dialog__primary');
  actions.append(cancel);
  if (approve) actions.append(approve);
  dialog.append(heading, message, identity, actions);
  document.body.append(dialog);

  function cancelPairing() {
    globalThis.location.replace(cleanPairingUrl());
  }

  function showWhenAuthenticated() {
    const session = getSession();
    if (!session || request.error || dialog.open) return;
    identity.textContent = `Signed in as ${session.display_name || session.username}.`;
    dialog.showModal();
    approve?.focus();
  }

  cancel.addEventListener('click', cancelPairing);
  dialog.addEventListener('cancel', event => {
    event.preventDefault();
    cancelPairing();
  });
  approve?.addEventListener('click', async () => {
    approve.disabled = true;
    cancel.disabled = true;
    message.textContent = 'Creating a short-lived authorization code...';
    try {
      const { data } = await postJson({
        action: 'authorize_cli',
        code_challenge: request.codeChallenge,
        code_challenge_method: 'S256'
      });
      globalThis.location.replace(buildCliCallbackUrl(request, data.code));
    } catch (error) {
      message.textContent = getClientErrorMessage(error, { fallback: 'The command-line session could not be authorized. Try again.' });
      approve.disabled = false;
      cancel.disabled = false;
    }
  });

  if (request.error) {
    dialog.showModal();
    cancel.focus();
    return;
  }
  globalThis.addEventListener?.('query-auth:changed', showWhenAuthenticated);
  queueMicrotask(showWhenAuthenticated);
}

initializeCliPairing();

export {
  buildCliCallbackUrl,
  cleanPairingUrl,
  initializeCliPairing,
  parseCliPairingRequest
};
