# AI API Guide

This guide is for AI agents, workflow automations, and tool-calling systems that need to use a compatible Query API directly.

The API has one endpoint. Send JSON `POST` bodies with an `action` field. Query results stream as JSON Lines. Do not invent field names or backend-specific syntax; discover fields first.

## Modern AI Integration Targets

The recommended order for model integrations is:

1. **MCP adapter** for AI clients that support the Model Context Protocol. Keep the API URL, auth, retry policy, and request signing inside the adapter. Expose small tools such as `query_api_get_fields`, `query_api_run`, and `query_api_get_results`.
2. **Strict function tools** for direct model tool-calling APIs. Use closed JSON schemas, keep optional fields explicit with `null`, and keep the endpoint out of model-controlled arguments.
3. **OpenAPI import** for platforms that can turn OpenAPI operations into tools. Use the OpenAPI file as a machine-readable API description, then add workflow instructions from this guide.

All three targets call the same backend contract. They are not alternate result formats.

## Agent Contract

1. Call `get_fields` before building a query.
2. Use only canonical field names returned by `get_fields`.
3. For exploratory runs, request a small field set and pass `limit` or `max_rows`.
4. Always request `result_format: "jsonl"` for `run` and `get_results`.
5. Treat `meta.columns` as the source of row value order.
6. Preserve array cell values as multi-value fields.
7. Use `status`, `cancel`, `get_results`, and `list_templates` only if the compatibility report says they are supported.
8. Do not put API keys or credentials in browser URLs or prompts. Use a same-origin proxy or authenticated session.

## Machine-Readable Files

| File | Purpose |
| --- | --- |
| [`docs/schemas/query-api.openapi.json`](schemas/query-api.openapi.json) | OpenAPI 3.1 description suitable for many AI tool importers |
| [`docs/schemas/query-api.schema.json`](schemas/query-api.schema.json) | Full JSON Schema contract for payload validation |
| [`examples/ai/query-api-tool-manifest.json`](../examples/ai/query-api-tool-manifest.json) | Provider-neutral AI tool descriptions |
| [`examples/ai/openai-tools.json`](../examples/ai/openai-tools.json) | Strict function-tool definitions for model APIs that accept JSON Schema tools |
| [`examples/ai/mcp-tools.json`](../examples/ai/mcp-tools.json) | MCP-shaped tool definitions for a thin adapter server |
| [`examples/ai/agent-system-prompt.md`](../examples/ai/agent-system-prompt.md) | Suggested system prompt for an API-using agent |
| [`examples/ai/run-request.json`](../examples/ai/run-request.json) | Minimal run request example |
| [`examples/ai/stream-example.jsonl`](../examples/ai/stream-example.jsonl) | Minimal JSONL result stream example |

## Recommended Agent Flow

### 1. Discover Fields

Request:

```json
{ "action": "get_fields" }
```

Response:

```json
{
  "fields": [
    {
      "name": "Title",
      "type": "string",
      "filters": ["contains", "equals"]
    },
    {
      "name": "Public Note",
      "type": "string",
      "multiValue": true
    }
  ]
}
```

Agent rule: store the returned `name` values and use those exact names in `display_fields` and `filters`.

### 2. Run a Small Query

Request:

```json
{
  "action": "run",
  "name": "Agent sample query",
  "result_format": "jsonl",
  "display_fields": ["Title", "Public Note"],
  "filters": [
    { "field": "Title", "operator": "=", "value": "*grant*" }
  ],
  "limit": 25,
  "max_rows": 25
}
```

The response must be `Content-Type: application/x-ndjson; charset=utf-8`.

Stream:

```jsonl
{"type":"meta","version":1,"format":"jsonl","query_id":"query-1","columns":["Title","Public Note"]}
{"type":"row","values":["Example title",["First note","Second note"]]}
{"type":"done","rows":1}
```

Agent rule: map each `row.values[index]` to `meta.columns[index]`.

### 3. Handle Long Runs

If a run returns a `query_id`, save it. Use:

```json
{ "action": "status" }
```

To stop a running query:

```json
{ "action": "cancel", "query_id": "query-1" }
```

To reload saved results:

```json
{ "action": "get_results", "query_id": "query-1", "result_format": "jsonl" }
```

## Filter Rules For Agents

Backend filters are intentionally simple:

| Meaning | Payload |
| --- | --- |
| Equals | `{ "operator": "=", "value": "VALUE" }` |
| Not equals | `{ "operator": "!=", "value": "VALUE" }` |
| Contains text | `{ "operator": "=", "value": "*VALUE*" }` |
| Starts with text | `{ "operator": "=", "value": "VALUE*" }` |
| Greater than | `{ "operator": ">", "value": "VALUE" }` |
| Less than | `{ "operator": "<", "value": "VALUE" }` |
| Between dates | Two filters: `>= YYYYMMDD` and `<= YYYYMMDD` |
| Never date | `{ "operator": "=", "value": "NEVER" }` |
| Bulk IDs or keys | Use a `value` array when the field supports value lists |

Date values sent to the backend should use `YYYYMMDD` or `NEVER`.

## AI Safety And Reliability Rules

- Prefer small preview runs before large exports.
- Ask for confirmation before broad, expensive, or destructive operations such as cancellation.
- Never fabricate fields. If a requested field is missing, report that it is unavailable.
- Keep the API endpoint, credentials, cookies, and proxy configuration outside model-editable tool arguments.
- Keep post-processing separate from backend filters. Post filters are client-side behavior unless your own integration explicitly implements them.
- When exporting, use the repository CLI when available because it shares the browser parser, field registry, post-filter logic, and workbook exporter:

```bash
npm run query:run -- --config examples/query-configs/grant-family-climatecon.json
```

## Tool Wrapper Guidance

AI tools should expose task-focused operations instead of asking a model to construct arbitrary HTTP requests. A good wrapper has these properties:

- `get_fields` has no model inputs.
- `run` accepts only `name`, `display_fields`, `filters`, `limit`, and `max_rows`.
- `run` always sends `action: "run"` and `result_format: "jsonl"`.
- `status`, `cancel`, `get_results`, and `list_templates` stay separate tools.
- The wrapper parses JSONL incrementally and returns a compact preview to the model unless the user asked for a full export.
- Large workbook exports should use the CLI or a backend job, not a huge model response.

The examples in [`examples/ai/openai-tools.json`](../examples/ai/openai-tools.json) and [`examples/ai/mcp-tools.json`](../examples/ai/mcp-tools.json) follow that shape.

## Tool Import Notes

Many AI platforms can import OpenAPI. Use [`docs/schemas/query-api.openapi.json`](schemas/query-api.openapi.json) and set the server URL to your deployed API endpoint.

If the platform expects separate tools instead of a single `POST /query-api` operation, use [`examples/ai/query-api-tool-manifest.json`](../examples/ai/query-api-tool-manifest.json) as the action list. Each tool still maps to the same backend endpoint with a different `action` value.

For MCP clients, wrap the Query API behind an MCP server and expose the tool schemas from [`examples/ai/mcp-tools.json`](../examples/ai/mcp-tools.json). The MCP server should call the configured API endpoint itself, not ask the model for the endpoint.
