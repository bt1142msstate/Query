import assert from 'node:assert/strict';
import test from 'node:test';

test('displayed field move and removal forward optimistic render metadata', async () => {
  const { QueryChangeManager, QueryStateReaders } = await import('../../../src/core/queryState.js');

  QueryChangeManager.setQueryState({
    displayedFields: ['Title', 'Branch', 'Status'],
    activeFilters: {}
  }, { source: 'QueryStateMutationMeta.seed', silent: true });

  const events = [];
  const unsubscribe = QueryStateReaders.subscribe(event => {
    events.push(event);
  });

  try {
    QueryChangeManager.moveDisplayedField(0, 2, {
      optimisticTableDomAlreadySynced: true,
      skipProjectionSync: true,
      source: 'QueryStateMutationMeta.move'
    });

    assert.deepEqual(QueryStateReaders.getDisplayedFields(), ['Branch', 'Status', 'Title']);
    const moveEvent = events.find(event => event.meta?.source === 'QueryStateMutationMeta.move');
    assert.equal(moveEvent?.meta?.optimisticTableDomAlreadySynced, true);
    assert.equal(moveEvent?.meta?.skipProjectionSync, true);

    QueryChangeManager.removeDisplayedField('Status', {
      optimisticTableDomAlreadySynced: true,
      source: 'QueryStateMutationMeta.remove'
    });

    assert.deepEqual(QueryStateReaders.getDisplayedFields(), ['Branch', 'Title']);
    const removeEvent = events.find(event => event.meta?.source === 'QueryStateMutationMeta.remove');
    assert.equal(removeEvent?.meta?.optimisticTableDomAlreadySynced, true);
  } finally {
    unsubscribe();
  }
});
