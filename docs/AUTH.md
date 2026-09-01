# Authentication And Access Control Guide

The MLP Query Project requires staff sign-in before any query feature is available. Only login, identity checks, and the one-time CLI authorization exchange are accepted without a session; the backend enforces that boundary independently of frontend controls. Creating a CLI authorization code requires an authenticated same-origin browser cookie.

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

The approved administrators are `bt1142` and `alw3`; no other staff account should carry the `admin` role. Local-session administrator authorization also checks this fixed username roster, so an accidentally elevated account record does not gain privileged API access. This role is the server-side boundary for Close Dates changes, schedules, application configuration, template mutation, cancellations, and other privileged operations. Command Center provisioning sends an opaque setup link with an administrator-selected lifetime, followed by a separate six-digit email code that expires after 10 minutes. Plaintext or temporary passwords, invitation tokens, and verification codes must never enter source, logs, shell arguments, job files, chat, or the clipboard.

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

The preferred interactive path is `query:pair`. The CLI binds a temporary listener to IPv4 loopback, creates a random state value and S256 PKCE challenge, and opens the Query Website over HTTPS. A signed-in user must explicitly approve the request. The browser then receives a 120-second, single-use authorization code and sends it to the exact `127.0.0.1` callback; the CLI validates state, exchanges the code with its private verifier, and stores the resulting independent session in macOS Keychain. Only a hash of the temporary code is stored server-side, and the code is consumed even when an exchange fails.

This follows the native-app loopback redirect and PKCE security pattern while avoiding cookie extraction. The browser password, persistent cookie, compatibility token, authorization code, verifier, and resulting CLI token are never placed in repository files or CLI output. `query:login --password-stdin` remains a fallback when browser pairing is unavailable. `query:whoami` verifies the active identity, and `query:logout` revokes the backend session and removes the Keychain entry.

## Account Operations

- Use Command Center Staff access to create, edit, invite, disable, restore, or delete standard accounts.
- Invitation-link choices are 30 minutes, 24 hours, 7 days, 30 days, or non-expiring. Opening the link is not sufficient: password creation requires a separate six-digit code sent to the account's registered email and valid for 10 minutes.
- Resending an invitation revokes the account's prior onboarding link. Disabling, renaming, or deleting an account also revokes onboarding state.
- Disable an account in server-side account state when access should be suspended.
- Replacing an account password invalidates its old password; clear existing sessions during credential rotation.
- Sign-out and successful password changes revoke the server session and expire the persistent cookie immediately.
- Do not manually edit a hash, reuse another account's salt, or create plaintext recovery fields.

## Deployment Checks

- Confirm unsigned `login`, `whoami`, and `exchange_cli_authorization` requests reach their handlers while `authorize_cli`, `get_fields`, `run`, templates, history, and result retrieval return `403` without a session.
- Confirm `authorize_cli` accepts only an authenticated local browser session and an S256 challenge; confirm each code expires after 120 seconds, cannot be replayed, and cannot be redeemed with a different verifier.
- Confirm signed-in ordinary queries work and protected fields remain authorization-gated.
- Confirm both administrator accounts can sign in, call `whoami`, reach a protected action, sign out, and cannot reuse the revoked token.
- Confirm invalid credentials return the same generic response for known and unknown usernames.
- Confirm account, session, lock, rate-limit, and audit files have private permissions.
- Keep HTTPS, timeouts, row limits, private runtime storage, and rate limits enabled.

The collocated Sirsi backend source includes `SECURITY_AUDIT.md` and focused authentication tests.

## Sirsi Operations Is A Separate High-Privilege Boundary

The Sirsi Operations API is not part of ordinary Query or Command Center authorization. It is an administrative deployment and server-operation surface, so every request must independently satisfy both of these conditions:

- the existing Query CLI session identifies Brandon's authorized administrator account (`bt1142`); and
- Brandon's approved Mac produces a fresh signature with its hardware-bound Secure Enclave key.

Neither factor is sufficient by itself. This additional device requirement applies only to the fixed Sirsi Operations endpoint. Query building, dashboards, hydration, Command Center, account administration, and other normal application actions continue to use their existing account and role checks and do not require the Mac device key.
