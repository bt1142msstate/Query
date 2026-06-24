import assert from 'node:assert/strict';
import test from 'node:test';
import { hydrateHistoryResultTable } from '../../../src/features/history/results/queryHistoryResultsLoader.js';

test('history result hydration marks restored displayed fields as the executed baseline', async () => {
  let displayedFields = ['Title', 'Status'];
  let virtualTableData = null;
  const lifecycleCalls = [];
  const renderedFields = [];

  await hydrateHistoryResultTable({
    headers: ['Title', 'Status'],
    rows: [['Example title', 'Open']],
    queryStateReaders: {
      getDisplayedFields() {
        return displayedFields;
      },
      getSerializableState() {
        return {
          activeFilters: {},
          displayedFields: [...displayedFields],
          groupMethod: 'ExpandIntoColumns'
        };
      }
    },
    queryChangeManager: {
      replaceDisplayedFields(fields) {
        displayedFields = [...fields];
      },
      setLifecycleState(patch, meta) {
        lifecycleCalls.push({ patch, meta });
      }
    },
    viewState: {
      displayedFields: ['Status']
    },
    services: {
      getVirtualTableData() {
        return virtualTableData;
      },
      isSplitColumnsActive() {
        return false;
      },
      replacePostFilters() {},
      renderVirtualTable() {},
      setVirtualTableData(data) {
        virtualTableData = data;
      },
    },
    uiState: {},
    uiActions: {
      async showExampleTable(fields) {
        renderedFields.push([...fields]);
      },
      syncTableViewportHeight() {},
      updateButtonStates() {},
      updateSplitColumnsToggleState() {}
    }
  });

  assert.deepEqual(displayedFields, ['Status']);
  assert.deepEqual(renderedFields, [['Status']]);
  assert.equal(lifecycleCalls.length, 1);
  assert.deepEqual(lifecycleCalls[0], {
    patch: {
      lastExecutedQueryState: {
        activeFilters: {},
        displayedFields: ['Status'],
        groupMethod: 'ExpandIntoColumns'
      }
    },
    meta: {
      silent: true,
      source: 'QueryHistory.hydrateResultState'
    }
  });
});
