import {
  getHistoryQueryStatus,
  normalizeHistoryViewOptions,
  queryMatchesHistoryFilters,
  sortHistoryQueries
} from './queryHistoryControls.js';

export function queryMatchesHistorySearch(query, searchTerm, options = {}) {
  const normalizedSearch = String(searchTerm || '').trim().toLowerCase();
  if (!normalizedSearch) {
    return true;
  }

  const includeError = options.includeError === true;
  const name = String(query?.name || '').toLowerCase();
  const id = String(query?.id || '').toLowerCase();
  const error = String(query?.error || '').toLowerCase();
  const columns = Array.isArray(query?.jsonConfig?.DesiredColumnOrder)
    ? query.jsonConfig.DesiredColumnOrder
    : [];

  return name.includes(normalizedSearch)
    || id.includes(normalizedSearch)
    || (includeError && error.includes(normalizedSearch))
    || columns.some(column => String(column || '').toLowerCase().includes(normalizedSearch));
}

export function groupHistoryQueries(queries, searchTerm = '', options = {}) {
  const source = Array.isArray(queries) ? queries : [];
  const normalizedOptions = normalizeHistoryViewOptions(options);
  const explicitNowNumber = Number(options?.now);
  const explicitNowDate = options?.now ? new Date(options.now).getTime() : NaN;
  const now = Number.isFinite(explicitNowNumber)
    ? explicitNowNumber
    : Number.isFinite(explicitNowDate)
      ? explicitNowDate
      : Date.now();
  const running = [];
  const complete = [];
  const failed = [];
  const canceled = [];

  const matchingQueries = sortHistoryQueries(source.filter(query => {
    const includeError = query?.failed || getHistoryQueryStatus(query) === 'failed';
    return queryMatchesHistorySearch(query, searchTerm, { includeError })
      && queryMatchesHistoryFilters(query, normalizedOptions, now);
  }), normalizedOptions.sortKey, now);

  matchingQueries.forEach(query => {
    const status = getHistoryQueryStatus(query);
    if (status === 'running') {
      running.push(query);
      return;
    }
    if (status === 'failed') {
      failed.push(query);
      return;
    }
    if (status === 'canceled') {
      canceled.push(query);
      return;
    }
    complete.push(query);
  });

  const counts = {
    running: running.length,
    complete: complete.length,
    failed: failed.length,
    canceled: canceled.length
  };
  const visibleCount = counts.running + counts.complete + counts.failed + counts.canceled;

  return {
    running,
    complete,
    failed,
    canceled,
    counts,
    visibleCount,
    totalCount: source.length,
    hasVisibleQueries: visibleCount > 0,
    options: normalizedOptions
  };
}
