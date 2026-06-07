# Project Roadmap

This roadmap tracks the current product and architecture state. It is meant to explain what is done, what is intentionally still open, and what should guide future work.

## Current Stage

**Stage 4: Integration readiness and public deployment hardening**

The frontend architecture and core product workflows are in stable shape. The project is now focused on making the app easier for someone else to connect to their own backend, deploy safely, and understand from the repository without needing project-specific context.

Current stage goals:

- Make backend setup obvious from the README and integration docs.
- Remove reliance on the project-owned example API for the public live default.
- Keep the browser app buildless and static while making API configuration first-class.
- Keep every new workflow covered by focused unit tests or realistic browser smoke tests.
- Continue small cohesion reviews, but only split modules where there is a real ownership boundary.

## Current Product State

The project is in a stable, production-oriented frontend shape for a static browser app:

- Browser source is organized under `src/` with clear `core`, `features`, `ui`, and `styles` ownership.
- The app uses native ES modules, deterministic startup through `src/appModules.js`, and executable architecture rules.
- The former public `window.*` application bridge has been removed; app coordination now goes through ES imports and explicit service/action registration.
- Field metadata is backend-driven. The frontend does not ship a built-in field catalog, and architecture tests guard against adding one.
- Query execution supports backend-driven dynamic/buildable fields, date `Never` handling, and streaming JSONL result events.
- Results support virtualized rendering, sorting, resizing, split multi-value columns, post filters, and worker-backed large Excel export.
- Mobile and tablet workflows are covered by browser smoke tests for overlays, menus, virtual table behavior, mobile dialogs, and responsive resizing.
- `npm test` is the full quality gate and runs cache-bust validation, lint, architecture checks, unit tests, and browser smoke tests.

## Stage Summary

| Stage | Status | Notes |
| --- | --- | --- |
| Stage 1: Core query builder | Complete | Query building, field search, filters, result rendering, and query JSON are implemented. |
| Stage 2: Frontend architecture modernization | Complete | Source lives under `src/`, ES modules are canonical, public `window.*` app coordination is removed, and architecture tests enforce boundaries. |
| Stage 3: Results, export, and responsive workflow baseline | Complete | Virtual table behavior, post filters, split multi-value columns, large Excel export, mobile overlays, and responsive resizing are covered by the current test gate. This does not claim a completed accessibility or exhaustive device audit. |
| Stage 4: Integration readiness and public deployment hardening | In progress | Backend integration is documented and swappable, but API settings and live-site default behavior still need final product polish. |
| Stage 5: Public release polish | Not started | Dedicated accessibility audit, expanded production deployment recipes, and optional user-facing setup polish belong here after Stage 4 is done. |

## Stage Audit Notes

The completed stages above are limited to work that is actually implemented or guarded by the repository:

- Stage 1 is complete because the app has the core query builder, field picker/search, display fields, filter conditions, query JSON inspection, query execution, and result rendering in place.
- Stage 2 is complete because source modules live under `src/`, native ES modules are canonical, app-level `window.*` bridge exports are forbidden by architecture checks, and module boundaries are tested.
- Stage 3 is complete as a functional results/export/responsive baseline because virtual-table scrolling, resizing, sorting, split multi-value columns, post filters, large workbook export, mobile overlays, and live responsive resizing are covered by the test gate.
- Stage 3 does not include a full accessibility audit, exhaustive device matrix, or production API setup. Those are intentionally Stage 4 or Stage 5 items.
- Stage 4 is the current stage because the backend is already swappable through documented contracts and API URL overrides, but the app still needs a first-class API settings screen and a live default that no longer relies on the project-owned example endpoint.

## Completed Milestones

| Area | Status |
| --- | --- |
| ES module migration | Complete |
| Public `window.*` bridge removal | Complete |
| Source tree cleanup | Complete: app source lives under `src/` |
| Folder ownership | Complete: product workflows live under `src/features/` |
| Backend-driven fields | Complete, with hardcoded-field guardrails |
| Streaming JSONL result support | Complete |
| Dynamic/buildable fields | Complete from the frontend contract side |
| Public note and MARC-style multi-value handling | Complete from the frontend contract side |
| Post filters | Complete for result-only filtering, including empty/non-empty and multi-value operators |
| Large Excel export | Complete with worker-backed generation, progress, and notification hooks |
| Responsive/mobile workflow baseline | Complete for current workflows covered by smoke tests |
| Cache-busting enforcement | Complete through `cache-bust.json` and CI |
| Test suite modernization | Complete: unified on Node's built-in test runner plus Playwright smoke coverage |

## Remaining Work

| Stage | Priority | Work | Why it matters |
| --- | --- | --- | --- |
| Stage 4 | High | Add a first-class API settings screen | The app already supports `?api_url=` and local storage, but non-technical users should be able to connect their own API from the UI without editing source or URL parameters. |
| Stage 4 | High | Remove project-owned API usage from the public live default | The checked-in endpoint is useful as an example/testing integration, but the live deployment should default to a bring-your-own-API setup. |
| Stage 4 | Medium | Add minimal compatible API implementation examples | Small examples for CORS/auth, field metadata, result JSON, history, cancel, and template persistence would make third-party integration easier. |
| Stage 4 | Medium | Keep expanding browser smoke coverage around new workflows | The current suite covers the main desktop/mobile flows. New workflow bugs should usually add one realistic browser interaction test plus focused unit coverage for reusable logic. |
| Stage 4 | Medium | Continue cohesion reviews as features change | There are no current large-module exceptions, but some coordinator modules are intentionally still large. Split them only when a stable responsibility boundary appears. |
| Stage 5 | Low | Optional accessibility audit | The app has keyboard-friendly controls in many areas, but a dedicated audit for focus order, screen reader labels, and reduced-motion behavior would be useful before broader public use. |

## Stage 4 Exit Criteria

Stage 4 is done when:

- A user can configure a compatible backend from the app UI.
- The public live deployment no longer defaults to the project-owned example API.
- The README clearly routes new users through local setup, API setup, and deployment choices.
- `docs/INTEGRATION.md` includes enough contract detail and minimal examples for a developer to implement the compatible backend without reading app internals.
- The test gate still passes with cache-busting enforcement, architecture rules, unit tests, and browser smoke coverage.

## Not Currently Planned

- A frontend build step. The buildless static deployment is intentional unless a future requirement clearly earns the added complexity.
- A local hardcoded field catalog. Field definitions should continue to come from the backend.
- Reintroducing a public browser-global application API. Tests should keep enforcing ES imports and explicit registration boundaries.
- Splitting coordinator modules only because they are long. Cohesion, testing value, and ownership boundaries should drive future extraction.

## How To Decide The Next Item

Use this order unless a production bug changes priorities:

1. Fix user-visible correctness bugs first.
2. Improve integration friction next, especially API configuration and deployment docs.
3. Add tests with each bug fix or new workflow.
4. Refactor only when it reduces coupling, clarifies ownership, or protects a workflow that already exists.
