# Frontend Architecture

This project is a static browser app organized as feature-oriented ES modules. The architecture is intentionally buildless so it can be served by any static web server, but it still uses explicit module loading, state facades, browser smoke tests, and architecture fitness checks.

## Architecture Summary

- It solves a real workflow with complex state, async execution, virtualized data display, export, overlays, and editable forms.
- It uses native browser ES modules and declares `"type": "module"` for Node-side tooling.
- It has executable guardrails for module specifiers, forbidden browser globals, query-state access, module reachability, import cycles, layer boundaries, coupling/modularity budgets, folder cohesion, Git-history change coupling, cognitive complexity, unit-tested business logic, and browser smoke behavior.
- Query history is split into grouping/search, backend status mapping, request mapping, row rendering, detail rendering, view metadata, and coordinator modules.
- Query templates are split into repository, payload, collection, state, category-view, list-view, and coordinator modules.
- It documents the intended module boundaries and known legacy areas.

The former private runtime coordination layer has been removed. Feature coordination now goes through ES imports plus explicit service/action registration.

Current product status and remaining roadmap items are tracked in `docs/ROADMAP.md`.

## Canonical Source Layout

The canonical application source root is `src/`.

The repository intentionally rejects a mixed top-level JavaScript source layout. Top-level files are for static hosting, runtime entry files, tooling, docs, tests, scripts, and config:

- `index.html` is the static host entrypoint.
- `backgroundNotificationServiceWorker.js` stays at the root because browsers register service workers by served scope.
- `cache-bust.json`, `package.json`, `eslint.config.cjs`, `.github/`, `config/`, `docs/`, `scripts/`, and `tests/` stay at the root as project/runtime/tooling files.
- Browser application modules, feature logic, UI systems, and stylesheet source live under `src/`.

New app code should be added under `src/core/`, `src/features/`, `src/lib/`, `src/ui/`, or `src/styles/` according to the ownership rules below. Reusable frontend surfaces that are intended for other websites should be exposed under `src/components/` as public entrypoints over reusable `src/lib/` internals. Tests and scripts should import app modules from `src/`; they should not create a parallel top-level source tree.

## Runtime Flow

1. `index.html` loads vendor scripts, fetches `cache-bust.json` with `cache: no-store`, versions the app stylesheet/module entry, and registers the root service worker for same-origin app assets.
2. `index.html` dynamically imports `src/appModules.js` with the current cache version.
3. `src/appModules.js` imports feature modules in deterministic startup order.
4. `src/core/bootstrap.js` initializes DOM-bound systems after DOM readiness.
5. User actions write query state through `QueryChangeManager`.
6. UI reads query state through `QueryStateReaders` and subscriptions.
7. `src/core/queryExecution.js` builds the backend payload, runs or cancels work, then updates result state.
8. Table, history, filters, templates, and overlays render from the current state and service facades.

## Backend Integration Policy

`src/core/backendApi.js` currently points at an example/testing query API. That endpoint exists to demonstrate the integration shape and gives the browser smoke test a stable route to stub. It should not be treated as the live site's long-term production backend.

The intended deployment model is bring-your-own API. The public live site should remove project-owned API usage and let each deployment provide its own compatible API URLs/configuration for field metadata, query execution, status/cancel, history result loading, and template persistence. Users can configure a compatible endpoint from the API Settings panel. Static deployments can also supply `?api_url=...` or `?query_api_url=...`; valid values are stored in `localStorage` under `query-project.api-url`. Local deployments can still change the default in `src/core/backendApi.js` when that is simpler.

Result hydration uses the canonical streaming JSONL contract. `src/core/queryStream.js` reads newline-delimited `meta`, `row`, `progress`, `warning`, `error`, and `done` events, then `src/core/queryResultParser.js` maps row value arrays into displayed columns. JSON array values are preserved as array-backed multi-value cells so table rendering, split columns, post filters, and Excel export share one representation.

The full backend integration contract is documented in `docs/INTEGRATION.md`.

## Layer Boundaries

