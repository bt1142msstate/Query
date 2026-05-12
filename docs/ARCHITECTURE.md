# Frontend Architecture

This project is a static browser app organized as feature-oriented ES modules. The architecture is intentionally buildless so it can be served by any static web server, but it still uses explicit module loading, state facades, browser smoke tests, and architecture fitness checks.

## Architecture Summary

- It solves a real workflow with complex state, async execution, virtualized data display, export, overlays, and editable forms.
- It uses native browser ES modules and declares `"type": "module"` for Node-side tooling.
- It has executable guardrails for module specifiers, forbidden browser globals, query-state access, module reachability, import cycles, layer boundaries, unit-tested business logic, and browser smoke behavior.
- Query history is split into request mapping, row rendering, detail rendering, view metadata, and coordinator modules.
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

## Layer Boundaries

| Layer | Path | Responsibility |
| --- | --- | --- |
| Entry/bootstrap | `appModules.js`, `core/bootstrap.js` | Module loading and app startup |
| State | `core/queryState.js` | Query state, lifecycle flags, read/write facades |
| Services/actions | `core/appServices.js`, `core/appUiActions.js` | Cross-feature coordination without direct feature coupling |
| Data contract | `filters/queryPayload.js`, `filters/fieldDefs.js` | Backend payload generation, field metadata, filter normalization |
| Feature UI | `ui/`, `filters/`, `bubbles/`, `table/`, `history/`, `templates/` | User workflows and rendering |
| UI feature folders | `ui/form-mode/`, `ui/field-picker/` | Larger UI workflows with their own shell, state helpers, and interaction logic |
| Table feature folders | `table/drag-drop/`, `table/virtual-table/`, `table/post-filters/`, `table/export/` | Result-table workflows grouped by behavior instead of one flat table folder |
| Styles | `styles/app.css` plus feature CSS files | Feature-scoped styling with a single stylesheet entry |
| Architecture config | `config/` | Forbidden browser globals, module budgets, and import-boundary rules |
| Tests | `tests/architecture/`, `tests/unit/`, `tests/browser/` | Architecture checks, focused unit coverage, and browser smoke coverage |

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

Some modules are intentionally allowed above the normal line-count budget while they are being split:

- Query history coordinator
- Query state
- Query templates
- Shared utilities
- Filter manager
- Drag/drop interactions
- Post filters
- Virtual table
- Field picker
- Form mode

The architecture fitness test prevents those files from growing. New large modules should be split instead of added to the budget.

## Recommended Next Refactors

1. Continue splitting `ui/form-mode/formMode.js` by moving field-picker coordination and event binding into dedicated modules.
2. Continue splitting `templates/queryTemplates.js` by moving rendering, category management, and editor coordination into dedicated modules.
3. Add more workflow-level unit tests for history/template state transitions and form-mode schema parsing.
4. Consider TypeScript or JSDoc type checking if stricter static contracts become useful.
