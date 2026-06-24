function shouldPreservePostFiltersForRun({
  lifecycleState,
  queryStateReaders,
  services
} = {}) {
  return Boolean(
    lifecycleState?.hasLoadedResultSet
    && services?.hasPostFilters?.()
    && typeof queryStateReaders?.hasQueryChanged === 'function'
    && !queryStateReaders.hasQueryChanged()
  );
}

export { shouldPreservePostFiltersForRun };
