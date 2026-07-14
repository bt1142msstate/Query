const AUTH_KEY = 'query-project.session';
let session = null;
try { session = JSON.parse(globalThis.sessionStorage?.getItem(AUTH_KEY) || 'null'); } catch (_) { session = null; }

function getAuthorizationHeaders() {
  return session?.token ? { 'X-Query-Session': session.token } : {};
}
function getSession() { return session; }
function setSession(value) {
  session = value?.token || value?.cookieSession ? value : null;
  try { session ? globalThis.sessionStorage?.setItem(AUTH_KEY, JSON.stringify(session)) : globalThis.sessionStorage?.removeItem(AUTH_KEY); } catch (_) {}
  if (typeof globalThis.CustomEvent === 'function') {
    globalThis.dispatchEvent?.(new CustomEvent('query-auth:changed', { detail: session }));
  }
}
function clearSession() { setSession(null); }
export { clearSession, getAuthorizationHeaders, getSession, setSession };
