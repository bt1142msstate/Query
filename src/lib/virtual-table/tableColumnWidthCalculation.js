export function shouldUseCompactMobileTable() {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(max-width: 1180px)').matches;
}

function getMeasuredCellText(value, type, fieldName, deps) {
  if (type === 'date') {
    return deps.valueFormatting.formatValueByType(value, type, {
      fieldName,
      invalidDateValue: 'Never',
      dateFallbackToRaw: true
    });
  }

  if (type === 'number' || type === 'money') {
    const numericValue = deps.parseNumericValue(value, type);
    if (!Number.isNaN(numericValue)) {
      return deps.valueFormatting.formatValueByType(numericValue, type, { fieldName });
    }
  }

  return String(value);
}

function measureSampledDataWidth(fieldName, data, deps) {
  if (!data?.rows?.length || !data?.columnMap?.has(fieldName)) {
    return 0;
  }

  const columnIndex = data.columnMap.get(fieldName);
  const type = deps.getFieldType(fieldName);
  const sampleStep = Math.max(1, Math.floor(data.rows.length / 1000));
  let maxWidth = 0;

  for (let index = 0; index < data.rows.length; index += sampleStep) {
    const value = data.rows[index][columnIndex];
    if (value == null) continue;
    const measuredValue = getMeasuredCellText(value, type, fieldName, deps);
    maxWidth = Math.max(maxWidth, deps.textMeasurement.measureText(measuredValue));
  }

  return maxWidth;
}

function getResponsiveWidthSettings(compactMobileTable, deps) {
  return {
    headerActionSpace: compactMobileTable ? 34 : deps.headerActionSpace,
    headerTextBalanceSpace: compactMobileTable ? 14 : deps.headerTextBalanceSpace,
    maxChars: compactMobileTable ? 32 : 50,
    minWidth: compactMobileTable ? 96 : 150,
    paddingAndBuffer: compactMobileTable ? 28 : 48 + 32
  };
}

export function calculateFieldWidth(fieldName, data = null, deps = {}) {
  const resolvedDeps = {
    getFieldType: deps.getFieldType,
    parseNumericValue: deps.parseNumericValue,
    textMeasurement: deps.textMeasurement,
    valueFormatting: deps.valueFormatting,
    headerActionSpace: deps.headerActionSpace ?? 116,
    headerTextBalanceSpace: deps.headerTextBalanceSpace ?? 116
  };
  const compactMobileTable = shouldUseCompactMobileTable();
  const settings = getResponsiveWidthSettings(compactMobileTable, resolvedDeps);
  const headerWidth = resolvedDeps.textMeasurement.measureText(fieldName.toUpperCase())
    + settings.headerActionSpace
    + settings.headerTextBalanceSpace;
  let maxWidth = Math.max(headerWidth, measureSampledDataWidth(fieldName, data, resolvedDeps));

  if (!data || !data.columnMap || !data.columnMap.has(fieldName)) {
    const placeholderWidth = resolvedDeps.textMeasurement.measureText('...');
    maxWidth = Math.max(maxWidth, placeholderWidth);
  }

  const requiredHeaderWidth = headerWidth + settings.paddingAndBuffer;
  const maxCharacterWidth = resolvedDeps.textMeasurement.measureText('A'.repeat(settings.maxChars)) + settings.paddingAndBuffer;
  const maxAllowedWidth = Math.max(maxCharacterWidth, requiredHeaderWidth);

  return Math.max(settings.minWidth, Math.min(maxAllowedWidth, maxWidth + settings.paddingAndBuffer));
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
