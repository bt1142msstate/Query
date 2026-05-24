function getFieldValueDisplayMap(fieldDef) {
  const values = Array.isArray(fieldDef?.values) ? fieldDef.values : [];
  if (!values.length || typeof values[0] !== 'object') {
    return new Map();
  }

  return new Map(
    values
      .map(value => [value?.RawValue, value?.Name])
      .filter(([rawValue, displayValue]) => rawValue !== undefined && displayValue !== undefined)
  );
}

export { getFieldValueDisplayMap };
