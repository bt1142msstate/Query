# Test Suite

The project uses Node's built-in test runner for static, unit, and browser smoke coverage. Keep new tests inside these layers so CI stays predictable and failures are named consistently.

## Commands

```bash
npm test
```

Runs the full gate:

- `npm run test:static`: cache-busting check, ESLint, and architecture tests.
- `npm run test:unit`: focused pure-logic and contract tests from `tests/unit/components/`, `tests/unit/core/`, `tests/unit/features/`, and `tests/unit/ui/`.
- `npm run test:browser`: Playwright smoke coverage for real desktop/mobile UI workflows.

Browser smoke coverage starts from `tests/browser/browserSmoke.mjs`; shared fixtures and assertions live in `tests/browser/support/`, and longer workflow scenarios live in `tests/browser/scenarios/`.

For manual browser QA against the public live backend, start the local live-backed server:

```bash
npm run serve:live
```

That server serves the static frontend locally and proxies API calls through `/live-query-api`, so manual testing uses the real backend without browser CORS differences or stale API URLs from `localStorage`.

Live integration coverage starts from `tests/browser/liveIntegration.mjs` and is intentionally separate from `npm test` because it hits the deployed site and a real API over the network. Run it when validating deployment/API behavior:

```bash
npm run test:live
LIVE_SITE_URL=https://bt1142msstate.github.io/Query/ LIVE_API_URL=https://mlp.sirsi.net/uhtbin/query_api.pl npm run test:live
```

The live test does not stub the backend. It opens the actual site, uses API Settings against the configured API URL, runs the compatibility report, fails on console warnings/errors, and only allows optional API actions to be reported as missing.
Treat a live-test failure as an integration finding. The default public API currently needs to return a compatibility sample with inspectable multi-value rows for the strict live gate to pass.

## Standards

- Use `node:test` with an explicit test name in every `.mjs` test file.
- Use `node:assert/strict` for assertions.
- Import application modules from the canonical `src/` tree. Tests should not introduce or document a parallel top-level app source layout.
- Reusable public component coverage belongs in `tests/unit/components/` and should import from `src/components/` entrypoints instead of feature internals.
- Do not add custom success logging; let the runner report pass/fail output.
- Prefer pure unit tests for parsing, mapping, validation, state transforms, payload contracts, and export formatting.
- Prefer browser smoke coverage for behavior that only fails through real DOM, touch, overlay, scrolling, export, or responsive interactions.
- Prefer live integration coverage when the risk depends on CORS, deployed assets, real API responses, or backend compatibility warnings that a stubbed smoke test cannot reveal.
- Avoid duplicate assertions that prove the same behavior through the same layer. If a browser test already proves the full workflow, add unit coverage only for the reusable logic behind it.
- Keep architecture tests focused on repo contracts that should fail before runtime: module graph rules, field metadata boundaries, layer-aware maintainability budgets, large-module budgets, and cache-stable imports.

## When Adding Tests

1. Reproduce the bug or contract in the narrowest useful layer.
2. Name the test after user-visible behavior or the public helper contract, not an implementation detail.
3. Add browser coverage only when the risk depends on actual UI integration.
4. Remove or update stale overlapping assertions when behavior moves to a clearer owner.
