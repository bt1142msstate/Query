import { classifyQueryStatus } from './queryHistoryViewHelpers.js';

const HISTORY_STATUS_FILTER_OPTIONS = Object.freeze([
  { value: 'all', label: 'All statuses' },
  { value: 'running', label: 'Running' },
  { value: 'complete', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
  { value: 'canceled', label: 'Cancelled' }
]);

const HISTORY_RESULT_FILTER_OPTIONS = Object.freeze([
  { value: 'all', label: 'Any result count' },
  { value: 'has_results', label: 'Has rows' },
  { value: 'no_results', label: 'No rows' },
  { value: 'large_results', label: '1,000+ rows' },
  { value: 'unknown_results', label: 'Unknown count' }
]);

const HISTORY_DURATION_FILTER_OPTIONS = Object.freeze([
  { value: 'all', label: 'Any duration' },
  { value: 'over_5m', label: 'Over 5 minutes' },
  { value: 'over_30m', label: 'Over 30 minutes' }
]);

const HISTORY_SORT_OPTIONS = Object.freeze([
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'most_results', label: 'Most results' },
  { value: 'longest_duration', label: 'Longest duration' },
  { value: 'fastest_duration', label: 'Fastest duration' },
  { value: 'name', label: 'Name A-Z' }
]);

const DEFAULT_HISTORY_VIEW_OPTIONS = Object.freeze({
  statusFilter: 'all',
  resultFilter: 'all',
  durationFilter: 'all',
  sortKey: 'newest'
});

function getOptionValue(options, value, fallback) {
  const normalized = String(value || '').trim();
  return options.some(option => option.value === normalized) ? normalized : fallback;
}

function getHistoryOptionLabel(options, value) {
  return options.find(option => option.value === value)?.label || '';
}

function normalizeHistoryViewOptions(options = {}) {
  return {
    statusFilter: getOptionValue(HISTORY_STATUS_FILTER_OPTIONS, options.statusFilter, DEFAULT_HISTORY_VIEW_OPTIONS.statusFilter),
    resultFilter: getOptionValue(HISTORY_RESULT_FILTER_OPTIONS, options.resultFilter, DEFAULT_HISTORY_VIEW_OPTIONS.resultFilter),
    durationFilter: getOptionValue(HISTORY_DURATION_FILTER_OPTIONS, options.durationFilter, DEFAULT_HISTORY_VIEW_OPTIONS.durationFilter),
    sortKey: getOptionValue(HISTORY_SORT_OPTIONS, options.sortKey, DEFAULT_HISTORY_VIEW_OPTIONS.sortKey)
  };
}

