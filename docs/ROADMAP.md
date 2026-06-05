# Project Roadmap

This roadmap tracks the current product and architecture state. It is meant to explain what is done, what is intentionally still open, and what should guide future work.

## Current Status

The project is in a stable, production-oriented frontend shape for a static browser app:

- Browser source is organized under `src/` with clear `core`, `features`, `ui`, and `styles` ownership.
- The app uses native ES modules, deterministic startup through `src/appModules.js`, and executable architecture rules.
- The former public `window.*` application bridge has been removed; app coordination now goes through ES imports and explicit service/action registration.
- Field metadata is backend-driven. The frontend does not ship a built-in field catalog, and architecture tests guard against adding one.
- Query execution supports backend-driven dynamic/buildable fields, date `Never` handling, legacy text result streams, and standard JSON result payloads.
- Results support virtualized rendering, sorting, resizing, split multi-value columns, post filters, and worker-backed large Excel export.
- Mobile and tablet workflows are covered by browser smoke tests for overlays, menus, virtual table behavior, mobile dialogs, and responsive resizing.
- `npm test` is the full quality gate and runs cache-bust validation, lint, architecture checks, unit tests, and browser smoke tests.

## Completed Milestones

| Area | Status |
| --- | --- |
| ES module migration | Complete |
| Public `window.*` bridge removal | Complete |
| Source tree cleanup | Complete: app source lives under `src/` |
| Folder ownership | Complete: product workflows live under `src/features/` |
| Backend-driven fields | Complete, with hardcoded-field guardrails |
| Standard JSON result support | Complete, alongside legacy text stream compatibility |
| Dynamic/buildable fields | Complete from the frontend contract side |
| Public note and MARC-style multi-value handling | Complete from the frontend contract side |
| Post filters | Complete for result-only filtering, including empty/non-empty and multi-value operators |
| Large Excel export | Complete with worker-backed generation, progress, and notification hooks |
| Mobile/tablet usability pass | Complete for current workflows covered by smoke tests |
| Cache-busting enforcement | Complete through `cache-bust.json` and CI |
| Test suite modernization | Complete: unified on Node's built-in test runner plus Playwright smoke coverage |

## Open Roadmap

| Priority | Work | Why it matters |
| --- | --- | --- |
| High | Add a first-class API settings screen | The app already supports `?api_url=` and local storage, but non-technical users should be able to connect their own API from the UI without editing source or URL parameters. |
| High | Remove project-owned API usage from the public live default | The checked-in endpoint is useful as an example/testing integration, but the live deployment should default to a bring-your-own-API setup. |
| Medium | Add deployment examples for compatible APIs | A small set of examples for CORS, auth, field metadata, result JSON, history, cancel, and template persistence would make third-party integration easier. |
| Medium | Keep expanding browser smoke coverage around new workflows | The current suite covers the main desktop/mobile flows. New workflow bugs should usually add one realistic browser interaction test plus focused unit coverage for reusable logic. |
| Medium | Continue cohesion reviews as features change | There are no current large-module exceptions, but some coordinator modules are intentionally still large. Split them only when a stable responsibility boundary appears. |
| Low | Optional accessibility audit | The app has keyboard-friendly controls in many areas, but a dedicated audit for focus order, screen reader labels, and reduced-motion behavior would be useful before broader public use. |

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
