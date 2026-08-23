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

function summarizeLibraryScopeSelection(selected = [], systems = [], libraries = []) {
  const selectedValues = (Array.isArray(selected) ? selected : []).map(String);
  if (!selectedValues.length) return [];

  const selectedSet = new Set(selectedValues);
  const normalizedLibraries = normalizeLibraryScopeOptions(libraries);
  const wholeSystem = normalizeLibraryScopeOptions(systems).find(system => {
    const code = systemCodeForLibraryScope(system.value);
    const systemLibraries = normalizedLibraries.filter(library => systemCodeForLibraryScope(library.value) === code);
    return systemLibraries.length > 0
      && systemLibraries.length === selectedSet.size
      && systemLibraries.every(library => selectedSet.has(String(library.value)));
  });
  if (wholeSystem) return [wholeSystem.label];

  const labels = new Map(normalizedLibraries.map(option => [String(option.value), option.label]));
  return selectedValues.map(value => labels.get(value) || value);
}

function systemCodeForLibraryScope(scope = '') {
  const normalized = String(scope || '').replace(/^system:/u, '');
  return normalized && normalized !== 'all' ? normalized.split('-')[0].toUpperCase() : '';
}

export {
  ALL_LIBRARY_SYSTEMS_LABEL,
  buildLibraryScopeGroups,
  buildLibraryScopeSelectorValues,
  summarizeLibraryScopeSelection,
  systemCodeForLibraryScope
};
