# CLI Export Guide

The browser app is not the only way to get data out of the query project. The repository includes a Node CLI that talks to the same backend JSONL contract used by the interface.

Use it when you want repeatable reports, scheduled jobs, shell scripts, or quick exports without opening the UI.

The CLI is the preferred automation surface. Its dedicated commands cover common report workflows, while `query:api` exposes the complete authenticated backend action surface used by the interface. This means newly deployed backend actions can be used from the CLI before a specialized convenience command exists.

Use `npm run query:plan -- --config query.json` to see the backend's selective-first filter order and an evidence-backed ETA range before running a report. The runtime applies the same safe ordering automatically. The browser shows a cold-start ETA as soon as a form is runnable, using current collection/policy aggregates and field-cost classes; comparable prior runs are optional calibration and are never required for an estimate. **Smart order** is on by default in the results toolbar. Select it to switch to **Off** when the displayed filter order must be preserved; the preference stays on this browser until it is turned back on.

## Sign In

Production actions require a staff session. When the Query Website is already signed in on this Mac, pair the CLI with that browser session:

```bash
npm run query:pair
```

The command opens `https://mlp.sirsi.net/query/` and shows an **Authorize Query CLI** confirmation. Approval creates a separate, revocable CLI session and returns it through a short-lived loopback callback protected by a one-time code, state validation, and PKCE. It does not read, copy, or expose the browser cookie or password.

If the browser session has expired, sign in normally on the Query Website and then approve the CLI. Password-based CLI login remains a fallback for machines without an available browser session; it accepts the password without placing it in shell arguments or history:

```bash
read -rs QUERY_CLI_PASSWORD
printf '%s' "$QUERY_CLI_PASSWORD" | npm run query:login -- --username bt1142 --password-stdin
unset QUERY_CLI_PASSWORD
```

On macOS, the CLI's opaque session is stored in Keychain under `MLP Query Project CLI session`. The CLI never prints it. Confirm the active identity before production work:

```bash
npm run query:whoami
```

Sign out and revoke/remove the saved session:

```bash
npm run query:logout
```

Controlled service environments may provide an approved ephemeral session through `QUERY_SESSION_TOKEN`. Never put a password or session token in a command argument, query config, URL, output file, log, or repository.

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

History status and saved-result retrieval require authentication on the MLP deployment. The CLI never scrapes browser storage; `query:pair` lets the signed-in browser explicitly approve a separate CLI session.

Invoke any backend action with a reviewed JSON payload:

```bash
npm run query:api -- --payload request.json --output response.json
```

Or provide the action and safe, non-secret top-level values directly:

```bash
npm run query:api -- --action update_history_run \
  --set query_id=query_123 \
  --set pinned=true
```

`--payload -` reads JSON from stdin. `--raw` preserves the response bytes without JSON pretty-printing. JSONL and other response types are preserved automatically. The generic command refuses the `login` action so a returned session token cannot accidentally be printed or written; use `query:login` instead.

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

Run the MLP offsite-journal title report with live MARC holdings:

```bash
npm run query:run -- --config examples/query-configs/msu-offsite-journals.json
```

`MARC Holdings` is a backend-provided, multi-value field in the MLP deployment. The frontend and CLI treat it like any other field; deployments that do not expose that field should omit or replace it in their own configuration.

Override output format or path:

```bash
npm run query:run -- --config examples/query-configs/grant-family-climatecon.json --format csv --output ../Reports/grant-family.csv
```

Split an Excel report into worksheets by an exported field:

```json
{
  "displayFields": ["Title", "Author", "Item Library"],
  "export": {
    "format": "xlsx",
    "output": "../Reports/sequenced-titles.xlsx",
    "groupField": "Item Library",
    "groupValues": ["LILS-BKM", "LILS-ITA", "LILS-LEE"],
    "sort": [{ "field": "Author", "direction": "asc" }, { "field": "Title", "direction": "asc" }],
    "includeOverviewSheet": true,
    "includeMasterSheet": false
  }
}
```

