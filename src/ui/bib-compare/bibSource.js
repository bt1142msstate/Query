const BIB_COMPARISON_FILTERS = Object.freeze([
  { id: 'differences', label: 'Changed', count: 'differences' },
  { id: 'all', label: 'All', count: 'all' },
  { id: 'local_only', label: 'Only in Symphony', count: 'local_only' },
  { id: 'worldcat_only', label: 'Only in source', count: 'worldcat_only' },
  { id: 'same', label: 'Same', count: 'same' }
]);

function bibliographicSource(payload = {}) {
  const code = payload?.source?.code === 'loc' || payload?.selection?.source === 'loc'
    ? 'loc'
    : 'oclc';
  const label = code === 'loc' ? 'Library of Congress' : 'OCLC WorldCat';
  const identifierLabel = code === 'loc' ? 'LCCN' : 'OCLC number';
  const identifier = code === 'loc'
    ? (payload?.selection?.lccn || '')
    : (payload?.selection?.oclc_number || payload?.worldcat?.summary?.oclc_number || '');
  return {
    code,
    label,
    shortLabel: code === 'loc' ? 'LC' : 'WorldCat',
    identifierLabel,
    identifier,
    record: payload?.external || payload?.worldcat || null,
    role: code === 'loc' ? 'fallback' : 'primary'
  };
}

function sourceReviewCount(review, tag) {
  return review?.[`source_${tag}_count`] ?? review?.[`worldcat_${tag}_count`] ?? '';
}

export { BIB_COMPARISON_FILTERS, bibliographicSource, sourceReviewCount };
