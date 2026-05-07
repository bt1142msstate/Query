<div align="center">

# Item Query Project

A browser-based report builder for library data.

</div>

A single-page app for building queries, applying filters, reviewing results, and exporting to Excel — all without leaving the browser. Designed to work against any compatible backend.

## 📌 At a Glance

| Feature | What it gives you |
| --- | --- |
| **Bubble builder** | Browse and select fields by category, apply filter conditions |
| **Form mode** | URL-driven guided forms for focused reporting workflows |
| **Query history** | Live status tracking — reload, rerun, cancel, or inspect past runs |
| **Query templates** | Save, categorize, pin, search, and reapply reusable query setups |
| **Query JSON** | Inspect the exact payload being sent to the backend |
| **Post filters** | Apply result-only filters without sending them to the backend |
| **Results table** | Virtualized large-table rendering with resize, sort, post-filter, and Excel export support |
| **Mobile workflow** | Responsive panels, mobile menu controls, and smoke-tested overlays |

## 💻 Features

### 🔍 Bubble Builder

The default view. Browse fields by category or search by name, then select fields to add them to your output. Click any active field to open a filter condition panel — supports `equals`, `contains`, `between`, `before/after`, `starts with`, and more.

### 📜 Query History

Tracks every query run in the session with live status badges: `running`, `complete`, `failed`, and `cancelled`. Completed queries can be reloaded or rerun; running queries can be cancelled mid-execution. The history panel polls for live status updates and keeps the last 50 queries in memory.

### 📚 Query Templates

Templates let users save reusable query configurations, organize them into categories, pin high-value reports, and reload them later. Template editing is integrated with the same query-state and validation flow used by the live builder.

### 📋 Query JSON Panel

Shows the structured JSON payload for the current query. Useful for debugging filter logic or copying the spec for reuse.

### 📝 Form Mode

A URL-driven mode for guided workflows. Pass a JSON spec via the `?spec=` parameter (raw JSON, URL-encoded, or Base64URL) to generate a focused input form instead of the full bubble builder. A form spec can define:

- title and description
- default query name
- fixed output columns
- editable inputs — text fields, dropdowns, multi-value inputs, or hidden fields
- locked filters the user cannot change
- optional limited view, which forces form mode and hides the JSON and history buttons

### 📊 Results & Export

Results render in a virtualized table that only draws the visible viewport plus an overscan buffer for smooth performance with large datasets. Export to Excel with the download button — multi-value fields can be rendered as stacked lines in one cell or expanded into separate numbered columns using the split-columns toggle.

The table also supports sorting, expand/collapse layout, manual column resizing with live row/header alignment, a draggable scrollbar thumb, and post filters that only affect the loaded result set. Post filters are intentionally client-side and are cleared between query runs.

## 📁 Structure

| Path | Purpose |
| --- | --- |
| `bubbles/` | Bubble rendering and interaction logic |
| `core/` | Query execution, history, state management, and utilities |
| `filters/` | Field definitions and filter/payload logic |
| `table/` | Result rendering, virtual scrolling, and Excel export |
| `ui/` | Form mode, modals, toasts, tooltips, and shared helpers |
| `styles/` | Feature-based CSS |
| `styles/app.css` | Stylesheet entrypoint that imports the feature CSS files |
| `config/` | Shared architecture contracts for forbidden browser globals and module boundaries |
| `docs/ARCHITECTURE.md` | Frontend architecture notes, quality gates, and refactor plan |
| `tests/` | Architecture checks, module-specifier checks, unit tests, and Playwright browser smoke coverage |

## 🛠️ Tech

- Static HTML, CSS, and vanilla JavaScript — no build step required
- Native browser ES modules with `"type": "module"` in Node tooling
- Feature-oriented folder structure with ES modules, explicit dependency registration for cross-feature services/actions, and enforced module boundaries
- ESLint, architecture fitness checks, and Playwright browser smoke tests
- Tailwind CSS and AutoNumeric are loaded from CDNs in `index.html`
- [ExcelJS](https://github.com/exceljs/exceljs) for Excel export

## 🚀 Running Locally

Install dependencies once:

```bash
npm install
```

Serve the project directory with any static server, then open the app through that server rather than directly from the filesystem:

```bash
python3 -m http.server 4173
```

Then open:

```text
http://127.0.0.1:4173/index.html
```

The app currently posts to the backend URL configured in `core/backendApi.js`. Use a compatible query API for live data, or rely on the Playwright smoke test stub for local validation.

## Architecture

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for module boundaries, runtime flow, quality gates, and the remaining compatibility layer.

## Quality Checks

```bash
npm test
```

Runs lint, architecture fitness checks, module-specifier checks, focused unit tests, and desktop/mobile browser smoke tests.

Individual checks:

```bash
npm run lint
npm run test:architecture
npm run test:modules
npm run test:unit
npm run test:browser
```

The browser smoke test starts a local static server, stubs the backend API, and covers desktop plus mobile flows: panel layout, dark/light search inputs, virtual-table scrolling and resize behavior, post filters, zero-result queries, export overlays, and mobile dialogs.

## Roadmap

- Cleaner backend contract layer to make integrations easier to swap
- Continue splitting the remaining large legacy modules into smaller feature modules
- Add focused unit tests for form-mode schema parsing and query-state lifecycle edge cases
