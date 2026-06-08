# Backend Adapter Examples

The frontend supports one recommended protocol: JSON request actions with JSONL result streams. These examples show how different backend shapes can be adapted to that protocol without adding alternate frontend protocols.

## Native JSONL Adapter

If your backend already accepts the app payload and streams JSONL, no adapter is needed.

Required core actions:

```json
{ "action": "get_fields" }
```

```json
{
  "action": "run",
  "result_format": "jsonl",
  "display_fields": ["Title"],
  "filters": []
}
```

## Node / Express Shape

This is the route shape if your project already uses Express. Install and wire Express in your backend project; the frontend repo does not require it.

```js
app.post('/query-api', async (req, res) => {
  if (req.body.action === 'get_fields') {
    res.json({ fields: await loadFieldMetadata() });
    return;
  }

  if (req.body.action === 'run') {
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.write(JSON.stringify({
      type: 'meta',
      version: 1,
      format: 'jsonl',
      query_id: crypto.randomUUID(),
      columns: req.body.display_fields
    }) + '\n');

    for await (const row of runInternalQuery(req.body)) {
      res.write(JSON.stringify({
        type: 'row',
        values: req.body.display_fields.map(field => row[field] ?? '')
      }) + '\n');
    }

    res.end(JSON.stringify({ type: 'done', rows: 0 }) + '\n');
    return;
  }

  res.status(400).json({ error: 'Unsupported action.' });
});
```

## Python / FastAPI Shape

This is the route shape if your backend already uses FastAPI. Install and wire FastAPI in your backend project; the frontend repo does not require it.

```python
from fastapi import FastAPI
from fastapi.responses import JSONResponse, StreamingResponse
import json
import uuid

app = FastAPI()

@app.post("/query-api")
async def query_api(payload: dict):
    if payload.get("action") == "get_fields":
        return {"fields": load_field_metadata()}

    if payload.get("action") == "run":
        columns = payload.get("display_fields", [])

        async def events():
            query_id = str(uuid.uuid4())
            yield json.dumps({
                "type": "meta",
                "version": 1,
                "format": "jsonl",
                "query_id": query_id,
                "columns": columns,
            }) + "\n"

            row_count = 0
            async for row in run_internal_query(payload):
                row_count += 1
                yield json.dumps({
                    "type": "row",
                    "values": [row.get(field, "") for field in columns],
                }) + "\n"

            yield json.dumps({"type": "done", "rows": row_count}) + "\n"

        return StreamingResponse(events(), media_type="application/x-ndjson")

    return JSONResponse({"error": "Unsupported action."}, status_code=400)
```

## Legacy Text Or Pipe Output Adapter

If an existing tool returns delimited text, keep that parser in the backend adapter and stream JSONL to the frontend.

```js
function parseDelimitedLine(line) {
  return line.split('|').map(value => value.trim());
}

async function streamLegacyTool(payload, res) {
  const columns = payload.display_fields;
  res.write(JSON.stringify({
    type: 'meta',
    version: 1,
    format: 'jsonl',
    query_id: `legacy-${Date.now()}`,
    columns
  }) + '\n');

  let rows = 0;
  for await (const line of runLegacyCommand(payload)) {
    if (!line.trim()) continue;
    rows += 1;
    res.write(JSON.stringify({
      type: 'row',
      values: parseDelimitedLine(line)
    }) + '\n');
  }

  res.write(JSON.stringify({ type: 'done', rows }) + '\n');
}
```

Keep command construction safe: validate fields/operators against backend metadata, avoid shell string concatenation, and pass arguments through structured process APIs when possible.

## SQL Or Reporting API Adapter

If the data source is SQL or a reporting API, translate the app payload into the native query system server-side, then stream rows as JSONL.

```js
async function streamSqlResults(payload, res, db) {
  const columns = payload.display_fields;
  const query = buildSqlFromPayload(payload);
  const cursor = db.stream(query.sql, query.params);
  let rows = 0;

  res.write(JSON.stringify({
    type: 'meta',
    version: 1,
    format: 'jsonl',
    query_id: `sql-${Date.now()}`,
    columns
  }) + '\n');

  for await (const record of cursor) {
    rows += 1;
    res.write(JSON.stringify({
      type: 'row',
      values: columns.map(column => record[column] ?? '')
    }) + '\n');
  }

  res.write(JSON.stringify({ type: 'done', rows }) + '\n');
}
```

## Adapter Rules

- Keep the frontend protocol stable: JSON actions in, JSONL events out.
- Keep field metadata backend-driven through `get_fields`.
- Preserve requested column order.
- Preserve repeated values as JSON arrays.
- Put credentials and data-system access server-side.
- Use the API Settings compatibility check after wiring an adapter.
