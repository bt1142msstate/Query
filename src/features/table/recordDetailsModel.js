const IDENTIFIER_FIELDS = new Map([
  ['catalogkey', 'Catalog key'], ['catalogid', 'Catalog key'], ['bibkey', 'Catalog key'],
  ['itemid', 'Item ID'], ['itembarcode', 'Item ID'], ['barcode', 'Barcode'], ['itemkey', 'Item key'],
  ['callnumberkey', 'Call number key'], ['userkey', 'User key'], ['userid', 'User ID'],
  ['patronid', 'User ID'], ['controlnumber', 'Control number'], ['oclcnumber', 'OCLC number'],
  ['isbn', 'ISBN'], ['issn', 'ISSN']
]);

function normalizeRecordFieldName(value) {
  return String(value || '').toLocaleLowerCase().replace(/[^a-z0-9]+/gu, '');
}

function flattenRecordValue(value) {
  if (Array.isArray(value)) return value.flatMap(flattenRecordValue);
  if (value && typeof value === 'object') {
    try { return [JSON.stringify(value)]; } catch (_) { return [String(value)]; }
  }
  return [String(value ?? '')];
}

function inferRecordKind(fieldNames) {
  const names = new Set(fieldNames.map(normalizeRecordFieldName));
  if (['userid', 'userkey', 'patronid', 'patronkey'].some(name => names.has(name))) {
    return { key: 'user', label: 'Patron record' };
  }
  if (['itemid', 'itembarcode', 'barcode', 'itemkey'].some(name => names.has(name))) {
    return { key: 'item', label: 'Item record' };
  }
  if (['callnumberkey', 'callkey'].some(name => names.has(name))) {
    return { key: 'call_number', label: 'Call number record' };
  }
  if (['catalogkey', 'catalogid', 'bibkey', 'controlnumber'].some(name => names.has(name))) {
    return { key: 'bibliographic', label: 'Bibliographic record' };
  }
  return { key: 'result', label: 'Query result' };
}

function firstFieldValue(fields, aliases) {
  const normalizedAliases = new Set(aliases.map(normalizeRecordFieldName));
  const match = fields.find(field => normalizedAliases.has(field.normalizedName) && !field.isEmpty);
  return match?.values?.[0] || '';
}

function buildRecordDetailsModel({ headers = [], row = [], displayedFields = [] } = {}) {
  const safeHeaders = Array.isArray(headers) ? headers : [];
  const safeRow = Array.isArray(row) ? row : [];
  const displayed = new Set((displayedFields || []).map(String));
  const fields = safeHeaders.map((name, index) => {
    const values = flattenRecordValue(safeRow[index]);
    const normalizedName = normalizeRecordFieldName(name);
    const isEmpty = values.every(value => !String(value).trim());
    return {
      index,
      name: String(name || `Field ${index + 1}`),
      normalizedName,
      values,
      isEmpty,
      isIdentifier: IDENTIFIER_FIELDS.has(normalizedName),
      identifierLabel: IDENTIFIER_FIELDS.get(normalizedName) || '',
      isDisplayed: displayed.has(String(name || ''))
    };
  });
  const kind = inferRecordKind(fields.map(field => field.name));
  const title = firstFieldValue(fields, ['title', 'username', 'patronname', 'name'])
    || firstFieldValue(fields, ['itemid', 'barcode', 'catalogkey', 'userid', 'callnumber'])
    || kind.label;
  const identifiers = fields.filter(field => field.isIdentifier && !field.isEmpty);
  const nonEmptyCount = fields.filter(field => !field.isEmpty).length;
  return {
    copyText: fields.map(field => `${field.name}: ${field.isEmpty ? '(blank)' : field.values.join(' | ')}`).join('\n'),
    fields,
    identifiers,
    kind,
    nonEmptyCount,
    title,
    totalCount: fields.length
  };
}

export { buildRecordDetailsModel, flattenRecordValue, inferRecordKind, normalizeRecordFieldName };
