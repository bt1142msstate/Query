# Architecture Cohesion Audit

This audit checks whether the frontend is split at useful ownership boundaries without creating avoidable one-off modules.

## Current Finding

The module graph is appropriately split for the current raw JavaScript architecture. The remaining large files are feature coordinators that delegate stable logic to focused modules. The small modules that remain have a clear purpose: shared pure helpers, worker boundaries, DOM adapters, service registration, or unit-tested behavior.

## Folder Organization Completed

- Moved browser application source under `src/`, keeping the repository root focused on `index.html`, deployment/runtime files, docs, tests, scripts, and config.
- Added `src/core/formatting/` for shared date, money, value, tooltip, cell-display, escaping, and data-formatting helpers.
- Kept `src/core/` for app-wide state, services, lifecycle, backend/query execution, browser primitives, and startup glue.
- Grouped product workflows under `src/features/`: filters, history, table, and templates.
- Added `src/features/filters/condition-editor/` for condition editor layout, input adapters, panel UI, and bubble-shaped field controls; the standalone bubble builder mode has been retired, so there is no top-level `bubbles/` feature folder.
- Kept `src/features/table/drag-drop/`, `src/features/table/export/`, `src/features/table/post-filters/`, `src/features/table/virtual-table/`, `src/ui/field-picker/`, and `src/ui/form-mode/` subfolders because those areas have enough internal workflow complexity to justify subfolders.

## Consolidation Completed

- Removed `src/core/dragUtils.js`; its single drag data-transfer helper was only used by the table drag/drop workflow, so it now lives with that workflow.
- Removed `src/features/table/drag-drop/dragDrop.js`; it was only a service-registration shim, so drag/drop service registration now happens in `src/features/table/drag-drop/dragDropInteractions.js`.

## Modules That Should Stay Split

- `src/core/formatting/*`, `src/core/icons.js`, `src/core/domReady.js`, `src/core/toast.js`: small but shared cross-feature primitives.
- `src/core/textMeasurement.js`: focused shared measurement helper with concrete consumers.
- `src/features/table/virtual-table/tableBuilder.js`: virtual-table-owned DOM table element helper.
- `src/features/table/export/*`: export has separate workbook data shaping, progress/yielding, download, overview/details sheets, large workbook generation, and worker/zip boundaries.
- `src/features/table/virtual-table/*`: virtual scrolling, rows, column layout, width measurement, scrollbar behavior, sort, split-column transforms, and post-filter projection are distinct responsibilities.
- `src/ui/form-mode/*`, `src/ui/field-picker/*`, `src/features/templates/*`, `src/features/history/*`: larger user workflows are split into shell/coordinator modules plus pure logic, view helpers, payload mapping, and repository/integration adapters.

## Modules That Should Not Be Split Further Right Now

- `src/ui/form-mode/formMode.js`
- `src/features/filters/filterManager.js`
- `src/features/history/queryHistory.js`
- `src/features/table/drag-drop/dragDropInteractions.js`
- `src/features/table/contextMenu.js`
- `src/features/templates/queryTemplates.js`
- `src/ui/field-picker/fieldPicker.js`
- `src/ui/queryUI.js`

These files are still relatively large, but their current role is coordination: binding DOM events, services, state subscriptions, and already-extracted helper modules. Splitting them further without a new stable seam would mostly produce indirection.

## Guardrails

- `npm test` runs lint, Node test-runner architecture checks, unit tests, and browser smoke coverage. Module-specifier checks are part of the architecture suite.
- The architecture fitness test enforces reachability from `src/appModules.js`, explicit `.js` imports, no import cycles, layer boundaries, no app `window.*` bridge exports, no former bridge reads, and no unused production dependencies.
- `config/architectureRules.cjs` has no legacy large-module exceptions.
