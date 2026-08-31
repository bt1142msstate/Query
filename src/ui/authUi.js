import { getApiUrl } from '../core/backendApi.js';
import { resolveAccountApiUrl } from '../core/authApiUrl.js';
import { clearSession, getSession, setSession } from '../core/authSession.js';
import { isDemoApiUrl, queryFetch } from '../core/mockQueryBackend.js';
import {
  formatSignInRetryCountdown,
  getRateLimitDeadline,
  getRemainingSeconds
} from './authRateLimit.js';

const button = document.getElementById('auth-session-button');
const dialog = document.getElementById('auth-session-dialog');
const form = document.getElementById('auth-session-form');
const passwordForm = document.getElementById('auth-password-form');
const profileForm = document.getElementById('auth-profile-form');
const forgotForm = document.getElementById('auth-forgot-form');
const forgotButton = document.getElementById('auth-forgot-button');
const codeForm = document.getElementById('auth-code-form');
const codeButton = document.getElementById('auth-code-button');
const status = document.getElementById('auth-session-status');
const signout = document.getElementById('auth-session-signout');
const headerSignout = document.getElementById('auth-header-signout');
const historyButton = document.getElementById('toggle-queries');
const dashboardButton = document.getElementById('toggle-kpi-dashboard');
const closeButton = dialog?.querySelector('[data-auth-close]');
const rateLimitPanel = document.getElementById('auth-rate-limit');
const rateLimitCountdown = document.getElementById('auth-rate-limit-countdown');
const rateLimitProgress = document.getElementById('auth-rate-limit-progress');
let restoringPersistentSession = false;
let loginRateLimitDeadline = 0;
let loginRateLimitDuration = 0;
let loginRateLimitTimer = 0;
function getAccountApiUrl() {
  return resolveAccountApiUrl(getApiUrl());
}

function getClientErrorMessage(error, { fallback }) {
  return error?.message || fallback;
}

async function postAccountJson(payload) {
  const response = await queryFetch(getAccountApiUrl(), { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || `Request failed (${response.status})`);
    error.status = response.status;
    error.payload = data;
    if (response.status === 429) {
      error.name = 'RateLimitError';
      error.isRateLimited = true;
      error.retryAfterSeconds = Number(data.retry_after_seconds || data.retry_after || 0);
    }
    throw error;
  }
  return { response, data };
}

function loginSubmitButton() {
  return form?.querySelector('[type="submit"]') || null;
}

function clearLoginRateLimit() {
  if (loginRateLimitTimer) {
    clearInterval(loginRateLimitTimer);
    loginRateLimitTimer = 0;
  }
  loginRateLimitDeadline = 0;
  loginRateLimitDuration = 0;
  rateLimitPanel?.classList.add('hidden');
  if (rateLimitCountdown) rateLimitCountdown.textContent = '';
  if (rateLimitProgress) {
    rateLimitProgress.value = 0;
    rateLimitProgress.max = 1;
  }
}

function renderLoginRateLimit() {
  const remaining = getRemainingSeconds(loginRateLimitDeadline);
  const submit = loginSubmitButton();
  if (remaining <= 0) {
    clearLoginRateLimit();
    if (submit) submit.disabled = false;
    if (status) status.textContent = 'You can try signing in again.';
    return;
  }

  rateLimitPanel?.classList.remove('hidden');
  if (rateLimitCountdown) {
    rateLimitCountdown.textContent = `Try again in ${formatSignInRetryCountdown(remaining)}.`;
  }
  if (rateLimitProgress) {
    rateLimitProgress.max = Math.max(1, loginRateLimitDuration);
    rateLimitProgress.value = remaining;
  }
  if (submit) submit.disabled = true;
}

function startLoginRateLimit(error) {
  clearLoginRateLimit();
  loginRateLimitDeadline = getRateLimitDeadline(error);
  const remaining = getRemainingSeconds(loginRateLimitDeadline);
  if (remaining <= 0) return false;
  loginRateLimitDuration = remaining;

  clearPasswordFields();
  if (status) status.textContent = 'Too many unsuccessful sign-in attempts.';
  renderLoginRateLimit();
  loginRateLimitTimer = setInterval(renderLoginRateLimit, 250);
  return true;
}

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
  const identity = session?.display_name || session?.username;
  button?.setAttribute('aria-label', session ? `Signed in as ${identity}` : 'Staff sign in');
  button?.setAttribute('data-tooltip', session ? `Signed in: ${identity}` : 'Staff sign in');
  button?.classList.toggle('auth-session-button--active', Boolean(session));
  form?.classList.toggle('hidden', Boolean(session));
  passwordForm?.classList.toggle('hidden', !session || demoMode);
  profileForm?.classList.toggle('hidden', !session || demoMode);
  forgotButton?.classList.toggle('hidden', Boolean(session));
  codeButton?.classList.toggle('hidden', Boolean(session));
  signout?.classList.toggle('hidden', !session);
  headerSignout?.classList.toggle('hidden', !session);
  historyButton?.classList.toggle('hidden', !session);
  dashboardButton?.classList.toggle('hidden', !session);
  closeButton?.classList.toggle('hidden', !session);
  document.body?.classList.toggle('query-auth-required', !session);
  if (status) {
    status.textContent = session
      ? `Signed in as ${identity}${demoMode ? ' using sample data' : ''}.`
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
    const response = await queryFetch(getAccountApiUrl(), {
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
      role: payload.role || 'user',
      display_name: payload.display_name || payload.username,
      email: payload.email || ''
    });
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
  const session = getSession();
  if (session && profileForm) {
    profileForm.elements.display_name.value = session.display_name || session.username || '';
    profileForm.elements.username.value = session.username || '';
    profileForm.elements.email.value = session.email || '';
  }
  dialog?.showModal();
});

