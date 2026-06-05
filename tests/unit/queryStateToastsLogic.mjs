import assert from 'node:assert/strict';
import {
  getActiveFilterDiff,
  getDisplayedFieldDiff,
  getQueryChangeToastMessage,
  shouldSkipQueryChangeToast
} from '../../core/queryStateToasts.js';
import test from 'node:test';

test('query state toasts', async () => {
  assert.equal(shouldSkipQueryChangeToast({ toast: false }), true);
  assert.equal(shouldSkipQueryChangeToast({ source: 'QueryFormMode.applyFormState' }), true);
  assert.equal(shouldSkipQueryChangeToast({ source: 'SharedFieldPicker.addField' }), true);
  assert.equal(shouldSkipQueryChangeToast({ source: 'QueryChangeManager.addDisplayedField' }), false);

  assert.deepEqual(
    getDisplayedFieldDiff(
      { displayedFields: ['Title', 'Author'] },
      { displayedFields: ['Author', 'Title'] }
    ),
    { added: [], removed: [], orderChanged: true }
  );

  assert.deepEqual(
    getDisplayedFieldDiff(
      { displayedFields: ['Title'] },
      { displayedFields: ['Title', 'Barcode'] }
    ),
    { added: ['Barcode'], removed: [], orderChanged: false }
  );

  assert.deepEqual(
    getActiveFilterDiff(
      { activeFilters: { Title: { filters: [{ cond: 'contains', val: 'history' }] } } },
      {
        activeFilters: {
          Title: { filters: [{ cond: 'contains', val: 'history' }] },
          Author: { filters: [{ cond: 'equals', val: 'Smith' }] }
        }
      }
    ),
    {
      added: [
        {
          field: 'Author',
          filter: { cond: 'equals', val: 'Smith' },
          key: 'Author::equals::Smith'
        }
      ],
      removed: [],
      reorderedGroups: false
    }
  );

  assert.equal(
    getQueryChangeToastMessage({
      changes: { displayedFields: true, activeFilters: false },
      previousSnapshot: { displayedFields: ['Title'] },
      snapshot: { displayedFields: ['Title', 'Author'] }
    }),
    'Added column Author.'
  );

  assert.equal(
    getQueryChangeToastMessage({
      changes: { displayedFields: false, activeFilters: true },
      previousSnapshot: { activeFilters: {} },
      snapshot: {
        activeFilters: {
          BillCount: {
            filters: [{ cond: 'greater', val: '2' }]
          }
        }
      }
    }),
    'Applied filter BillCount greater than 2.'
  );

  assert.equal(
    getQueryChangeToastMessage({
      changes: { displayedFields: true, activeFilters: true },
      previousSnapshot: {
        displayedFields: ['Title'],
        activeFilters: {}
      },
      snapshot: {
        displayedFields: ['Title', 'Author'],
        activeFilters: {
          BillCount: {
            filters: [{ cond: 'between', val: '2|5' }]
          }
        }
      }
    }),
    'Added column Author and applied filter BillCount between 2 and 5.'
  );

  assert.equal(
    getQueryChangeToastMessage({
      meta: { source: 'QueryBuilderShell.groupMethodChange' },
      changes: {}
    }),
    'Updated column grouping.'
  );
});
