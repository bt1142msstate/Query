function normalizedText(value) {
  return String(value ?? '').trim();
}

function summaryValue(value, fallback = 'Not present') {
  const text = normalizedText(value);
  return text || fallback;
}

function formatIdentifierList(values) {
  const entries = Array.isArray(values)
    ? values.map(normalizedText).filter(Boolean)
    : [];
  return entries.length ? entries.join(', ') : 'Not present';
}

function filterComparisonRows(rows, mode = 'differences') {
  const safeRows = Array.isArray(rows) ? rows : [];
  switch (mode) {
    case 'all':
      return safeRows;
    case 'same':
      return safeRows.filter(row => row?.status === 'same');
    case 'local_only':
      return safeRows.filter(row => row?.status === 'local_only');
    case 'worldcat_only':
      return safeRows.filter(row => row?.status === 'worldcat_only');
    case 'differences':
    default:
      return safeRows.filter(row => row?.status !== 'same');
  }
}

function comparisonStatusLabel(status) {
  const labels = {
    same: 'Same',
    changed: 'Different',
    local_only: 'Local only',
    worldcat_only: 'WorldCat only'
  };
  return labels[status] || 'Review';
}

function matchConfidenceLabel(confidence) {
  const labels = {
    linked: 'Linked record',
    oclc_resolved: 'OCLC resolved',
    strong: 'Strong match',
    possible: 'Possible match',
    review: 'Review match'
  };
  return labels[confidence] || 'Review match';
}

function fieldLines(field) {
  if (!field) {
    return [];
  }
  if (field.control) {
    return [normalizedText(field.data) || '(blank)'];
  }

  const indicators = `${field.indicator1 || ' '}${field.indicator2 || ' '}`;
  const subfields = Array.isArray(field.subfields)
    ? field.subfields.map(subfield => `$${subfield?.code || '?'} ${normalizedText(subfield?.value)}`)
    : [];
  return [`Indicators ${indicators}`, ...subfields];
}

function searchInputMetadata(lookupType) {
  const metadata = {
    title: {
      label: 'Record title',
      placeholder: 'Enter title words',
      inputMode: 'search'
    },
    catalog_key: {
      label: 'Catalog key',
      placeholder: 'Enter catalog key',
      inputMode: 'numeric'
    },
    item_id: {
      label: 'Item ID',
      placeholder: 'Scan or enter item ID',
      inputMode: 'text'
    },
    isbn: {
      label: 'ISBN',
      placeholder: 'Enter ISBN-10 or ISBN-13',
      inputMode: 'numeric'
    }
  };
  return metadata[lookupType] || metadata.title;
}

export {
  comparisonStatusLabel,
  fieldLines,
  filterComparisonRows,
  formatIdentifierList,
  matchConfidenceLabel,
  searchInputMetadata,
  summaryValue
};
