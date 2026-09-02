import { buildDemoQueryPlan } from './mockQueryPlanning.js';

const DEMO_API_PATH = '/demo-api';
const DEMO_TOKEN = 'query-project-demo-session';
let dataPromise = null;
let bibDataPromise = null;
const demoHydrationRuns = new Map();

function buildDemoDashboardQueries(now = Date.now()) {
  const iso = (daysAgo, minuteOffset = 0) => new Date(now - (daysAgo * 86400000) - (minuteOffset * 60000)).toISOString();
  const completed = (id, name, createdBy, daysAgo, rows, durationMinutes, extra = {}) => [id, {
    name,
    created_by: createdBy,
    status: 'complete',
    start_time: iso(daysAgo, durationMinutes),
    end_time: iso(daysAgo),
    row_count: rows,
    ...extra
  }];
  return Object.fromEntries([
    completed('demo-dashboard-01', 'Items by Library', 'anita', 1, 18420, 4),
    completed('demo-dashboard-02', 'MSU Unshadowed Ebooks', 'anita', 2, 44796, 13),
    completed('demo-dashboard-03', 'Monthly Circulation Review', 'brandon', 3, 8210, 7),
    completed('demo-dashboard-04', 'Items by Library', 'juanitta', 4, 17982, 5),
    completed('demo-dashboard-05', 'Missing Item Inventory', 'brandon', 6, 1320, 3),
    completed('demo-dashboard-06', 'Items by Library', 'anita', 8, 18105, 4),
    completed('demo-dashboard-07', 'Collection Age Review', 'juanitta', 10, 6220, 9),
    completed('demo-dashboard-08', 'MSU Unshadowed Ebooks', 'anita', 12, 44831, 12),
    completed('demo-dashboard-09', 'Monthly Circulation Review', 'brandon', 15, 7960, 6),
    completed('demo-dashboard-10', 'Items by Library', 'juanitta', 18, 17604, 4),
    completed('demo-dashboard-11', 'Collection Age Review', 'anita', 21, 6044, 8),
    completed('demo-dashboard-12', 'Missing Item Inventory', 'brandon', 25, 1188, 3),
    completed('demo-dashboard-h1', 'Hydration: Juvenile Fiction', 'anita', 5, 42, 9, {
      kind: 'hydration',
      hydration_completed: 42,
      hydration_total: 45,
      hydration_counts: { resolved: 34, review: 5, not_found: 2, failed: 1 }
    }),
    completed('demo-dashboard-h2', 'Hydration: Ebook Cleanup', 'brandon', 14, 28, 6, {
      kind: 'hydration',
      hydration_completed: 28,
      hydration_total: 30,
      hydration_counts: { resolved: 23, review: 3, not_found: 2, failed: 0 }
    }),
    ['demo-dashboard-f1', { name: 'Large Shelf List', created_by: 'juanitta', status: 'failed', start_time: iso(7, 2), end_time: iso(7), row_count: 0 }],
    ['demo-dashboard-c1', { name: 'Items by Library', created_by: 'brandon', status: 'canceled', start_time: iso(17, 1), end_time: iso(17), row_count: 0 }],
    ['demo-dashboard-r1', { name: 'Active Holds Review', created_by: 'anita', status: 'running', start_time: iso(0, 2), row_count: 640 }]
  ]);
}

