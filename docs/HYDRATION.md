# Hydration Integration

Hydration is the Query project's open-source, read-only bibliographic matching and enrichment-review interface. It is designed so another library can adopt the public frontend while keeping its catalog credentials, provider integrations, authentication, and write procedures in its own backend.

## Public Frontend

The repository includes the reusable browser behavior for:

- local-record lookup by title, catalog key, item ID/barcode, or ISBN;
- pasted lists and text, CSV, TSV, and `.xlsx` workbook imports;
- worksheet and lookup-column selection performed locally in the browser;
- complete-query handoff when the backend identifies a suitable bibliographic key;
- cancelable, restartable bulk review in bounded request batches;
- candidate navigation, confidence evidence, field-level comparison, and review filtering;
- shared-run display when a compatible backend persists runs;
- Excel review export and read-only MARC/MARCXML downloads;
- selected-field hydration previews that preserve protected local/control fields.

The GitHub demonstration backend supplies safe sample records and a mock account so the workflow can be evaluated without access to Symphony, OCLC credentials, or production library data.

## Backend Boundary

A production adapter remains responsible for:

- authenticating and authorizing staff;
- querying the local ILS and returning bounded bibliographic records;
- storing OCLC or other provider credentials outside the browser and document root;
- calling provider APIs, handling provider limits, and validating responses;
- enforcing record-identity and manifestation checks independently of the UI;
- persisting, canceling, and reopening shared Hydration runs when that feature is enabled;
- redacting secrets and sensitive operational data from errors and telemetry;
- authorizing, backing up, executing, and verifying any catalog write as a separate workflow.

The public frontend never needs an OCLC key or secret. An institution can replace the backend implementation while preserving the documented JSON actions and response shapes used by `search_bibs`, `compare_oclc_bib`, and `resolve_oclc_bibs_bulk`.

## Provider Policy

The MLP production adapter uses OCLC WorldCat as its primary source and an exact-LCCN Library of Congress lookup as a fallback. That provider policy is not hardcoded into workbook parsing or general Query form controls. Other adapters may use different sources, but they should return source provenance and retain the identity-first rule: metadata richness or requested-field availability must never override evidence that a candidate is a different edition, format, language, or manifestation.

## Adoption Path

1. Deploy the static frontend or fork the public repository.
2. Start with the included demonstration backend and sample account.
3. Implement the Query API authentication and bibliographic actions against the local ILS.
4. Keep provider credentials and access tokens exclusively in the backend.
5. Run API compatibility, unit, browser, responsive, and security checks.
6. Enable only read-only comparison first. Add catalog-write tooling separately with explicit authorization, backups, field restrictions, and post-write verification.

See [INTEGRATION.md](INTEGRATION.md), [AUTH.md](AUTH.md), and [DEPLOYMENT.md](DEPLOYMENT.md) for the general Query API and hosting requirements.