| Layer | Path | Responsibility |
| --- | --- | --- |
| Entry/bootstrap | `src/appModules.js`, `src/core/bootstrap.js` | Module loading and app startup |
| State | `src/core/queryState.js` | Query state, lifecycle flags, read/write facades |
| Services/actions | `src/core/appServices.js`, `src/core/appUiActions.js` | Cross-feature coordination without direct feature coupling |
| Core utilities | `src/core/fieldDefs.js`, `src/core/formatting/`, `src/core/*Utils.js`, `src/core/textMeasurement.js` | Backend-driven field registry, focused helpers, and shared primitives imported from their owning modules instead of a mixed utility facade |
| Reusable components | `src/components/` | Public ES module entrypoints for the reusable mounted virtual table, table projection, column drag/drop, workbook export, date input, and tooltip behavior |
| Reusable library internals | `src/lib/` | Framework-free virtual-table, drag/drop, and workbook-export primitives that can be used by app features, public components, tests, and scripts without depending on app state |
| Data contract | `src/core/fieldDefs.js`, `src/features/filters/queryPayload.js` | Backend field metadata registry, payload generation, and filter normalization |
| Features | `src/features/filters/`, `src/features/table/`, `src/features/history/`, `src/features/templates/` | User workflows grouped by product feature, with complex widgets split into focused view/helper modules |
| Query history | `src/features/history/` | History shell split from request mapping, config loading, result hydration, row rendering, grouping, notifications, tooltips, and status mapping |
| Filter workflows | `src/features/filters/` | Backend payload contracts, field metadata, condition validation, buildable-field construction, filter-pill rendering, and condition input/panel configuration |
| Template workflows | `src/features/templates/` | Template shell split from models, state, repository, payloads, category actions/views, list/detail rendering, and view-state helpers |
| UI feature folders | `src/ui/form-mode/`, `src/ui/field-picker/` | Larger UI workflows with dedicated shell, field-picker, query-preview, state helper, presentation, and interaction modules |
| Table feature folders | `src/features/table/drag-drop/`, `src/features/table/virtual-table/`, `src/features/table/post-filters/`, `src/features/table/export/` | App-specific result-table workflows grouped by behavior, with stateful drag/drop, resize, header-action, post-filter, context-menu, and export overlay coordination split from reusable `src/lib/` primitives |
| Shared UI | `src/ui/` | App shell rendering, shared selectors, modals, toasts, tooltips, date picker, field picker, and form mode |
| Styles | `src/styles/tokens.css`, `src/styles/app.css`, plus feature CSS files | Token-driven theming, feature-scoped styling, and a single stylesheet entry |
| Architecture config | `config/` | Forbidden browser globals, module budgets, and import-boundary rules |
| Tests | `tests/architecture/`, `tests/unit/`, `tests/browser/` | Architecture checks, focused unit coverage, and browser smoke coverage |

## Folder Organization

- `src/` owns the browser application source, keeping the repository root focused on static-host files, runtime files, tooling, docs, and tests.
- `src/components/` owns public reusable entrypoints. These modules wrap stable `src/lib/` internals for outside sites and future package exports; they should stay small and avoid importing app-shell coordinators.
- `src/core/` owns app-wide state, services/actions, lifecycle, backend/query execution, the backend-driven field metadata registry, browser primitives, startup glue, and shared formatting helpers under `src/core/formatting/`.
- `src/lib/` owns reusable, framework-free implementation internals. It can import `src/core/` primitives and other `src/lib/` modules, but it cannot import app features, app UI shells, query state stores, or overlay coordinators.
- `src/features/` owns product features: filters, history, table, and templates.
- `src/features/table/` keeps the top-level table surface in `contextMenu.js` and groups app-specific table workflows into `drag-drop/`, `export/`, `post-filters/`, and `virtual-table/`.
- `src/features/table/export/` owns the app export dialog, progress UI, split-column preference UI, and download orchestration. Worker-safe workbook building and ZIP/XLSX generation live in `src/lib/workbook-export/`.
- `src/lib/workbook-export/` keeps workbook data shaping, overview/details sheets, browser-safe Blob generation, worker entrypoint support, and ZIP writing separate from app UI orchestration.
- `src/lib/virtual-table/` owns reusable virtualizer, column layout, scrollbar controller, row projection, sort, split-column transforms, multi-value display helpers, and duplicate-row collapse.
- `src/lib/drag-drop/` owns reusable drag/drop math, viewport auto-scroll, resize-start detection, and drop-anchor layout helpers.
- `src/features/filters/condition-editor/` owns condition editor layout, input adapters, panel UI, interaction wiring, reset behavior, and bubble-shaped field controls. This keeps the retired standalone bubble-builder concept out of the top-level folder model.
- `src/ui/` keeps shared UI systems at the root and groups larger workflows in `field-picker/` and `form-mode/`.
- `src/styles/` owns design tokens, the stylesheet entrypoint, and feature CSS.

