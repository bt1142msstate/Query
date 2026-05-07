const sourceEntries = ['appModules.js', 'bubbles', 'core', 'filters', 'table', 'ui'];
const maxModuleLines = 900;
const appRuntimeUsageBudget = {
  maxDistinctMembers: 59,
  maxMemberReferences: 413,
  forbiddenMembers: new Set([
    'calculateCategoryCounts',
    'fieldAliases',
    'fieldDefs',
    'fieldDefsArray',
    'filteredDefs',
    'getFieldFilterOperators',
    'hasLoadedFieldDefinitions',
    'isFieldBackendFilterable',
    'loadFieldDefinitions',
    'registerDynamicField',
    'renderCategorySelectors',
    'resolveFieldName',
    'shouldFieldHavePurpleStyling',
    'shouldFieldHavePurpleStylingBase',
    'updateFilteredDefs'
  ])
};

const forbiddenWindowMemberReads = new Map([
  ['AppState', 'Import from core/queryState.js instead of reading app runtime state from window'],
  ['AppServices', 'Import from core/appServices.js instead of reading app service facade from window'],
  ['AppUiActions', 'Import from core/appUiActions.js instead of reading UI action facade from window'],
  ['BackendApi', 'Import from core/backendApi.js instead of reading the backend client from window'],
  ['ClipboardUtils', 'Import from core/clipboard.js instead of reading clipboard helpers from window'],
  ['DragDropColumnOps', 'Import from table/dragDropColumns.js or register with query state accessors instead of reading column ops from window'],
  ['DragUtils', 'Import from core/dragUtils.js instead of reading drag helpers from window'],
  ['escapeRegExp', 'Import from core/dataFormatters.js instead of reading this formatter from window'],
  ['formatDuration', 'Import from core/dataFormatters.js instead of reading this formatter from window'],
  ['FilterValueUi', 'Import from filters/filterValueUi.js instead of reading filter value helpers from window'],
  ['FormatUtils', 'Import from core/utils.js instead of reading format helpers from window'],
  ['FormModeControls', 'Import from ui/formModeControls.js instead of reading form controls from window'],
  ['FormModeStateHelpers', 'Import from ui/formModeStateHelpers.js instead of reading form state helpers from window'],
  ['getFieldOutputSegments', 'Import from core/dataFormatters.js instead of reading this formatter from window'],
  ['Icons', 'Import from core/icons.js instead of reading icon helpers from window'],
  ['MoneyUtils', 'Import from core/utils.js instead of reading money helpers from window'],
  ['onDOMReady', 'Import from core/domReady.js instead of reading DOM lifecycle helpers from window'],
  ['OperatorLabels', 'Import from core/operatorLabels.js instead of reading operator labels from window'],
  ['OperatorSelectUtils', 'Import from core/utils.js instead of reading operator select helpers from window'],
  ['parsePipeDelimitedRow', 'Import from core/dataFormatters.js instead of reading this formatter from window'],
  ['QueryChangeManager', 'Import from core/queryState.js instead of reading query state mutations from window'],
  ['QueryStateSubscriptions', 'Import from core/queryStateSubscriptions.js instead of reading query state subscriptions from window'],
  ['QueryStateReaders', 'Import from core/queryState.js instead of reading query state selectors from window'],
  ['SearchUI', 'Import from ui/searchUI.js instead of reading search helpers from window'],
  ['SelectorControls', 'Import from ui/selectorControls.js instead of reading selector controls from window'],
  ['SharedFieldPicker', 'Import from ui/fieldPicker.js instead of reading shared field picker from window'],
  ['TableBuilder', 'Import from core/utils.js instead of reading table builder helpers from window'],
  ['TextMeasurement', 'Import from core/utils.js instead of reading text measurement helpers from window'],
  ['TooltipManager', 'Import from core/tooltipFormatters.js for formatting or ui/tooltips.js for tooltip behavior instead of reading tooltip helpers from window'],
  ['VisibilityUtils', 'Import from core/visibility.js instead of reading visibility helpers from window'],
  ['dismissToastMessage', 'Import from core/toast.js instead of reading toast helpers from window'],
  ['showToast', 'Import from core/toast.js instead of reading toast helpers from window'],
  ['showToastMessage', 'Import from core/toast.js instead of reading toast helpers from window'],
  ['toast', 'Import from core/toast.js instead of reading toast helpers from window'],
  ['ValueFormatting', 'Import from core/utils.js instead of reading value-formatting helpers from window'],
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
  appRuntimeUsageBudget,
  forbiddenWindowMemberReads,
  legacyLargeModuleBudgets,
  maxModuleLines,
  moduleBoundaryRules,
  sourceEntries
};
