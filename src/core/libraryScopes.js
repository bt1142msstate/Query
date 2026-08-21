const ALL_LIBRARY_SYSTEMS_LABEL = 'All library systems';

function normalizeLibraryScopeOptions(options = []) {
  return (Array.isArray(options) ? options : []).map(option => typeof option === 'string'
    ? { value: option, label: option }
    : { value: option.value ?? option.code, label: option.label ?? option.name ?? option.code });
}

function buildLibraryScopeGroups(systems = [], libraries = []) {
  return [
    { label: 'Library systems', options: normalizeLibraryScopeOptions(systems) },
    { label: 'Item libraries', options: normalizeLibraryScopeOptions(libraries) }
  ].filter(group => group.options.length > 0);
}

function systemCodeForLibraryScope(scope = '') {
  const normalized = String(scope || '').replace(/^system:/u, '');
  return normalized && normalized !== 'all' ? normalized.split('-')[0].toUpperCase() : '';
}

export { ALL_LIBRARY_SYSTEMS_LABEL, buildLibraryScopeGroups, systemCodeForLibraryScope };
