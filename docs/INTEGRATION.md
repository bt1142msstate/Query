# Backend Integration Guide

This app is a static frontend. It does not own the data system. A compatible backend only needs to provide field metadata, accept query payloads, and return results in one of the supported response formats.

The current checked-in endpoint remains the default example/testing backend. New deployments can point the same frontend at another backend without changing field logic in the frontend.

## Integration Goals

- Keep the current backend path working.
- Prefer standard JSON request and response bodies for new integrations.
- Keep legacy pipe-delimited result streams working for existing systems.
- Keep field definitions backend-driven. The frontend must not ship a built-in field catalog.
- Make optional features clear: core querying can work without template persistence, but the template panel needs template actions.

## Choosing an API URL

The default endpoint is still defined in `src/core/backendApi.js` as `DEFAULT_API_URL`.

For a static deployment, the frontend can use another compatible backend by providing one of these browser settings:

```text
?api_url=https://your.example.org/query-api
?query_api_url=https://your.example.org/query-api
```

The URL can be absolute or same-origin relative:

```text
https://reports.example.org/index.html?api_url=/api/query
```

When a valid URL is supplied, the app stores it in `localStorage` under:

```text
query-project.api-url
```

You can also pre-seed that localStorage value in your deployment shell. The default endpoint remains the fallback if no override is supplied. Do not put secrets or API keys in the URL; use normal authenticated sessions, reverse proxies, or server-side API credentials instead.

Your backend must allow browser requests from the deployed frontend origin through normal CORS rules, unless it is served from the same origin.

## Transport

All app actions are sent as JSON `POST` requests:

```http
POST /query-api
Content-Type: application/json
```

Every request has an `action` property. Successful JSON endpoints should return `Content-Type: application/json`. Query result endpoints may return either JSON or the legacy text stream described below.

Errors should use normal HTTP status codes. A useful error body is:

```json
{
  "error": "Human-readable error message"
}
```

Rate limits should return HTTP `429`. The frontend understands either `retry_after_seconds` or `retry_after`:

```json
{
  "error": "Too many requests from this IP.",
  "retry_after_seconds": 30
}
```

## Required Core Actions

These two actions are the minimum needed for the main query builder.

### `get_fields`

Request:

```json
{
  "action": "get_fields"
}
```

Response:

```json
{
  "fields": [
    {
      "name": "Title",
      "label": "Title",
      "type": "string",
      "category": "Bibliographic",
      "desc": "Main title displayed to users",
      "filters": ["contains", "starts", "equals", "does_not_equal"],
      "aliases": ["title"],
      "parts": 1
    }
  ]
}
```

The response may also be a bare array of field definitions.

Supported field metadata:

| Property | Purpose |
| --- | --- |
| `name` | Required canonical field name sent back in query payloads |
| `label` | Optional display label; defaults to `name` |
| `desc` or `description` | Field help text used by search/tooltips |
| `category` | String or string array for grouping in the picker |
| `type` | `string`, `date`, `number`, `money`, `boolean`, or another backend-defined text type |
| `filters` or `operators` | Backend-supported filter operators for the field |
| `values` | Optional selector values for dropdown/pill controls |
| `aliases` | Old or alternate names that should resolve to this field |
| `allowValueList` | Allows comma/newline values for equality filters |
| `multiSelect` | Allows selecting multiple values from `values` |
| `groupValues` | Lets the UI group selector values with dashed labels |
| `parts` | Number of pipe-delimited output segments consumed by this field in legacy text results |
| `numberFormat` or `numericFormat` | `integer`, `decimal`, `year`, or `currency` style hints |
| `builder` | Defines dynamic/buildable fields |

### Buildable Fields

Use buildable field metadata when users need to create dynamic output fields from inputs. The frontend renders the inputs generically and sends the generated field name back to the backend. It does not need to know what backend tool extracts the value.

