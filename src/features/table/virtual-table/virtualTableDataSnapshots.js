import { cloneResultCellValue } from '../../../core/resultCellValues.js';
import { cloneDuplicateRowGroups } from '../../../lib/virtual-table/virtualTableDuplicateCollapse.js';

function createEmptyVirtualTableData() {
  return {
    headers: [],
    rows: [],
    columnMap: new Map(),
    duplicateRowGroups: [],
    splitColumnGroups: new Map(),
    splitColumnParent: new Map(),
    splitColumnSourceMap: new Map()
  };
}

function cloneSplitColumnGroups(groups) {
  return groups instanceof Map ? new Map(Array.from(groups.entries()).map(([field, children]) => [field, [...children]])) : new Map();
}

function cloneSplitColumnParent(parentMap) {
  return parentMap instanceof Map ? new Map(parentMap) : new Map();
}

function cloneSplitColumnSourceMap(sourceMap) {
  return sourceMap instanceof Map ? new Map(sourceMap) : new Map();
}

function cloneTableData(data) {
  return {
    headers: Array.isArray(data?.headers) ? [...data.headers] : [],
    rows: Array.isArray(data?.rows) ? data.rows.map(row => Array.isArray(row) ? row.map(cloneResultCellValue) : row) : [],
    columnMap: data?.columnMap instanceof Map ? new Map(data.columnMap) : new Map(),
    duplicateRowGroups: cloneDuplicateRowGroups(data?.duplicateRowGroups),
    splitColumnGroups: cloneSplitColumnGroups(data?.splitColumnGroups),
    splitColumnParent: cloneSplitColumnParent(data?.splitColumnParent),
    splitColumnSourceMap: cloneSplitColumnSourceMap(data?.splitColumnSourceMap)
  };
}

export {
  cloneSplitColumnGroups,
  cloneSplitColumnParent,
  cloneSplitColumnSourceMap,
  cloneTableData,
  createEmptyVirtualTableData
};
