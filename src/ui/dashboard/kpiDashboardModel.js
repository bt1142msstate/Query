const COMPLETE_STATUSES = new Set(['complete', 'completed', 'hydration_complete']);
const RUNNING_STATUSES = new Set(['running', 'hydration_running', 'queued']);
const CANCELED_STATUSES = new Set(['canceled', 'cancelled']);

function parseTimestamp(value) {
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function classifyRunStatus(status) {
  const normalized = String(status || '').trim().toLowerCase();
  if (COMPLETE_STATUSES.has(normalized)) return 'complete';
  if (RUNNING_STATUSES.has(normalized)) return 'running';
  if (CANCELED_STATUSES.has(normalized)) return 'canceled';
  return 'failed';
}

function getRunRows(run) {
  const value = run?.hydration_completed ?? run?.row_count;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : 0;
}

function getDurationSeconds(run, now = Date.now()) {
  const start = parseTimestamp(run?.start_time);
  if (start === null) return null;
  const end = parseTimestamp(run?.end_time) ?? (classifyRunStatus(run?.status) === 'running' ? now : null);
  if (end === null || end < start) return null;
  return Math.round((end - start) / 1000);
}

function normalizeDashboardRuns(payload) {
  const source = payload?.queries;
  if (!source || typeof source !== 'object') return [];
  return Object.entries(source).map(([id, value]) => ({ id, ...(value || {}) }));
}

function getRangeStart(range, now) {
  const days = Number(range);
  if (!Number.isFinite(days) || days <= 0) return null;
  const date = new Date(now);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - (days - 1));
  return date.getTime();
}

function filterDashboardRuns(runs, options = {}) {
  const now = options.now ?? Date.now();
  const rangeStart = getRangeStart(options.range || '30', now);
  const kind = options.kind || 'all';
  const staff = options.staff || 'all';
  return (runs || []).filter(run => {
    if (rangeStart !== null && (parseTimestamp(run.start_time) ?? 0) < rangeStart) return false;
    if (kind !== 'all' && (run.kind === 'hydration' ? 'hydration' : 'query') !== kind) return false;
    if (staff !== 'all' && String(run.created_by || '') !== staff) return false;
    return true;
  });
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

function increment(map, key, amount = 1) {
  map.set(key, (map.get(key) || 0) + amount);
}

function topEntries(map, limit = 6) {
  return [...map.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((left, right) => right.value - left.value || left.label.localeCompare(right.label))
    .slice(0, limit);
}

function getBucketConfig(range, runs) {
  if (range === '7') return { unit: 'day', count: 7 };
  if (range === '30') return { unit: 'day', count: 30 };
  if (range === '90') return { unit: 'week', count: 13 };
  const validDates = runs.map(run => parseTimestamp(run.start_time)).filter(value => value !== null);
  if (!validDates.length) return { unit: 'month', count: 12 };
  const first = new Date(Math.min(...validDates));
  const last = new Date(Math.max(...validDates));
  const count = Math.max(1, Math.min(24, ((last.getFullYear() - first.getFullYear()) * 12) + last.getMonth() - first.getMonth() + 1));
  return { unit: 'month', count };
}

function startOfBucket(timestamp, unit) {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  if (unit === 'week') {
    const mondayOffset = (date.getDay() + 6) % 7;
    date.setDate(date.getDate() - mondayOffset);
  } else if (unit === 'month') {
    date.setDate(1);
  }
  return date;
}

function moveBucket(date, unit, amount) {
  const next = new Date(date);
  if (unit === 'month') next.setMonth(next.getMonth() + amount);
  else next.setDate(next.getDate() + (unit === 'week' ? 7 * amount : amount));
  return next;
}

function formatBucketLabel(date, unit) {
  if (unit === 'month') return date.toLocaleDateString([], { month: 'short', year: '2-digit' });
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function buildTrend(runs, range, now) {
  const { unit, count } = getBucketConfig(range, runs);
  const lastStart = startOfBucket(now, unit);
  const firstStart = moveBucket(lastStart, unit, -(count - 1));
  const buckets = Array.from({ length: count }, (_, index) => {
    const date = moveBucket(firstStart, unit, index);
    return { key: date.toISOString().slice(0, 10), label: formatBucketLabel(date, unit), start: date.getTime(), complete: 0, other: 0, total: 0 };
  });

  runs.forEach(run => {
    const timestamp = parseTimestamp(run.start_time);
    if (timestamp === null) return;
    const bucketStart = startOfBucket(timestamp, unit).getTime();
    const bucket = buckets.find(item => item.start === bucketStart);
    if (!bucket) return;
    const field = classifyRunStatus(run.status) === 'complete' ? 'complete' : 'other';
    bucket[field] += 1;
    bucket.total += 1;
  });
  return { buckets, unit };
}

function summarizeHydration(runs) {
  const totals = { resolved: 0, review: 0, not_found: 0, failed: 0 };
  runs.filter(run => run.kind === 'hydration').forEach(run => {
    const counts = run.hydration_counts || {};
    Object.keys(totals).forEach(key => {
      const value = Number(counts[key] || 0);
      if (Number.isFinite(value) && value > 0) totals[key] += value;
    });
  });
  return totals;
}

function summarizeDashboardRuns(runs, options = {}) {
  const now = options.now ?? Date.now();
  const filteredRuns = filterDashboardRuns(runs, { ...options, now });
  const statusCounts = { complete: 0, running: 0, failed: 0, canceled: 0 };
  const nameCounts = new Map();
  const staffCounts = new Map();
  const durations = [];
  let totalRows = 0;

  filteredRuns.forEach(run => {
    const status = classifyRunStatus(run.status);
    statusCounts[status] += 1;
    totalRows += getRunRows(run);
    increment(nameCounts, String(run.name || run.request?.name || 'Untitled report'));
    increment(staffCounts, String(run.created_by || 'Unknown staff'));
    const duration = getDurationSeconds(run, now);
    if (duration !== null && status !== 'running') durations.push(duration);
  });

  const finalized = statusCounts.complete + statusCounts.failed + statusCounts.canceled;
  const timestamps = filteredRuns.map(run => parseTimestamp(run.start_time)).filter(value => value !== null);
  return {
    totalRuns: filteredRuns.length,
    totalRows,
    completionRate: finalized ? statusCounts.complete / finalized : null,
    medianDurationSeconds: median(durations),
    activeRuns: statusCounts.running,
    statusCounts,
    trend: buildTrend(filteredRuns, options.range || '30', now),
    topReports: topEntries(nameCounts),
    staffActivity: topEntries(staffCounts),
    hydration: summarizeHydration(filteredRuns),
    recentRuns: [...filteredRuns].sort((left, right) => (parseTimestamp(right.start_time) || 0) - (parseTimestamp(left.start_time) || 0)).slice(0, 8),
    coverage: {
      first: timestamps.length ? Math.min(...timestamps) : null,
      last: timestamps.length ? Math.max(...timestamps) : null
    }
  };
}

function getDashboardStaffOptions(runs) {
  return [...new Set((runs || []).map(run => String(run.created_by || '')).filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

export {
  classifyRunStatus,
  filterDashboardRuns,
  getDashboardStaffOptions,
  getDurationSeconds,
  getRunRows,
  normalizeDashboardRuns,
  summarizeDashboardRuns
};
