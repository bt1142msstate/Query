import { getApiUrl } from '../core/backendApi.js';
import { clearSession, getSession, setSession } from '../core/authSession.js';

const button = document.getElementById('auth-session-button');
const dialog = document.getElementById('auth-session-dialog');
const form = document.getElementById('auth-session-form');
const passwordForm = document.getElementById('auth-password-form');
const status = document.getElementById('auth-session-status');
const signout = document.getElementById('auth-session-signout');

function render() {
  const session = getSession();
  button?.setAttribute('aria-label', session ? `Signed in as ${session.username}` : 'Staff sign in');
  button?.setAttribute('data-tooltip', session ? `Signed in: ${session.username}` : 'Staff sign in');
  button?.classList.toggle('auth-session-button--active', Boolean(session));
  form?.classList.toggle('hidden', Boolean(session));
  passwordForm?.classList.toggle('hidden', !session);
  signout?.classList.toggle('hidden', !session);
  if (status) {
    status.textContent = session ? `Signed in as ${session.username}.` : '';
  }
}

button?.addEventListener('click', () => {
  render();
  dialog?.showModal();
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
    const response = await fetch(getApiUrl(), {
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
    clearSession();
    render();
    status.textContent = 'Password changed. Sign in again with the new password.';
  } catch (error) {
    status.textContent = error.message || 'Password change failed.';
  } finally {
    submit.disabled = false;
  }
});

dialog?.querySelector('[data-auth-close]')?.addEventListener('click', () => dialog.close());
dialog?.addEventListener('click', event => {
  if (event.target === dialog) {
    dialog.close();
  }
});

form?.addEventListener('submit', async event => {
  event.preventDefault();
  const submit = form.querySelector('[type="submit"]');
  const values = new FormData(form);
  submit.disabled = true;
  status.textContent = 'Signing in...';
  try {
    const response = await fetch(getApiUrl(), {
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
    dialog.close();
    globalThis.location?.reload();
  } catch (error) {
    status.textContent = error.message || 'Sign in failed.';
  } finally {
    submit.disabled = false;
  }
});

signout?.addEventListener('click', async () => {
  const session = getSession();
  try {
    if (session?.token) {
      await fetch(getApiUrl(), {
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
    dialog.close();
    globalThis.location?.reload();
  }
});

globalThis.addEventListener?.('query-auth:changed', render);
render();
