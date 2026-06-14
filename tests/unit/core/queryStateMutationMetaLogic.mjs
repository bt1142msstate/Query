import assert from 'node:assert/strict';
import test from 'node:test';

test('displayed field add, move, and removal forward render metadata', async () => {
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
    QueryChangeManager.addDisplayedField('Barcode', {
      insertAt: 1,
      skipPostFilterRefresh: true,
      source: 'QueryStateMutationMeta.add'
    });

    assert.deepEqual(QueryStateReaders.getDisplayedFields(), ['Title', 'Barcode', 'Branch', 'Status']);
    const addEvent = events.find(event => event.meta?.source === 'QueryStateMutationMeta.add');
    assert.equal(addEvent?.meta?.insertAt, 1);
    assert.equal(addEvent?.meta?.skipPostFilterRefresh, true);

    QueryChangeManager.moveDisplayedField(0, 2, {
      optimisticTableDomAlreadySynced: true,
      skipProjectionSync: true,
      source: 'QueryStateMutationMeta.move'
    });

    assert.deepEqual(QueryStateReaders.getDisplayedFields(), ['Barcode', 'Branch', 'Title', 'Status']);
    const moveEvent = events.find(event => event.meta?.source === 'QueryStateMutationMeta.move');
    assert.equal(moveEvent?.meta?.optimisticTableDomAlreadySynced, true);
    assert.equal(moveEvent?.meta?.skipProjectionSync, true);

    QueryChangeManager.removeDisplayedField('Status', {
      optimisticTableDomAlreadySynced: true,
      source: 'QueryStateMutationMeta.remove'
    });

    assert.deepEqual(QueryStateReaders.getDisplayedFields(), ['Barcode', 'Branch', 'Title']);
    const removeEvent = events.find(event => event.meta?.source === 'QueryStateMutationMeta.remove');
    assert.equal(removeEvent?.meta?.optimisticTableDomAlreadySynced, true);
  } finally {
    unsubscribe();
  }
});
