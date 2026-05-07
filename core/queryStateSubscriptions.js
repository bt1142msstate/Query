import { QueryStateReaders } from './queryState.js';

function subscribe(handler, options = {}) {
  if (typeof QueryStateReaders.subscribe !== 'function' || typeof handler !== 'function') {
    return () => {};
  }

  const {
    displayedFields = false,
    activeFilters = false,
    predicate = null
  } = options;

  const requireSpecificChanges = displayedFields || activeFilters;

  return QueryStateReaders.subscribe(event => {
    if (!event) {
      return;
    }

    if (requireSpecificChanges) {
      const matchesDisplayedFields = displayedFields && Boolean(event.changes?.displayedFields);
      const matchesActiveFilters = activeFilters && Boolean(event.changes?.activeFilters);
      if (!matchesDisplayedFields && !matchesActiveFilters) {
        return;
      }
    }

    if (typeof predicate === 'function' && !predicate(event)) {
      return;
    }

    handler(event);
  });
}

const QueryStateSubscriptions = Object.freeze({
  subscribe
});

export { QueryStateSubscriptions, subscribe };
