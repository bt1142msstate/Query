# Frontend Architecture

This project is a static browser app organized as feature-oriented ES modules. The architecture is intentionally buildless so it can be served by any static web server, but it still uses explicit module loading, state facades, browser smoke tests, and architecture fitness checks.

## Architecture Summary

- It solves a real workflow with complex state, async execution, virtualized data display, export, overlays, and editable forms.
- It uses native browser ES modules and declares `"type": "module"` for Node-side tooling.
- It has executable guardrails for module specifiers, forbidden browser globals, query-state access, module reachability, import cycles, layer boundaries, unit-tested business logic, and browser smoke behavior.
- Query history is split into grouping/search, backend status mapping, request mapping, row rendering, detail rendering, view metadata, and coordinator modules.
- Query templates are split into repository, payload, collection, state, category-view, list-view, and coordinator modules.
- It documents the intended module boundaries and known legacy areas.

The former private runtime coordination layer has been removed. Feature coordination now goes through ES imports plus explicit service/action registration.

## Runtime Flow

1. `index.html` loads vendor scripts and `appModules.js` as the single application module entry.
2. `appModules.js` imports feature modules in deterministic startup order.
3. `core/bootstrap.js` initializes DOM-bound systems after DOM readiness.
4. User actions write query state through `QueryChangeManager`.
5. UI reads query state through `QueryStateReaders` and subscriptions.
6. `core/queryExecution.js` builds the backend payload, runs or cancels work, then updates result state.
7. Table, history, filters, templates, and overlays render from the current state and service facades.

## Backend Integration Policy

`core/backendApi.js` currently points at an example/testing query API. That endpoint exists to demonstrate the integration shape and gives the browser smoke test a stable route to stub. It should not be treated as the live site's long-term production backend.

The intended deployment model is bring-your-own API. The public live site should remove project-owned API usage and let each deployment provide its own compatible API URLs/configuration for field metadata, query execution, status/cancel, history result loading, and template persistence. Local deployments can temporarily change `core/backendApi.js`, but the next integration step is a runtime API configuration layer so hosted users can supply their own endpoint settings without editing source.

Result hydration is intentionally tolerant while integrations evolve. `core/queryResultParser.js` accepts the legacy `X-Raw-Columns` plus pipe-delimited row stream and standard JSON result payloads such as `{ "columns": [...], "rows": [...] }`, `{ "headers": [...], "results": [...] }`, `{ "fields": [...], "data": [...] }`, or a bare array of row objects. JSON array values normalize to the same internal multi-value separator used by repeated MARC/public-note fields, so table rendering, split columns, post filters, and Excel export share one representation.

## Layer Boundaries

| Layer | Path | Responsibility |
| --- | --- | --- |
| Entry/bootstrap | `appModules.js`, `core/bootstrap.js` | Module loading and app startup |
| State | `core/queryState.js` | Query state, lifecycle flags, read/write facades |
| Services/actions | `core/appServices.js`, `core/appUiActions.js` | Cross-feature coordination without direct feature coupling |
| Core utilities | `core/formatting/`, `core/*Utils.js`, `core/tableBuilder.js`, `core/textMeasurement.js` | Focused helpers imported from their owning modules instead of a mixed utility facade |
| Data contract | `filters/queryPayload.js`, `filters/fieldDefs.js` | Backend payload generation, field metadata, filter normalization |
| Feature UI | `ui/`, `filters/`, `table/`, `history/`, `templates/`, `bubbles/` | User workflows and rendering, with complex widgets split into focused view/helper modules. `bubbles/` is compatibility UI for the current filter-card editor, not a separate builder mode |
| Query history | `history/` | History shell split from request mapping, config loading, result hydration, row rendering, grouping, notifications, tooltips, and status mapping |
| Filter workflows | `filters/` | Backend payload contracts, field metadata, condition validation, buildable-field construction, filter-pill rendering, and condition input/panel configuration |
| Template workflows | `templates/` | Template shell split from models, state, repository, payloads, category actions/views, list/detail rendering, and view-state helpers |
| UI feature folders | `ui/form-mode/`, `ui/field-picker/` | Larger UI workflows with dedicated shell, field-picker, query-preview, state helper, presentation, and interaction modules |
| Table feature folders | `table/drag-drop/`, `table/virtual-table/`, `table/post-filters/`, `table/export/` | Result-table workflows grouped by behavior, with drag/drop split into column, resize, header-action, viewport, and interaction modules; virtual table measurement, row rendering, post-filter state, and split-column transforms split from the coordinator; post-filter value virtualization isolated from the overlay coordinator |
| Styles | `styles/app.css` plus feature CSS files | Feature-scoped styling with a single stylesheet entry |
| Architecture config | `config/` | Forbidden browser globals, module budgets, and import-boundary rules |
| Tests | `tests/architecture/`, `tests/unit/`, `tests/browser/` | Architecture checks, focused unit coverage, and browser smoke coverage |

