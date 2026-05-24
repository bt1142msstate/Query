export function shouldUseCompactMobileTable() {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(max-width: 1180px)').matches;
}

export function calculateFieldWidth(fieldName, data = null, deps = {}) {
  const {
    getFieldType,
    parseNumericValue,
    textMeasurement,
    valueFormatting,
    headerActionSpace = 116,
    headerTextBalanceSpace = 116
  } = deps;

  let maxWidth = 0;
  const compactMobileTable = shouldUseCompactMobileTable();
  const resolvedHeaderActionSpace = compactMobileTable ? 34 : headerActionSpace;
  const resolvedHeaderTextBalanceSpace = compactMobileTable ? 14 : headerTextBalanceSpace;

  const headerWidth = textMeasurement.measureText(fieldName.toUpperCase()) + resolvedHeaderActionSpace + resolvedHeaderTextBalanceSpace;
  maxWidth = Math.max(maxWidth, headerWidth);

  if (data && data.rows && data.rows.length > 0) {
    const columnIndex = data.columnMap.get(fieldName);
    if (columnIndex !== undefined) {
      const type = getFieldType(fieldName);
      const sampleStep = Math.max(1, Math.floor(data.rows.length / 1000));

      for (let i = 0; i < data.rows.length; i += sampleStep) {
        const value = data.rows[i][columnIndex];
        if (value != null) {
          let measuredValue = String(value);
          if (type === 'date') {
            measuredValue = valueFormatting.formatValueByType(value, type, {
              fieldName,
              invalidDateValue: 'Never',
              dateFallbackToRaw: true
            });
          } else if (type === 'number' || type === 'money') {
            const numericValue = parseNumericValue(value, type);
            if (!isNaN(numericValue)) {
              measuredValue = valueFormatting.formatValueByType(numericValue, type, { fieldName });
            }
          }
          const textWidth = textMeasurement.measureText(measuredValue);
          maxWidth = Math.max(maxWidth, textWidth);
        }
      }
    }
  }

  if (!data || !data.columnMap || !data.columnMap.has(fieldName)) {
    const placeholderWidth = textMeasurement.measureText('...');
    maxWidth = Math.max(maxWidth, placeholderWidth);
  }

  const paddingAndBuffer = compactMobileTable ? 28 : 48 + 32;
  const requiredHeaderWidth = headerWidth + paddingAndBuffer;
  const maxCharacterWidth = textMeasurement.measureText('A'.repeat(compactMobileTable ? 32 : 50)) + paddingAndBuffer;
  const maxAllowedWidth = Math.max(maxCharacterWidth, requiredHeaderWidth);

  return Math.max(compactMobileTable ? 96 : 150, Math.min(maxAllowedWidth, maxWidth + paddingAndBuffer));
}

export function calculateOptimalColumnWidths(fields, data, deps = {}) {
  const targetFields = fields || data?.headers || [];
  if (!targetFields.length) {
    return {};
  }

  const widths = {};
  targetFields.forEach(field => {
    widths[field] = calculateFieldWidth(field, data, deps);
  });

  return widths;
}
