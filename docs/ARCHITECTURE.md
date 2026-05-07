# Frontend Architecture

This project is a static browser app organized as feature-oriented ES modules. The architecture is intentionally buildless so it can be served by any static web server, but it still uses explicit module loading, state facades, browser smoke tests, and architecture fitness checks.

## Current Grade

For a frontend job portfolio, the project is now an A+ architecture sample for a vanilla JavaScript application:

- It solves a real workflow with complex state, async execution, virtualized data display, export, overlays, and editable forms.
- It uses native browser ES modules and declares `"type": "module"` for Node-side tooling.
- It has executable guardrails for module specifiers, forbidden browser globals, query-state access, module reachability, import cycles, layer boundaries, unit-tested business logic, and browser smoke behavior.
- Query history is split into request mapping, row rendering, detail rendering, view metadata, and coordinator modules.
- It documents the intended module boundaries and known legacy areas.

The former private runtime coordination layer has been reduced to a single app-ready marker in the entry module. Feature coordination now goes through ES imports plus explicit service/action registration.

## Runtime Flow

1. `index.html` loads vendor scripts and `appModules.js` as the single application module entry.
2. `appModules.js` imports feature modules in deterministic startup order.
3. `core/bootstrap.js` initializes DOM-bound systems after DOM readiness.
4. User actions write query state through `QueryChangeManager`.
5. UI reads query state through `QueryStateReaders` and subscriptions.
6. `core/queryExecution.js` builds the backend payload, runs or cancels work, then updates result state.
7. Table, history, filters, templates, and overlays render from the current state and service facades.

## Layer Boundaries

| Layer | Path | Responsibility |
| --- | --- | --- |
| Entry/bootstrap | `appModules.js`, `core/bootstrap.js` | Module loading and app startup |
| State | `core/queryState.js` | Query state, lifecycle flags, read/write facades |
| Services/actions | `core/appServices.js`, `core/appUiActions.js` | Cross-feature coordination without direct feature coupling |
| Data contract | `filters/queryPayload.js`, `filters/fieldDefs.js` | Backend payload generation, field metadata, filter normalization |
| Feature UI | `ui/`, `filters/`, `bubbles/`, `table/`, `core/queryHistory*.js`, `core/queryTemplates.js` | User workflows and rendering |
| Styles | `styles/app.css` plus feature CSS files | Feature-scoped styling with a single stylesheet entry |
| Architecture config | `config/` | Forbidden browser globals, module budgets, and import-boundary rules |
| Tests | `tests/` | Architecture checks and browser smoke coverage |

## Runtime Marker

The project no longer exposes application APIs through `window.*`. `core/appRuntime.js` now exists only for the `appModules.js` ready marker used during startup.

Rules now enforced:

- New `window.foo = ...` exports fail lint and architecture checks.
- New `Object.defineProperty(window, 'foo', ...)` exports fail lint and architecture checks.
- Reads from former app-level `window.*` bridge names fail architecture checks.
- Query lifecycle state must be read through `QueryStateReaders`, not through loose globals.
- App modules cannot use CommonJS.
- Module imports cannot include cache-busting query strings.

This removes the public browser-global API surface and keeps cross-feature coordination explicit.

## Module Graph Contract

`tests/architectureFitness.mjs` builds a static graph from ES imports and enforces these constraints:

- Every application module must be reachable from `appModules.js`.
- Local imports must resolve to explicit `.js` modules inside the application source set.
- Imports must follow the layer rules in `config/architectureRules.cjs`.
- Circular imports fail the architecture gate.
- Legacy large modules cannot grow beyond their current budget.

This is the strongest portfolio signal in the project: the architecture rules are executable, versioned, and run in CI.

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

1. Split `ui/formMode.js` into schema parsing, lifecycle coordination, rendering, and event binding modules.
2. Split `core/queryTemplates.js` into storage, rendering, category management, and editor modules.
3. Add focused unit tests for `core/queryState.js` lifecycle edge cases and form-mode schema parsing.
4. Consider TypeScript or JSDoc type checking if the project needs a stronger enterprise-style portfolio signal.
