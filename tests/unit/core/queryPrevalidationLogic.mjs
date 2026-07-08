import assert from 'node:assert/strict';
import test from 'node:test';

import { replaceFieldDefinitions } from '../../../src/core/fieldDefs.js';
import { validateQueryChange } from '../../../src/core/queryPrevalidation.js';

test('query prevalidation rejects unauthorized displayed fields', () => {
  replaceFieldDefinitions([
    { name: 'Title', type: 'string' },
    {
      name: 'Checkout User Name',
      type: 'string',
      authorized: false,
      authMessage: 'Sign in with an authorized staff account.'
    }
  ], { restoreDynamicFields: false });

  const result = validateQueryChange({
    meta: { toast: false },
    nextState: {
      activeFilters: {},
      displayedFields: ['Title', 'Checkout User Name']
    }
  });

  assert.equal(result.accepted, false);
  assert.equal(result.message, 'Sign in with an authorized staff account.');
});

test('query prevalidation rejects unauthorized filter fields', () => {
  replaceFieldDefinitions([
    {
      name: 'Checkout User ID',
      type: 'string',
      authorized: false
    }
  ], { restoreDynamicFields: false });

  const result = validateQueryChange({
    meta: { toast: false },
    nextState: {
      activeFilters: {
        'Checkout User ID': {
          filters: [{ cond: 'equals', val: '000009015' }]
        }
      },
      displayedFields: []
    }
  });

  assert.equal(result.accepted, false);
  assert.match(result.message, /Checkout User ID requires sign-in/u);
});

test('query manager showField rejects unauthorized displayed fields', async () => {
  const { QueryChangeManager, QueryStateReaders } = await import('../../../src/core/queryState.js');

  replaceFieldDefinitions([
    { name: 'Title', type: 'string' },
    {
      name: 'Checkout User Name',
      type: 'string',
      authorized: false,
      authMessage: 'Sign in with an authorized staff account.'
    }
  ], { restoreDynamicFields: false });

  QueryChangeManager.setQueryState({
    activeFilters: {},
    displayedFields: ['Title']
  }, { silent: true, source: 'queryPrevalidation.seed' });

  const result = QueryChangeManager.showField('Checkout User Name', {
    toast: false,
    source: 'queryPrevalidation.showField'
  });

  assert.equal(result, false);
  assert.deepEqual(QueryStateReaders.getDisplayedFields(), ['Title']);
});
