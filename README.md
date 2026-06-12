<div align="center">

# Item Query Project

A static frontend for backend-driven item queries, virtualized results, and Excel export.

[![Test](https://github.com/bt1142msstate/Query/actions/workflows/lint.yml/badge.svg)](https://github.com/bt1142msstate/Query/actions/workflows/lint.yml)
[![Live site](https://img.shields.io/badge/live-GitHub%20Pages-2ea44f?logo=github)](https://bt1142msstate.github.io/Query/)

</div>

A single-page app for building queries, applying filters, reviewing results, and exporting to Excel — all without leaving the browser. Designed to work against any compatible backend.

## 📌 At a Glance

| Feature | What it gives you |
| --- | --- |
| **Core query builder** | Add display fields, search field metadata, and apply filter conditions |
| **Shared form workflow** | URL-driven guided forms for focused reporting workflows |
| **Query history** | Live status tracking — reload, rerun, cancel, or inspect past runs |
| **Query templates** | Save, categorize, pin, search, and reapply reusable query setups |
| **Query JSON** | Inspect the exact payload being sent to the backend |
| **API Settings** | Connect a compatible backend from the app without editing source files |
| **Post filters** | Apply result-only filters without sending them to the backend |
| **Results table** | Virtualized large-table rendering with resize, sort, post-filter, and Excel export support |
| **Reusable components** | Public ES module entrypoints for virtual-table projection, workbook export, date input, and tooltips |
| **Mobile workflow** | Responsive panels, mobile menu controls, and smoke-tested overlays |

## 🚀 Quick Start: Run and Connect a Backend

This repository is a static frontend with a swappable backend contract. The canonical app source lives under `src/`; root-level files are limited to static-host entry files, deployment/runtime files, docs, tests, scripts, and config.

1. Install the test/dev dependencies:

```bash
npm install
```

2. Serve the project directory with any static server:

```bash
python3 -m http.server 4173
```

Or run the full local demo, which starts the static frontend and minimal backend together:

```bash
npm run demo
```

3. Open the app:

```text
http://127.0.0.1:4173/index.html
```

4. Connect a backend from the app: open **API Settings**, enter your compatible query API URL, save it, and reload fields.

Use **Run Compatibility Check** in API Settings to verify browser access, field loading, JSONL streaming, event order, multi-value arrays, and optional workflow actions.

You can also launch with an API URL:

```text
http://127.0.0.1:4173/index.html?api_url=https://your.example.org/query-api
```

The app defaults to the checked-in public example/testing endpoint. Valid API URL overrides from the settings screen, `?api_url=...`, or `?query_api_url=...` are stored in `localStorage` under `query-project.api-url`.

To run the minimal local example backend:

```bash
npm run example:backend
```

Then set the API URL to:

```text
http://127.0.0.1:8787/query-api
```

For a new backend, start with [`docs/INTEGRATION.md`](docs/INTEGRATION.md). The minimum integration is `POST` JSON actions for `get_fields` and `run`; history, cancellation, saved templates, and saved-result loading are optional extensions.

For reusing pieces of the frontend in another site, start with [`docs/COMPONENTS.md`](docs/COMPONENTS.md). The supported public entrypoints are under `src/components/`; outside sites should use those instead of importing directly from feature internals.

If your system does not already speak this contract, use an adapter or proxy backend. The repository includes adapter sketches in [`examples/adapters/`](examples/adapters/) for Node/Express, Python/FastAPI, legacy delimited output, and SQL/reporting APIs.

The recommended backend contract is intentionally small:

```json
{ "action": "get_fields" }
```

```json
{
  "action": "run",
  "result_format": "jsonl",
  "display_fields": ["Title"],
  "filters": [{ "field": "Title", "operator": "=", "value": "*history*" }]
}
```

Backends stream results as JSON Lines events using `Content-Type: application/x-ndjson`. The machine-readable contract lives at [`docs/schemas/query-api.schema.json`](docs/schemas/query-api.schema.json), and the full setup guide is [`docs/INTEGRATION.md`](docs/INTEGRATION.md).

The checked-in default endpoint in `src/core/backendApi.js` is an example/testing integration, not the intended production backend for the public live site. Real deployments should provide their own compatible API URL or same-origin API route.

## 💻 Features

### 🔍 Core Query Builder

The default view. Add fields through the shared field picker, browse by category, or search by field name and description. Active fields appear in the Display & Filters panel, where display order and filter conditions can be edited. Conditions support `equals`, `contains`, `between`, `before/after`, `starts with`, empty/non-empty post filters, date `Never`, and more.

### 📜 Query History

Tracks every query run in the session with live status badges: `running`, `complete`, `failed`, and `cancelled`. Completed queries can be reloaded or rerun; running queries can be cancelled mid-execution. The history panel polls for live status updates and keeps the last 50 queries in memory.

### 📚 Query Templates

Templates let users save reusable query configurations, organize them into categories, pin high-value reports, and reload them later. Template editing is integrated with the same query-state and validation flow used by the live builder.

### 📋 Query JSON Panel

Shows the structured JSON payload for the current query. Useful for debugging filter logic or copying the spec for reuse.

### 📝 Shared Form Workflow

A URL-driven workflow for guided reports. Pass a JSON spec via the `?spec=` parameter (raw JSON, URL-encoded, or Base64URL) to generate focused input controls on top of the same core query state. A form spec can define:

- title and description
- default query name
- fixed output columns
- editable inputs — text fields, dropdowns, multi-value inputs, or hidden fields
- locked filters the user cannot change
- optional limited view, which forces form mode and hides the JSON and history buttons

### 📊 Results & Export

Results render in a virtualized table that only draws the visible viewport plus an overscan buffer for smooth performance with large datasets. Export to Excel with the download button — multi-value fields can be rendered as stacked lines in one cell or expanded into separate numbered columns using the split-columns toggle.

The table also supports sorting, expand/collapse layout, manual column resizing with live row/header alignment, a draggable scrollbar thumb, and post filters that only affect the loaded result set. Post filters are intentionally client-side and are cleared between query runs.

The virtual-table projection logic, XLSX generation path, custom date picker, and tooltip system are also exposed as reusable ES module components in `src/components/` for other static pages or frontend apps.

## 📁 Structure

Canonical layout decision: application source lives in `src/`. We are not using a mixed top-level JavaScript source layout. Keep root-level JavaScript reserved for static-host/runtime entry files such as the service worker; put app modules, feature logic, UI systems, and styles under `src/`.

| Path | Purpose |
| --- | --- |
| `index.html` | Static host entrypoint that loads cache-busted `src/` assets |
| `backgroundNotificationServiceWorker.js` | Root service-worker/runtime file required by the static host |
| `src/` | Browser application source |
| `src/appModules.js` | Deterministic ES module startup entrypoint |
| `src/components/` | Public reusable component entrypoints for outside sites and future package exports |
| `src/core/` | Query execution, state management, service facades, and shared utilities |
| `src/features/filters/` | Field definitions, filter workflows, payload logic, and condition editor |
| `src/features/history/` | Query history rendering, request mapping, status grouping, and detail overlays |
| `src/features/table/` | Result rendering, virtual scrolling, drag/drop, post filters, and Excel export |
| `src/features/table/drag-drop/` | Column drag/drop, duplicate column restoration, and resize coordination |
| `src/features/table/virtual-table/` | Virtualized result rendering, column layout, scrollbar, and sort helpers |
| `src/features/table/post-filters/` | Client-side post-filter UI and comparison logic |
| `src/features/table/export/` | Excel export workflow |
| `src/features/templates/` | Query template rendering, categories, draft state, and template models |
| `src/ui/` | App shell UI, modals, toasts, tooltips, and shared helpers |
| `src/ui/form-mode/` | Form-mode shell, controls, spec parsing, URL sharing, and query sync |
| `src/ui/field-picker/` | Shared field picker modal and search ranking |
| `src/styles/` | Feature-based CSS |
| `src/styles/app.css` | Stylesheet entrypoint that imports the feature CSS files |
| `config/` | Shared architecture contracts for forbidden browser globals and module boundaries |
| `docs/ARCHITECTURE.md` | Frontend architecture notes, quality gates, and refactor plan |
| `docs/COMPONENTS.md` | Reusable component entrypoints and integration examples |
| `docs/INTEGRATION.md` | Backend integration contract, streaming JSONL results, and deployment options |
| `docs/DEPLOYMENT.md` | Deployment recipes for same-origin proxying, CORS, auth, GitHub Pages, and internal hosting |
| `docs/PROJECT_HISTORY.md` | Non-redundant build history and backend work summary |
| `docs/ROADMAP.md` | Current project status, completed milestones, and remaining roadmap items |
| `docs/schemas/query-api.schema.json` | Machine-readable JSON Schema for the recommended backend contract |
| `examples/adapters/` | Adapter sketches for translating existing systems into the JSONL contract |
| `examples/minimal-backend/` | Dependency-free JSONL backend example for local integration testing |
| `tests/architecture/` | Architecture fitness and module-specifier checks |
| `tests/unit/` | Focused pure-logic unit tests grouped by `components/`, `core/`, `features/`, and `ui/` |
| `tests/browser/` | Playwright browser smoke coverage |

## 🛠️ Tech

- Static HTML, CSS, and vanilla JavaScript — no build step required
- Native browser ES modules with `"type": "module"` in Node tooling
- Feature-oriented folder structure with ES modules, explicit dependency registration for cross-feature services/actions, and enforced module boundaries
- Public reusable component entrypoints for table data projection, workbook export, date input, and tooltips
- ESLint, architecture fitness checks, and Playwright browser smoke tests
- Tailwind CSS and AutoNumeric are loaded from CDNs in `index.html`
- Custom browser-side XLSX export with worker support for larger workbooks

## Running Locally

Use the Quick Start steps above. The important rule is to open the app through a local web server rather than directly from the filesystem, because native ES modules, cache busting, and service-worker behavior expect an HTTP origin.

## Backend API Notice

The backend URL currently configured in `src/core/backendApi.js` is a temporary example/testing integration. It is useful for demonstrating the request/response shape during development, and the Playwright smoke test stubs that route so local validation does not require a real external service.

The public live site should not rely on that example API as its production data source. We plan to remove project-owned API usage from the live deployment. For real use, connect your own compatible query API and provide the API URLs/settings for your environment. The app is designed around a swappable backend contract: field metadata, query execution, status/cancel, history results, and template actions can be backed by your own service as long as it returns the expected payloads.

Static deployments can point the app at another compatible service through the API Settings panel, `?api_url=...`, or `?query_api_url=...`; valid values are stored in `localStorage` under `query-project.api-url`. Local deployments can still change the default in `src/core/backendApi.js` when that is simpler.

See [`docs/INTEGRATION.md`](docs/INTEGRATION.md) for the full backend contract, including field metadata, query payloads, streaming JSONL results, history/cancel actions, template actions, rate-limit errors, deployment options, and the [`docs/schemas/query-api.schema.json`](docs/schemas/query-api.schema.json) schema. See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) for production hosting recipes.

### Streaming JSONL Results

Query execution and history result loading use one result format: newline-delimited JSON events.

```http
Content-Type: application/x-ndjson; charset=utf-8
X-Query-Id: optional-query-id
```

```jsonl
{"type":"meta","version":1,"format":"jsonl","query_id":"query-1","columns":["Title","Public Note"]}
{"type":"row","values":["Example title",["First note","Second note"]]}
{"type":"done","rows":1}
```

Rows use array values in the same order as the `meta.columns` list. Multi-value cells are JSON arrays and flow through stacked table cells, split-column views, post filters, and Excel export.

## Architecture

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for module boundaries, runtime flow, quality gates, and architecture guardrails.
See [`docs/COMPONENTS.md`](docs/COMPONENTS.md) for reusable frontend component entrypoints.
See [`docs/INTEGRATION.md`](docs/INTEGRATION.md) for the supported backend integration patterns.
See [`docs/PROJECT_HISTORY.md`](docs/PROJECT_HISTORY.md) for a consolidated list of what was built and what backend work was required.
See [`docs/ROADMAP.md`](docs/ROADMAP.md) for current status, completed milestones, and remaining roadmap items.

## Quality Checks

```bash
npm test
```

Runs the cache-busting manifest check, lint, Node test-runner architecture checks, focused unit tests, and desktop/mobile browser smoke tests. The architecture suite includes module-specifier checks and the hardcoded-field integration guard.

Individual checks:

```bash
npm run cache:bust:check
npm run lint
npm run test:static
npm run test:architecture
npm run test:unit
npm run test:browser
npm run test:live
```

See [`tests/README.md`](tests/README.md) for the testing standards, layer ownership, and rules for avoiding redundant coverage.

The browser smoke test starts a local static server, stubs the backend API, and covers desktop plus mobile flows: panel layout, dark/light search inputs, virtual-table scrolling and resize behavior, post filters, zero-result queries, export overlays, and mobile dialogs.

`npm run test:live` is separate from the default gate because it uses the deployed site and a real API over the network. It opens the live app, runs API Settings against `LIVE_API_URL`, fails on browser console warnings/errors, and runs the compatibility report without stubbing the backend. Defaults:

```bash
LIVE_SITE_URL=https://bt1142msstate.github.io/Query/
LIVE_API_URL=https://mlp.sirsi.net/uhtbin/query_api.pl
```

The GitHub Actions **Live Integration** workflow can run this check manually after deployment or when validating a backend.
If the configured live API returns compatibility warnings or failures, this command is expected to fail until the backend/API behavior is corrected.

## Cache Busting

Runtime assets are versioned through `cache-bust.json`, which is generated from the app HTML, JavaScript, and CSS asset hashes. `index.html` loads that manifest with `cache: no-store`, applies the version to the stylesheet and app module entry, and registers the root service worker with the same version so nested ES module imports are fetched network-first after deployments.

When app assets change, update the manifest before committing:

```bash
npm run cache:bust
```

`npm test` runs `npm run cache:bust:check`, so GitHub Actions will fail if a push changes app assets without committing the updated manifest.

## Roadmap

Current stage: Stage 4, integration readiness and public deployment hardening. The frontend architecture, ES module migration, source-tree organization, responsive/mobile workflow baseline, cache-busting enforcement, backend-driven field contract, API Settings screen with compatibility diagnostics, minimal example backend, one-command demo, adapter sketches, deployment recipes, streaming JSONL result support, large Excel export, and modernized test suite are in place.

Remaining work is mostly integration and polish:

- Remove project-owned API usage from the public live default and make bring-your-own-API the primary deployment path.
- Expand adapter examples into runnable backend packages only if real integrators need more than the current sketches.
- Continue adding realistic browser interaction coverage when new workflow bugs are found.
- Keep reviewing large coordinator modules as features change, but only split them when a real ownership boundary appears.

See [`docs/ROADMAP.md`](docs/ROADMAP.md) for the detailed milestone/status table.
