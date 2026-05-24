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

export function groupHistoryQueries(queries, searchTerm = '') {
  const source = Array.isArray(queries) ? queries : [];
  const running = [];
  const complete = [];
  const failed = [];
  const canceled = [];

  source.forEach(query => {
    if (query?.running) {
      if (queryMatchesHistorySearch(query, searchTerm)) running.push(query);
      return;
    }

    if (query?.failed) {
      if (queryMatchesHistorySearch(query, searchTerm, { includeError: true })) failed.push(query);
      return;
    }

    if (query?.cancelled) {
      if (queryMatchesHistorySearch(query, searchTerm)) canceled.push(query);
      return;
    }

    if (queryMatchesHistorySearch(query, searchTerm)) complete.push(query);
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
    hasVisibleQueries: visibleCount > 0
  };
}
