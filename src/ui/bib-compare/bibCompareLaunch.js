const LOOKUP_FIELDS = Object.freeze([
  {
    lookupType: 'catalog_key',
    aliases: ['catalogkey', 'catalogid', 'bibkey']
  },
  {
    lookupType: 'item_id',
    aliases: ['itemid', 'itembarcode', 'barcode']
  },
  {
    lookupType: 'title',
    aliases: ['title']
  }
]);

function normalizeFieldName(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/gu, '');
}

function normalizeLookupValue(value) {
  if (Array.isArray(value)) {
    return value.map(normalizeLookupValue).find(Boolean) || '';
  }
  return String(value ?? '').trim();
}

function lookupHint(lookupType, query) {
  if (lookupType === 'catalog_key') return `Catalog ${query}`;
  if (lookupType === 'item_id') return `Item ${query}`;
  return query;
}

function resolveBibCompareLookup(fields = [], values = []) {
  const rowValues = new Map();
  fields.forEach((field, index) => {
    const normalizedField = normalizeFieldName(field);
    const value = normalizeLookupValue(values[index]);
    if (normalizedField && value && !rowValues.has(normalizedField)) {
      rowValues.set(normalizedField, value);
    }
  });

  for (const lookup of LOOKUP_FIELDS) {
    const matchingAlias = lookup.aliases.find(alias => rowValues.has(alias));
    if (!matchingAlias) continue;
    const query = rowValues.get(matchingAlias);
    return {
      hint: lookupHint(lookup.lookupType, query),
      lookupType: lookup.lookupType,
      query
    };
  }

  return null;
}

export {
  normalizeFieldName,
  resolveBibCompareLookup
};