## Folder Organization

- `core/formatting/` owns value conversion, escaping, date/money formatting, tooltip formatting, and cell display formatting.
- `core/` root owns app-wide state, services/actions, lifecycle, backend/query execution, browser primitives, and startup glue.
- `table/` keeps the top-level table surface in `table/contextMenu.js` and groups complex table workflows into `drag-drop/`, `export/`, `post-filters/`, and `virtual-table/`.
- `ui/` keeps shared UI systems at the root and groups larger workflows in `field-picker/` and `form-mode/`.
- `filters/`, `history/`, and `templates/` are active feature folders; they should only gain subfolders if a workflow grows into multiple independently owned clusters.
- `bubbles/` remains as legacy filter-card presentation code while the condition editor still depends on it. It should not grow new builder-mode behavior.

## Public Runtime Surface

The project no longer exposes application APIs through `window.*`. Startup readiness is represented by the `data-query-app-modules-ready` attribute on the document root and the `query-app:modules-ready` DOM event from `appModules.js`.

Rules now enforced:

- New `window.foo = ...` exports fail lint and architecture checks.
- New `Object.defineProperty(window, 'foo', ...)` exports fail lint and architecture checks.
- Reads from former app-level `window.*` bridge names fail architecture checks.
- Query lifecycle state must be read through `QueryStateReaders`, not through loose globals.
- App modules cannot use CommonJS.
- Module imports cannot include cache-busting query strings.

This removes the public browser-global API surface and keeps cross-feature coordination explicit.

## Module Graph Contract

`tests/architecture/architectureFitness.mjs` builds a static graph from ES imports and enforces these constraints:

- Every application module must be reachable from `appModules.js`.
- Local imports must resolve to explicit `.js` modules inside the application source set.
- Production package dependencies must be imported by application modules; unused runtime packages fail the gate.
- Imports must follow the layer rules in `config/architectureRules.cjs`.
- Circular imports fail the architecture gate.
- Legacy large modules cannot grow beyond their current budget.

The architecture rules are executable, versioned, and run in CI.

## Fitness Checks

Run the full quality gate:

```bash
npm test
```

That runs:

- `npm run lint`: syntax, globals, module rules, query-state boundaries.
- `npm run test:architecture`: architecture fitness checks, legacy module budgets, forbidden browser globals, import graph reachability, import cycles, and layer boundaries.
- `npm run test:modules`: canonical ES module specifiers.
- `npm run test:unit`: focused pure-logic tests for query-history status, request mapping, row output, backend payload contracts, and table transforms.
- `npm run test:browser`: Playwright smoke test for runtime behavior and key UI styling.

## Legacy Budgets

No application module currently uses a legacy large-module budget. The architecture fitness test enforces the normal module size limit across the app, so new large modules should be split instead of added to an exception list.

## Current Review Focus

Future structure work should be cohesion-driven, not size-driven. Large feature shells can stay intact when they own a single workflow and delegate testable logic to focused modules. Small modules should only remain split when they isolate a stable contract, pure logic, worker entrypoint, or feature boundary.

1. Audit the remaining large shells for mixed responsibilities before extracting anything else.
2. Consolidate tiny single-use helpers when their boundary does not improve testing, ownership, or reuse.
3. Keep runtime dependencies minimal; add production packages only when app modules import them directly and the dependency earns its weight.
4. Continue expanding interaction tests around real workflows rather than adding thin tests around implementation details.
