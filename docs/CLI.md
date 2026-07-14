# CLI Export Guide

The browser app is not the only way to get data out of the query project. The repository includes a Node CLI that talks to the same backend JSONL contract used by the interface.

Use it when you want repeatable reports, scheduled jobs, shell scripts, or quick exports without opening the UI.

## Commands

List backend fields:

```bash
npm run query:fields -- --search location
```

Run the same backend compatibility report used by API Settings:

```bash
npm run query:compat
```

Inspect running/completed query status:

```bash
npm run query:status
```

History status and saved-result retrieval require authentication on the MLP deployment. The CLI does not inherit a browser session automatically.

Cancel a running query by id:

```bash
npm run query:cancel -- --query-id query_123
```

Export a saved history result by id using the same workbook/CSV/JSON/JSONL paths as a fresh run:

```bash
npm run query:results -- --query-id query_123 --format xlsx --output ../Reports/saved-result.xlsx
```

List saved templates:

```bash
npm run query:templates
```

Run a query config and export a workbook:

```bash
npm run query:run -- --config examples/query-configs/grant-family-climatecon.json
```

Override output format or path:

```bash
npm run query:run -- --config examples/query-configs/grant-family-climatecon.json --format csv --output ../Reports/grant-family.csv
```

Run a small query directly from flags:

```bash
npm run query:run -- --display "Item Id,Title,Item Library" --filter "Item Library=MSU-GRANT" --format json --output ../Reports/grant-items.json
```

## API URL

The CLI uses the same default public testing endpoint as the app. Override it with a flag or environment variable:

```bash
npm run query:run -- --api-url https://your.example.org/query-api --config report.json
```

```bash
QUERY_API_URL=https://your.example.org/query-api npm run query:run -- --config report.json
```

`LIVE_API_URL` is also accepted for consistency with the browser test scripts.

## Query Config

Configs are plain JSON. They map closely to the request payload shown by the app's Query JSON panel.

```json
{
  "name": "Report name",
  "tableName": "Worksheet name",
  "displayFields": ["Item Id", "Title", "MARC 590"],
  "filters": [
    { "field": "Item Library", "operator": "=", "value": "MSU-GRANT" }
  ],
  "postFilters": {
    "Title": {
      "logic": "all",
      "filters": [{ "cond": "contains", "val": "Grant" }]
    }
  },
  "export": {
    "format": "xlsx",
    "output": "../Reports/report.xlsx"
  }
}
```

The CLI also accepts the app's template/history UI config shape, which means saved templates can be used directly:

```json
{
  "name": "Template-based report",
  "ui_config": {
    "DesiredColumnOrder": ["Item Id", "Title", "Public Note"],
    "Filters": [
      { "FieldName": "Title", "FieldOperator": "Contains", "Values": ["Grant"] }
    ]
  },
  "export": {
    "format": "xlsx",
    "output": "../Reports/template-report.xlsx"
  }
}
```

Supported export formats:

| Format | Output |
| --- | --- |
| `xlsx` | Styled Excel workbook using the app's reusable workbook exporter |
| `csv` | Comma-separated rows with multi-value cells numbered on separate lines |
| `json` | Object rows keyed by output column |
| `jsonl` | JSON Lines `meta`, `row`, and `done` events |

The `run` and `results` commands support the same export formats and post-filter syntax.

## Filters And Post Filters

`filters` are backend filters. They are sent to the configured API.

`postFilters` are local result filters. They run after the backend stream finishes, just like result-only post filters in the table UI. Supported conditions include `contains`, `equals`, `does_not_equal`, `starts`, `greater`, `less`, `between`, `is_blank`, `has_value`, `has_multiple_values`, and `does_not_have_multiple_values`.

Inline filters are useful for quick one-off runs:

```bash
--filter "Item Library=MSU-GRANT"
--filter "Bill Count:greater:2"
--post-filter "Title:contains:Grant"
```

For anything repeatable, prefer a JSON config. It is easier to review, commit, and rerun.

## Notes

- The CLI uses the same field registry, UI-config filter normalization, backend payload builder, JSONL stream reader, result parser, row normalization, post-filter controller, API compatibility checker, template repository, and workbook exporter that the browser uses.
- JSONL exports are regenerated from parsed output so requested column order, local post filters, and multi-value cells stay consistent across formats.
- CLI runs load backend field metadata before building payloads, matching the interface path for aliases, date normalization, dynamic fields, and list-valued key filters.
- XLSX exports include a run details sheet unless `export.includeRunDetails` is set to `false`.
- The CLI does not store credentials. Use same-origin proxies, normal authenticated sessions, or server-side credentials for private deployments.
