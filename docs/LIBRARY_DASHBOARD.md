# Library Intelligence Dashboard

The Query dashboard is an open-source presentation and analysis layer for privacy-safe library aggregates. It is designed to go beyond a conventional circulation KPI page by combining four different questions:

1. What circulated during a reporting period?
2. What does the current collection contain and how has it been used?
3. Who does the library serve and how recently have patrons engaged?
4. Which underlying records should staff review next?

The browser never receives raw patron records, credentials, server paths, Sirsi commands, or record-level backend extracts.

## Public and private boundary

The public repository contains:

- dashboard UI and responsive styles;
- accessible chart and table rendering;
- KPI names and plain-language definitions;
- the versioned aggregate response contract;
- source-adapter interfaces;
- sample data and automated tests;
- drill-down query contracts that use backend-provided field metadata.

The private MLP environment owns:

- Sirsi and BLUEcloud credentials and sessions;
- Symphony command execution and paths;
- raw item, transaction, and patron records;
- aggregation and cache jobs;
- privacy suppression and authorization enforcement;
- production refresh schedules and operational logs.

## Metric contract

`library_dashboard` returns a JSON object with `schema_version: 1`. Its principal groups are:

- `circulation`: period checkouts, renewals, in-house use, holds, and demand ratios;
- `collection`: current items and titles, lifetime checkout and renewal counters, recent-use rate, never-used items, item age, and price coverage;
- `patrons`: current, active, newly registered, currently borrowing, currently holding, and soon-expiring patron counts;
- `circulation_trend`: reporting-period transaction points;
- `library_breakdown` and `item_type_breakdown`: comparable scoped aggregates;
- `use_bands` and `age_bands`: current-collection distributions;
- `patron_*_breakdown`: privacy-suppressed home-library, profile, age-band, and geographic aggregates;
- `opportunities`: aggregate action groups with optional backend-generated Query configurations;
- `freshness`, `sources`, and `notes`: exact lineage, update times, and limitations.

The UI must treat absent groups as unavailable, not as zero. Every production response should describe the time basis of each source independently.

## Definitions

The circulation transaction baseline follows the established BLUEcloud contract:

- checkouts: `Charge Item Part B`;
- renewals: `Renew Item`;
- patron renewals (`Renew User Part B`) are excluded.

Current holdings come from current item records. Item creation transactions must not be labeled as holdings. Lifetime item checkout/renewal counters must not be plotted as historical monthly transactions.

An active patron is a current user whose last-activity date falls inside the selected activity window. The response must state the window. Age groups are derived only from usable birth dates, and unknown dates remain a visible category.

## Live-data behavior

The client automatically refreshes the aggregate response while the dashboard is open and displays the server-generated timestamp. Production adapters may refresh at different safe cadences:

- transaction aggregates after the source transaction feed updates;
- item snapshots on a bounded recurring schedule;
- patron aggregates on a bounded recurring schedule.

The production snapshot stores each item scope, patron scope, and ranking once. Requested dashboard views are materialized from those compact dimensions, so activity-window and cross-filter responses do not duplicate the same breakdowns thousands of times. The same current library and item-type counts inform the Query smart planner: exact policy filters with smaller estimated candidate sets are safely evaluated first, while query meaning remains unchanged.

Short server-side caching is intentional. It prevents multiple open browser tabs from launching duplicate full-catalog or full-patron scans while keeping the displayed data current. A response is stale when its source-specific age exceeds the backend policy; the server should return the last verified snapshot with an explicit stale warning rather than silently presenting it as current.

## Privacy

Patron measures are aggregate-only. Production must:

- suppress groups below the configured threshold;
- roll suppressed values into an `Other / suppressed` group when doing so does not reveal them;
- avoid names, IDs, exact addresses, emails, phone numbers, and record-level drill-downs;
- restrict dashboard access to authenticated staff;
- retain only private operational logs needed to validate refresh jobs.

The sample dashboard uses illustrative values and labels itself `Sample data`.
