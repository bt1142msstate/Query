# Authentication And Access Control Guide

This project is a static frontend with a swappable backend. The frontend should not collect library-system passwords, store API keys, or hold long-lived access tokens. Authentication and authorization should live in the backend adapter, reverse proxy, or an identity-aware gateway.

## Recommended Pattern

Use a same-origin authenticated backend-for-frontend:

```text
https://reports.example.org/          -> static frontend
https://reports.example.org/api/query -> authenticated Query API adapter
```

Flow:

1. User opens the app.
2. The server, proxy, or API checks for a valid session.
3. If unauthenticated, it redirects to the organization's existing sign-in system.
4. The identity provider authenticates the user with existing credentials.
5. The backend creates a server-side session and sets a secure session cookie.
6. The browser calls `/api/query`; the backend validates the session and authorizes the query before touching the library system.

The app should use `/api/query` in API Settings. The browser sends only a same-origin session cookie; data-system credentials stay server-side.

## Existing Sign-In Options

Use the identity system the library or institution already has:

| Existing system | Recommended integration |
| --- | --- |
| Microsoft Entra ID, Google Workspace, Okta, Auth0, Keycloak | OpenID Connect authorization code flow handled by the backend or gateway |
| Shibboleth, InCommon, institutional SSO | SAML handled by a service provider, reverse proxy, or gateway |
| CAS | CAS handled by the backend or gateway |
| LDAP or Active Directory | Prefer an IdP/gateway that talks to LDAP/AD; do not send LDAP passwords from the browser to the static app |
| VPN or intranet-only deployments | Still use app/API sessions for user attribution and access control when reports expose private data |

The frontend does not need a provider-specific SDK for these flows. It only needs a same-origin API URL after sign-in.

## Cookie And Session Requirements

Use server-side sessions or a token-mediating backend. Do not expose refresh tokens or data-system credentials to browser JavaScript.

Recommended cookie settings:

```http
Set-Cookie: query_session=<opaque-id>; Path=/; HttpOnly; Secure; SameSite=Lax
```

Use `SameSite=Strict` when the sign-in flow and user workflows do not require cross-site redirects back into a state-changing request. Use `SameSite=None; Secure` only when a real cross-site embedded or separate-domain requirement exists.

Session requirements:

- Generate high-entropy opaque session IDs.
- Rotate the session after login.
- Expire idle and absolute sessions.
- Store user identity, roles, and data-system access server-side.
- Add CSRF protection for authenticated cookie-backed state-changing endpoints.
- Log user id, action, query id, duration, row count, and errors server-side.

## Authorization Rules

Authentication says who the user is. Authorization says what that user can query.

At minimum, the backend should enforce:

- deny by default
- least privilege by role or group
- per-action checks for `get_fields`, `run`, `status`, `cancel`, `get_results`, and templates
- row, location, library, or collection scoping when a user should not see every result
- server-side field allowlists for sensitive fields
- rate limits, query timeouts, and max row/export limits
- audit logs for report access and export generation

Do not rely on hidden frontend controls to protect data. The backend must reject unauthorized fields, filters, result IDs, and template actions.

## Sensitive Field Metadata

The API contract supports field-level metadata so the UI can label sensitive fields and avoid letting users add fields they are not authorized to use. This is only a convenience layer; the backend remains responsible for enforcement.

Recommended `get_fields` metadata for protected fields:

```json
{
  "name": "Checkout User Name",
  "type": "string",
  "category": "User",
  "filters": ["equals"],
  "sensitive": true,
  "requiresAuth": true,
  "authorized": false,
  "requiredScopes": ["reports:sensitive"],
  "authMessage": "Sign in with an authorized staff account to use checkout user fields."
}
```

Use `authorized: false` when a user can see that a field exists but cannot use it yet. For fully hidden fields, omit them from `get_fields` until the authenticated user has access. Either way, the backend must reject unauthorized `display_fields` and `filters` in `run` requests, because hand-edited JSON can bypass UI controls.

The sample Sirsi backend helper follows a default-deny model for fields marked `sensitive`, `requiresAuth`, or `requiredScopes`. A deployment can grant access by instantiating the command creator with the required scope, or by setting trusted backend environment context before handling a request:

```text
QUERY_API_AUTH_SCOPES=reports:sensitive
```

For emergency/internal deployments only, `QUERY_API_ALLOW_SENSITIVE_REPORTS=1` allows all sensitive report fields. Treat that as an administrative bypass, not normal user auth.

If an SSO gateway or reverse proxy sets per-request headers, only trust them after the proxy strips spoofed incoming headers and runs on the same trusted network path. The backend supports `QUERY_API_TRUST_PROXY_AUTH_HEADERS=1` with `X-Query-API-Scopes`, but this should be enabled only behind a controlled proxy.

## Frontend Behavior

The app's API requests use `credentials: "same-origin"`. This intentionally supports the recommended same-origin session model and avoids sending cookies to arbitrary cross-origin API URLs configured in API Settings.

Recommended API Settings value for private deployments:

```text
/api/query
```

Avoid:

```text
https://api.example.org/query-api?token=secret
```

If a deployment truly requires a separate API origin, prefer putting a same-origin proxy in front of it:

```text
https://reports.example.org/api/query -> https://api.example.org/query-api
```

If you intentionally build a cross-origin credentialed deployment, you must change both the frontend credential policy and the backend CORS policy deliberately. Do not use wildcard CORS with credentials.

## Optional Auth Status Endpoint

A deployment can add a small authenticated status route outside the Query API contract:

```http
GET /api/session
```

Example response:

```json
{
  "authenticated": true,
  "user": {
    "id": "jane.doe",
    "displayName": "Jane Doe",
    "roles": ["reports"]
  },
  "expiresAt": "2026-06-26T22:30:00Z"
}
```

This is useful for showing "signed in as..." in a deployment shell. It is optional; the core Query API remains `POST` JSON actions plus JSONL streams.

## Deployment Checklist

- Serve the frontend and API over HTTPS.
- Prefer same-origin `/api/query`.
- Put sign-in in the backend, proxy, or identity gateway.
- Use existing institutional credentials through OIDC, SAML, CAS, or an IdP-backed directory.
- Keep secrets, refresh tokens, and library-system credentials server-side.
- Set session cookies with `HttpOnly`, `Secure`, and an appropriate `SameSite` value.
- Enforce backend authorization for fields, filters, result IDs, templates, exports, and cancellation.
- Add CSRF protection for cookie-backed authenticated actions.
- Add rate limits, query timeouts, max result limits, and audit logs.
- Run API Settings compatibility checks after sign-in.

## References

- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)
- [OAuth 2.0 for Browser-Based Apps](https://datatracker.ietf.org/doc/draft-ietf-oauth-browser-based-apps/)
- [OpenID Connect Core](https://openid.net/specs/openid-connect-core-1_0.html)
- [Shibboleth Service Provider](https://www.shibboleth.net/products/service-provider/) and [Apereo CAS](https://apereo.github.io/cas/)
