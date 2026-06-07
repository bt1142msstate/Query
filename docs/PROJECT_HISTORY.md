# Project Build History

This is a non-redundant summary of the work represented by the repository commit history through the current release. It groups repeated fixes and polish passes by outcome instead of repeating every individual commit message.

## Foundation

- Created the static single-page application entrypoint and moved the app to `index.html` for GitHub Pages hosting.
- Built the initial query-building interface with field selection, filters, query JSON inspection, and result display.
- Added a persistent header, toolbar actions, modal panels, and the main app shell.
- Added custom styling, CSS variables, reusable visual states, and a feature-based stylesheet structure.
- Added README documentation and evolved it into a setup guide for a static frontend with a swappable backend.
- Added project metadata, app icons, web manifest support, cache-busting files, and GitHub Actions validation.
- Removed tracked `node_modules` and added dependency hygiene rules so generated dependencies stay out of the repository.

## Query Builder

- Built the original visual builder workflow, including selectable fields, active filters, displayed columns, drag/drop ordering, and condition editing.
- Added field search, category filtering, selected-field views, and field count updates.
- Added a shared field picker that works for display fields, filters, table actions, and form mode.
- Ranked exact and name-based field matches ahead of description matches so searches like `title` surface the expected field first.
- Added support for backend-driven dynamic/buildable fields so the frontend can render custom field inputs without knowing backend tools.
- Removed the old bubble-first builder workflow and made form/core mode the primary workflow.
- Prevented non-real parent fields from being displayed directly when they exist only to create dynamic fields.
- Added empty-state guidance so the app tells users what to do when no fields are selected.

## Filters

- Implemented standard filter conditions such as equals, contains, starts with, before, after, between, and does not equal.
- Added robust date input handling, including manual entry, common date formats, delayed validation while typing, and normalized date values.
- Added date `Never` support for equality filters and date picker controls.
- Added validation to block illogical date filters, especially invalid `Never` combinations and reversed ranges.
- Added post filters that apply only to already-loaded results and do not get sent to the backend.
- Ensured post filters are cleared between query runs while preserving view state when loading/restoring the same result.
- Added post-filter operators for blank, not blank, has multiple values, and does not have multiple values.
- Updated post-filter comparison logic so contains, equals, and related operators work correctly with multi-value cells.
- Added streamed selector support for post-filter value picking.

## Query Execution

- Built query payload generation from selected fields and active filters.
- Added query running state, cancellation state, progress messaging, and failure handling.
- Fixed zero-result handling so no-result queries report no results instead of switching into planning state.
- Fixed cases where filtered counts and rendered result counts diverged.
- Cleared client-only post filters before backend query execution.
- Added guarded query lifecycle state so reruns, fresh runs, restored results, and shared URLs do not corrupt one another.
- Added support for backend progress metadata so long-running queries can report meaningful progress while results are still being prepared.
- Added backend error diagnostics in history and result loading so failures can point to transport, query, streaming, or post-processing problems.

## Results Table

- Added virtualized result rendering so large result sets render only the visible rows plus an overscan buffer.
- Added native and custom table scrolling behavior, including a draggable scrollbar thumb.
- Fixed scroll boundaries so the table cannot scroll above headers or below the result range.
- Added column sorting with raw-value handling and empty-value placement.
- Added column resizing with live row/header alignment while dragging.
- Fixed expanded table mode so cells and headers stay aligned.
- Added column drag/drop, grouped split-column movement, drop anchors, drag previews, and horizontal auto-scroll.
- Prevented no-op drop anchors where dropping would leave a column in the same position.
- Added table context menus for desktop right-click and mobile long-press.
- Added mobile touch behavior for context menus, column resizing, and header dragging.
- Added compact multi-value cells that show the first value and open a viewer for all values.
- Added full-value viewing for ellipsized cells so clipped text can be inspected and copied.
- Added copy actions for cells, rows, and columns.

## Multi-Value Data

- Preserved JSON array values from the backend as true multi-value cells instead of flattening them into ambiguous strings.
- Added split-column mode so multi-value fields can expand into numbered sibling columns.
- Made split-column mode fast enough for very large result sets by avoiding unnecessary full-table materialization.
- Preserved post filters and other view state when toggling split columns.
- Ensured filter and post-filter actions on a split child column target the parent field.
- Moved split child columns as a group during drag/drop.
- Highlighted split-column groups consistently during table actions.
- Added tests for public-note-style and MARC-style repeated values, split-column behavior, post filters, and Excel export.