```json
{
  "name": "Custom Field",
  "type": "string",
  "category": "Dynamic",
  "desc": "Create a custom output field",
  "filters": ["contains", "equals"],
  "builder": {
    "outputFieldIdTemplate": "Custom {code}${subfield}",
    "displayLabelTemplate": "Custom {code}${subfield}",
    "matchPattern": "^Custom\\s+[A-Z0-9]+(?:\\$[A-Za-z0-9])?$",
    "inputs": [
      {
        "id": "code",
        "label": "Code",
        "type": "text",
        "pattern": "^[A-Z0-9]+$",
        "placeholder": "LOCAL",
        "error_msg": "Enter a valid code"
      },
      {
        "id": "subfield",
        "label": "Subfield",
        "type": "text",
        "pattern": "^[A-Za-z0-9]$",
        "placeholder": "a",
        "optional": true
      }
    ]
  }
}
```

If a user enters `LOCAL` and leaves the optional subfield blank, the frontend creates and displays `Custom LOCAL`. If the user enters subfield `a`, it creates `Custom LOCAL$a`.

The backend should recognize the generated field name in `display_fields` and return that column in results.

### `run`

Request:

```json
{
  "action": "run",
  "name": "Optional query name",
  "display_fields": ["Title", "Custom LOCAL"],
  "filters": [
    {
      "field": "Title",
      "operator": "=",
      "value": "*history*"
    },
    {
      "field": "Record Date",
      "operator": ">=",
      "value": "20240101"
    }
  ]
}
```

Supported backend operators currently sent by the frontend:

| Operator | Meaning |
| --- | --- |
| `=` | equals, contains, starts-with, or date never depending on value |
| `!=` | does not equal or does not contain |
| `>` | greater than or after |
| `<` | less than or before |
| `>=` | greater than/equal or on/after |
| `<=` | less than/equal or on/before |

For text contains/starts filters, the frontend sends wildcard values such as `*needle*` or `needle*`. For date fields, the frontend sends normalized `YYYYMMDD` values or `NEVER`. For fields with `allowValueList`, an equals filter may send `value` as an array.

Post filters are intentionally not sent to the backend. They operate only on already-loaded result rows and are cleared between query runs.

## Recommended JSON Result Format

New backends should return JSON object rows. This avoids delimiter escaping problems and gives a natural representation for multi-value cells.

```json
{
  "columns": [
    { "key": "title", "label": "Title" },
    { "key": "public_note", "label": "Public Note" },
    { "key": "custom_local", "label": "Custom LOCAL" }
  ],
  "rows": [
    {
      "title": "Example title",
      "public_note": ["First note", "Second note"],
      "custom_local": {
        "values": ["Local value one", "Local value two"]
      }
    }
  ]
}
```

Supported column keys:

- `columns`
- `headers`
- `fields`
- `rawColumns`
- `columnOrder`

Each column may be a string or an object. For object descriptors, the frontend recognizes:

- `name`
- `label`
- `fieldName`
- `field`
- `id`
- `key`
- `source`
- `sourceName`
- `output`
- `column`

Supported row containers:

- `rows`
- `results`
- `data`
- `items`
- `records`
- a bare array of row objects

Supported row shapes:

```json
{
  "columns": ["Title", "Count"],
  "rows": [
    { "Title": "Object row", "Count": 3 },
    ["Array row", 4]
  ]
}
```

Supported cell shapes:

```json
{
  "Single value": "text",
  "Multiple values as array": ["one", "two"],
  "Multiple values as object": { "values": ["one", "two"] },
  "Wrapped single value": { "value": "text" }
}
```

Multi-value arrays are normalized by the frontend and work with the virtual table, copy cell, post filters, split-column views, and Excel export.

## Legacy Text Result Format

Existing backends can keep returning the current text stream.

Response headers:

```http
X-Query-Id: optional-query-id
X-Raw-Columns: Title|Item Key|Count
Content-Type: text/plain
```

Response body:

```text
Example title|123|1|1|4
Another title|456|1|1|2
```

The frontend uses field metadata `parts` to know when one displayed column consumes multiple pipe-delimited output segments. If a cell can contain pipes, repeated values, or complex nested values, prefer the JSON result format instead. If a legacy text backend must send repeated values inside one cell, use the unit separator character `\u001F` between values.

## Long-Running Query Actions

The core query builder can show results from the direct `run` response. Query history, cancellation, and loading old results work best when the backend also supports IDs and status actions.

### Query IDs

If `run` returns an `X-Query-Id` header, the frontend tracks that query in history and can poll/cancel/load it later.

### `status`

Request:

