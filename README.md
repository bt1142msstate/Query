<div align="center">

# 📊 Item Query Project

A browser-based report builder for library data.

</div>

A single-page app for building queries, applying filters, reviewing results, and exporting to Excel — all without leaving the browser. Designed to work against any compatible backend.

## 📌 At a Glance

| Feature | What it gives you |
| --- | --- |
| **Bubble builder** | Browse and select fields by category, apply filter conditions |
| **Form mode** | URL-driven guided forms for focused reporting workflows |
| **Query history** | Live status tracking — reload, rerun, cancel, or inspect past runs |
| **Query JSON** | Inspect the exact payload being sent to the backend |
| **Results table** | Virtualized large-table rendering with Excel export |

## 💻 Features

### 🔍 Bubble Builder

The default view. Browse fields by category or search by name, then select fields to add them to your output. Click any active field to open a filter condition panel — supports `equals`, `contains`, `between`, `before/after`, `starts with`, and more.

### 📜 Query History

Tracks every query run in the session with live status badges: `running`, `complete`, `failed`, and `cancelled`. Completed queries can be reloaded or rerun; running queries can be cancelled mid-execution. The history panel polls for live status updates and keeps the last 50 queries in memory.

### 📋 Query JSON Panel

Shows the structured JSON payload for the current query. Useful for debugging filter logic or copying the spec for reuse.

### 📝 Form Mode

A URL-driven mode for guided workflows. Pass a JSON spec via the `?spec=` parameter (raw JSON, URL-encoded, or Base64URL) to generate a focused input form instead of the full bubble builder. A form spec can define:

- title and description
- default query name
- fixed output columns
- editable inputs — text fields, dropdowns, multi-value inputs, or hidden fields
- locked filters the user cannot change

### 📊 Results & Export

Results render in a virtualized table (25 visible rows at a time) for smooth performance with large datasets. Export to Excel with the download button — multi-value fields can be rendered as stacked lines in one cell or expanded into separate numbered columns using the split-columns toggle.

## 📁 Structure

| Path | Purpose |
| --- | --- |
| `bubbles/` | Bubble rendering and interaction logic |
| `core/` | Query execution, history, state management, and utilities |
| `filters/` | Field definitions and filter/payload logic |
| `table/` | Result rendering, virtual scrolling, and Excel export |
| `ui/` | Form mode, modals, toasts, tooltips, and shared helpers |
| `styles/` | Feature-based CSS |

## 🛠️ Tech

- Static HTML, CSS, and vanilla JavaScript — no build step required
- Feature-oriented folder structure
- [ExcelJS](https://github.com/exceljs/exceljs) for Excel export

## 🚀 Running Locally

1. Serve this directory from a local static server.
2. Open the app through that server (not directly from the filesystem).
3. Point it at a compatible backend.

## � Roadmap

- Optional sign-in with an AI provider (Gemini, ChatGPT) to help turn reporting needs into query specs
- Cleaner backend contract layer to make integrations easier to swap
