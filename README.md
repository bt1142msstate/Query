Query is a browser-based report builder for SirsiDynix Symphony-style library data. It lets staff assemble output columns and filters visually, run live queries against the backend, inspect query JSON, reload previous runs, and export results.

## What the app does today

- Build queries with bubble-based field selection and filtering.
- Run live queries against the backend and load saved results from query history.
- Reopen prior queries from history, including displayed columns and filters.
- Cancel running queries and monitor running, completed, failed, and cancelled states.
- Export results to Excel.
- Switch into URL-driven form mode for guided report entry.
- Normalize renamed fields through alias support so older saved configs can still load.
- Show shared tooltips and shared toast notifications across the UI.

## Main UI areas

- Bubble builder: the default visual query builder for selecting output columns and filters.
- Query history: reload past queries, inspect status, view results, rerun, and cancel running jobs.
- Query JSON panel: inspect the payload that will be sent to the backend.
- Form mode: a guided input experience built from a form specification encoded in the URL.

## Frontend structure

- `core/`: query execution, history, state, and shared utilities.
- `ui/`: UI systems such as form mode, tooltips, toasts, modal handling, and UI helpers.
- `filters/`: backend field definitions, filter behavior, and payload generation.
- `table/`: result rendering, column management, drag/drop, and Excel export.
- `bubbles/`: bubble rendering and bubble interaction logic.
- `styles/`: shared CSS split by feature area.

Script loading is still controlled directly by `index.html`, so moving files between folders also requires updating the script tags there.

## Running the frontend

There is no build step for the main app. The site is a static HTML, CSS, and JavaScript frontend loaded from `index.html`.

Typical local workflow:

1. Serve the `Query Website` folder from a local static server.
2. Open `index.html` through that server, not directly from the filesystem.
3. Make sure the backend endpoints it calls are reachable from your browser.

The root `package.json` is minimal and is not the main runtime entrypoint for the frontend.

## Backend expectations

The frontend expects the backend to provide at least:

- field definitions, including filter metadata and aliases
- query execution
- query status polling
- query cancellation
- result retrieval for previous runs

Recent frontend behavior also assumes the backend may return field aliases so older saved names can be normalized to current canonical names.

## URL form mode

Form mode is driven by a `form` query parameter whose value is a base64url-encoded JSON object.

Input values stay in the URL as normal query parameters such as `library=MAIN` or `lastUsedBefore=2024-01-01`.

### Supported form schema keys

- `title`: heading shown above the form.
- `description`: optional supporting copy.
- `queryName`: default output or query name.
- `columns`: output columns to load automatically.
- `inputs`: editable form inputs.
- `lockedFilters`: filters always applied behind the scenes.

Each `inputs` entry can include:

- `key`
- `field`
- `label`
- `operator`
- `required`
- `multiple`
- `type`
- `placeholder`
- `help`
- `default`
- `keys` for `between`
- `options`

### Example schema

```json
{
  "title": "Weeding List",
  "description": "Run a focused stale-items report without the full bubble builder.",
  "queryName": "Weeding List",
  "columns": ["Item Key", "Title", "Item Library", "Date Last Used"],
  "inputs": [
    {
      "key": "library",
      "field": "Item Library",
      "label": "Item Library",
      "operator": "equals",
      "required": true
    },
    {
      "key": "lastUsedBefore",
      "field": "Date Last Used",
      "label": "Last Used Before",
      "operator": "on_or_before",
      "type": "date",
      "required": true
    }
  ]
}
```

### Generating a form URL in the browser console

```js
const spec = {
  title: 'Weeding List',
  queryName: 'Weeding List',
  columns: ['Item Key', 'Title', 'Item Library', 'Date Last Used'],
  inputs: [
    { key: 'library', field: 'Item Library', label: 'Item Library', operator: 'equals', required: true },
    { key: 'lastUsedBefore', field: 'Date Last Used', label: 'Last Used Before', operator: 'on_or_before', type: 'date', required: true }
  ]
};

const url = new URL(window.location.href);
url.search = '';
url.searchParams.set('form', window.QueryFormMode.encodeSpec(spec));
url.searchParams.set('library', 'MAIN');
url.searchParams.set('lastUsedBefore', '2024-01-01');
console.log(url.toString());
```

## Notes

- Query history is a core part of the current workflow, not a future feature.
- Form mode can also be generated from the current query inside the app.
- The UI includes shared bottom-right toast notifications and shared hover tooltips.
- Multi-value fields may render as grouped selectors or list-entry popups depending on field metadata.
