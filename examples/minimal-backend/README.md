# Minimal Query API Example

This is a dependency-free Node example for the frontend's recommended JSONL backend contract. It is intentionally small: it demonstrates field metadata, JSON request bodies, CORS, and streaming result rows.

Run it from the repository root:

```bash
npm run example:backend
```

Or run the frontend and this backend together:

```bash
npm run demo
```

The API listens at:

```text
http://127.0.0.1:8787/query-api
```

Then serve the static frontend and set the API from the app's API Settings panel, or open:

```text
http://127.0.0.1:4173/index.html?api_url=http://127.0.0.1:8787/query-api
```

Supported actions:

| Action | Purpose |
| --- | --- |
| `get_fields` | Returns example field metadata, including a buildable field and a multi-value field |
| `run` | Streams `application/x-ndjson` result events |
| `status` | Returns an empty status map so the history panel can open without errors |
| `cancel` | Returns `{ "ok": true }` |
| `list_templates` | Returns empty template/category arrays so the template panel can open cleanly |

Environment variables:

| Name | Default | Purpose |
| --- | --- | --- |
| `PORT` | `8787` | Local server port |
| `API_PATH` | `/query-api` | API route path |

This example is not a production backend. Real deployments should add authentication, authorization, rate limiting, logging, and a data adapter for the target system.

The example honors `compatibility_check`, `limit`, and `max_rows` hints so the API Settings compatibility report can run quickly.
