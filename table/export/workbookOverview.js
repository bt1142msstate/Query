const OVERVIEW_ROW_HEADER = 'Rows';
const OVERVIEW_PERCENT_HEADER = 'Percent of Total';
const OVERVIEW_TOTAL_LABEL = 'Total';
const OVERVIEW_PERCENT_FORMAT = '0.00%';

function getOverviewGroupCount(group) {
  if (Number.isFinite(group?.count)) {
    return Number(group.count);
  }
  if (Array.isArray(group?.rows)) {
    return group.rows.length;
  }
  return 0;
}

function getOverviewTotalCount(groups, totalRowCount) {
  if (Number.isFinite(totalRowCount)) {
    return Number(totalRowCount);
  }
  return groups.reduce((sum, group) => sum + getOverviewGroupCount(group), 0);
}

function getOverviewColumns(groupField) {
  return [groupField, OVERVIEW_ROW_HEADER, OVERVIEW_PERCENT_HEADER];
}

function buildOverviewRows(groups, totalRowCount) {
  const total = getOverviewTotalCount(groups, totalRowCount);
  const rows = groups.map(group => {
    const count = getOverviewGroupCount(group);
    return [
      group.label,
      count,
      total > 0 ? count / total : 0
    ];
  });

  rows.push([
    OVERVIEW_TOTAL_LABEL,
    total,
    total > 0 ? 1 : 0
  ]);

  return rows;
}

export {
  OVERVIEW_PERCENT_FORMAT,
  OVERVIEW_PERCENT_HEADER,
  OVERVIEW_ROW_HEADER,
  OVERVIEW_TOTAL_LABEL,
  buildOverviewRows,
  getOverviewColumns,
  getOverviewGroupCount,
  getOverviewTotalCount
};
