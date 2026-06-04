# Architecture Cohesion Audit

This audit checks whether the frontend is split at useful ownership boundaries without creating avoidable one-off modules.

## Current Finding

The module graph is appropriately split for the current raw JavaScript architecture. The remaining large files are feature coordinators that delegate stable logic to focused modules. The small modules that remain have a clear purpose: shared pure helpers, worker boundaries, DOM adapters, service registration, or unit-tested behavior.

## Folder Organization Completed

- Added `core/formatting/` for shared date, money, value, tooltip, cell-display, escaping, and data-formatting helpers.
- Kept `core/` root for app-wide state, services, lifecycle, backend/query execution, browser primitives, and startup glue.
- Left `filters/`, `history/`, and `templates/` flat because each is already a feature folder with cohesive module names.
- Kept `bubbles/` flat as legacy filter-card presentation code only; the standalone bubble builder mode has been retired.
- Kept existing `table/drag-drop/`, `table/export/`, `table/post-filters/`, `table/virtual-table/`, `ui/field-picker/`, and `ui/form-mode/` subfolders because those areas have enough internal workflow complexity to justify subfolders.

## Consolidation Completed

- Removed `core/dragUtils.js`; its single drag data-transfer helper was only used by the table drag/drop workflow, so it now lives with that workflow.
- Removed `table/drag-drop/dragDrop.js`; it was only a service-registration shim, so drag/drop service registration now happens in `table/drag-drop/dragDropInteractions.js`.

## Modules That Should Stay Split

- `core/formatting/*`, `core/icons.js`, `core/domReady.js`, `core/toast.js`: small but shared cross-feature primitives.
- `core/textMeasurement.js`, `core/tableBuilder.js`: focused core helpers with concrete consumers.
- `table/export/*`: export has separate workbook data shaping, progress/yielding, download, overview/details sheets, large workbook generation, and worker/zip boundaries.
- `table/virtual-table/*`: virtual scrolling, rows, column layout, width measurement, scrollbar behavior, sort, split-column transforms, and post-filter projection are distinct responsibilities.
- `ui/form-mode/*`, `ui/field-picker/*`, `templates/*`, `history/*`: larger user workflows are split into shell/coordinator modules plus pure logic, view helpers, payload mapping, and repository/integration adapters.

## Modules That Should Not Be Split Further Right Now

- `ui/form-mode/formMode.js`
- `filters/filterManager.js`
- `history/queryHistory.js`
- `table/drag-drop/dragDropInteractions.js`
- `table/contextMenu.js`
- `templates/queryTemplates.js`
- `ui/field-picker/fieldPicker.js`
- `ui/queryUI.js`

These files are still relatively large, but their current role is coordination: binding DOM events, services, state subscriptions, and already-extracted helper modules. Splitting them further without a new stable seam would mostly produce indirection.

## Guardrails

- `npm test` runs lint, architecture fitness, module specifier checks, unit tests, and browser smoke coverage.
- The architecture fitness test enforces reachability from `appModules.js`, explicit `.js` imports, no import cycles, layer boundaries, no app `window.*` bridge exports, no former bridge reads, and no unused production dependencies.
- `config/architectureRules.cjs` has no legacy large-module exceptions.
