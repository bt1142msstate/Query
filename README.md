# Query Website

Frontend application for the Sirsi Query Project.

This is the browser UI for building reports, reviewing query state, opening prior runs, and exporting results. It is written as a static HTML/CSS/JavaScript app and is being shaped to stay compatible with multiple backend implementations over time.

## What It Does

- build queries visually with the bubble-based workflow
- switch into guided form mode for focused report entry
- inspect the active query payload in the JSON panel
- browse query history, including active and past runs
- rerun, cancel, and reopen saved queries
- export results to Excel

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

```text
core/      Query execution flow, history, state, utilities
ui/        Form mode, modals, tooltips, toasts, shared helpers
filters/   Field definitions and query-payload helpers
table/     Result rendering, column handling, export helpers
bubbles/   Bubble rendering and interaction logic
styles/    Feature-based stylesheets
```

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
