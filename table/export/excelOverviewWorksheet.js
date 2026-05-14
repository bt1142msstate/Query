import {
  OVERVIEW_PERCENT_FORMAT,
  buildOverviewRows,
  getOverviewColumns
} from './workbookOverview.js';

function addOverviewWorksheet(workbook, { groups, groupField, getUniqueSheetName, usedNames }) {
  const overviewSheet = workbook.addWorksheet(getUniqueSheetName('Overview', usedNames));
  const overviewRows = buildOverviewRows(groups);
  const overviewColumns = getOverviewColumns(groupField);

  overviewSheet.views = [{ state: 'frozen', ySplit: 1 }];
  overviewSheet.columns = [
    { header: overviewColumns[0], key: 'group', width: 26 },
    { header: overviewColumns[1], key: 'count', width: 12 },
    { header: overviewColumns[2], key: 'percent', width: 18 }
  ];
  overviewSheet.addTable({
    name: `Overview_${Date.now()}`,
    ref: 'A1',
    headerRow: true,
    style: { theme: 'TableStyleMedium2', showRowStripes: true },
    columns: overviewColumns.map(name => ({ name, filterButton: true })),
    rows: overviewRows
  });
  overviewSheet.getColumn(2).alignment = { horizontal: 'right' };
  overviewSheet.getColumn(3).alignment = { horizontal: 'right' };
  overviewSheet.getColumn(3).numFmt = OVERVIEW_PERCENT_FORMAT;
}

export { addOverviewWorksheet };
