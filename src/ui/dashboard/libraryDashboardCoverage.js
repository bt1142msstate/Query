const SERVICE_COVERAGE = [
  { id: 'circulation', label: 'Circulation', detail: 'Checkouts, renewals, trends, and demand rankings.' },
  { id: 'collection', label: 'Collection', detail: 'Distinct titles, current items, turnover, inventory, availability, location, use, age, holds, and price coverage.' },
  { id: 'patrons', label: 'Patrons', detail: 'Current, active, and newly registered patrons with privacy-safe demographics.' },
  { id: 'operations', label: 'Query operations', detail: 'Report reliability, turnaround, staff activity, and Hydration outcomes.' },
  { id: 'visits', label: 'Visits and door counts', detail: 'Requires a gate-counter or reporting-system source.' },
  { id: 'programs', label: 'Programs and attendance', detail: 'Requires a program calendar or attendance source.' },
  { id: 'technology', label: 'Computers and Wi-Fi', detail: 'Requires session or network aggregates.' },
  { id: 'eresources', label: 'Electronic resources', detail: 'Requires COUNTER or vendor usage aggregates.' },
  { id: 'ill', label: 'Interlibrary loan', detail: 'Requires request, filled, and turnaround aggregates.' },
  { id: 'budget', label: 'Acquisitions and budget', detail: 'Sirsi acquisitions commands are installed; a dedicated privacy-safe aggregate is not connected yet.' },
  { id: 'fulfillment', label: 'Hold fulfillment', detail: 'Sirsi hold records are available; a dedicated lifecycle aggregate is not connected yet.' },
  { id: 'transit', label: 'Transit workflow', detail: 'Sirsi current-transit records and transaction logs are available; historical throughput is not connected yet.' },
  { id: 'billing', label: 'Billing', detail: 'Sirsi bill and payment selectors are installed; leadership-safe aggregates are not connected yet.' }
];

function activityWindowLabel(days = 365) {
  const value = Number(days);
  if (value === 90) return 'Last 90 days';
  if (value === 730) return 'Last 24 months';
  return 'Last 12 months';
}

function seriesTotal(series = [], key = 'patrons') {
  return (Array.isArray(series) ? series : []).reduce((sum, entry) => {
    const value = Number(entry?.[key] ?? entry?.value ?? 0);
    return sum + (Number.isFinite(value) && value > 0 ? value : 0);
  }, 0);
}

function patronCoverage(series, totalPatrons, suppressionThreshold = 0) {
  const total = Math.max(0, Number(totalPatrons) || 0);
  const represented = Math.min(total, seriesTotal(series, 'patrons'));
  const unavailable = Math.max(0, total - represented);
  const rate = total > 0 ? represented / total : 0;
  return {
    total,
    represented,
    unavailable,
    rate,
    smallSuppressedGap: unavailable > 0 && unavailable < Math.max(0, Number(suppressionThreshold) || 0)
  };
}

function serviceCoverage(availability = {}, configured = []) {
  const overrides = new Map((Array.isArray(configured) ? configured : []).map(entry => [entry?.id, entry]));
  return SERVICE_COVERAGE.map(area => {
    const override = overrides.get(area.id) || {};
    const connectedByDefault = area.id === 'operations' || Boolean(availability?.[area.id]);
    return {
      ...area,
      ...override,
      connected: Object.prototype.hasOwnProperty.call(override, 'connected')
        ? Boolean(override.connected)
        : connectedByDefault
    };
  });
}

export { activityWindowLabel, patronCoverage, seriesTotal, serviceCoverage };
