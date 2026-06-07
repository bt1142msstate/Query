import assert from 'node:assert/strict';
import { bindFormModeTableNameUrlSync } from '../../../src/ui/form-mode/formModeTableNameSync.js';
import test from 'node:test';

test('form mode table name sync', async () => {
  function createInput(value = '') {
    const listeners = new Map();
    return {
      placeholder: '',
      value,
      addEventListener(type, callback) {
        listeners.set(type, callback);
      },
      dispatch(type) {
        const callback = listeners.get(type);
        if (callback) callback();
      },
      listenerCount() {
        return listeners.size;
      }
    };
  }

  {
    const tableNameInput = createInput('Updated Query');
    const state = {
      active: true,
      formCard: {},
      isClearingQuery: false,
      spec: { title: '', queryName: '', inputs: [] },
      tableNameListenersBound: false
    };
    let headerSyncCount = 0;
    let refreshCount = 0;

    const didBind = bindFormModeTableNameUrlSync({
      state,
      tableNameInput,
      collectFormBindings(spec) {
        assert.equal(spec, state.spec);
        return { title: 'Updated Query' };
      },
      getCurrentInputValues() {
        return [];
      },
      supportsMultipleValues() {
        return false;
      },
      getInputParamKeys() {
        return [];
      },
      syncFormHeaderCopy(formCard, spec, bindings) {
        assert.equal(formCard, state.formCard);
        assert.equal(spec, state.spec);
        assert.deepEqual(bindings, { title: 'Updated Query' });
        headerSyncCount += 1;
      },
      interpolateValue(value) {
        return value;
      },
      refreshBrowserUrl() {
        refreshCount += 1;
      }
    });

    assert.equal(didBind, true);
    assert.equal(tableNameInput.placeholder, 'No name');
    assert.equal(tableNameInput.listenerCount(), 2);

    tableNameInput.dispatch('input');

    assert.equal(state.spec.title, 'Updated Query');
    assert.equal(state.spec.queryName, 'Updated Query');
    assert.equal(headerSyncCount, 1);
    assert.equal(refreshCount, 1);

    assert.equal(bindFormModeTableNameUrlSync({ state, tableNameInput }), false);
  }

  {
    const tableNameInput = createInput('Ignored');
    const state = {
      active: true,
      isClearingQuery: true,
      spec: { title: 'Existing', queryName: 'Existing' },
      tableNameListenersBound: false
    };

    bindFormModeTableNameUrlSync({
      state,
      tableNameInput,
      collectFormBindings() {
        throw new Error('should not collect while clearing');
      },
      refreshBrowserUrl() {
        throw new Error('should not refresh while clearing');
      }
    });

    tableNameInput.dispatch('change');

    assert.equal(state.spec.title, 'Existing');
    assert.equal(state.spec.queryName, 'Existing');
  }
});
