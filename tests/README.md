# Test Suite

The project uses Node's built-in test runner for static, unit, and browser smoke coverage. Keep new tests inside these layers so CI stays predictable and failures are named consistently.

## Commands

```bash
npm test
```

Runs the full gate:

- `npm run test:static`: cache-busting check, ESLint, and architecture tests.
- `npm run test:unit`: focused pure-logic and contract tests.
- `npm run test:browser`: Playwright smoke coverage for real desktop/mobile UI workflows.

## Standards

- Use `node:test` with an explicit test name in every `.mjs` test file.
- Use `node:assert/strict` for assertions.
- Import application modules from the canonical `src/` tree. Tests should not introduce or document a parallel top-level app source layout.
- Do not add custom success logging; let the runner report pass/fail output.
- Prefer pure unit tests for parsing, mapping, validation, state transforms, payload contracts, and export formatting.
- Prefer browser smoke coverage for behavior that only fails through real DOM, touch, overlay, scrolling, export, or responsive interactions.
- Avoid duplicate assertions that prove the same behavior through the same layer. If a browser test already proves the full workflow, add unit coverage only for the reusable logic behind it.
- Keep architecture tests focused on repo contracts that should fail before runtime: module graph rules, field metadata boundaries, large-module budgets, and cache-stable imports.

## When Adding Tests

1. Reproduce the bug or contract in the narrowest useful layer.
2. Name the test after user-visible behavior or the public helper contract, not an implementation detail.
3. Add browser coverage only when the risk depends on actual UI integration.
4. Remove or update stale overlapping assertions when behavior moves to a clearer owner.
