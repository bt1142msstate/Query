# Authentication And Access Control Guide

The MLP Query Project requires staff sign-in before any query feature is available. Only login and identity checks are accepted without a session; the backend enforces that boundary independently of frontend controls.

## Current Sirsi-Local Authentication

The GitHub Pages frontend signs in against the Sirsi CGI API over HTTPS. The backend verifies a locally provisioned password hash and returns an opaque, revocable bearer session:

- Passwords are stored only as per-user PBKDF2-SHA256 hashes with unique salts and 210,000 iterations.
- Same-origin production login sets a `__Host-QuerySession` cookie with `Secure`, `HttpOnly`, `SameSite=Strict`, `Path=/`, and a 30-day maximum age. JavaScript cannot read the persistent cookie.
- Persistent sessions have a server-enforced seven-day inactivity timeout and a 30-day absolute lifetime. Activity refreshes the idle deadline at most once every five minutes.
- Session tokens are stored server-side only as SHA-256 token hashes. The browser may keep the active tab's compatibility token in `sessionStorage`, but it is removed with the browser session and is never placed in a URL or repository.
- On a later browser launch, the frontend calls `whoami` with the cookie, restores only username/role metadata, and confirms the account before enabling the application.
- Login attempts are limited to five per five minutes per client, followed by a 15-minute block.
- Login, logout, and staff API actions are recorded in the private request audit trail without passwords or tokens.
- Account and session files live outside the CGI document tree under `/software/MLP/APIwork/Playground/QueryBackend/auth` with private permissions.

The initial administrators are `bt1142` and `alw3`. Account provisioning is performed through the secure local password prompt; plaintext passwords must never enter source, logs, shell arguments, job files, chat, or the clipboard.

## Authorization Rules

| Access | Operations |
| --- | --- |
| Signed out | Login and identity checks only |
| Signed-in user | Field metadata, public-field query execution, template/category reads, and account-scoped query history and saved-result retrieval |
| Administrator | Signed-in operations plus protected fields, cancellation, template/category mutation, and history/results across accounts |

Protected fields include staff notes and internal created/modified metadata. They remain restricted to authorized administrators even after sign-in.

## Request Boundary

The API accepts actions only through bounded JSON POST requests. Cross-origin requests must match an exact configured origin; wildcard CORS is not supported. An allowed origin does not bypass authentication.

Staff browser requests use `X-Query-Session: <opaque-session-token>` because the production CGI host does not forward the standard authorization header. Controlled service clients may still use configured standard bearer authentication. Never put either token in API Settings, query parameters, logs, or shared links.

## Account Operations

- Provision or replace hashes using the reviewed secure account helper.
- Disable an account in server-side account state when access should be suspended.
- Replacing an account password invalidates its old password; clear existing sessions during credential rotation.
- Sign-out and successful password changes revoke the server session and expire the persistent cookie immediately.
- Do not manually edit a hash, reuse another account's salt, or create plaintext recovery fields.

## Deployment Checks

- Confirm unsigned `login` and `whoami` requests work while `get_fields`, `run`, templates, history, and result retrieval return `403`.
- Confirm signed-in ordinary queries work and protected fields remain authorization-gated.
- Confirm both administrator accounts can sign in, call `whoami`, reach a protected action, sign out, and cannot reuse the revoked token.
- Confirm invalid credentials return the same generic response for known and unknown usernames.
- Confirm account, session, lock, rate-limit, and audit files have private permissions.
- Keep HTTPS, timeouts, row limits, private runtime storage, and rate limits enabled.

The collocated Sirsi backend source includes `SECURITY_AUDIT.md` and focused authentication tests.
