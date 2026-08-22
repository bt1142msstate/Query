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

function buildLibraryScopeSelectorValues(systems = [], libraries = []) {
  const systemLabels = new Map(normalizeLibraryScopeOptions(systems).map(option => [
    systemCodeForLibraryScope(option.value), option.label
  ]));
  const libraryOptions = normalizeLibraryScopeOptions(libraries).map(option => ({
    RawValue: option.value,
    Display: option.label,
    Group: systemLabels.get(systemCodeForLibraryScope(option.value)) || systemCodeForLibraryScope(option.value) || 'Item libraries'
  }));
  return libraryOptions;
}

function systemCodeForLibraryScope(scope = '') {
  const normalized = String(scope || '').replace(/^system:/u, '');
  return normalized && normalized !== 'all' ? normalized.split('-')[0].toUpperCase() : '';
}

export {
  ALL_LIBRARY_SYSTEMS_LABEL,
  buildLibraryScopeGroups,
  buildLibraryScopeSelectorValues,
  systemCodeForLibraryScope
};
