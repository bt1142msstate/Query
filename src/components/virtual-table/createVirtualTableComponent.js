import { buildExpandedMultiValueTable } from '../../features/table/virtual-table/splitColumnExpansion.js';
import { buildSplitModeDisplayedFields } from '../../features/table/virtual-table/splitColumnFields.js';
import {
  buildVirtualTableProjection,
  createEmptyDuplicateCollapseStats
} from '../../features/table/virtual-table/virtualTableDuplicateCollapse.js';

function normalizeStringList(values) {
  return (Array.isArray(values) ? values : [])
    .map(value => String(value || '').trim())
    .filter(Boolean);
}

function cloneMap(value) {
  return value instanceof Map ? new Map(value) : new Map();
}

function createEmptyVirtualTableData() {
  return {
    headers: [],
    rows: [],
    columnMap: new Map(),
    splitColumnGroups: new Map(),
    splitColumnParent: new Map(),
    splitColumnSourceMap: new Map()
  };
}

function buildColumnMap(headers, sourceColumnMap) {
  if (sourceColumnMap instanceof Map) {
    return new Map(sourceColumnMap);
  }

  return new Map(headers.map((header, index) => [header, index]));
}

function normalizeVirtualTableData(data = {}) {
  const headers = normalizeStringList(data.headers);
  const rows = Array.isArray(data.rows) ? data.rows : [];

  return {
    headers,
    rows,
    columnMap: buildColumnMap(headers, data.columnMap),
    splitColumnGroups: cloneMap(data.splitColumnGroups),
    splitColumnParent: cloneMap(data.splitColumnParent),
    splitColumnSourceMap: cloneMap(data.splitColumnSourceMap)
  };
}

function createVirtualTableComponent(options = {}) {
  let rawTableData = normalizeVirtualTableData(options.data || createEmptyVirtualTableData());
  let splitViewData = null;
  let splitColumnsActive = Boolean(options.splitColumns);
  let collapseDuplicateRows = options.collapseDuplicateRows !== false;
  let displayedFields = normalizeStringList(options.displayedFields || rawTableData.headers);
  let lastProjectionStats = createEmptyDuplicateCollapseStats();

  function getBaseViewData() {
    if (!splitColumnsActive) {
      return rawTableData;
    }

    if (!splitViewData) {
      splitViewData = buildExpandedMultiValueTable(rawTableData, { lazyRows: true });
    }
    return splitViewData;
  }

  function getDisplayedFields() {
    return buildSplitModeDisplayedFields(displayedFields, getBaseViewData(), splitColumnsActive);
  }

  function project(projectOptions = {}) {
    const baseViewData = getBaseViewData();
    const projection = buildVirtualTableProjection({
      baseViewData,
      collapseDuplicates: collapseDuplicateRows,
      displayedFields: getDisplayedFields(),
      filteredRows: Array.isArray(projectOptions.filteredRows) ? projectOptions.filteredRows : baseViewData.rows
    });
    lastProjectionStats = projection.stats;
    return projection;
  }

  return Object.freeze({
    get collapseDuplicateRows() { return collapseDuplicateRows; },
    get displayedFields() { return getDisplayedFields(); },
    get rawTableData() { return rawTableData; },
    get splitColumnsActive() { return splitColumnsActive; },
    get stats() { return lastProjectionStats; },
    project,
    setCollapseDuplicateRows(active) {
      collapseDuplicateRows = active !== false;
      return project();
    },
    setData(data) {
      rawTableData = normalizeVirtualTableData(data);
      splitViewData = null;
      return project();
    },
    setDisplayedFields(fields) {
      displayedFields = normalizeStringList(fields);
      return project();
    },
    setSplitColumns(active) {
      splitColumnsActive = Boolean(active);
      return project();
    }
  });
}

export {
  createEmptyVirtualTableData,
  createVirtualTableComponent,
  normalizeVirtualTableData
};