## Query History

- Built a query history panel with running, completed, failed, and cancelled states.
- Added live status polling, query duration/status metadata, result counts, and progress display.
- Added loading progress when opening large result sets from history.
- Added history search, sorting/filtering controls, compact cards, and less intimidating result summaries.
- Added reload, rerun, cancel, open results, and save-as-template actions.
- Improved history action button layout and labels for clarity.
- Added detail overlays for long field/filter lists instead of forcing wide cards.
- Added result caching so the last opened result can restore instantly after refresh.
- Added shared result URLs that open a specific saved result without putting the result data itself in the URL.
- Canonicalized shared URLs and cleared older URL formats into the current standard.

## Query Templates

- Added template saving, loading, deletion, categories, pinned templates, search, and detail views.
- Reworked template panels and overlays for desktop, mobile, and tablet layouts.
- Added template API integration paths while keeping template persistence optional for minimal backends.
- Added the ability to turn a query history entry into a template.
- Updated template icons and visual polish, then kept project branding separate from the header.

## Form Mode

- Added URL-driven form mode for guided reporting workflows.
- Added form specs for titles, descriptions, default names, editable inputs, hidden values, locked filters, and output columns.
- Added share URLs for editable forms and separate share behavior for result links.
- Fixed refresh behavior so an opened non-limited query does not become limited mode just because the URL was refreshed.
- Preserved relevant result view state, field search, ordering, filters, and split preferences across refresh/share where appropriate.
- Added form-mode state reconciliation so controls, filters, and displayed fields stay synchronized.

## Excel Export

- Added Excel export through ExcelJS with table styling, frozen headers, filters, and type-aware formatting.
- Added column type handling for dates, money, numbers, text, and special `Never` date values.
- Added large workbook export support that avoids crashing the site on large result sets.
- Moved large export generation into a worker so the page remains responsive and background tabs do not pause the work as aggressively.
- Added visible export progress and completion notifications for long-running exports.
- Added optional workbook run details with displayed fields, filters, post filters, and timing metadata.
- Added overview/summary sheets with total rows and percentage calculations for grouped exports.
- Preserved multi-value display choices in export, including stacked values and split columns.
- Kept large-export styling aligned with the normal export path.

## Mobile And Responsive Work

- Reworked the app into a usable mobile/tablet workflow with one major surface visible at a time.
- Prioritized the results table at the top of mobile when fields/results exist.
- Added mobile action bars, builder drawers, overlay sheets, and touch-friendly controls.
- Improved the mobile field picker, filters/display panel, query history, templates, help overlay, export dialog, and expanded table mode.
- Prevented page zoom and accidental text selection where controls should behave like app controls.
- Locked background page scrolling when overlays are open while still allowing overlay content to scroll.
- Kept landscape and tablet widths on the mobile workflow when that layout is more usable.
- Added responsive resizing behavior so layout adapts when the browser window changes size on the fly.
- Added browser smoke coverage for desktop, mobile, tablet landscape, tablet portrait, rotation, overlays, touch menus, and table controls.

## Notifications And Progress UI

- Added startup status while field metadata loads from the backend.
- Started the space-themed loading animation immediately so users see a stable loading state instead of UI flicker.
- Added progress panels for query execution, result loading, and workbook export.
- Added toast behavior tuned for mobile so notifications do not stack over important controls.
- Added service-worker-backed notifications for long-running background tasks where supported by the browser.

## Architecture

- Moved app code into `src/` and kept root-level files limited to static host/runtime files, docs, tests, scripts, and config.
- Migrated browser code to native ES modules.
- Replaced sequential script loading with a deterministic ES module startup entrypoint.
- Removed legacy global application bridges and moved cross-feature coordination to imports plus explicit service/action registration.
- Split core utilities into focused modules for backend API calls, clipboard, DOM readiness, formatting, icons, toast, visibility, drag utilities, and operator labels.
- Split feature modules for history, templates, form mode, filters, drag/drop, virtual table, post filters, and Excel export.
- Added architecture guardrails to prevent protected globals, mixed module ownership, invalid import paths, and hardcoded frontend field catalogs.
- Organized source folders into `core`, `features`, `ui`, and `styles`, with feature subfolders where ownership boundaries are clear.
- Kept coordinator modules only where they still represent real workflow ownership.

