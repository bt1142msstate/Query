const APP_MODULES = [
  './core/utils.js?v=19',
  './filters/fieldDefs.js?v=8',
  './ui/toast.js?v=2',
  './core/queryPrevalidation.js?v=2',
  './core/queryState.js?v=26',
  './ui/domCache.js?v=3',
  './core/appServices.js?v=3',
  './core/appUiActions.js?v=5',
  './ui/conditionEditorLayout.js?v=1',
  './ui/searchUI.js?v=1',
  './ui/selectorControls.js?v=2',
  './ui/customDatePicker.js?v=8',
  './ui/fieldPicker.js?v=24',
  './ui/queryUI.js?v=25',
  './ui/queryTableView.js?v=5',
  './ui/jsonViewerUI.js?v=3',
  './ui/queryAnimation.js?v=12',
  './filters/queryPayload.js?v=8',
  './ui/tooltips.js?v=9',
  './table/simpleTable.js?v=1',
  './table/virtualTable.js?v=25',
  './table/excel.js?v=13',
  './table/postFilters.js?v=17',
  './ui/modalManager.js?v=3',
  './filters/filterValueUi.js?v=2',
  './filters/filterManager.js?v=39',
  './filters/filterSidePanel.js?v=1773930000003',
  './core/queryHistoryViewHelpers.js?v=1',
  './core/queryHistory.js?v=17',
  './core/queryTemplates.js?v=2',
  './table/columnManager.js?v=3',
  './table/dragDropColumns.js?v=3',
  './table/dragDropInteractions.js?v=3',
  './table/dragDrop.js?v=20',
  './table/contextMenu.js?v=3',
  './bubbles/bubble.js?v=13',
  './bubbles/bubbleReset.js?v=6',
  './bubbles/bubbleInteraction.js?v=10',
  './ui/queryBuilderShell.js?v=7',
  './ui/tableNameInput.js?v=3',
  './core/queryExecution.js?v=14',
  './ui/formModeStateHelpers.js?v=6',
  './ui/formModeControls.js?v=11',
  './ui/formMode.js?v=1773931000035',
  './core/bootstrap.js?v=2'
];

window.__QUERY_APP_MODULES_READY = false;
window.__QUERY_APP_MODULES_ERROR = null;

(async function loadAppModules() {
  for (const modulePath of APP_MODULES) {
    await import(modulePath);
  }

  window.__QUERY_APP_MODULES_READY = true;
  window.dispatchEvent(new CustomEvent('query-app:modules-ready'));
})().catch(error => {
  window.__QUERY_APP_MODULES_ERROR = error;
  console.error('Failed to load application modules:', error);
  window.dispatchEvent(new CustomEvent('query-app:modules-error', { detail: { error } }));
  throw error;
});
