import assert from 'node:assert/strict';
import test from 'node:test';

test('backend-defined filter groups drive dynamic field matching', async () => {
  globalThis.window = globalThis;
  window.setTimeout = setTimeout;
  window.clearTimeout = clearTimeout;

  const { QueryChangeManager } = await import('../../../src/core/queryState.js');
  const {
    registerDynamicField,
    replaceFieldDefinitions
  } = await import('../../../src/core/fieldDefs.js');
  const {
    collectActiveFilterGroups,
    getFilterGroupLogicPayload,
    restoreFilterGroupLogic,
    setFilterGroupLogic
  } = await import('../../../src/features/filters/filterGroupLogic.js');

  replaceFieldDefinitions([
    {
      name: 'Local Metadata Field',
      filters: ['equals', 'is_blank'],
      builder: {
        outputFieldIdTemplate: 'Local Metadata {code}',
        matchPattern: '^Local Metadata\\s+[A-Z0-9]+$',
        inputs: [{ id: 'code', label: 'Code' }]
      },
      filterGroup: {
        id: 'local_metadata',
        label: 'Local metadata conditions',
        description: 'Choose how related conditions are matched.',
        defaultLogic: 'all',
        minConditions: 2,
        legacyPayloadKeys: ['old_local_logic']
      }
    }
  ], { restoreDynamicFields: false });

  const first = registerDynamicField('Local Metadata ALPHA', { persist: false });
  const second = registerDynamicField('Local Metadata BETA', { persist: false });
  assert.equal(first.filterGroup.id, 'local_metadata');
  assert.equal(second.filterGroup.id, 'local_metadata');

  const activeFilters = {
    'Local Metadata ALPHA': {
      filters: [{ cond: 'is_blank', val: '' }]
    },
    'Local Metadata BETA': {
      filters: [{ cond: 'is_blank', val: '' }]
    }
  };
  QueryChangeManager.setQueryState({
    displayedFields: ['Local Metadata ALPHA', 'Local Metadata BETA'],
    activeFilters
  }, { source: 'FilterGroupLogic.test' });

  assert.deepEqual(collectActiveFilterGroups(activeFilters), [{
    id: 'local_metadata',
    label: 'Local metadata conditions',
    description: 'Choose how related conditions are matched.',
    defaultLogic: 'all',
    minConditions: 2,
    legacyPayloadKeys: ['old_local_logic'],
    conditionCount: 2
  }]);
  assert.deepEqual(getFilterGroupLogicPayload(activeFilters), {
    local_metadata: 'all'
  });

  setFilterGroupLogic('local_metadata', 'any');
  assert.deepEqual(getFilterGroupLogicPayload(activeFilters), {
    local_metadata: 'any'
  });

  restoreFilterGroupLogic([{ old_local_logic: 'all' }]);
  assert.deepEqual(getFilterGroupLogicPayload(activeFilters), {
    local_metadata: 'all'
  });
});
