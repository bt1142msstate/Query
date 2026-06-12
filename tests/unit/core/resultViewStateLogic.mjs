import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import test from 'node:test';
import {
  RESULT_VIEW_URL_PARAM,
  applyResultViewState,
  decodeResultViewStateParam,
  encodeResultViewState,
  normalizeResultViewState,
  readResultViewStateFromLocation
} from '../../../src/core/resultViewState.js';

test('result view state normalizes and encodes view settings only', () => {
  globalThis.btoa = globalThis.btoa || (value => Buffer.from(value, 'binary').toString('base64'));
  globalThis.atob = globalThis.atob || (value => Buffer.from(value, 'base64').toString('binary'));

  const viewState = normalizeResultViewState({
    displayedFields: ['Status', '', 'Title'],
    fieldSearch: ' status ',
    headers: ['Title', 'Status'],
    objectRows: [{ Title: 'Loaded object data should not be included' }],
    rows: [['Loaded row data should not be included']],
    postFilters: {
      Status: {
        logic: 'any',
        filters: [
          { cond: 'equals', val: 'Open' },
          { cond: '', val: '' }
        ]
      }
    },
    splitColumns: true,
    collapseDuplicateRows: false
  });

  assert.deepEqual(viewState, {
    version: 1,
    displayedFields: ['Status', 'Title'],
    fieldSearch: 'status',
    postFilters: {
      Status: {
        logic: 'any',
        filters: [{ cond: 'equals', val: 'Open' }]
      }
    },
    splitColumns: true,
    collapseDuplicateRows: false
  });

  const encoded = encodeResultViewState(viewState);
  const decoded = decodeResultViewStateParam(encoded);
  assert.deepEqual(decoded, viewState);
  assert.equal(JSON.stringify(decoded).includes('Loaded row data'), false);
  assert.equal(JSON.stringify(decoded).includes('Loaded object data'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(decoded, 'rows'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(decoded, 'objectRows'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(decoded, 'headers'), false);
  assert.deepEqual(normalizeResultViewState(null), { version: 1 });
});

test('result view state reads only for the matching result id', () => {
  const encoded = encodeResultViewState({
    displayedFields: ['Status'],
    splitColumns: false,
    collapseDuplicateRows: false
  });
  const url = `https://example.test/index.html?result=query-123&${RESULT_VIEW_URL_PARAM}=${encoded}`;

  assert.deepEqual(readResultViewStateFromLocation(url, { queryId: 'query-123' }), {
    version: 1,
    displayedFields: ['Status'],
    splitColumns: false,
    collapseDuplicateRows: false
  });
  assert.equal(readResultViewStateFromLocation(url, { queryId: 'other-query' }), null);
});

test('result view state restore clears stale post filters when a shared view has none', () => {
  const calls = [];

  applyResultViewState({
    displayedFields: ['Status'],
    splitColumns: false,
    collapseDuplicateRows: false
  }, {
    queryChangeManager: {
      replaceDisplayedFields(fields, meta) {
        calls.push({ fields, meta, type: 'fields' });
      }
    },
    services: {
      isSplitColumnsActive: () => true,
      isDuplicateRowCollapseActive: () => true,
      replacePostFilters(filters, options) {
        calls.push({ filters, options, type: 'postFilters' });
      },
      setSplitColumnsMode(value) {
        calls.push({ type: 'split', value });
      },
      setDuplicateRowCollapseMode(value) {
        calls.push({ type: 'duplicateCollapse', value });
      }
    },
    uiState: {
      setFieldSearch(value) {
        calls.push({ type: 'fieldSearch', value });
      }
    },
    uiActions: {
      resetSplitColumnsToggleUI() {
        calls.push({ type: 'toggleReset' });
      },
      resetDuplicateRowsToggleUI() {
        calls.push({ type: 'duplicateToggleReset' });
      }
    }
  });

  assert.deepEqual(calls.find(call => call.type === 'postFilters')?.filters, {});
  assert.deepEqual(calls.find(call => call.type === 'fields')?.fields, ['Status']);
  assert.equal(calls.find(call => call.type === 'fieldSearch'), undefined);
  assert.equal(calls.find(call => call.type === 'split')?.value, false);
  assert.equal(calls.find(call => call.type === 'duplicateCollapse')?.value, false);
});

test('result view state restore can apply field search text', () => {
  const calls = [];

  applyResultViewState({
    fieldSearch: 'branch'
  }, {
    services: {
      replacePostFilters(filters) {
        calls.push({ filters, type: 'postFilters' });
      }
    },
    uiState: {
      setFieldSearch(value) {
        calls.push({ type: 'fieldSearch', value });
      }
    }
  });

  assert.deepEqual(calls, [
    { type: 'fieldSearch', value: 'branch' },
    { type: 'postFilters', filters: {} }
  ]);
});