## Theme System

The theme system follows a token layering model: reference tokens define raw values, semantic system tokens define UI roles, and component CSS consumes those roles. `src/styles/tokens.css` is the source of truth for those tokens and is imported before all feature styles from `src/styles/app.css`.

Rules for theme work:

- Add new visual modes by overriding `--qp-sys-*` semantic tokens under root attributes such as `data-theme-resolved`, `data-theme-accent`, or `data-theme-contrast`.
- Keep feature CSS focused on component structure and state. Prefer semantic tokens such as `--qp-sys-color-surface`, `--qp-sys-color-on-surface`, `--qp-sys-color-outline`, and `--qp-sys-color-focus-ring` over hardcoded light/dark values.
- `--theme-*` variables are compatibility aliases for older component rules. They must resolve to `--qp-sys-*` tokens and should not gain new raw values.
- Contrast-sensitive states such as borders, focus rings, selected rows, and icon-only controls must be tokenized so they can satisfy light, dark, and higher-contrast variants together.

The contract is executable in `tests/architecture/themeTokenContract.mjs`, which verifies token import order, required semantic roles, light/dark variants, contrast support, future accent axes, and alias ownership.

## Reusable Component Surface

Reusable components are documented in `docs/COMPONENTS.md` and exported through `src/components/index.js`.

Current public surfaces:

- `src/components/virtual-table/`: mounted DOM virtual-table component with packaged scrollbar, headless virtual-table projection, bounded render-window planning, split-column transforms, duplicate-row collapse, table sorting, scrollbar controller, and column-layout helpers.
- `src/components/drag-drop/`: headless column drag/drop controller plus reusable drop-anchor, auto-scroll, viewport, and resize-target helpers.
- `src/components/workbook-export/`: custom XLSX Blob/download generation, grouping helpers, workbook details, and overview helpers.
- `src/components/date-picker/`: DOM-bound date input enhancement plus shared date parsing/normalization helpers.
- `src/components/tooltips/`: browser-safe tooltip behavior plus field/filter tooltip HTML formatters.

Rules for this surface:

- Outside sites should import from `src/components/`, not from `src/features/`.
- Component entrypoints may wrap `src/lib/` internals, but they should not depend on query-state stores, app bootstrap, app shell rendering, feature coordinators, or overlay coordinators.
- Public component behavior should have focused coverage in `tests/unit/components/`.
- If a component starts needing framework-specific mounting, add that as an adapter around the public entrypoint instead of mixing it into the feature internals.

## Public Runtime Surface

The project no longer exposes application APIs through `window.*`. Startup readiness is represented by the `data-query-app-modules-ready` attribute on the document root and the `query-app:modules-ready` DOM event from `src/appModules.js`.

Rules now enforced:

- New `window.foo = ...` exports fail lint and architecture checks.
- New `Object.defineProperty(window, 'foo', ...)` exports fail lint and architecture checks.
- Reads from former app-level `window.*` bridge names fail architecture checks.
- Query lifecycle state must be read through `QueryStateReaders`, not through loose globals.
- App modules cannot use CommonJS.
- Module imports cannot include cache-busting query strings.

This removes the public browser-global API surface and keeps cross-feature coordination explicit.

## Cache Busting Contract

The checked-in `cache-bust.json` manifest is generated by `npm run cache:bust` from the source HTML, JavaScript, and CSS assets that the static app serves. `npm test` runs `npm run cache:bust:check`, so CI fails when app assets change without an updated manifest.

