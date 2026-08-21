function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function normalizeMetricGroup(group = {}) {
  return Object.fromEntries(Object.entries(group || {}).map(([key, value]) => {
    if (typeof value === 'boolean') return [key, value];
    if (typeof value === 'string' && value.trim() && !Number.isFinite(Number(value))) return [key, value];
    return [key, finiteNumber(value)];
  }));
}

function normalizeSeries(series = []) {
  return (Array.isArray(series) ? series : []).map(entry => ({
    ...entry,
    value: finiteNumber(entry?.value),
    checkouts: finiteNumber(entry?.checkouts),
    renewals: finiteNumber(entry?.renewals),
    items: finiteNumber(entry?.items),
    patrons: finiteNumber(entry?.patrons)
  }));
}

function normalizeLibraryDashboard(payload = {}) {
  const data = payload && typeof payload === 'object' ? payload : {};
  const hasMetric = (group, key) => Boolean(group && Object.prototype.hasOwnProperty.call(group, key));
  return {
    schemaVersion: finiteNumber(data.schema_version || 1),
    generatedAt: data.generated_at || null,
    isSampleData: Boolean(data.sample_data),
    scope: data.scope || { library: 'all', item_type: 'all', active_window_days: 365 },
    freshness: data.freshness || {},
    coverage: data.coverage || {},
    circulation: normalizeMetricGroup(data.circulation),
    collection: normalizeMetricGroup(data.collection),
    patrons: normalizeMetricGroup(data.patrons),
    circulationTrend: normalizeSeries(data.circulation_trend),
    libraryBreakdown: normalizeSeries(data.library_breakdown),
    itemTypeBreakdown: normalizeSeries(data.item_type_breakdown),
    useBands: normalizeSeries(data.use_bands),
    ageBands: normalizeSeries(data.age_bands),
    patronLibraryBreakdown: normalizeSeries(data.patron_library_breakdown),
    patronProfileBreakdown: normalizeSeries(data.patron_profile_breakdown),
    patronAgeBands: normalizeSeries(data.patron_age_bands),
    patronGeoBreakdown: normalizeSeries(data.patron_geo_breakdown),
    opportunities: Array.isArray(data.opportunities) ? data.opportunities : [],
    filters: {
      libraries: Array.isArray(data.filters?.libraries) ? data.filters.libraries : [],
      itemTypes: Array.isArray(data.filters?.item_types) ? data.filters.item_types : []
    },
    sources: Array.isArray(data.sources) ? data.sources : [],
    notes: Array.isArray(data.notes) ? data.notes : [],
    privacy: data.privacy || {},
    availability: {
      circulation: hasMetric(data.circulation, 'checkouts'),
      collection: hasMetric(data.collection, 'items'),
      patrons: hasMetric(data.patrons, 'total')
    }
  };
}

function libraryDashboardHasData(data) {
  return finiteNumber(data?.collection?.items) > 0
    || finiteNumber(data?.circulation?.checkouts) > 0
    || finiteNumber(data?.patrons?.total) > 0;
}

export { finiteNumber, libraryDashboardHasData, normalizeLibraryDashboard };
