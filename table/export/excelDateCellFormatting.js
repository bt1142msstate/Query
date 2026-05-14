function alignDateTextCells(worksheet, sourceData, exportedRows) {
  if (!worksheet || !sourceData || !Array.isArray(exportedRows)) {
    return;
  }

  sourceData.displayedFields.forEach((field, fieldIndex) => {
    if (sourceData.fieldTypeMap.get(field) !== 'date') {
      return;
    }

    exportedRows.forEach((row, rowIndex) => {
      const value = row?.values?.[fieldIndex];
      if (typeof value !== 'string' || !value.trim()) {
        return;
      }

      const cell = typeof worksheet.getCell === 'function'
        ? worksheet.getCell(rowIndex + 2, fieldIndex + 1)
        : null;
      if (cell) {
        cell.alignment = { ...(cell.alignment || {}), horizontal: 'right' };
      }
    });
  });
}

export { alignDateTextCells };
