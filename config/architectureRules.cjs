const sourceEntries = ['appModules.js', 'bubbles', 'core', 'filters', 'table', 'ui'];
const maxModuleLines = 900;

const forbiddenWindowMemberReads = new Map([
  ['AppState', 'Import from core/queryState.js instead of reading app runtime state from window'],
  ['AppServices', 'Import from core/appServices.js instead of reading app service facade from window'],
  ['AppUiActions', 'Import from core/appUiActions.js instead of reading UI action facade from window'],
  ['BackendApi', 'Import from core/backendApi.js instead of reading the backend client from window'],
  ['ClipboardUtils', 'Import from core/clipboard.js instead of reading clipboard helpers from window'],
  ['DragUtils', 'Import from core/dragUtils.js instead of reading drag helpers from window'],
  ['escapeRegExp', 'Import from core/dataFormatters.js instead of reading this formatter from window'],
  ['formatDuration', 'Import from core/dataFormatters.js instead of reading this formatter from window'],
  ['getFieldOutputSegments', 'Import from core/dataFormatters.js instead of reading this formatter from window'],
  ['Icons', 'Import from core/icons.js instead of reading icon helpers from window'],
  ['onDOMReady', 'Import from core/domReady.js instead of reading DOM lifecycle helpers from window'],
  ['OperatorLabels', 'Import from core/operatorLabels.js instead of reading operator labels from window'],
  ['parsePipeDelimitedRow', 'Import from core/dataFormatters.js instead of reading this formatter from window'],
  ['QueryChangeManager', 'Import from core/queryState.js instead of reading query state mutations from window'],
  ['QueryStateSubscriptions', 'Import from core/queryStateSubscriptions.js instead of reading query state subscriptions from window'],
  ['QueryStateReaders', 'Import from core/queryState.js instead of reading query state selectors from window'],
  ['VisibilityUtils', 'Import from core/visibility.js instead of reading visibility helpers from window'],
  ['dismissToastMessage', 'Import from core/toast.js instead of reading toast helpers from window'],
  ['showToast', 'Import from core/toast.js instead of reading toast helpers from window'],
  ['showToastMessage', 'Import from core/toast.js instead of reading toast helpers from window'],
  ['toast', 'Import from core/toast.js instead of reading toast helpers from window'],
  ['buildBackendFilters', 'Import from filters/queryPayload.js instead of reading this helper from window'],
  ['buildBackendQueryPayload', 'Import from filters/queryPayload.js instead of reading this helper from window'],
  ['buildQueryUiConfig', 'Import from filters/queryPayload.js instead of reading this helper from window'],
  ['collectCurrentSpecialFields', 'Import from filters/queryPayload.js instead of reading this helper from window'],
  ['formatFieldOperatorForDisplay', 'Import from filters/queryPayload.js instead of reading this helper from window'],
  ['getNormalizedDisplayedFields', 'Import from filters/queryPayload.js instead of reading this helper from window'],
  ['mapFieldOperatorToUiCond', 'Import from filters/queryPayload.js instead of reading this helper from window'],
  ['mapUiCondToFieldOperator', 'Import from filters/queryPayload.js instead of reading this helper from window'],
  ['normalizeUiConfigFilters', 'Import from filters/queryPayload.js instead of reading this helper from window']
]);

const legacyLargeModuleBudgets = new Map([
  ['core/queryHistory.js', 1208],
  ['core/queryState.js', 1191],
  ['core/queryTemplates.js', 1592],
  ['core/utils.js', 674],
  ['filters/filterManager.js', 1371],
  ['table/dragDropInteractions.js', 1348],
  ['table/postFilters.js', 1109],
  ['table/virtualTable.js', 1383],
  ['ui/fieldPicker.js', 1266],
  ['ui/formMode.js', 2034]
]);

const moduleBoundaryRules = [
  {
    path: 'appModules.js',
    allowedLayers: ['core', 'filters', 'ui', 'table', 'bubbles']
  },
  {
    path: 'core/appUiActions.js',
    allowedLayers: ['core', 'ui']
  },
  {
    path: 'core/bootstrap.js',
    allowedLayers: ['core', 'ui']
  },
  {
    path: 'core/queryExecution.js',
    allowedLayers: ['core', 'filters', 'ui']
  },
  {
    prefix: 'core/',
    allowedLayers: ['core', 'filters']
  },
  {
    prefix: 'filters/',
    allowedLayers: ['core', 'filters', 'ui']
  },
  {
    prefix: 'ui/',
    allowedLayers: ['core', 'filters', 'ui']
  },
  {
    prefix: 'table/',
    allowedLayers: ['core', 'filters', 'table', 'ui']
  },
  {
    prefix: 'bubbles/',
    allowedLayers: ['core', 'filters', 'ui', 'bubbles']
  }
];

module.exports = {
  forbiddenWindowMemberReads,
  legacyLargeModuleBudgets,
  maxModuleLines,
  moduleBoundaryRules,
  sourceEntries
};
