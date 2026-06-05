import { normalizeBackendProgress } from '../../core/queryProgress.js';

export function mapStatusPayloadToHistoryRows(payload, dependencies = {}) {
  const queries = payload?.queries;
  if (!queries || typeof queries !== 'object') {
    return [];
  }

  return Object.entries(queries)
    .map(([id, info]) => ({ id, ...(info || {}) }))
    .sort((left, right) => String(right.id).localeCompare(String(left.id)))
    .map(serverQuery => mapServerQueryToHistoryRow(serverQuery, dependencies));
}

function mapServerQueryToHistoryRow(serverQuery, dependencies = {}) {
  const {
    buildUiConfigFromRequest,
    classifyQueryStatus,
    mapperDependencies,
    mergeUiConfigWithRequest,
    now = Date.now()
  } = dependencies;

  const request = serverQuery?.request || null;
  const statusBucket = classifyQueryStatus(serverQuery?.status);
  const jsonConfig = buildHistoryJsonConfig(request, {
    buildUiConfigFromRequest,
    mapperDependencies,
    mergeUiConfigWithRequest
  });

  return {
    id: serverQuery.id,
    name: serverQuery.name || (request ? request.name : 'Unknown Query'),
    status: serverQuery.status,
    statusBucket,
    launchMode: serverQuery.launch_mode || '',
    deliveryMode: serverQuery.delivery_mode || '',
    running: serverQuery.status === 'running',
    cancelled: serverQuery.status === 'canceled',
    failed: statusBucket !== 'running' && statusBucket !== 'complete' && statusBucket !== 'canceled',
    startTime: serverQuery.start_time,
    endTime: serverQuery.end_time || '-',
    duration: getHistoryQueryDuration(serverQuery, now),
    jsonConfig,
    resultCount: serverQuery.row_count !== undefined ? serverQuery.row_count : (serverQuery.start_time && serverQuery.end_time ? '?' : '-'),
    progress: normalizeBackendProgress(serverQuery.progress),
    error: serverQuery.error || serverQuery.warning || ''
  };
}

function buildHistoryJsonConfig(request, dependencies) {
  if (!request) {
    return null;
  }

  if (request.ui_config) {
    return dependencies.mergeUiConfigWithRequest(request.ui_config, request, dependencies.mapperDependencies);
  }

  return dependencies.buildUiConfigFromRequest(request, dependencies.mapperDependencies);
}

function getHistoryQueryDuration(serverQuery, now) {
  if (serverQuery.start_time && serverQuery.end_time) {
    const start = parseHistoryDate(serverQuery.start_time);
    const end = parseHistoryDate(serverQuery.end_time);
    if (!isNaN(start) && !isNaN(end)) {
      return `${Math.floor((end - start) / 1000)}s`;
    }
  }

  if (serverQuery.start_time && serverQuery.status === 'running') {
    const start = parseHistoryDate(serverQuery.start_time);
    if (!isNaN(start)) {
      return `${Math.floor((now - start) / 1000)}s...`;
    }
  }

  return '-';
}

function parseHistoryDate(value) {
  return new Date(String(value || '').replace(/-/g, '/'));
}
