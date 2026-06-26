# Deployment Recipes

This project is a static frontend with a bring-your-own API model. The recommended backend contract is the JSON request plus JSONL stream described in [`docs/INTEGRATION.md`](INTEGRATION.md).

## Recommended Pattern

Use a same-origin API route when you can:

```text
https://reports.example.org/index.html
https://reports.example.org/api/query
```

Then set the app API URL to:

```text
/api/query
```

This avoids most CORS complexity and keeps authentication cookies on one origin.

For private deployments with sign-in or existing institutional credentials, follow [`docs/AUTH.md`](AUTH.md). The short version is: keep sign-in, tokens, library-system credentials, and authorization checks on the backend or reverse proxy; point the frontend at a same-origin route such as `/api/query`.

## Same-Origin Reverse Proxy

Put the static site and API behind the same public origin. A reverse proxy can route:

```text
/               -> static frontend
/api/query      -> backend adapter
```

Example Nginx shape:

```nginx
location / {
  root /var/www/query-frontend;
  try_files $uri $uri/ /index.html;
}

location /api/query {
  proxy_pass http://127.0.0.1:8787/query-api;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
}
```

## CORS Setup

Use CORS when the static frontend and API are on different origins:

```text
https://reports.example.org/index.html
https://api.example.org/query-api
```

Minimum headers:

```http
Access-Control-Allow-Origin: https://reports.example.org
Access-Control-Allow-Methods: POST, OPTIONS
Access-Control-Allow-Headers: Content-Type
Access-Control-Expose-Headers: X-Query-Id, X-Raw-Columns
```

If the API uses cookies, also configure credentials and SameSite policy carefully. Do not use wildcard origins with credentialed requests.

## Cookie Or Session Auth

For internal deployments, prefer a normal server-side session:

1. User signs in to the API origin or shared app origin.
2. The API stores credentials and data-system access server-side.
3. The browser sends only a session cookie.
4. The API validates the session before running actions.

Do not put data-system passwords, API keys, or long-lived tokens into the API Settings URL.

For OIDC, SAML/Shibboleth, CAS, LDAP-backed identity providers, or institutional SSO, terminate sign-in in the backend, reverse proxy, or identity-aware gateway. The browser app should only call the authenticated same-origin Query API route after sign-in.

## Avoid API Keys In Browser URLs

The API Settings panel and `?api_url=` are for endpoint location only. They should not contain secrets.

Avoid:

```text
https://api.example.org/query-api?token=secret
```

Prefer:

```text
https://reports.example.org/api/query
```

Then keep secrets in the backend environment or reverse proxy configuration.

## GitHub Pages Frontend With Separate API

This works well for demos and public static hosting:

```text
https://org.github.io/query/
https://api.example.org/query-api
```

Requirements:

- API must be HTTPS.
- API must allow the GitHub Pages origin through CORS.
- API Settings should point to the separate API URL.
- Authentication should use a normal login/session flow or a server-side proxy. Do not put secrets in the URL.

## Internal Network Deployment

For a library or organization intranet:

```text
https://reports.internal.example.org/
https://reports.internal.example.org/api/query
```

Recommended controls:

- Serve the frontend over HTTPS, even internally.
- Put the API on the same origin or behind the same reverse proxy.
- Restrict API access to the internal network or authenticated users.
- Add rate limits and query timeouts.
- Log action, user, query id, duration, row count, and errors server-side.
- Use the API Settings compatibility check after deployment.

## Pre-Release Checklist

- API Settings compatibility check passes core items: browser access, field metadata, JSONL stream, event order.
- `run` streams `meta`, zero or more `row` events, and `done`.
- Multi-value cells are JSON arrays when multiple values exist.
- Optional actions are either implemented or intentionally reported as missing.
- CORS or same-origin routing is configured.
- Secrets are server-side only.
- `npm test` passes before publishing frontend changes.
