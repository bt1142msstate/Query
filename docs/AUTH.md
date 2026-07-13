# Authentication And Access Control Guide

The public API remains available for non-sensitive library queries. Staff sign-in unlocks protected fields and administrative operations; the backend enforces those permissions independently of frontend controls.

## Current Sirsi-Local Authentication

The GitHub Pages frontend signs in against the Sirsi CGI API over HTTPS. The backend verifies a locally provisioned password hash and returns an opaque, revocable bearer session:

- Passwords are stored only as per-user PBKDF2-SHA256 hashes with unique salts and 210,000 iterations.
- Session tokens expire after eight hours and are stored server-side only as SHA-256 token hashes.
- The browser keeps its raw token in `sessionStorage`, so it is removed when the browser session ends and is never placed in a URL or repository.
- Login attempts are limited to five per five minutes per client, followed by a 15-minute block.
- Login, logout, and staff API actions are recorded in the private request audit trail without passwords or tokens.
- Account and session files live outside the CGI document tree under `/software/MLP/APIwork/Playground/QueryBackend/auth` with private permissions.

The initial administrators are `bt1142` and `alw3`. Account provisioning is performed through the secure local password prompt; plaintext passwords must never enter source, logs, shell arguments, job files, chat, or the clipboard.

## Authorization Rules

| Access | Operations |
| --- | --- |
| Public | Public field metadata, public-field query execution, status/results, and template/category reads |
| Administrator | Public operations plus protected fields, cancellation, template/category mutation, and administrative history/results |

Protected fields include staff notes and internal created/modified metadata. Public clients receive `403` if they submit a protected field manually.

## Request Boundary

The API accepts state-changing actions only through bounded JSON POST requests. Cross-origin requests must match an exact configured origin; wildcard CORS is not supported. The public API intentionally remains cross-origin accessible for ordinary non-sensitive queries.

Staff browser requests use `X-Query-Session: <opaque-session-token>` because the production CGI host does not forward the standard authorization header. Controlled service clients may still use configured standard bearer authentication. Never put either token in API Settings, query parameters, logs, or shared links.

## Account Operations

- Provision or replace hashes using the reviewed secure account helper.
- Disable an account in server-side account state when access should be suspended.
- Replacing an account password invalidates its old password; clear existing sessions during credential rotation.
- Do not manually edit a hash, reuse another account's salt, or create plaintext recovery fields.

## Deployment Checks

- Confirm public ordinary queries still work without signing in.
- Confirm public protected-field requests return `403`.
- Confirm both administrator accounts can sign in, call `whoami`, reach a protected action, sign out, and cannot reuse the revoked token.
- Confirm invalid credentials return the same generic response for known and unknown usernames.
- Confirm account, session, lock, rate-limit, and audit files have private permissions.
- Keep HTTPS, timeouts, row limits, private runtime storage, and rate limits enabled.

The collocated Sirsi backend source includes `SECURITY_AUDIT.md` and focused authentication tests.