function sessionHeaders(session) {
  return session?.token ? { 'X-Query-Session': session.token } : {};
}

forgotButton?.addEventListener('click', () => {
  form?.classList.add('hidden');
  forgotForm?.classList.remove('hidden');
  status.textContent = 'Password recovery';
  forgotForm?.elements.email?.focus();
});
forgotForm?.querySelector('[data-forgot-back]')?.addEventListener('click', () => {
  forgotForm.classList.add('hidden');
  form?.classList.remove('hidden');
  status.textContent = 'Sign in to access Library Item Reports.';
});
forgotForm?.addEventListener('submit', async event => {
  event.preventDefault();
  const submit = forgotForm.querySelector('[type="submit"]');
  submit.disabled = true;
  try {
    const { data } = await postAccountJson({ action: 'request_password_reset', email: String(new FormData(forgotForm).get('email') || '').trim() });
    status.textContent = data.message || 'If that email matches an account, a reset link has been sent.';
    forgotForm.reset();
  } catch (error) {
    status.textContent = getClientErrorMessage(error, { fallback: 'Password recovery could not be started. Try again.' });
  } finally { submit.disabled = false; }
});

codeButton?.addEventListener('click', () => {
  form?.classList.add('hidden');
  forgotForm?.classList.add('hidden');
  codeForm?.classList.remove('hidden');
  status.textContent = 'Sign in with an email code';
  codeForm?.elements.email?.focus();
});
codeForm?.querySelector('[data-code-back]')?.addEventListener('click', () => {
  codeForm.classList.add('hidden');
  form?.classList.remove('hidden');
  status.textContent = 'Sign in to access Library Item Reports.';
});
codeForm?.querySelector('[data-code-send]')?.addEventListener('click', async event => {
  const send = event.currentTarget;
  const email = String(new FormData(codeForm).get('email') || '').trim();
  if (!email) { status.textContent = 'Enter your recovery email.'; return; }
  send.disabled = true;
  try {
    const { data } = await postAccountJson({ action: 'request_login_code', email });
    codeForm.querySelector('[data-code-field]')?.classList.remove('hidden');
    codeForm.elements.code.required = true;
    codeForm.querySelector('[data-code-complete]')?.classList.remove('hidden');
    status.textContent = data.message || 'If that email matches an account, a sign-in code has been sent.';
    codeForm.elements.code.focus();
  } catch (error) {
    status.textContent = getClientErrorMessage(error, { fallback: 'A sign-in code could not be sent. Try again.' });
  } finally { send.disabled = false; }
});
codeForm?.addEventListener('submit', async event => {
  event.preventDefault();
  const submit = codeForm.querySelector('[data-code-complete]');
  const values = new FormData(codeForm);
  submit.disabled = true;
  try {
    const { data } = await postAccountJson({ action: 'login_with_code', email: String(values.get('email') || '').trim(), code: String(values.get('code') || '').trim() });
    setSession({ cookieSession: true, ...data });
    globalThis.location?.reload();
  } catch (error) {
    status.textContent = getClientErrorMessage(error, { fallback: 'That code is invalid or expired.' });
  } finally { submit.disabled = false; }
});

profileForm?.addEventListener('submit', async event => {
  event.preventDefault();
  const session = getSession();
  const submit = profileForm.querySelector('[type="submit"]');
  const values = new FormData(profileForm);
  submit.disabled = true;
  status.textContent = 'Saving profile...';
  try {
    const response = await queryFetch(getAccountApiUrl(), {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...sessionHeaders(session) },
      body: JSON.stringify({ action: 'update_profile', display_name: String(values.get('display_name') || '').trim(), username: String(values.get('username') || '').trim(), email: String(values.get('email') || '').trim(), current_password: String(values.get('current_password') || '') })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.profile) throw new Error(payload.error || 'Profile update failed.');
    profileForm.elements.current_password.value = '';
    if (payload.sessions_revoked) {
      clearSession(); render(); status.textContent = 'Profile saved. Sign in again with your username.';
    } else {
      setSession({ ...session, ...payload.profile }); render(); status.textContent = 'Profile saved.';
    }
  } catch (error) { status.textContent = getClientErrorMessage(error, { fallback: 'Your profile could not be saved. Check the entries and try again.' }); }
  finally { submit.disabled = false; }
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
    const response = await queryFetch(getAccountApiUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...sessionHeaders(session)
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
    status.textContent = getClientErrorMessage(error, { fallback: 'Your password could not be changed. Check the entries and try again.' });
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
  if (getRemainingSeconds(loginRateLimitDeadline) > 0) {
    renderLoginRateLimit();
    return;
  }
  const values = new FormData(form);
  submit.disabled = true;
  status.textContent = 'Signing in...';
  try {
    const { data: payload } = await postAccountJson({
      action: 'login',
      username: String(values.get('username') || '').trim(),
      password: String(values.get('password') || '')
    }, {
      notifyOnRateLimit: false
    });
    if (!payload.token) {
      throw new Error(payload.error || 'Sign in failed.');
    }
    clearLoginRateLimit();
    setSession(payload);
    form.reset();
    concealPasswords();
    dialog.close();
    globalThis.location?.reload();
  } catch (error) {
    if (!error?.isRateLimited || !startLoginRateLimit(error)) {
      status.textContent = getClientErrorMessage(error, { fallback: 'Sign in did not work. Check your username and password and try again.' });
    }
  } finally {
    submit.disabled = getRemainingSeconds(loginRateLimitDeadline) > 0;
  }
});

async function signOut() {
  const session = getSession();
  try {
    if (session?.token) {
      await queryFetch(getAccountApiUrl(), {
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
