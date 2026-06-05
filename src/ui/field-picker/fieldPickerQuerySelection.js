function parseFieldPickerInsertAt(value) {
  const parsedInsertAt = Number.isInteger(value)
    ? value
    : Number.parseInt(String(value ?? ''), 10);
  return Number.isInteger(parsedInsertAt) ? parsedInsertAt : -1;
}

function buildNextDisplayedFieldsForPicker(
  currentFields,
  fieldName,
  nextChecked,
  insertAt = -1,
  matchesBase = (column, field) => column === field
) {
  const fields = Array.isArray(currentFields) ? currentFields : [];
  if (!nextChecked) {
    return fields.filter(column => !matchesBase(column, fieldName));
  }

  if (fields.some(column => matchesBase(column, fieldName))) {
    return fields;
  }

  if (insertAt >= 0 && insertAt <= fields.length) {
    const next = fields.slice();
    next.splice(insertAt, 0, fieldName);
    return next;
  }

  return [...fields, fieldName];
}

export {
  buildNextDisplayedFieldsForPicker,
  parseFieldPickerInsertAt
};
