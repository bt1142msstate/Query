const DEFAULT_ITEM_UNIVERSE = 3_500_000;

function finitePositive(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function filterValues(filter = {}) {
  const raw = filter.value ?? filter.values ?? '';
  return (Array.isArray(raw) ? raw : [raw]).map(value => String(value ?? '').trim()).filter(Boolean);
}

function exactValues(filter = {}) {
  return filterValues(filter).filter(value => !/[*?]/u.test(value));
}

function sumBreakdown(rows, values) {
  const wanted = new Set(values.map(value => value.toUpperCase()));
  let matched = 0;
  let count = 0;
  (Array.isArray(rows) ? rows : []).forEach(row => {
    if (!wanted.has(String(row?.label || row?.code || '').toUpperCase())) return;
    matched += 1;
    count += finitePositive(row?.items);
  });
  return matched > 0 ? count : null;
}

function exactAggregateCount(filter, aggregate) {
  const field = String(filter?.field || '').trim().toLowerCase();
  const values = exactValues(filter);
  if (!values.length || String(filter?.operator || '=') !== '=') return null;
  if (/^(?:item id|item key|catalog key|call number key|barcode)$/u.test(field)) return values.length;
  if (field === 'item library' || field === 'call number library') return sumBreakdown(aggregate?.library_breakdown, values);
  if (field === 'item type') return sumBreakdown(aggregate?.item_type_breakdown, values);
  if (field === 'home location') return sumBreakdown(aggregate?.home_location_breakdown, values);
  if (field === 'current location') return sumBreakdown(aggregate?.current_location_breakdown, values);
  return null;
}

function structuralRatio(filter = {}) {
  const field = String(filter.field || '').toLowerCase();
  const operator = String(filter.operator || '=');
  const values = filterValues(filter);
  if (/^(?:item id|item key|catalog key|call number key|barcode)$/u.test(field) && operator === '=') return 0.000001;
  if (/library|location|item type/u.test(field) && operator === '=') return Math.min(0.65, Math.max(0.04, values.length * 0.08));
  if (/shadowed|status|available/u.test(field) && operator === '=') return 0.7;
  if (operator === '=' && values.some(value => /[*?]/u.test(value))) return 0.42;
  if (operator === '=') return 0.18;
  if (/^(?:<|<=|>|>=)$/u.test(operator)) return 0.35;
  return 0.55;
}

function expensiveFieldScore(displayFields = []) {
  return (Array.isArray(displayFields) ? displayFields : []).reduce((score, field) => {
    const name = String(field || '');
    if (/MARC|Note|Subject|Holdings|Description/iu.test(name)) return score + 2;
    if (/Title|Author|Call Number/iu.test(name)) return score + 1;
    return score;
  }, 0);
}

function secondsBand(candidateCount, displayFields, filterCount) {
  const count = finitePositive(candidateCount, DEFAULT_ITEM_UNIVERSE);
  let band = count <= 10 ? 0 : count <= 100 ? 1 : count <= 1_000 ? 2 : count <= 10_000 ? 3
    : count <= 100_000 ? 4 : count <= 500_000 ? 5 : 6;
  const outputPenalty = Math.floor(expensiveFieldScore(displayFields) / 5);
  const filterPenalty = filterCount >= 7 ? 1 : 0;
  band = Math.min(6, band + outputPenalty + filterPenalty);
  return [
    [1, 5], [2, 8], [3, 15], [5, 30], [10, 90], [45, 300], [180, 900]
  ][band];
}

function durationLabel([minimum, maximum]) {
  if (maximum <= 60) return `Likely ${minimum}\u2013${maximum} sec`;
  const minMinutes = Math.max(1, Math.round(minimum / 60));
  const maxMinutes = Math.max(minMinutes + 1, Math.round(maximum / 60));
  return `Likely ${minMinutes}\u2013${maxMinutes}${maximum >= 1800 ? '+' : ''} min`;
}

function estimateColdStartQueryPlan(payload = {}, aggregate = null) {
  const filters = Array.isArray(payload.filters) ? payload.filters : [];
  const displayFields = Array.isArray(payload.display_fields) ? payload.display_fields : [];
  const liveUniverse = finitePositive(aggregate?.collection?.items);
  const universe = liveUniverse || DEFAULT_ITEM_UNIVERSE;
  const aggregateCounts = filters.map(filter => exactAggregateCount(filter, aggregate)).filter(value => Number.isFinite(value));
  const structuralCounts = filters.map(filter => Math.max(1, Math.round(universe * structuralRatio(filter))));
  const itemLibraryFilter = filters.find(filter => /^(?:item library|call number library)$/iu.test(String(filter?.field || '')));
  const itemTypeFilter = filters.find(filter => /^item type$/iu.test(String(filter?.field || '')));
  const libraryCount = exactAggregateCount(itemLibraryFilter, aggregate);
  const itemTypeCount = exactAggregateCount(itemTypeFilter, aggregate);
  const combinedAggregateCount = Number.isFinite(libraryCount) && Number.isFinite(itemTypeCount)
    ? Math.max(1, Math.round((libraryCount * itemTypeCount) / universe))
    : aggregateCounts.length ? Math.min(...aggregateCounts) : null;
  const candidateCount = Math.min(
    universe,
    ...(Number.isFinite(combinedAggregateCount)
      ? [combinedAggregateCount]
      : structuralCounts.length ? structuralCounts : [universe])
  );
  const rangeSeconds = secondsBand(candidateCount, displayFields, filters.length);
  const exactAggregate = aggregateCounts.length > 0;
  const basis = liveUniverse
    ? exactAggregate ? 'current collection aggregate and exact policy totals' : 'current collection aggregate and field-cost model'
    : 'cold-start system-size and field-cost model';
  const [p50Seconds, p80Seconds] = rangeSeconds;
  return {
    schema_version: 2,
    strategy: 'client_stage_prior_v2',
    eta: {
      available: true,
      method: 'client_stage_prior_v2',
      confidence: exactAggregate ? 'medium' : 'low',
      sample_size: 0,
      requires_comparable_history: false,
      p50_seconds: p50Seconds,
      p80_seconds: p80Seconds,
      p90_seconds: Math.ceil(p80Seconds * (exactAggregate ? 1.4 : 1.8)),
      expected_candidates: candidateCount,
      estimated_candidates: candidateCount,
      range_seconds: rangeSeconds,
      label: `${durationLabel(rangeSeconds)} · ${basis}`,
      basis
    },
    aggregate_basis: {
      available: Boolean(liveUniverse),
      item_universe: universe,
      exact_filter_match: exactAggregate,
      label: basis
    }
  };
}

function normalizedBackendEta(eta = {}) {
  if (!eta?.available) return null;
  const minimum = finitePositive(eta.p50_seconds ?? eta.lower_seconds ?? eta.minimum_seconds);
  const maximum = finitePositive(eta.p80_seconds ?? eta.upper_seconds ?? eta.maximum_seconds);
  if (!minimum || !maximum) return null;
  const rangeSeconds = [Math.max(1, Math.floor(minimum)), Math.max(Math.ceil(maximum), Math.floor(minimum) + 1)];
  return {
    ...eta,
    method: eta.method || 'backend_calibrated_model',
    requires_comparable_history: false,
    range_seconds: rangeSeconds,
    label: eta.label || `${durationLabel(rangeSeconds)} · ${eta.basis || 'backend stage-cost model'}`
  };
}

function mergeQueryPlanEstimate(payload, backendPlan = null, aggregate = null) {
  const coldStart = estimateColdStartQueryPlan(payload, aggregate);
  const source = backendPlan && typeof backendPlan === 'object' ? backendPlan : {};
  const backendEta = normalizedBackendEta(source.eta);
  return {
    ...source,
    eta: backendEta || coldStart.eta,
    aggregate_basis: source.aggregate_basis?.available ? source.aggregate_basis : coldStart.aggregate_basis,
    order: Array.isArray(source.order) ? source.order : [],
    changed: Boolean(source.changed),
    explanation: source.explanation || 'This immediate estimate uses current collection aggregates while the backend compares complete Sirsi route costs.',
    ...(source.eta?.available ? { history_calibration: source.eta } : {})
  };
}

function queryPlanSignature(payload = {}) {
  return JSON.stringify({
    display_fields: payload.display_fields || [],
    filters: payload.filters || [],
    filter_group_logic: payload.filter_group_logic || {},
    smart_query_enabled: payload.smart_query_enabled !== false
  });
}

export { estimateColdStartQueryPlan, mergeQueryPlanEstimate, queryPlanSignature };