## Testing And Quality Gates

- Added linting and architecture fitness checks.
- Added unit tests for query state, payloads, filters, date handling, post filters, history, templates, form mode, virtual table logic, sorting, split columns, and workbook export helpers.
- Added browser smoke tests for realistic app interactions instead of relying only on isolated unit tests.
- Added coverage for zero-result queries, multi-step interactions, mobile overlays, context menus, resizing, sorting, split columns, JSONL results, and history/result restoration.
- Modernized tests under Node's built-in test runner and grouped unit tests by `core`, `features`, and `ui`.
- Added cache-busting enforcement so deployments fail if app assets change without updating `cache-bust.json`.
- Updated GitHub Actions to the current Node runtime and maintained a single `npm test` quality gate.

## Documentation And Repository Polish

- Updated the README to explain the app, local setup, source layout, backend connection path, quality checks, cache busting, and current roadmap.
- Added architecture documentation describing module boundaries, quality gates, and current structure.
- Added an integration guide and JSON Schema for compatible backend implementations.
- Added roadmap documentation with current stage, completed milestones, remaining work, and non-goals.
- Added testing documentation to explain test layers and avoid redundant coverage.
- Updated repository metadata and icons so the project presents cleanly on GitHub and as an installed web app.

## Backend Work Required

The frontend is intentionally backend-swappable. To make the full project work with a real data source, the backend side needed to provide or be updated for the following responsibilities.

- Host a compatible HTTPS API endpoint that accepts browser `POST` requests with JSON bodies.
- Support CORS or same-origin routing for the deployed frontend.
- Implement `get_fields` so the frontend can discover all available fields instead of shipping a built-in field catalog.
- Return field metadata with names, labels, categories, descriptions, data types, supported filter operators, selector values, aliases, multi-value hints, and warnings for fields that may be slow.
- Return dynamic/buildable field definitions for custom fields such as public-note-style values or MARC-style fields, including optional subfield inputs where needed.
- Accept `run` payloads with `result_format: "jsonl"`, ordered `display_fields`, backend filters, query names, and dynamic field names created by the frontend.
- Convert the underlying query tool output into streaming JSON Lines events:
  - one `meta` event with `version`, `format`, `query_id`, and ordered `columns`
  - zero or more `row` events with `values` in the same order as `columns`
  - one final `done` event with the completed row count
- Preserve key values such as item IDs, item keys, and any other stable identifiers exactly as the backend receives them.
- Preserve repeated values as JSON arrays so the frontend can support multi-value cells, split columns, post filters, and Excel export correctly.
- Support public-note-style fields in a way that returns all notes for an item, not only the first note.
- Support MARC-style dynamic fields without requiring a subfield when the whole field is requested, while still allowing subfield-specific output when supplied.
- Handle date `Never` semantics on the backend, including equality with `Never` and before-date behavior that includes both normal before-date results and `Never` results when that is the intended filter behavior.
- De-duplicate combined backend result sets when a filter requires more than one backend query.
- Stream rows progressively instead of buffering the entire result set before sending the first result.
- Report structured progress metadata during long-running stages such as query execution, dynamic field extraction, post-processing, and cleanup.
- Report useful structured errors that distinguish transport failures, query-tool failures, dynamic-field extraction failures, post-processing failures, and cleanup failures.
- Clean up temporary files and spawned query processes, including recovery cleanup when a previous query errors before normal cleanup finishes.
- Support optional `status`, `cancel`, and `get_results` actions when the deployment wants live query history, cancellation, saved-result loading, and refresh-safe result restoration.
- Support optional template actions when the deployment wants template persistence across sessions.
- Return HTTP `429` with retry metadata for rate limits when requests need throttling, while allowing practical testing without unnecessary timeouts.
- Keep secrets, credentials, and data-system access on the backend side rather than exposing them through frontend URLs or static files.

## Current Result

The project is now a buildless static frontend with a documented backend contract, backend-driven field definitions, streaming JSONL result support, a virtualized results table, large Excel export, mobile/tablet workflows, query history, templates, form sharing, result sharing, and a modern test/architecture gate.

The remaining work is mainly integration polish: first-class API settings in the UI, removal of the example API as the live-site default, and small compatible backend examples for new deployments.
