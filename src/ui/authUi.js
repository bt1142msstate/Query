import { getApiUrl } from '../core/backendApi.js';
import { clearSession, getSession, setSession } from '../core/authSession.js';
import { isDemoApiUrl, queryFetch } from '../core/mockQueryBackend.js';

const button = document.getElementById('auth-session-button');
const dialog = document.getElementById('auth-session-dialog');
const form = document.getElementById('auth-session-form');
const passwordForm = document.getElementById('auth-password-form');
const status = document.getElementById('auth-session-status');
const signout = document.getElementById('auth-session-signout');
const headerSignout = document.getElementById('auth-header-signout');
const historyButton = document.getElementById('toggle-queries');
const closeButton = dialog?.querySelector('[data-auth-close]');
let restoringPersistentSession = false;

function openRequiredSignIn() {
  if (restoringPersistentSession || getSession() || !dialog || dialog.open) return;
  clearPasswordFields();
  dialog.showModal();
  form?.querySelector('input[name="username"]')?.focus();
}

function concealPasswords() {
  dialog?.querySelectorAll('.auth-password-control').forEach(control => {
    const input = control.querySelector('input');
    const toggle = control.querySelector('.auth-password-toggle');
    if (input) input.type = 'password';
    control.classList.remove('auth-password-control--visible');
    if (toggle) {
      const label = toggle.dataset.hiddenLabel || toggle.getAttribute('aria-label') || 'Show password';
      toggle.dataset.hiddenLabel = label;
      toggle.setAttribute('aria-label', label);
      toggle.setAttribute('title', label);
      toggle.setAttribute('aria-pressed', 'false');
    }
  });
}

function clearPasswordFields() {
  concealPasswords();
  dialog?.querySelectorAll('input[type="password"], .auth-password-control input').forEach(input => {
    input.value = '';
  });
}

function render() {
  const session = getSession();
  const demoMode = isDemoApiUrl(getApiUrl());
  button?.setAttribute('aria-label', session ? `Signed in as ${session.username}` : 'Staff sign in');
  button?.setAttribute('data-tooltip', session ? `Signed in: ${session.username}` : 'Staff sign in');
  button?.classList.toggle('auth-session-button--active', Boolean(session));
  form?.classList.toggle('hidden', Boolean(session));
  passwordForm?.classList.toggle('hidden', !session || demoMode);
  signout?.classList.toggle('hidden', !session);
  headerSignout?.classList.toggle('hidden', !session);
  historyButton?.classList.toggle('hidden', !session);
  closeButton?.classList.toggle('hidden', !session);
  document.body?.classList.toggle('query-auth-required', !session);
  if (status) {
    status.textContent = session
      ? `Signed in as ${session.username}${demoMode ? ' using sample data' : ''}.`
      : restoringPersistentSession
        ? 'Checking your saved sign-in...'
      : demoMode
        ? 'Demo account: demo / library'
        : 'Sign in to access Library Item Reports.';
  }
  if (!session && !restoringPersistentSession) queueMicrotask(openRequiredSignIn);
}

async function restorePersistentSession() {
  if (getSession() || isDemoApiUrl(getApiUrl())) return false;
  restoringPersistentSession = true;
  render();
  try {
    const response = await queryFetch(getApiUrl(), {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'whoami' })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.authenticated || !payload.username) return false;
    setSession({
      cookieSession: true,
      username: payload.username,
      role: payload.role || 'user'
    });
    globalThis.location?.reload();
    return true;
  } catch (_) {
    return false;
  } finally {
    restoringPersistentSession = false;
    render();
  }
}

button?.addEventListener('click', () => {
  clearPasswordFields();
  render();
  dialog?.showModal();
});

dialog?.addEventListener('click', event => {
  const toggle = event.target.closest?.('.auth-password-toggle');
  if (!toggle) return;
  const control = toggle.closest('.auth-password-control');
  const input = control?.querySelector('input');
  if (!input) return;
  if (!toggle.dataset.hiddenLabel) toggle.dataset.hiddenLabel = toggle.getAttribute('aria-label') || 'Show password';
  const visible = input.type === 'password';
  input.type = visible ? 'text' : 'password';
  control.classList.toggle('auth-password-control--visible', visible);
  const label = visible ? 'Hide password' : toggle.dataset.hiddenLabel;
  toggle.setAttribute('aria-label', label);
  toggle.setAttribute('title', label);
  toggle.setAttribute('aria-pressed', String(visible));
});

passwordForm?.addEventListener('submit', async event => {
  event.preventDefault();
  const session = getSession();
  const submit = passwordForm.querySelector('[type="submit"]');
  const values = new FormData(passwordForm);
  const replacement = String(values.get('new_password') || '');
  if (replacement !== String(values.get('confirm_password') || '')) {
    status.textContent = 'New passwords do not match.';
    return;
  }
  submit.disabled = true;
  status.textContent = 'Changing password...';
  try {
    const response = await queryFetch(getApiUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Query-Session': session.token
      },
      body: JSON.stringify({
        action: 'change_password',
        current_password: String(values.get('current_password') || ''),
        new_password: replacement
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.status !== 'password_changed') {
      throw new Error(payload.error || 'Password change failed.');
    }
    passwordForm.reset();
    concealPasswords();
    clearSession();
    render();
    status.textContent = 'Password changed. Sign in again with the new password.';
  } catch (error) {
    status.textContent = error.message || 'Password change failed.';
  } finally {
    submit.disabled = false;
  }
});

dialog?.querySelector('[data-auth-close]')?.addEventListener('click', () => {
  if (!getSession()) return;
  clearPasswordFields();
  dialog.close();
});
dialog?.addEventListener('click', event => {
  if (event.target === dialog && getSession()) {
    clearPasswordFields();
    dialog.close();
  }
});
dialog?.addEventListener('cancel', event => {
  if (!getSession()) event.preventDefault();
});
dialog?.addEventListener('close', () => {
  clearPasswordFields();
  if (!getSession() && !restoringPersistentSession) queueMicrotask(openRequiredSignIn);
});

form?.addEventListener('submit', async event => {
  event.preventDefault();
  const submit = form.querySelector('[type="submit"]');
  const values = new FormData(form);
  submit.disabled = true;
  status.textContent = 'Signing in...';
  try {
    const response = await queryFetch(getApiUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'login',
        username: String(values.get('username') || '').trim(),
        password: String(values.get('password') || '')
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.token) {
      throw new Error(payload.error || 'Sign in failed.');
    }
    setSession(payload);
    form.reset();
    concealPasswords();
    dialog.close();
    globalThis.location?.reload();
  } catch (error) {
    status.textContent = error.message || 'Sign in failed.';
  } finally {
    submit.disabled = false;
  }
});

async function signOut() {
  const session = getSession();
  try {
    if (session?.token) {
      await queryFetch(getApiUrl(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Query-Session': session.token
        },
        body: JSON.stringify({ action: 'logout' })
      });
    }
  } finally {
    clearSession();
    if (dialog?.open) dialog.close();
    globalThis.location?.reload();
  }
}

signout?.addEventListener('click', signOut);
headerSignout?.addEventListener('click', signOut);

globalThis.addEventListener?.('query-auth:changed', render);
restorePersistentSession().then(restored => {
  if (!restored) render();
});
