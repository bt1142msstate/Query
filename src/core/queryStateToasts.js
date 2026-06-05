import { OperatorLabels } from './formatting/operatorLabels.js';

function shouldSkipQueryChangeToast(meta = {}) {
  if (!meta || meta.toast === false) {
    return true;
  }

  const source = String(meta.source || '');
  if (!source) {
    return false;
  }

  if (source.startsWith('QueryFormMode.') || source.startsWith('SharedFieldPicker.')) {
    return true;
  }

  return [
    'Query.initialization',
    'Query.showExampleTable',
    'Query.showExampleTable.empty',
    'QueryTableView.showExampleTable',
    'QueryTableView.showExampleTable.empty',
    'QueryChangeManager.clearQuery',
    'Query.clearCurrentQuery',
    'QueryHistory.loadQueryConfig',
    'VirtualTable.setSplitMode',
    'Query.groupMethodChange'
  ].includes(source);
}

function capitalizeToastMessage(message) {
  const normalized = String(message || '').trim();
  if (!normalized) {
    return 'Query updated.';
  }

  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function truncateToastValue(value, maxLength = 60) {
  const normalized = String(value || '').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function diffItemLists(nextItems, previousItems) {
  const previousCounts = new Map();
  previousItems.forEach(item => {
    previousCounts.set(item, (previousCounts.get(item) || 0) + 1);
  });

  const added = [];
  nextItems.forEach(item => {
    const remaining = previousCounts.get(item) || 0;
    if (remaining > 0) {
      previousCounts.set(item, remaining - 1);
      return;
    }
    added.push(item);
  });

  const nextCounts = new Map();
  nextItems.forEach(item => {
    nextCounts.set(item, (nextCounts.get(item) || 0) + 1);
  });

  const removed = [];
  previousItems.forEach(item => {
    const remaining = nextCounts.get(item) || 0;
    if (remaining > 0) {
      nextCounts.set(item, remaining - 1);
      return;
    }
    removed.push(item);
  });

  return { added, removed };
}

function getDisplayedFieldDiff(previousSnapshot = {}, nextSnapshot = {}) {
  const previousFields = Array.isArray(previousSnapshot.displayedFields) ? previousSnapshot.displayedFields : [];
  const nextFields = Array.isArray(nextSnapshot.displayedFields) ? nextSnapshot.displayedFields : [];
  const { added, removed } = diffItemLists(nextFields, previousFields);
  const orderChanged = added.length === 0
    && removed.length === 0
    && previousFields.length === nextFields.length
    && previousFields.some((field, index) => field !== nextFields[index]);

  return { added, removed, orderChanged };
}

function flattenFilterEntries(snapshot = {}) {
  return Object.entries(snapshot.activeFilters || {}).flatMap(([field, data]) => (
    Array.isArray(data?.filters)
      ? data.filters.map(filter => ({
          field,
          filter,
          key: `${field}::${String(filter?.cond || '')}::${String(filter?.val || '')}`
        }))
      : []
  ));
}

function diffFilterEntries(nextEntries, previousEntries) {
  const previousCounts = new Map();
  previousEntries.forEach(entry => {
    previousCounts.set(entry.key, (previousCounts.get(entry.key) || 0) + 1);
  });

  const added = [];
  nextEntries.forEach(entry => {
    const remaining = previousCounts.get(entry.key) || 0;
    if (remaining > 0) {
      previousCounts.set(entry.key, remaining - 1);
      return;
    }
    added.push(entry);
  });

  const nextCounts = new Map();
  nextEntries.forEach(entry => {
    nextCounts.set(entry.key, (nextCounts.get(entry.key) || 0) + 1);
  });

  const removed = [];
  previousEntries.forEach(entry => {
    const remaining = nextCounts.get(entry.key) || 0;
    if (remaining > 0) {
      nextCounts.set(entry.key, remaining - 1);
      return;
    }
    removed.push(entry);
  });

  return { added, removed };
}

function getFilterGroupOrder(snapshot = {}) {
  return Object.entries(snapshot.activeFilters || {})
    .filter(([, data]) => Array.isArray(data?.filters) && data.filters.length > 0)
    .map(([field]) => field);
}

function getActiveFilterDiff(previousSnapshot = {}, nextSnapshot = {}) {
  const previousEntries = flattenFilterEntries(previousSnapshot);
  const nextEntries = flattenFilterEntries(nextSnapshot);
  const { added, removed } = diffFilterEntries(nextEntries, previousEntries);
  const previousOrder = getFilterGroupOrder(previousSnapshot);
  const nextOrder = getFilterGroupOrder(nextSnapshot);
  const reorderedGroups = added.length === 0
    && removed.length === 0
    && previousOrder.length === nextOrder.length
    && previousOrder.some((field, index) => field !== nextOrder[index]);

  return { added, removed, reorderedGroups };
}

function getOperatorToastLabel(cond) {
  const label = OperatorLabels.get(cond, '');
  if (label) {
    return String(label).toLowerCase();
  }

  return String(cond || '')
    .replace(/_/g, ' ')
    .trim()
    .toLowerCase();
}

function formatFilterToastValue(filter) {
  const rawValue = String(filter?.val || '').trim();
  if (!rawValue) {
    return '';
  }

  if (String(filter?.cond || '').toLowerCase() === 'between') {
    const [startValue, endValue] = rawValue.split('|').map(value => truncateToastValue(value));
    if (startValue && endValue) {
      return `${startValue} and ${endValue}`;
    }
    return startValue || endValue || '';
  }

  const values = rawValue
    .split(',')
    .map(value => truncateToastValue(value))
    .filter(Boolean);

  if (values.length === 0) {
    return '';
  }

  if (values.length === 1) {
    return values[0];
  }

  const previewValues = values.slice(0, 3).join(', ');
  return values.length > 3
    ? `${previewValues} (+${values.length - 3} more)`
    : previewValues;
}

function formatFilterEntryToast(entry) {
  if (!entry || !entry.field) {
    return 'filter';
  }

  const operatorLabel = getOperatorToastLabel(entry.filter?.cond);
  const valueLabel = formatFilterToastValue(entry.filter);
  return valueLabel
    ? `${entry.field} ${operatorLabel} ${valueLabel}`
    : `${entry.field} ${operatorLabel}`.trim();
}

function getDisplayedFieldsToastClause(previousSnapshot, nextSnapshot) {
  const { added, removed, orderChanged } = getDisplayedFieldDiff(previousSnapshot, nextSnapshot);

  if (orderChanged) {
    return 'reordered columns';
  }

  if (added.length === 1 && removed.length === 0) {
    return `added column ${truncateToastValue(added[0])}`;
  }

  if (removed.length === 1 && added.length === 0) {
    return `removed column ${truncateToastValue(removed[0])}`;
  }

  if (added.length > 0 && removed.length === 0) {
    return `added ${added.length} columns`;
  }

  if (removed.length > 0 && added.length === 0) {
    return `removed ${removed.length} columns`;
  }

  if (added.length > 0 || removed.length > 0) {
    return `updated columns (${added.length} added, ${removed.length} removed)`;
  }

  return 'updated columns';
}

function getActiveFiltersToastClause(previousSnapshot, nextSnapshot) {
  const { added, removed, reorderedGroups } = getActiveFilterDiff(previousSnapshot, nextSnapshot);

  if (reorderedGroups) {
    return 'reordered filter groups';
  }

  if (added.length === 1 && removed.length === 0) {
    return `applied filter ${formatFilterEntryToast(added[0])}`;
  }

  if (removed.length === 1 && added.length === 0) {
    return `removed filter ${formatFilterEntryToast(removed[0])}`;
  }

  if (added.length === 1 && removed.length === 1 && added[0].field === removed[0].field) {
    return `updated filter ${truncateToastValue(added[0].field)}`;
  }

  if (added.length > 0 && removed.length === 0) {
    return `applied ${added.length} filters`;
  }

  if (removed.length > 0 && added.length === 0) {
    return `removed ${removed.length} filters`;
  }

  if (added.length > 0 || removed.length > 0) {
    return `updated filters (${added.length} added, ${removed.length} removed)`;
  }

  return 'updated filters';
}

function getQueryChangeToastMessage(event) {
  const source = String(event?.meta?.source || '');
  const displayedFieldsChanged = Boolean(event?.changes?.displayedFields);
  const activeFiltersChanged = Boolean(event?.changes?.activeFilters);
  const previousSnapshot = event?.previousSnapshot || {};
  const nextSnapshot = event?.snapshot || {};

  if (source === 'QueryBuilderShell.groupMethodChange') {
    return 'Updated column grouping.';
  }

  if (displayedFieldsChanged && activeFiltersChanged) {
    return `${capitalizeToastMessage(getDisplayedFieldsToastClause(previousSnapshot, nextSnapshot))} and ${getActiveFiltersToastClause(previousSnapshot, nextSnapshot)}.`;
  }

  if (displayedFieldsChanged) {
    return `${capitalizeToastMessage(getDisplayedFieldsToastClause(previousSnapshot, nextSnapshot))}.`;
  }

  if (activeFiltersChanged) {
    return `${capitalizeToastMessage(getActiveFiltersToastClause(previousSnapshot, nextSnapshot))}.`;
  }

  return 'Query updated.';
}

export {
  getActiveFilterDiff,
  getDisplayedFieldDiff,
  getQueryChangeToastMessage,
  shouldSkipQueryChangeToast
};