function demoFiscalPeriods(system, startMonth, source, now = new Date()) {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  const currentFiscalYear = month >= startMonth ? year + 1 : year;
  const compact = (dateYear, dateMonth, dateDay) => `${dateYear}${String(dateMonth).padStart(2, '0')}${String(dateDay).padStart(2, '0')}`;
  const shiftYear = value => {
    const shiftedYear = Number(value.slice(0, 4)) - 1;
    const shiftedMonth = Number(value.slice(4, 6));
    const shiftedDay = Math.min(Number(value.slice(6, 8)), new Date(Date.UTC(shiftedYear, shiftedMonth, 0)).getUTCDate());
    return compact(shiftedYear, shiftedMonth, shiftedDay);
  };
  const displayDate = value => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[Number(value.slice(4, 6)) - 1]} ${Number(value.slice(6, 8))}, ${value.slice(0, 4)}`;
  };
  return [0, 1, 2].map(offset => {
    const fiscalYear = currentFiscalYear - offset;
    const startYear = fiscalYear - 1;
    const endMonth = startMonth - 1;
    const endDay = new Date(Date.UTC(fiscalYear, endMonth, 0)).getUTCDate();
    const current = offset === 0;
    const start = compact(startYear, startMonth, 1);
    const end = current ? compact(year, month, now.getUTCDate()) : compact(fiscalYear, endMonth, endDay);
    const dateSpan = `${displayDate(start)}–${displayDate(end)}`;
    return {
      value: `fy:${system}:${fiscalYear}`,
      label: current ? `FY ${fiscalYear} to date (${dateSpan})` : `FY ${fiscalYear} (${dateSpan})`,
      system, fiscal_year: fiscalYear, start, end,
      previous_start: shiftYear(start), previous_end: shiftYear(end),
      current_to_date: current, start_month: startMonth,
      start_label: displayDate(start), end_label: displayDate(end), date_span: dateSpan, source
    };
  });
}

function demoCalendarPeriods(now = new Date()) {
  const currentYear = now.getUTCFullYear();
  const compact = (year, month, day) => `${year}${String(month).padStart(2, '0')}${String(day).padStart(2, '0')}`;
  return [0, 1, 2].map(offset => {
    const calendarYear = currentYear - offset;
    const current = offset === 0;
    return {
      value: `cy:${calendarYear}`,
      label: current ? `Calendar Year ${calendarYear} to date` : `Calendar Year ${calendarYear}`,
      calendar_year: calendarYear,
      start: compact(calendarYear, 1, 1),
      end: current ? compact(currentYear, now.getUTCMonth() + 1, now.getUTCDate()) : compact(calendarYear, 12, 31),
      previous_start: compact(calendarYear - 1, 1, 1),
      previous_end: current ? compact(calendarYear - 1, now.getUTCMonth() + 1, now.getUTCDate()) : compact(calendarYear - 1, 12, 31),
      current_to_date: current
    };
  });
}

function buildDemoLibraryDashboard(payload = {}, data = {}) {
  const library = payload.library || 'all';
  const selectedLibraries = Array.isArray(payload.libraries) ? payload.libraries : [];
  const itemType = payload.item_type || 'all';
  const scopeFactor = selectedLibraries.length
    ? Math.min(1, selectedLibraries.length * 0.08)
    : library === 'all' ? 1 : library.startsWith('system:') ? 0.25 : 0.08;
  const typeFactor = itemType === 'all' ? 1 : 0.22;
  const factor = scopeFactor * typeFactor;
  const reportingPeriod = String(payload.reporting_period || payload.active_window_days || 365);
  const scaled = value => Math.round(value * factor);
  const scaleRows = (rows, keys) => rows.map(row => ({
    ...row,
    ...Object.fromEntries(keys.map(key => [key, scaled(row[key])]))
  }));
  const circulationTrend = [
    ['Sep', 74210, 39142], ['Oct', 78144, 41820], ['Nov', 70110, 37796], ['Dec', 56201, 34211],
    ['Jan', 75390, 40318], ['Feb', 76831, 41005], ['Mar', 81105, 44192], ['Apr', 79220, 42773],
    ['May', 69224, 37430], ['Jun', 63880, 35188], ['Jul', 66892, 35911], ['Aug', 74822, 39844]
  ].map(([label, checkouts, renewals]) => ({ label, checkouts: scaled(checkouts), renewals: scaled(renewals) }));
  const libraryRows = [
    ['MMRLS', 208144, 128831, 602844], ['First Regional', 171220, 93204, 477880], ['Lee-Itawamba', 126410, 74408, 318600],
    ['Columbus-Lowndes', 106822, 55812, 283112], ['MSU', 30717, 12389, 248220], ['Jackson-Hinds', 94210, 50884, 291774]
  ].map(([label, checkouts, renewals, items]) => ({ label, checkouts, renewals, items }));
  const typeRows = [
    ['Books', 544810, 290442, 1864300], ['DVD / Blu-ray', 123440, 36110, 184220], ['Ebooks', 94220, 73310, 371800],
    ['Audiobooks', 72510, 48330, 168440], ['Juvenile kits', 28940, 10082, 69220], ['Other', 16420, 8331, 155462]
  ].map(([label, checkouts, renewals, items]) => ({ label, checkouts, renewals, items }));
  const fiscalPeriodsBySystem = {
    MSU: demoFiscalPeriods('MSU', 7, 'https://www.osp.msstate.edu/faq'),
    MMRLS: demoFiscalPeriods('MMRLS', 10, 'https://www.imls.gov/research-evaluation/surveys/public-libraries-survey-pls'),
    FRL: demoFiscalPeriods('FRL', 10, 'https://www.imls.gov/research-evaluation/surveys/public-libraries-survey-pls'),
    LILS: demoFiscalPeriods('LILS', 10, 'https://www.imls.gov/research-evaluation/surveys/public-libraries-survey-pls')
  };
  const calendarPeriods = demoCalendarPeriods();
  const fiscalPeriod = Object.values(fiscalPeriodsBySystem).flat().find(period => period.value === reportingPeriod);
  const calendarPeriod = calendarPeriods.find(period => period.value === reportingPeriod);
  const namedPeriod = fiscalPeriod || calendarPeriod;
  const currentCheckouts = scaled(880229);
  const currentRenewals = scaled(487605);
  const previousCheckouts = scaled(842110);
  const previousRenewals = scaled(469220);
  const filters = {
    systems: [
      { value: 'system:MSU', code: 'MSU', label: 'Mississippi State University' },
      { value: 'system:MMRLS', code: 'MMRLS', label: 'Mid-Mississippi Regional Library System' },
      { value: 'system:FRL', code: 'FRL', label: 'First Regional Library' },
      { value: 'system:LILS', code: 'LILS', label: 'Lee-Itawamba Library System' }
    ],
    libraries: [
      { value: 'MSU-MAIN', label: 'MSU Main Library' },
      { value: 'MSU-MERIDIAN', label: 'MSU Meridian Library' },
      { value: 'MMRLS-CARTHAGE', label: 'MMRLS Carthage' },
      { value: 'FRL-HERNANDO', label: 'First Regional Hernando' },
      { value: 'LILS-TUPELO', label: 'Lee-Itawamba Tupelo' }
    ],
    item_types: ['BOOK', 'EBOOK', 'DVD', 'AUDIOBOOK', 'KIT'],
    calendar_periods: calendarPeriods,
    fiscal_periods_by_system: fiscalPeriodsBySystem
  };
  return {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    sample_data: true,
    scope: {
      library,
      library_label: selectedLibraries.length
        ? `${selectedLibraries.length} selected libraries`
        : library === 'all' ? 'All MLP libraries' : ([...filters.systems, ...filters.libraries].find(entry => entry.value === library)?.label || library),
      item_type: itemType,
      item_type_label: itemType === 'all' ? 'All item types' : itemType,
      active_window_days: Number(payload.active_window_days || 365),
      reporting_period: reportingPeriod
    },
    circulation: {
      checkouts: currentCheckouts, renewals: currentRenewals, previous_checkouts: previousCheckouts, previous_renewals: previousRenewals,
      checkout_change: currentCheckouts - previousCheckouts, renewal_change: currentRenewals - previousRenewals,
      checkout_change_rate: previousCheckouts ? (currentCheckouts - previousCheckouts) / previousCheckouts : null,
      renewal_change_rate: previousRenewals ? (currentRenewals - previousRenewals) / previousRenewals : null,
      comparison_available: true, comparison_coverage_complete: true,
      comparison_period_label: fiscalPeriod ? 'Previous fiscal year equivalent' : calendarPeriod ? 'Previous calendar year equivalent' : 'Previous equivalent period',
      in_house_uses: scaled(61240), holds: scaled(121843), renewal_share: 0.356, holds_per_100_items: 4.3,
      period_label: namedPeriod?.label || 'Illustrative 12-month reporting period',
      period_type: fiscalPeriod ? 'fiscal' : calendarPeriod ? 'calendar' : 'rolling',
      calendar_year: calendarPeriod?.calendar_year,
      fiscal_year: fiscalPeriod?.fiscal_year, fiscal_system: fiscalPeriod?.system
    },
    collection: {
      items: scaled(2813442), titles: scaled(1601291), lifetime_checkouts: scaled(12844308), lifetime_renewals: scaled(5160244), in_house_uses: scaled(843108), used_recently: scaled(947835), recent_use_rate: 0.337, never_used: scaled(1023995),
      never_used_rate: 0.364, checkouts_per_item: 4.6, total_value: scaled(42850300), price_coverage: 0.71,
      inventoried: scaled(2194485), inventoried_last_365_days: scaled(416220), inventoried_last_730_days: scaled(782910),
      never_inventoried: scaled(618957), inventory_coverage: 0.78, unavailable_items: scaled(214640), unavailable_rate: 0.076,
      missing_lost_items: scaled(42870), in_transit_items: scaled(3810)
    },
    patrons: {
      total: scaled(618420), active: scaled(183804), active_rate: 0.297, new: scaled(42640), with_charges: scaled(74482), with_holds: scaled(18814),
      expiring_soon: scaled(29711), new_period_label: 'Registered in the last 12 months', records_total: scaled(704200), expired: scaled(74210), expiration_unknown: scaled(11570), never_expires: scaled(2840),
      expired_with_charges: scaled(1240), eligibility_rate: 0.878,
      eligibility_label: 'Expiration is today or later, or privileges never expire'
    },
    circulation_trend: circulationTrend,
    library_breakdown: scaleRows(libraryRows, ['checkouts', 'renewals', 'items']),
    item_type_breakdown: scaleRows(typeRows, ['checkouts', 'renewals', 'items']),
    use_bands: scaleRows([
      { label: 'Never used', items: 1023995 }, { label: '1–2 checkouts', items: 731400 }, { label: '3–9 checkouts', items: 688220 },
      { label: '10–24 checkouts', items: 269117 }, { label: '25+ checkouts', items: 100710 }
    ], ['items']),
    age_bands: scaleRows([
      { label: 'Under 1 year', items: 81340 }, { label: '1–4 years', items: 443210 }, { label: '5–9 years', items: 562870 },
      { label: '10–19 years', items: 911202 }, { label: '20+ years', items: 714820 }
    ], ['items']),
    home_location_breakdown: scaleRows([
      { label: 'STACKS', items: 1048220 }, { label: 'FICTION', items: 524810 }, { label: 'NONFICTION', items: 489130 }, { label: 'JUVENILE', items: 337420 },
      { label: 'EASY', items: 193862 }, { label: 'LARGEPRNT', items: 111000 }, { label: 'OTHER', items: 109000 }
    ], ['items']),
    current_location_breakdown: scaleRows([
      { label: 'STACKS', items: 901440 }, { label: 'CHECKEDOUT', items: 721330 }, { label: 'FICTION', items: 417220 }, { label: 'NONFICTION', items: 382810 },
      { label: 'JUVENILE', items: 331962 }, { label: 'MISSING / LOST', items: 42870 }, { label: 'INTRANSIT', items: 3810 }, { label: 'OTHER', items: 12000 }
    ], ['items']),
    patron_library_breakdown: scaleRows([
      { label: 'MMRLS', patrons: 146820 }, { label: 'First Regional', patrons: 112440 }, { label: 'Lee-Itawamba', patrons: 78310 },
      { label: 'Columbus-Lowndes', patrons: 72120 }, { label: 'Jackson-Hinds', patrons: 68670 }, { label: 'MSU', patrons: 31220 }
    ], ['patrons']),
    patron_profile_breakdown: scaleRows([
      { label: 'Adult', patrons: 359140 }, { label: 'Juvenile', patrons: 143880 }, { label: 'Student', patrons: 51110 },
      { label: 'Faculty / staff', patrons: 19340 }, { label: 'Other profiles', patrons: 44950 }
    ], ['patrons']),
    patron_age_bands: scaleRows([
      { label: 'Under 13', patrons: 48110 }, { label: '13–17', patrons: 54120 }, { label: '18–24', patrons: 62330 },
      { label: '25–44', patrons: 157880 }, { label: '45–64', patrons: 131440 }, { label: '65+', patrons: 72920 }, { label: 'Unknown', patrons: 91620 }
    ], ['patrons']),
    patron_geo_breakdown: scaleRows([
      { label: '388xx', patrons: 49220 }, { label: '386xx', patrons: 43880 }, { label: '390xx', patrons: 39210 },
      { label: '397xx', patrons: 34190 }, { label: '395xx', patrons: 31220 }, { label: 'Other / unknown', patrons: 420700 }
    ], ['patrons']),
    patron_city_breakdown: scaleRows([
      { label: 'Tupelo, MS', patrons: 42910 }, { label: 'Columbus, MS', patrons: 31180 }, { label: 'Starkville, MS', patrons: 29440 },
      { label: 'Southaven, MS', patrons: 26320 }, { label: 'Oxford, MS', patrons: 24210 }, { label: 'Other / unknown', patrons: 464360 }
    ], ['patrons']),
    patron_state_breakdown: scaleRows([
      { label: 'Mississippi', patrons: 564880 }, { label: 'Alabama', patrons: 17420 }, { label: 'Tennessee', patrons: 15110 },
      { label: 'Other / unknown', patrons: 21010 }
    ], ['patrons']),
    opportunities: (data.dashboardOpportunities || []).map(entry => ({ ...entry, count: scaled(entry.baseCount) })),
    filters,
    privacy: { suppression_threshold: 10 },
    sources: [
      { label: 'Circulation transactions', detail: 'Checkout and renewal counts follow the established BLUEcloud Analytics command definitions.' },
      { label: 'Current item snapshot', detail: 'Query item fields provide actual holdings, lifetime use, last use, item age, holds, and price.' },
      { label: 'Patron snapshot', detail: 'Sirsi user data is aggregated before display; no names, IDs, addresses, or individual records are returned.' },
      { label: 'Fiscal-year definitions', detail: 'Illustrative periods follow the same system-specific reporting calendars used by the production dashboard.' }
    ],
    notes: ['Sample values demonstrate the dashboard contract and are not production MLP totals. Lifetime item counters and reporting-period transaction counts are shown separately.']
  };
}

function loadDemoData() {
  if (!dataPromise) {
    const url = new URL('../../assets/demo/query-data.json', import.meta.url);
    dataPromise = globalThis.fetch(url).then(response => {
      if (!response.ok) throw new Error('The sample catalog could not be loaded.');
      return response.json();
    });
  }
  return dataPromise;
}

function loadDemoBibData() {
  if (!bibDataPromise) {
    const url = new URL('../../assets/demo/oclc-bib-data.json', import.meta.url);
    bibDataPromise = globalThis.fetch(url).then(response => {
      if (!response.ok) throw new Error('The sample bibliographic records could not be loaded.');
      return response.json();
    });
  }
  return bibDataPromise;
}

function isDemoApiUrl(url) {
  try {
    return new URL(String(url), globalThis.location?.href || 'https://example.invalid/').pathname.endsWith(DEMO_API_PATH);
  } catch (_) {
    return false;
  }
}

function json(payload, status = 200) {
  return Response.json(payload, { status, headers: { 'Cache-Control': 'no-store' } });
}

function isAuthenticated(options = {}) {
  const headers = new Headers(options.headers || {});
  return headers.get('X-Query-Session') === DEMO_TOKEN;
}

function wildcardMatch(actual, expected) {
  const escaped = String(expected).replace(/[|\\{}()[\]^$+?.]/gu, '\\$&').replaceAll('*', '.*');
  return new RegExp(`^${escaped}$`, 'iu').test(String(actual ?? ''));
}

function matchesFilter(row, filter = {}) {
  const values = Array.isArray(row[filter.field]) ? row[filter.field] : [row[filter.field]];
  const expected = filter.value ?? '';
  const operator = filter.operator || '=';
  const matches = values.some(value => wildcardMatch(value, expected));
  if (operator === '!=') return !matches;
  if (operator === '>') return values.some(value => String(value) > String(expected));
  if (operator === '>=') return values.some(value => String(value) >= String(expected));
  if (operator === '<') return values.some(value => String(value) < String(expected));
  if (operator === '<=') return values.some(value => String(value) <= String(expected));
  return matches;
}

function runQuery(payload, data) {
  const fields = data.fields || [];
  const rows = (data.rows || []).map(values => Object.fromEntries(fields.map((field, index) => [field.name, values[index]])));
  const columns = payload.display_fields?.length ? payload.display_fields : data.defaultColumns;
  const limit = Math.max(1, Math.min(Number(payload.limit || payload.max_rows || rows.length), rows.length));
  const resultRows = rows.filter(row => (payload.filters || []).every(filter => matchesFilter(row, filter))).slice(0, limit);
  const queryId = `demo-${Date.now()}`;
  const events = [
    {
      type: 'meta', version: 1, format: 'jsonl', query_id: queryId, columns,
      planning: {
        strategy: 'cost_based_routes_v2',
        eta: {
          available: true,
          method: 'stage_cost_model_v2',
          confidence: 'low',
          sample_size: 0, requires_comparable_history: false,
          estimated_candidates: resultRows.length,
          label: 'Likely 1–3 seconds from the current sample aggregate and field costs.'
        }
      }
    },
    ...resultRows.map(row => ({ type: 'row', values: columns.map(column => row[column] ?? '') })),
    { type: 'done', rows: resultRows.length }
  ];
  return new Response(`${events.map(event => JSON.stringify(event)).join('\n')}\n`, {
    status: 200,
    headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'X-Query-Id': queryId }
  });
}

function loadDemoRecordDetails(payload, data) {
  const fields = data.fields || [];
  const lookupDefinition = fields.find(field => field.recordLookupType === payload.lookup_type);
  if (!lookupDefinition) return null;
  const lookupIndex = fields.indexOf(lookupDefinition);
  if (lookupIndex < 0) return null;
  const row = (data.rows || []).find(values => String(values[lookupIndex] ?? '') === String(payload.lookup_value ?? ''));
  if (!row) return null;
  const kind = payload.lookup_type.startsWith('item_')
    ? { key: 'item', label: 'Item record' }
    : payload.lookup_type === 'call_number_key'
      ? { key: 'call_number', label: 'Call number record' }
      : { key: 'bibliographic', label: 'Bibliographic record' };
  return {
    kind,
    lookup: { type: payload.lookup_type, field: lookupDefinition.name, value: payload.lookup_value },
    fields: fields.map((field, index) => ({
      name: field.name,
      category: field.category || 'Other',
      description: field.desc || '',
      values: Array.isArray(row[index]) ? row[index] : [String(row[index] ?? '')]
    })),
    source_row_count: 1
  };
}

function searchDemoBibs(payload, data) {
  const query = String(payload.query || '').trim().toLocaleLowerCase();
  const lookupType = payload.lookup_type || 'title';
  const limit = Math.max(1, Math.min(Number(payload.limit || 20), 25));
  const records = (data.records || []).filter(record => {
    const summary = record.local?.summary || {};
    if (lookupType === 'catalog_key') return String(summary.catalog_key || '') === query;
    if (lookupType === 'item_id') {
      return (record.item_ids || []).some(itemId => String(itemId).toLocaleLowerCase() === query);
    }
    if (lookupType === 'isbn') {
      const normalized = query.replace(/[\s-]+/gu, '');
      return (summary.isbn || []).some(isbn => String(isbn).replace(/[\s-]+/gu, '') === normalized);
    }
    return [
      summary.title,
      summary.creator,
      summary.isbn?.join(' ')
    ].some(value => String(value || '').toLocaleLowerCase().includes(query));
  }).slice(0, limit);

  return {
    lookup: { type: lookupType, query: payload.query || '' },
    results: records.map(record => structuredClone(record.local.summary)),
    returned: records.length,
    truncated: 0
  };
}

function resolveDemoBibsBulk(payload, data) {
  const results = (payload.entries || []).map((entry, index) => {
    const search = searchDemoBibs({ ...entry, limit: 10 }, data);
    if (search.results.length !== 1) {
      return {
        index,
        input: entry.query,
        lookup_type: entry.lookup_type,
        status: search.results.length ? 'review' : 'not_found',
        local_candidates: search.results,
        reason: search.results.length
          ? 'More than one local record matched this input.'
          : 'No local bibliographic record matched this input.'
      };
    }
    const comparison = compareDemoBib({
      catalog_key: search.results[0].catalog_key,
      target_tags: payload.target_tags
    }, data);
    return {
      index,
      input: entry.query,
      lookup_type: entry.lookup_type,
      status: comparison?.needs_selection ? 'review' : 'resolved',
      local: structuredClone(comparison.local.summary),
      ...(comparison?.worldcat ? {
        worldcat: structuredClone(comparison.worldcat.summary),
        selection: structuredClone(comparison.selection),
        match: structuredClone(comparison.match),
        review: structuredClone(comparison.review || {}),
        comparison_counts: structuredClone(comparison.comparison.counts)
      } : {
        candidates: structuredClone(comparison?.candidates || []),
        reason: 'No single strong WorldCat match was found.'
      })
    };
  });
  const counts = results.reduce((summary, result) => {
    summary[result.status] = (summary[result.status] || 0) + 1;
    return summary;
  }, { resolved: 0, review: 0, not_found: 0, failed: 0 });
  return { results, counts, returned: results.length };
}

function resolveDemoSpreadsheetBibs(payload, data) {
  const results = (payload.entries || []).map((entry, index) => {
    const metadata = entry.metadata || {};
    const normalizedIsbns = new Set((metadata.isbns || []).map(value => String(value).replace(/[\s-]+/gu, '')));
    const oclcNumbers = new Set((metadata.oclc_numbers || []).map(String));
    const normalizedTitle = String(metadata.title || '').trim().toLocaleLowerCase();
    const record = (data.records || []).find(candidate => {
      const summary = candidate.worldcat?.summary || {};
      if (oclcNumbers.has(String(summary.oclc_number || ''))) return true;
      if ((summary.isbn || []).some(isbn => normalizedIsbns.has(String(isbn).replace(/[\s-]+/gu, '')))) return true;
      return normalizedTitle && String(summary.title || '').trim().toLocaleLowerCase().startsWith(normalizedTitle);
    });
    if (!record) {
      return {
        index,
        input: metadata.title || metadata.row_label || `Spreadsheet row ${index + 1}`,
        input_metadata: structuredClone(metadata),
        lookup_type: 'spreadsheet',
        status: 'not_found',
        reason: 'No exact sample WorldCat record matched this spreadsheet row.'
      };
    }
    const comparison = compareDemoBib({
      catalog_key: record.local.summary.catalog_key,
      target_tags: payload.target_tags
    }, data);
    return {
      index,
      input: metadata.title || metadata.row_label || `Spreadsheet row ${index + 1}`,
      input_metadata: structuredClone(metadata),
      lookup_type: 'spreadsheet',
      status: comparison?.needs_selection ? 'review' : 'resolved',
      local: { ...structuredClone(comparison.local.summary), catalog_key: '' },
      worldcat: structuredClone(comparison.worldcat.summary),
      source: { code: 'oclc', role: 'primary', read_only: true },
      selection: { ...structuredClone(comparison.selection), source: 'oclc' },
      match: structuredClone(comparison.match),
      review: structuredClone(comparison.review || {}),
      comparison_counts: structuredClone(comparison.comparison.counts)
    };
  });
  const counts = results.reduce((summary, result) => {
    summary[result.status] = (summary[result.status] || 0) + 1;
    return summary;
  }, { resolved: 0, review: 0, not_found: 0, failed: 0 });
  return { results, counts, returned: results.length };
}

function saveDemoHydrationBatch(payload, resolved) {
  const run = demoHydrationRuns.get(payload.run_id);
  if (run && run.metadata.status !== 'hydration_running') return false;
  if (run && payload.batch_id && !run.batches.has(payload.batch_id)) {
    run.batches.add(payload.batch_id);
    run.results.push(...structuredClone(resolved.results));
    run.metadata.hydration_completed = run.results.length;
    run.metadata.row_count = run.results.length;
  }
  return true;
}

function compareDemoBib(payload, data) {
  const record = (data.records || []).find(candidate => (
    String(candidate.local?.summary?.catalog_key || '') === String(payload.catalog_key || '')
  ));
  if (!record) return null;
  const requestedCandidate = payload.oclc_number
    ? (record.candidates || []).find(candidate => String(candidate.oclc_number || '') === String(payload.oclc_number))
    : null;
  if (payload.oclc_number && !requestedCandidate
      && String(payload.oclc_number) !== String(record.selection?.oclc_number || '')) {
    return null;
  }
  const comparison = structuredClone(record);
  if (requestedCandidate && String(requestedCandidate.oclc_number) !== String(comparison.selection?.oclc_number || '')) {
    comparison.selection = {
      oclc_number: String(requestedCandidate.oclc_number),
      method: 'staff_selection'
    };
    comparison.worldcat.summary = {
      ...comparison.worldcat.summary,
      ...structuredClone(requestedCandidate),
      publication: requestedCandidate.date || comparison.worldcat.summary.publication
    };
    comparison.match = {
      confidence: requestedCandidate.match_confidence || 'possible',
      reason: requestedCandidate.match_reason || 'This candidate needs staff review.',
      hydration_ready: requestedCandidate.validation_rejected ? 0 : 1,
      identity_conflict: requestedCandidate.validation_rejected ? 1 : 0
    };
    comparison.review = {
      ...comparison.review,
      identity_score: requestedCandidate.match_score,
      overall_score: requestedCandidate.match_score,
      confidence_band: requestedCandidate.match_confidence_band || 'review',
      advice: requestedCandidate.validation_rejected ? 'do_not_hydrate' : 'review',
      reason: requestedCandidate.match_reason || 'This candidate needs staff review.'
    };
  }
  const requestedTags = [...new Set((payload.target_tags || []).map(String))];
  const worldcatTags = new Set([
    ...(comparison.worldcat?.record?.fields || []).map(field => field.tag),
    ...(comparison.comparison?.rows || []).filter(row => row.worldcat).map(row => row.tag)
  ]);
  const blocked = requestedTags.filter(tag => /^(?:001|003|005|035|040|049|59\d|69\d|8[5-9]\d|9\d\d)$/u.test(tag));
  const missing = requestedTags.filter(tag => !worldcatTags.has(tag));
  const fields = requestedTags.map(tag => ({
    tag,
    available: worldcatTags.has(tag) ? 1 : 0,
    hydration_allowed: worldcatTags.has(tag) && !blocked.includes(tag) ? 1 : 0,
    risk: blocked.includes(tag) ? 'blocked' : (['250', '264', '300', '505', '520', '521', '526', '856'].includes(tag) ? 'high' : 'standard')
  }));
  const targetScore = requestedTags.length
    ? Math.round(100 * fields.filter(field => field.hydration_allowed).length / requestedTags.length)
    : 100;
  const identityScore = Number(comparison.review?.identity_score) || 98;
  const identityRejected = Boolean(comparison.match?.identity_conflict || !comparison.match?.hydration_ready);
  const advice = identityRejected
    ? 'do_not_hydrate'
    : blocked.length
    ? 'do_not_hydrate'
    : (missing.length ? 'review' : 'recommended');
  const evidenceFields = fields.map(field => {
    const status = !field.hydration_allowed
      ? 'not_appropriate'
      : (['521', '526'].includes(field.tag) ? 'strong' : 'supported');
    return {
      tag: field.tag,
      label: field.tag === '521' ? 'Target audience note' : (field.tag === '526' ? 'Study program information' : `Field ${field.tag}`),
      status,
      reason: status === 'strong'
        ? 'The field is structurally valid, attributed, and attached to an identity-safe WorldCat record.'
        : (status === 'supported'
            ? 'The field is structurally valid and attached to an identity-safe WorldCat record.'
            : 'This field is missing or is not eligible for WorldCat hydration.'),
      download_allowed: ['strong', 'supported'].includes(status) ? 1 : 0,
      local_count: 0,
      worldcat_count: field.available ? 1 : 0,
      local_relationship: 'missing_locally',
      source_path: 'local_035',
      source_path_label: 'Existing local OCLC link',
      field_attribution: field.tag === '526' ? ['Accelerated Reader AR'] : [],
      structure: { valid: field.available ? 1 : 0, issues: [] }
    };
  });
  comparison.review = {
    ...(comparison.review || {}),
    mode: requestedTags.length ? 'selected_fields' : 'all_fields',
    requested_tags: requestedTags,
    identity_score: identityScore,
    target_field_score: targetScore,
    overall_score: requestedTags.length
      ? Math.min(identityScore, Math.round((identityScore * 0.8) + (targetScore * 0.2)))
      : identityScore,
    confidence_band: comparison.review?.confidence_band || 'high',
    advice,
    reason: identityRejected
      ? (comparison.review?.reason || 'Record identity does not meet the minimum safe hydration threshold.')
      : advice === 'recommended'
      ? 'The record identity and requested-field coverage meet the hydration thresholds.'
      : (advice === 'do_not_hydrate'
          ? 'One or more requested fields are local or control fields that should not be copied from WorldCat.'
          : 'The selected WorldCat record does not contain every requested field.'),
    recommended: advice === 'recommended' ? 1 : 0,
    identity_threshold: requestedTags.some(tag => fields.find(field => field.tag === tag)?.risk === 'high') ? 90 : 80,
    overall_threshold: 80,
    fields,
    missing_tags: missing,
    blocked_tags: blocked,
    high_risk_tags: fields.filter(field => field.risk === 'high').map(field => field.tag),
    field_evidence: {
      applicable: evidenceFields.length ? 1 : 0,
      ready_for_candidate_download: evidenceFields.length && evidenceFields.every(field => field.download_allowed) ? 1 : 0,
      score_effect: 'none',
      version: '1.0-demo',
      fields: evidenceFields,
      needs_review_tags: [],
      conflicting_tags: [],
      not_appropriate_tags: evidenceFields.filter(field => field.status === 'not_appropriate').map(field => field.tag),
      already_present_tags: [],
      record_provenance: {
        cataloging_agencies: ['DLC', 'OCLCO'],
        authentication_codes: ['pcc']
      }
    },
    scoring_version: '1.0-demo'
  };
  return comparison;
}

async function handleDemoQueryRequest(options = {}) {
  let payload = {};
  try { payload = JSON.parse(String(options.body || '{}')); } catch (_) { return json({ error: 'Invalid JSON request.' }, 400); }

  if (payload.action === 'login') {
    return payload.username === 'demo' && payload.password === 'library'
      ? json({ token: DEMO_TOKEN, username: 'demo', role: 'demo', demo: true })
      : json({ error: 'Invalid username or password.' }, 401);
  }
  if (payload.action === 'whoami') {
    return json(isAuthenticated(options)
      ? { authenticated: true, username: 'demo', role: 'demo', demo: true }
      : { authenticated: false, username: null, role: 'public' });
  }
  if (!isAuthenticated(options)) return json({ error: 'Sign in with the demo account to continue.' }, 403);

  const data = await loadDemoData();
  switch (payload.action) {
    case 'logout': return json({ status: 'signed_out' });
    case 'change_password': return json({ error: 'The shared demo password cannot be changed.' }, 403);
    case 'get_fields': return json({ fields: data.fields || [] });
    case 'run': return runQuery(payload, data);
    case 'record_details': {
      const details = loadDemoRecordDetails(payload, data);
      return details
        ? json(details)
        : json({ error: 'The selected record was not found.' }, 404);
    }
    case 'query_plan': return json(buildDemoQueryPlan(payload));
    case 'library_dashboard': return json(buildDemoLibraryDashboard(payload, data));
    case 'status': return json({
      queries: {
        ...(payload.dashboard ? buildDemoDashboardQueries() : {}),
        ...Object.fromEntries([...demoHydrationRuns].map(([id, run]) => [id, run.metadata]))
      },
      sample_data: Boolean(payload.dashboard)
    });
    case 'list': return json({ queries: [] });
    case 'list_templates': return json({ categories: [], templates: [] });
    case 'search_bibs': {
      const bibData = await loadDemoBibData();
      return json(searchDemoBibs(payload, bibData));
    }
    case 'compare_oclc_bib': {
      const bibData = await loadDemoBibData();
      const comparison = compareDemoBib(payload, bibData);
      return comparison
        ? json(comparison)
        : json({ error: 'The sample bibliographic record was not found.' }, 404);
    }
    case 'resolve_oclc_bibs_bulk': {
      const bibData = await loadDemoBibData();
      const resolved = resolveDemoBibsBulk(payload, bibData);
      if (!saveDemoHydrationBatch(payload, resolved)) {
        return json({ error: 'Hydration run is no longer active.' }, 409);
      }
      return json(resolved);
    }
    case 'resolve_spreadsheet_bibs_bulk': {
      const bibData = await loadDemoBibData();
      const resolved = resolveDemoSpreadsheetBibs(payload, bibData);
      if (!saveDemoHydrationBatch(payload, resolved)) {
        return json({ error: 'Hydration run is no longer active.' }, 409);
      }
      return json(resolved);
    }
    case 'retrieve_external_bibs_bulk': {
      const bibData = await loadDemoBibData();
      const records = (payload.records || []).map((request, index) => {
        const matched = (bibData.records || []).find(record => (
          request.source === 'oclc'
            ? String(record.worldcat?.summary?.oclc_number || '') === String(request.identifier || '')
            : (record.worldcat?.summary?.lccn || []).includes(request.identifier)
        ));
        return matched
          ? { index, source: request.source, identifier: request.identifier, status: 'resolved', record: structuredClone(matched.worldcat.record) }
          : { index, source: request.source, identifier: request.identifier, status: 'failed', error: 'The sample record was not found.' };
      });
      return json({ records, returned: records.length });
    }
    case 'start_hydration_run': {
      const runId = `query_${Math.floor(Date.now() / 1000)}_${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
      const metadata = {
        kind: 'hydration', created_by: 'demo', name: payload.name,
        status: 'hydration_running', start_time: new Date().toISOString(),
        hydration_total: payload.total, hydration_completed: 0, row_count: 0,
        target_tags: payload.target_tags || []
      };
      demoHydrationRuns.set(runId, { metadata, results: [], batches: new Set() });
      return json({ run_id: runId, metadata });
    }
    case 'get_hydration_run': {
      const run = demoHydrationRuns.get(payload.run_id);
      if (!run) return json({ error: 'Hydration run not found.' }, 404);
      const offset = Number(payload.offset || 0);
      const limit = Number(payload.limit || 500);
      const results = run.results.slice(offset, offset + limit);
      return json({
        run_id: payload.run_id, metadata: run.metadata, results, offset,
        next_offset: offset + results.length, total: run.results.length,
        has_more: offset + results.length < run.results.length
      });
    }
    case 'finish_hydration_run': {
      const run = demoHydrationRuns.get(payload.run_id);
      if (!run) return json({ error: 'Hydration run not found.' }, 404);
      run.metadata.status = payload.status;
      run.metadata.end_time = new Date().toISOString();
      return json({ run_id: payload.run_id, metadata: run.metadata });
    }
    case 'cancel_hydration_run': {
      const run = demoHydrationRuns.get(payload.run_id);
      if (!run) return json({ error: 'Hydration run not found.' }, 404);
      if (run.metadata.status !== 'hydration_running' && run.metadata.status !== 'canceled') {
        return json({ error: 'Hydration run is already finalized.' }, 409);
      }
      run.metadata.status = 'canceled';
      run.metadata.end_time ||= new Date().toISOString();
      return json({ run_id: payload.run_id, metadata: run.metadata });
    }
    case 'update_history_run': {
      const run = demoHydrationRuns.get(payload.query_id);
      if (!run) return json({ error: 'History run not found.' }, 404);
      if (typeof payload.name === 'string' && payload.name.trim()) run.metadata.name = payload.name.trim();
      if (typeof payload.pinned === 'boolean') run.metadata.pinned = payload.pinned;
      return json({
        query_id: payload.query_id,
        name: run.metadata.name,
        pinned: Boolean(run.metadata.pinned)
      });
    }
    case 'cancel': return json({ ok: true });
    case 'get_results': return json({ error: 'No saved demo result was found.' }, 404);
    default: return json({ error: `The demo backend does not support ${payload.action || 'this action'}.` }, 400);
  }
}

async function queryFetch(url, options = {}) {
  return isDemoApiUrl(url) ? handleDemoQueryRequest(options) : globalThis.fetch(url, options);
}

export { DEMO_API_PATH, handleDemoQueryRequest, isDemoApiUrl, queryFetch };
