<div align="center">

# Query Website

Frontend application for the Sirsi Query Project.

![Static Site](https://img.shields.io/badge/app-static_site-f6f3ff?style=for-the-badge)
![Vanilla JS](https://img.shields.io/badge/ui-vanilla_js-fff3e8?style=for-the-badge)
![History Ready](https://img.shields.io/badge/history-live_status_%2B_restore-e8fbf2?style=for-the-badge)
![Form Mode](https://img.shields.io/badge/mode-url_driven_forms-f2f7ff?style=for-the-badge)

</div>

This is the browser UI for building reports, reviewing query state, reopening prior runs, and exporting results. It is intentionally being shaped to stay compatible with multiple backend implementations over time.

> [!NOTE]
> The frontend is being pushed toward a cleaner integration surface so it can migrate more easily between backend implementations without forcing a full UI rewrite.

## What It Does

| Capability | Summary |
| --- | --- |
| Visual query building | Bubble-based field and filter workflow |
| Guided workflows | URL-driven form mode for focused report entry |
| Query visibility | Inspect the active query payload in the JSON panel |
| History | Browse active and previous runs with status-aware actions |
| Results | Reopen, rerun, cancel, and export query output |

## UI Areas

### Bubble Builder

The default interface for assembling output columns and filters.

### Query History

Shows running, complete, failed, and cancelled queries with status-aware actions.

### Query JSON

Exposes the current query payload so it can be reviewed before or after execution.

### Form Mode

Supports URL-driven forms for narrower workflows where users should fill in a guided set of inputs instead of working directly in the full builder.

## Frontend Structure

| Path | Purpose |
| --- | --- |
| `core/` | Query execution flow, history, state, and utilities |
| `ui/` | Form mode, modals, tooltips, toasts, and shared helpers |
| `filters/` | Field definitions and query-payload helpers |
| `table/` | Result rendering, columns, and export helpers |
| `bubbles/` | Bubble rendering and interaction logic |
| `styles/` | Feature-based stylesheets |

## Local Development

There is no required build step for the main app.

1. Serve this directory from a local static server.
2. Open `index.html` through that server.
3. Connect it to a compatible backend environment.

## Migration Direction

This frontend is intended to work with more than one backend shape.

Ongoing work is focused on making that easier by:

- reducing backend-specific assumptions in the UI
- tightening shared query and field-definition contracts
- preserving compatibility for saved queries as integrations evolve

## Future Features

- optional sign-in with a preferred AI provider, such as Gemini or ChatGPT, so users can get help turning reporting needs into queries
- continued work to make frontend integration more portable across backend implementations

## Form Mode Summary

Form mode is driven by an encoded JSON specification passed through the URL. A form can define:

- a title and description
- a default query name
- output columns
- editable inputs
- locked filters

That makes the same frontend usable for both exploratory report building and narrow operational workflows.