Source modules still use clean ES import specifiers. Cache keys are applied at the runtime loader boundary and by the root service worker, which fetches same-origin app assets with `cache: reload`. This avoids scattering query strings through the module graph while still preventing stale deployed modules after a push.

## Module Graph Contract

`tests/architecture/architectureFitness.mjs` builds a static graph from ES imports and enforces these constraints:

- Every application module must be reachable from `src/appModules.js`, a configured public component entrypoint, or a worker entrypoint.
- Local imports must resolve to explicit `.js` modules inside the application source set.
- Production package dependencies must be imported by application modules; unused runtime packages fail the gate.
- Imports must follow the layer rules in `config/architectureRules.cjs`.
- Circular imports fail the architecture gate.
- Legacy large modules cannot grow beyond their current budget.

The architecture rules are executable, versioned, and run in CI.

`tests/architecture/couplingModularityFitness.mjs` adds a metrics-oriented gate over the same source graph. It tracks average fan-out, maximum non-entrypoint fan-out, entrypoint fan-out, maximum fan-in, large-coordinator count, large high-fan-out coordinator count, and worker-inclusive import cycles. The budgets live in `config/architectureRules.cjs`; if a future change makes a coordinator too broad or turns a shared module into a hub, CI fails with the exact module names.

`tests/architecture/maintainabilityFitness.mjs` adds layer-aware maintainability budgets using standard ESLint rule semantics for maximum module lines, function length, cyclomatic complexity, nesting depth, and parameter count. It also runs a local cognitive-complexity approximation over parsed JavaScript functions so deeply nested or hard-to-follow control flow is visible even when basic cyclomatic complexity still passes. These are intentionally measured by layer because a public component wrapper, a stateful feature coordinator, and a low-level library module do not carry the same risk profile.

`tests/architecture/cohesionFitness.mjs` checks folder-level separation of concerns. It measures external imports per module, incoming external imports per module, and internal import ratio for architectural folders such as `src/features/table/virtual-table`, `src/ui/field-picker`, and `src/lib/workbook-export`.

The same cohesion test also runs a Git-history change-coupling analysis. Bulk refactor commits are skipped, and high-confidence cross-folder file pairs are budgeted so files that repeatedly change together are surfaced as candidates for a clearer boundary. GitHub Actions fetches full history for the normal test workflow so this check has enough data in CI.

For a human-readable scorecard, run:

```bash
npm run architecture:metrics
```

## Fitness Checks

Run the full quality gate:

```bash
npm test
```

That runs:

- `npm run lint`: syntax, globals, module rules, query-state boundaries.
- `npm run test:architecture`: architecture fitness checks, coupling/modularity budgets, folder cohesion budgets, Git-history change-coupling budgets, maintainability and cognitive-complexity budgets, legacy module budgets, forbidden browser globals, import graph reachability, import cycles, layer boundaries, canonical ES module specifiers, cache-stable import paths, and the hardcoded-field integration guard.
- `npm run test:unit`: focused pure-logic tests for query-history status, request mapping, row output, backend payload contracts, and table transforms.
- `npm run test:browser`: Playwright smoke test for runtime behavior and key UI styling.

All `.mjs` tests run through Node's built-in test runner with explicit test names. See `tests/README.md` for the test-layer standards and redundancy rules.

## Legacy Budgets

No application module currently uses a legacy large-module budget. The architecture fitness test enforces the normal module size limit across the app, so new large modules should be split instead of added to an exception list.

## Current Review Focus

Future structure work should be cohesion-driven, not size-driven. Large feature shells can stay intact when they own a single workflow and delegate testable logic to focused modules. Small modules should only remain split when they isolate a stable contract, pure logic, worker entrypoint, or feature boundary.

1. Audit the remaining large shells for mixed responsibilities before extracting anything else.
2. Consolidate tiny single-use helpers when their boundary does not improve testing, ownership, or reuse.
3. Keep runtime dependencies minimal; add production packages only when app modules import them directly and the dependency earns its weight.
4. Continue expanding interaction tests around real workflows rather than adding thin tests around implementation details.