```json
{
  "action": "status"
}
```

Response:

```json
{
  "queries": {
    "q-123": {
      "name": "Optional query name",
      "status": "complete",
      "start_time": "2026-06-05T02:30:00Z",
      "end_time": "2026-06-05T02:30:07Z",
      "row_count": 25,
      "request": {
        "name": "Optional query name",
        "display_fields": ["Title"],
        "filters": []
      },
      "ui_config": {
        "DesiredColumnOrder": ["Title"],
        "Filters": []
      }
    }
  }
}
```

Recognized statuses include `running`, `complete`, `failed`, and `canceled`.

### `cancel`

Request:

```json
{
  "action": "cancel",
  "query_id": "q-123"
}
```

Any HTTP success response is treated as a successful cancellation.

### `get_results`

Request:

```json
{
  "action": "get_results",
  "query_id": "q-123"
}
```

Response can use the same recommended JSON result format or the legacy text result format.

## Template Actions

Templates are optional. If your deployment does not support them, the main query builder can still run. The template panel expects these actions when enabled:

| Action | Request fields | Expected response |
| --- | --- | --- |
| `list_templates` | none | `{ "templates": [...], "categories": [...] }` |
| `create_template` | `name`, `description`, `svg`, `categories`, `ui_config`, `pinned`, `pin_order` | saved template object or `{ "template": {...} }` |
| `update_template` | `template_id` plus the create fields | saved template object or `{ "template": {...} }` |
| `delete_template` | `template_id`, optional `name` | success object |
| `reorder_pinned_templates` | `template_ids` | optional `{ "templates": [...] }` |
| `create_template_category` | `name`, `description` | saved category object |
| `update_template_category` | `category_id`, `name`, `description` | saved category object |
| `delete_template_category` | `category_id` | success object |

Template objects may use either camelCase or snake_case for common keys:

```json
{
  "id": "template-1",
  "name": "Monthly report",
  "description": "Reusable report",
  "svg": "<svg></svg>",
  "categories": [
    { "id": "cat-1", "name": "Reports", "description": "" }
  ],
  "ui_config": {
    "DesiredColumnOrder": ["Title"],
    "Filters": []
  },
  "pinned": true,
  "pin_order": 0,
  "created_at": "2026-06-05T02:30:00Z",
  "updated_at": "2026-06-05T02:31:00Z"
}
```

## Integration Options

### Native JSON Backend

Best option for new systems. Implement the actions above and return JSON result objects. This gives clean multi-value cells and avoids delimiter issues.

### Adapter or Proxy Backend

Use a small backend adapter that accepts the app's JSON payload, translates it to your internal system, then returns the recommended JSON result format. This is usually the cleanest path for systems that already have their own query language.

### Legacy Pipe Backend

Keep an existing text-stream backend and return `X-Raw-Columns` plus pipe-delimited rows. Add `parts` to field metadata when a displayed field consumes multiple pipe segments.

### Static Deployment with Same-Origin API

Serve the app and API under the same origin, then launch the app with:

```text
https://reports.example.org/index.html?api_url=/api/query
```

### Static Deployment with Cross-Origin API

Launch the app with:

```text
https://reports.example.org/index.html?api_url=https://api.example.org/query
```

Your API must allow the frontend origin with CORS. If users authenticate through cookies, configure credentials and same-site policy on your backend/proxy.

## Compatibility Guardrails

- The frontend field catalog comes from `get_fields`.
- Dynamic/buildable fields come from backend builder metadata.
- The architecture test `tests/architecture/noHardcodedFrontendFields.mjs` fails if production frontend code adds backend field-name literals or a local field catalog.
- `src/core/queryResultParser.js` accepts both current legacy text results and standard JSON result payloads.
- `npm test` runs the integration guard, parser tests, payload tests, and browser smoke tests.

## Minimal Backend Checklist

1. Implement `POST` JSON handling.
2. Support `get_fields`.
3. Support `run`.
4. Return result rows as JSON if possible.
5. Add `X-Query-Id`, `status`, `cancel`, and `get_results` if you want history and cancellation.
6. Add template actions only if you want saved templates.
7. Return useful `{ "error": "..." }` bodies for failures.
8. Configure CORS or serve the API from the same origin as the static app.
