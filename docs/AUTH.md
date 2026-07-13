# Authentication And Access Control Guide

The static frontend must not collect library-system passwords, store API keys, or contain long-lived access tokens. Authentication and authorization are enforced by the Sirsi CGI backend together with Apache or a trusted identity gateway.

## Recommended Pattern

Use a same-origin authenticated backend-for-frontend:

```text
https://reports.example.org/          -> static frontend
https://reports.example.org/api/query -> authenticated Sirsi Query API
```

The frontend calls `/api/query` with `credentials: "same-origin"`. Apache or the identity gateway authenticates the browser session and supplies a verified CGI `REMOTE_USER`; the frontend never receives data-system credentials.

Use the organization's existing OpenID Connect (OIDC), SAML/Shibboleth, CAS, or directory-backed gateway. Do not copy a client-supplied identity header into `REMOTE_USER`. The web server must establish that value only after successful authentication.

## Current Backend Enforcement

`QUERY_API_AUTH_MODE` defaults to `required`. CGI access succeeds through one of two paths:

| Method | Use | Requirement |
| --- | --- | --- |
| `REMOTE_USER` | Browser users behind Apache or a trusted gateway | The web tier authenticates the request and sets a valid CGI `REMOTE_USER` |
| Bearer token | CLI or a controlled service client | `Authorization: Bearer ...` must match server-side `QUERY_API_BEARER_TOKEN`, which must contain at least 32 characters |

`QUERY_API_AUTH_MODE=off` is a local-development bypass that grants administrator access. Never enable it on a production route.

### Configuration

```text
QUERY_API_AUTH_MODE=required
QUERY_API_AUTHORIZED_USERS=<optional comma-separated REMOTE_USER allowlist>
QUERY_API_ADMIN_USERS=<comma-separated REMOTE_USER administrator allowlist>
QUERY_API_ALLOWED_ORIGINS=<exact comma-separated origins, only when cross-origin is required>
```

Bearer service-client configuration:

```text
QUERY_API_BEARER_TOKEN=<random server-side secret of at least 32 characters>
QUERY_API_BEARER_ROLE=user
```

Set `QUERY_API_BEARER_ROLE=admin` only for a separately controlled client that requires privileged operations. Keep the token outside the repository, frontend, URL, logs, and web-readable files.

## Authorization Rules

The backend enforces authorization independently of visible frontend controls.

| Access | Operations |
| --- | --- |
| Authenticated user | Field metadata, query execution, status/history for owned queries, results for owned queries, and template/category reads |
| Administrator | All user operations, cancellation, template/category create/update/delete/reorder, all query history/results, and `Staff Note` display or filtering |

Non-admin users cannot retrieve another principal's result by guessing a query id. `Staff Note` is omitted from their field metadata and rejected if submitted in hand-edited query JSON.

Client-supplied template `svg` and `bubble_svg` values are rejected. Legacy SVG fields are not returned to the browser.

## Browser And CSRF Boundary

The API accepts state-changing actions only through JSON POST requests. Requests are limited to `application/json`, exact bounded `Content-Length`, and a 1 MiB body. A cross-origin browser request must match a full origin in `QUERY_API_ALLOWED_ORIGINS`; wildcard CORS is not supported.

Same-origin deployment is preferred. When authentication uses cookies, configure them with `HttpOnly`, `Secure`, and an appropriate `SameSite` value. The gateway must not expose an authenticated CGI route through a second origin that bypasses the backend's origin check.

## Frontend Behavior

The app intentionally sends credentials only to its own origin. Recommended API Settings value:

```text
/api/query
```

Do not put secrets in API Settings or `?api_url=`:

```text
https://api.example.org/query-api?token=secret
```

For a separate API origin, prefer a same-origin reverse proxy. The existing browser frontend does not inject bearer credentials into requests.

## Deployment Checks

- Serve the frontend and API over HTTPS.
- Verify the identity layer sets `REMOTE_USER` only after sign-in.
- Confirm an unauthenticated POST returns `401`.
- Confirm a normal user can run a query but receives `403` for an admin-only action and `Staff Note`.
- Confirm only configured administrators can mutate templates or cancel queries.
- Confirm non-admin users cannot list or retrieve another user's query.
- Confirm an unlisted Origin receives `403` and no wildcard CORS header.
- Keep rate limits, query timeouts, row limits, private runtime storage, and audit logging enabled.
- Run the API compatibility checks after authentication is active.

The collocated Sirsi backend source includes `SECURITY_AUDIT.md` with the complete audit and production gate.

## References

- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)
- [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- [OWASP CSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