The grouping field must be included in `displayFields`. Optional `groupValues` preserves a worksheet for every requested group even when one has zero matching rows. Grouped workbooks use the same sheet-name sanitizing, overview, run-details, and row-splitting behavior as the interface exporter.

As in the interface, exports collapse rows that are exact duplicates across the displayed columns. Set `export.collapseDuplicateRows` to `false`, or pass `--include-duplicates`, when every repeated source row must be retained.

Optional `export.sort` accepts one or more displayed fields. Multiple fields are applied in order, so the example sorts primarily by author and then by title.

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
  "smartQueryEnabled": true,
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

`smartQueryEnabled` defaults to `true`. Set it to `false` only when a repeatable CLI/configured report must keep its authored backend-filter order. The query meaning and result set are unchanged either way; this controls only the safe execution order.

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

- The CLI uses the same field registry, UI-config filter normalization, backend payload builder, JSONL stream reader, result parser, row normalization, post-filter controller, duplicate-row collapse, API compatibility checker, template repository, and workbook exporter that the browser uses.
- JSONL exports are regenerated from parsed output so requested column order, local post filters, and multi-value cells stay consistent across formats.
- CLI runs load backend field metadata before building payloads, matching the interface path for aliases, date normalization, dynamic fields, and list-valued key filters.
- XLSX exports include a run details sheet unless `export.includeRunDetails` is set to `false`.
- XLSX configs can set `export.groupField` to create one worksheet per value, with optional `includeOverviewSheet` and `includeMasterSheet` controls.
- The CLI does not copy the browser's session. `query:pair` uses browser approval, a loopback callback, state validation, a short-lived single-use authorization code, and S256 PKCE to create an independent session. On macOS it stores that opaque, revocable session in Keychain. `query:login --password-stdin` remains a password-safe fallback.
- Dedicated report commands provide local behavior shared with the interface: field discovery, UI-config normalization, JSONL parsing, post-filters, and CSV/JSON/JSONL/XLSX export.
- `query:api` provides backend parity for authentication-safe profile actions, template/category mutation, history metadata, query lifecycle actions, OCLC comparison/search, Hydration lifecycle operations, bulk resolution, and future backend actions. Large or complex requests should use reviewed payload files.
- Browser presentation behavior such as opening dialogs, arranging visible panels, or rendering an interactive table is intentionally not reproduced in a terminal. The underlying data operation is available through a dedicated command or `query:api`.

## Sirsi Operations Commands

The `sirsi:ops:*` commands are a separate, high-privilege administrative workflow for approved Sirsi server work. They reuse the CLI's paired account session, but also require a fresh signature from Brandon's enrolled Secure Enclave key. This hardware-backed factor is intentionally not required by ordinary Query, dashboard, hydration, or Command Center commands.

Preparing an operation uploads and validates it without running it:

```bash
npm run sirsi:ops:capabilities
npm run sirsi:ops:prepare -- --profile managed-release --archive /absolute/path/operation.tar.gz
```

Execution and rollback are explicit, separate actions using the operation ID returned by prepare:

```bash
npm run sirsi:ops:execute -- --operation-id 0123456789abcdef0123456789abcdef
npm run sirsi:ops:status -- --operation-id 0123456789abcdef0123456789abcdef
npm run sirsi:ops:output -- --operation-id 0123456789abcdef0123456789abcdef
npm run sirsi:ops:rollback -- --operation-id 0123456789abcdef0123456789abcdef
```

Use `managed-release` for guarded file deployment and `script-operation` only for bounded diagnostics supported by the live capabilities response. The archive must contain `sirsi-operation.json` plus its narrow payload and must not exceed the reported 25 MiB limit. Preparing validates and plans but does not execute.

The endpoint hostname and path are fixed in the client. The commands do not accept an alternate deployment host, export the private key, or bypass the server's account, policy, baseline, backup, audit, and replay protections. A Git push and a Sirsi deployment are separate actions.