function toTimestamp(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (!value) {
    return null;
  }

  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function getHistoryQueryStatus(query) {
  if (query?.running) return 'running';
  if (query?.failed) return 'failed';
  if (query?.cancelled || query?.canceled) return 'canceled';

  const status = String(query?.status || '').toLowerCase();
  if (status === 'cancelled') return 'canceled';

  const classified = classifyQueryStatus(status);
  return classified && classified !== 'unknown' ? classified : 'complete';
}

function getHistoryQueryResultCount(query) {
  const value = query?.resultCount ?? query?.rowCount ?? query?.row_count;
  if (value === '' || value === null || value === undefined || value === '-' || value === '?') {
    return null;
  }

  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function getHistoryQueryStartTimeMs(query) {
  return toTimestamp(query?.startTime || query?.start_time || query?.createdAt || query?.created_at);
}

function getHistoryQuerySortTimeMs(query, now = Date.now()) {
  if (query?.running) {
    return now;
  }

  return toTimestamp(query?.endTime || query?.cancelledTime || query?.updatedAt || query?.updated_at || query?.startTime || query?.start_time) || 0;
}

function getHistoryQueryDurationMs(query, now = Date.now()) {
  const start = getHistoryQueryStartTimeMs(query);
  if (!start) {
    return 0;
  }

  const end = query?.running
    ? now
    : toTimestamp(query?.endTime || query?.cancelledTime || query?.updatedAt || query?.updated_at) || start;

  return Math.max(0, end - start);
}

function queryMatchesHistoryFilters(query, options = {}, now = Date.now()) {
  const normalizedOptions = normalizeHistoryViewOptions(options);
  const status = getHistoryQueryStatus(query);

  if (normalizedOptions.statusFilter !== 'all' && status !== normalizedOptions.statusFilter) {
    return false;
  }

  const resultCount = getHistoryQueryResultCount(query);
  if (normalizedOptions.resultFilter === 'has_results' && !(resultCount > 0)) {
    return false;
  }
  if (normalizedOptions.resultFilter === 'no_results' && resultCount !== 0) {
    return false;
  }
  if (normalizedOptions.resultFilter === 'large_results' && !(resultCount >= 1000)) {
    return false;
  }
  if (normalizedOptions.resultFilter === 'unknown_results' && resultCount !== null) {
    return false;
  }

  const durationMs = getHistoryQueryDurationMs(query, now);
  if (normalizedOptions.durationFilter === 'over_5m' && durationMs < 5 * 60 * 1000) {
    return false;
  }
  if (normalizedOptions.durationFilter === 'over_30m' && durationMs < 30 * 60 * 1000) {
    return false;
  }

  return true;
}

function compareNumbers(left, right) {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}

function compareQueryNames(left, right) {
  return String(left?.name || left?.id || '').localeCompare(String(right?.name || right?.id || ''), undefined, {
    sensitivity: 'base',
    numeric: true
  });
}

function sortHistoryQueries(queries, sortKey = DEFAULT_HISTORY_VIEW_OPTIONS.sortKey, now = Date.now()) {
  const normalizedSortKey = normalizeHistoryViewOptions({ sortKey }).sortKey;
  return (Array.isArray(queries) ? queries : [])
    .map((query, index) => ({ query, index }))
    .sort((left, right) => {
      let comparison = 0;

      if (normalizedSortKey === 'oldest') {
        comparison = compareNumbers(getHistoryQuerySortTimeMs(left.query, now), getHistoryQuerySortTimeMs(right.query, now));
      } else if (normalizedSortKey === 'most_results') {
        comparison = compareNumbers(
          getHistoryQueryResultCount(right.query) ?? -1,
          getHistoryQueryResultCount(left.query) ?? -1
        );
      } else if (normalizedSortKey === 'longest_duration') {
        comparison = compareNumbers(
          getHistoryQueryDurationMs(right.query, now),
          getHistoryQueryDurationMs(left.query, now)
        );
      } else if (normalizedSortKey === 'fastest_duration') {
        comparison = compareNumbers(
          getHistoryQueryDurationMs(left.query, now),
          getHistoryQueryDurationMs(right.query, now)
        );
      } else if (normalizedSortKey === 'name') {
        comparison = compareQueryNames(left.query, right.query);
      } else {
        comparison = compareNumbers(getHistoryQuerySortTimeMs(right.query, now), getHistoryQuerySortTimeMs(left.query, now));
      }

      if (comparison !== 0) {
        return comparison;
      }

      const fallbackTime = compareNumbers(getHistoryQuerySortTimeMs(right.query, now), getHistoryQuerySortTimeMs(left.query, now));
      return fallbackTime || compareNumbers(left.index, right.index);
    })
    .map(entry => entry.query);
}

function getHistorySortLabel(sortKey) {
  const normalized = sortKey && typeof sortKey === 'object'
    ? normalizeHistoryViewOptions(sortKey)
    : normalizeHistoryViewOptions({ sortKey });
  return getHistoryOptionLabel(HISTORY_SORT_OPTIONS, normalized.sortKey);
}

function getHistoryActiveFilterLabel(options = {}) {
  const normalized = normalizeHistoryViewOptions(options);
  const active = [];

  if (normalized.statusFilter !== DEFAULT_HISTORY_VIEW_OPTIONS.statusFilter) {
    active.push(`status: ${getHistoryOptionLabel(HISTORY_STATUS_FILTER_OPTIONS, normalized.statusFilter)}`);
  }
  if (normalized.resultFilter !== DEFAULT_HISTORY_VIEW_OPTIONS.resultFilter) {
    active.push(`results: ${getHistoryOptionLabel(HISTORY_RESULT_FILTER_OPTIONS, normalized.resultFilter)}`);
  }
  if (normalized.durationFilter !== DEFAULT_HISTORY_VIEW_OPTIONS.durationFilter) {
    active.push(`duration: ${getHistoryOptionLabel(HISTORY_DURATION_FILTER_OPTIONS, normalized.durationFilter)}`);
  }

  return active.join(', ');
}

function buildHistorySubtitleText({
  searchTerm,
  visibleCount,
  totalCount,
  runningCount,
  viewOptions
}) {
  const activeFilterLabel = getHistoryActiveFilterLabel(viewOptions);
  const sortLabel = getHistorySortLabel(viewOptions);
  const liveSignal = runningCount > 0
    ? `${runningCount} ${runningCount === 1 ? 'query is' : 'queries are'} still running.`
    : 'Nothing is running right now.';
  const scopeLabel = searchTerm
    ? `${visibleCount} of ${totalCount} runs match "${searchTerm}".`
    : `${visibleCount} of ${totalCount} saved ${totalCount === 1 ? 'run' : 'runs'} shown.`;
  const filterLabel = activeFilterLabel ? ` Filtered by ${activeFilterLabel}.` : '';
  const sortSummary = sortLabel ? ` Sorted by ${sortLabel.toLowerCase()}.` : '';

  return `${scopeLabel}${filterLabel}${sortSummary} ${liveSignal}`;
}

function buildHistoryVisibleMetaDetail(searchTerm, viewOptions) {
  const activeFilterLabel = getHistoryActiveFilterLabel(viewOptions);
  if (searchTerm && activeFilterLabel) {
    return 'Search and filters active';
  }
  if (searchTerm) {
    return 'Search active';
  }
  if (activeFilterLabel) {
    return 'Filters active';
  }

  return `Sorted by ${getHistorySortLabel(viewOptions).toLowerCase()}`;
}

function buildHistoryEmptyCriteriaMessage(searchTerm, viewOptions) {
  const activeFilterLabel = getHistoryActiveFilterLabel(viewOptions);
  if (searchTerm && activeFilterLabel) {
    return `No queries found matching "${searchTerm}" with the selected filters.`;
  }
  if (searchTerm) {
    return `No queries found matching "${searchTerm}".`;
  }
  if (activeFilterLabel) {
    return 'No queries match the selected history filters.';
  }
  return 'No query history is available yet.';
}

export {
  buildHistoryEmptyCriteriaMessage,
  buildHistorySubtitleText,
  buildHistoryVisibleMetaDetail,
  DEFAULT_HISTORY_VIEW_OPTIONS,
  HISTORY_DURATION_FILTER_OPTIONS,
  HISTORY_RESULT_FILTER_OPTIONS,
  HISTORY_SORT_OPTIONS,
  HISTORY_STATUS_FILTER_OPTIONS,
  getHistoryActiveFilterLabel,
  getHistoryQueryDurationMs,
  getHistoryQueryResultCount,
  getHistoryQuerySortTimeMs,
  getHistoryQueryStatus,
  getHistorySortLabel,
  normalizeHistoryViewOptions,
  queryMatchesHistoryFilters,
  sortHistoryQueries
};
