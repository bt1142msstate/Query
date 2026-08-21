import assert from 'node:assert/strict';
import test from 'node:test';

function permutations(values) {
  if (values.length <= 1) return [values.slice()];
  return values.flatMap((value, index) => permutations([
    ...values.slice(0, index),
    ...values.slice(index + 1)
  ]).map(rest => [value, ...rest]));
}

test('column add, remove, and move mutations preserve filters and payload order under pressure', async () => {
  globalThis.window = globalThis;
  window.setTimeout = setTimeout;
  window.clearTimeout = clearTimeout;

  const { QueryChangeManager, QueryStateReaders } = await import('../../../src/core/queryState.js');
  const { fieldAliases, fieldDefs } = await import('../../../src/features/filters/fieldDefs.js');
  const { buildBackendQueryPayload } = await import('../../../src/features/filters/queryPayload.js');

  fieldDefs.clear();
  fieldAliases.clear();
  const fields = ['Catalog Key', 'Title', 'Call Number', 'Call Number Library', 'MARC 856'];
  fields.forEach(name => fieldDefs.set(name, { name, filters: name === 'Catalog Key' ? ['equals'] : [] }));
  fieldDefs.set('Public Note', { name: 'Public Note', filters: [], multiValue: true });

  QueryChangeManager.setQueryState({
    displayedFields: ['Catalog Key', 'Title', 'Call Number'],
    activeFilters: {
      'Catalog Key': { filters: [{ cond: 'equals', val: '3368808' }] }
    }
  }, { source: 'QueryColumnMutationPressure.seed', silent: true });

  assert.equal(QueryChangeManager.addDisplayedField('Call Number Library', { insertAt: 1 }), true);
  assert.deepEqual(QueryStateReaders.getDisplayedFields(), [
    'Catalog Key', 'Call Number Library', 'Title', 'Call Number'
  ]);

  assert.equal(QueryChangeManager.moveDisplayedField(3, 0), true);
  assert.deepEqual(QueryStateReaders.getDisplayedFields(), [
    'Call Number', 'Catalog Key', 'Call Number Library', 'Title'
  ]);

  assert.equal(QueryChangeManager.removeDisplayedField('Title'), true);
  assert.equal(QueryChangeManager.addDisplayedField(['MARC 856', 'Public Note'], { insertAt: 2 }), true);
  assert.deepEqual(QueryStateReaders.getDisplayedFields(), [
    'Call Number', 'Catalog Key', 'MARC 856', 'Public Note', 'Call Number Library'
  ]);
  assert.deepEqual(QueryStateReaders.getActiveFilters(), {
    'Catalog Key': { filters: [{ cond: 'equals', val: '3368808' }] }
  });

  for (const order of permutations(fields)) {
    QueryChangeManager.replaceDisplayedFields(order, {
      source: 'QueryColumnMutationPressure.permutation',
      silent: true
    });
    const payload = buildBackendQueryPayload('Column Mutation Pressure');
    assert.deepEqual(payload.display_fields, order);
    assert.deepEqual(payload.filters, [
      { field: 'Catalog Key', operator: '=', value: '3368808' }
    ]);
  }

  QueryChangeManager.replaceDisplayedFields(['Title'], {
    source: 'QueryColumnMutationPressure.minimum',
    silent: true
  });
  assert.deepEqual(buildBackendQueryPayload('Minimum Column Pressure').display_fields, ['Title']);
  assert.deepEqual(QueryStateReaders.getActiveFilters(), {
    'Catalog Key': { filters: [{ cond: 'equals', val: '3368808' }] }
  });
});
