import assert from 'node:assert/strict';
import test from 'node:test';
import { buildNextState } from '../../../src/core/queryPrevalidationState.js';

test('query prevalidation state builds displayed-field transitions', () => {
  const currentState = {
    activeFilters: {},
    displayedFields: ['Title', 'Author', 'Barcode']
  };

  assert.deepEqual(
    buildNextState(currentState, 'addDisplayedField', [['Call Number', 'Item Library'], { insertAt: 1 }]).displayedFields,
    ['Title', 'Call Number', 'Item Library', 'Author', 'Barcode']
  );

  assert.deepEqual(
    buildNextState(currentState, 'removeDisplayedField', ['Author', { all: false }]).displayedFields,
    ['Title', 'Barcode']
  );

  assert.deepEqual(
    buildNextState(currentState, 'moveDisplayedField', [0, 3, { behavior: 'group', count: 2 }]).displayedFields,
    ['Barcode', 'Title', 'Author']
  );
});

test('query prevalidation state builds filter transitions', () => {
  const currentState = {
    displayedFields: ['Title'],
    activeFilters: {
      Title: {
        filters: [
          { cond: 'contains', val: 'history' },
          { cond: 'starts', val: 'old' }
        ]
      },
      Author: {
        filters: [{ cond: 'equals', val: 'Smith' }]
      }
    }
  };

  assert.deepEqual(
    buildNextState(currentState, 'upsertFilter', ['Title', { cond: 'contains', val: 'history' }, { dedupe: true }]),
    currentState
  );

  assert.deepEqual(
    buildNextState(currentState, 'upsertFilter', ['Title', { cond: 'contains', val: 'science' }, { replaceByCond: true }]).activeFilters.Title.filters,
    [
      { cond: 'starts', val: 'old' },
      { cond: 'contains', val: 'science' }
    ]
  );

  assert.deepEqual(
    buildNextState(currentState, 'removeFilter', ['Title', { cond: 'starts' }]).activeFilters.Title.filters,
    [{ cond: 'contains', val: 'history' }]
  );

  assert.deepEqual(
    Object.keys(buildNextState(currentState, 'reorderFilterGroups', [['Author', 'Title']]).activeFilters),
    ['Author', 'Title']
  );
});
