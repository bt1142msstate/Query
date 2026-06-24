const sourceEntries = ['src'];
const publicModuleEntrypoints = ['src/components/index.js'];
const maxModuleLines = 900;
const runtimeBridgeUsageBudget = {
  maxDistinctMembers: 0,
  maxMemberReferences: 0,
  forbiddenMembers: new Set([
    'AppUiActions',
    'AppState',
    'AppServices',
    'activeFilters',
    'BackendApi',
    'BUBBLE_DEBUG',
    'BubbleConditionPanel',
    'BubbleInteraction',
    'BubbleReset',
    'BubbleSystem',
    'calculateCategoryCounts',
    'clearCurrentQuery',
    'ClipboardUtils',
    'CustomDatePicker',
    'DOM',
    'dismissToastMessage',
    'DragDropInteractions',
    'DragDropSystem',
    'escapeHtml',
    'escapeRegExp',
    'EventUtils',
    'fieldAliases',
    'fieldDefs',
    'fieldDefsArray',
    'fieldOrDuplicatesExist',
    'filteredDefs',
    'filterCard',
    'FilterPill',
    'FilterSidePanel',
    'formatDuration',
    'findRelatedColumnIndices',
    'finalizeConfirmAction',
    'buildableConditionBtnHandler',
    'configureInputsForType',
    'createBubblePopParticles',
    'getContradictionMessage',
    'getFieldFilterOperators',
    'getFieldOutputSegments',
    'getBaseFieldName',
    'getCurrentQueryState',
    'getDuplicateGroups',
    'getSelectedCondition',
    'getLiteralToDisplayMap',
    'handleConditionBtnClick',
    'handleFilterConfirm',
    'hasLoadedFieldDefinitions',
    'Icons',
    'isFieldBackendFilterable',
    'isListPasteField',
    'loadFieldDefinitions',
    'lockInput',
    'modalManager',
    'ModalSystem',
    'onDOMReady',
    'OperatorLabels',
    'parsePipeDelimitedRow',
    'positionInputWrapper',
    'removedColumnInfo',
    'JsonViewerUI',
    'QueryHistoryViewHelpers',
    'QueryPrevalidation',
    'QueryChangeManager',
    'QueryBuilderShell',
    'QueryFormMode',
    'QueryHistorySystem',
    'QueryTableAnimation',
    'QueryTableView',
    'QueryTemplatesSystem',
    'QueryUI',
    'QueryStateReaders',
    'QueryStateStore',
    'QueryStateSubscriptions',
    'PostFilterSystem',
    'registerDynamicField',
    'renderConditionList',
    'renderCategorySelectors',
    'resolveFieldName',
    'restoreFieldWithDuplicates',
    'shouldFieldHavePurpleStyling',
    'shouldFieldHavePurpleStylingBase',
    'showToast',
    'showToastMessage',
    'splitColumnsActive',
    'toast',
    'TableNameInput',
    'TableContextMenu',
    'typeConditions',
    'displayedFields',
    'resetSplitColumnsToggleUI',
    'setSplitColumnsToggleUIActive',
    'setBubbleDebug',
    'updateCategoryCounts',
    'updateFilteredDefs',
    'VisibilityUtils',
    'VirtualList',
    'VirtualTable'
  ])
};

const couplingModularityBudgets = {
  largeCoordinatorLineThreshold: 850,
  highFanOutThreshold: 10,
  maxAverageFanOut: 3,
  maxEntrypointFanOut: 55,
  maxLargeCoordinatorCount: 9,
  maxLargeHighFanOutCoordinatorCount: 7,
  maxModuleFanIn: 32,
  maxNonEntrypointFanOut: 30
};

const maintainabilityBudgets = {
  maxCognitiveComplexityByLayer: {
    components: 25,
    core: 110,
    filters: 110,
    history: 35,
    lib: 35,
    table: 55,
    templates: 45,
    ui: 45
  },
  maxDepthByLayer: {
    components: 5,
    core: 6,
    filters: 6,
    history: 6,
    lib: 6,
    table: 6,
    templates: 6,
    ui: 6
  },
  maxFunctionLinesByLayer: {
    components: 300,
    core: 260,
    filters: 310,
    history: 260,
    lib: 300,
    table: 300,
    templates: 260,
    ui: 760
  },
  maxModuleLinesByLayer: {
    components: 650,
    core: 800,
    filters: 900,
    history: 900,
    lib: 800,
    table: 900,
    templates: 900,
    ui: 900
  },
  maxParams: 8,
  maxCyclomaticComplexityByLayer: {
    components: 25,
    core: 60,
    filters: 90,
    history: 30,
    lib: 40,
    table: 45,
    templates: 55,
    ui: 45
  }
};

const folderModularityBudgets = {
  ignoredFolders: ['src/appModules.js'],
  maxExternalImportsPerModule: 7,
  maxIncomingExternalImportsPerModule: 12,
  maxLowCohesionFolderCount: 0,
  minImportsForCohesionCheck: 8,
  minInternalImportRatio: 0.03,
  minModulesForCohesionCheck: 3
};

const changeCouplingBudgets = {
  commitLimit: 300,
  highConfidenceThreshold: 0.9,
  maxCrossFolderHighConfidencePairs: 4,
  maxFilesPerCommit: 25,
  minCoChanges: 4
};

const forbiddenWindowMemberReads = new Map([
  ['AppState', 'Import from src/core/queryState.js instead of reading AppState from window'],
  ['AppServices', 'Import from src/core/appServices.js instead of reading app service facade from window'],
  ['AppUiActions', 'Import from src/core/appUiActions.js instead of reading UI action facade from window'],
  ['BackendApi', 'Import from src/core/backendApi.js instead of reading the backend client from window'],
  ['ClipboardUtils', 'Import from src/core/clipboard.js instead of reading clipboard helpers from window'],
  ['DragDropColumnOps', 'Import from src/features/table/drag-drop/dragDropColumns.js or register with query state accessors instead of reading column ops from window'],
  ['DragUtils', 'Keep drag data-transfer helpers local to the table drag/drop module instead of reading drag helpers from window'],
  ['escapeRegExp', 'Import from src/core/formatting/dataFormatters.js instead of reading this formatter from window'],
  ['formatDuration', 'Import from src/core/formatting/dataFormatters.js instead of reading this formatter from window'],
  ['FilterValueUi', 'Import from src/features/filters/filterValueUi.js instead of reading filter value helpers from window'],
  ['FormatUtils', 'Import from src/core/formatting/cellDisplayFormatting.js instead of reading format helpers from window'],
  ['FormModeControls', 'Import from src/ui/form-mode/formModeControls.js instead of reading form controls from window'],
  ['FormModeStateHelpers', 'Import from src/ui/form-mode/formModeStateHelpers.js instead of reading form state helpers from window'],
  ['getFieldOutputSegments', 'Import from src/core/formatting/dataFormatters.js instead of reading this formatter from window'],
  ['Icons', 'Import from src/core/icons.js instead of reading icon helpers from window'],
  ['MoneyUtils', 'Import from src/core/formatting/moneyUtils.js instead of reading money helpers from window'],
  ['onDOMReady', 'Import from src/core/domReady.js instead of reading DOM lifecycle helpers from window'],
  ['OperatorLabels', 'Import from src/core/formatting/operatorLabels.js instead of reading operator labels from window'],
  ['OperatorSelectUtils', 'Import from src/core/operatorSelectUtils.js instead of reading operator select helpers from window'],
  ['parsePipeDelimitedRow', 'Import from src/core/formatting/dataFormatters.js instead of reading this formatter from window'],
  ['QueryChangeManager', 'Import from src/core/queryState.js instead of reading query state mutations from window'],
  ['QueryStateSubscriptions', 'Import from src/core/queryStateSubscriptions.js instead of reading query state subscriptions from window'],
  ['QueryStateReaders', 'Import from src/core/queryState.js instead of reading query state selectors from window'],
  ['SearchUI', 'Import from src/ui/controls/searchUI.js instead of reading search helpers from window'],
  ['SelectorControls', 'Import from src/ui/controls/selectorControls.js instead of reading selector controls from window'],
  ['SharedFieldPicker', 'Import from src/ui/field-picker/fieldPicker.js instead of reading shared field picker from window'],
  ['TableBuilder', 'Import from src/lib/virtual-table/tableBuilder.js instead of reading table builder helpers from window'],
  ['TextMeasurement', 'Import from src/core/textMeasurement.js instead of reading text measurement helpers from window'],
  ['TooltipManager', 'Import from src/core/formatting/tooltipFormatters.js for formatting or src/ui/tooltips.js for tooltip behavior instead of reading tooltip helpers from window'],
  ['VisibilityUtils', 'Import from src/core/visibility.js instead of reading visibility helpers from window'],
  ['dismissToastMessage', 'Import from src/core/toast.js instead of reading toast helpers from window'],
  ['showToast', 'Import from src/core/toast.js instead of reading toast helpers from window'],
  ['showToastMessage', 'Import from src/core/toast.js instead of reading toast helpers from window'],
  ['toast', 'Import from src/core/toast.js instead of reading toast helpers from window'],
  ['ValueFormatting', 'Import from src/core/formatting/valueFormatting.js instead of reading value-formatting helpers from window'],
  ['buildBackendFilters', 'Import from src/features/filters/queryPayload.js instead of reading this helper from window'],
  ['buildBackendQueryPayload', 'Import from src/features/filters/queryPayload.js instead of reading this helper from window'],
  ['buildQueryUiConfig', 'Import from src/features/filters/queryPayload.js instead of reading this helper from window'],
  ['formatFieldOperatorForDisplay', 'Import from src/features/filters/queryPayload.js instead of reading this helper from window'],
  ['getNormalizedDisplayedFields', 'Import from src/features/filters/queryPayload.js instead of reading this helper from window'],
  ['mapFieldOperatorToUiCond', 'Import from src/features/filters/queryPayload.js instead of reading this helper from window'],
  ['mapUiCondToFieldOperator', 'Import from src/features/filters/queryPayload.js instead of reading this helper from window'],
  ['normalizeUiConfigFilters', 'Import from src/features/filters/queryPayload.js instead of reading this helper from window']
]);

const legacyLargeModuleBudgets = new Map([]);

const moduleBoundaryRules = [
  {
    path: 'src/appModules.js',
    allowedLayers: ['core', 'filters', 'history', 'lib', 'templates', 'ui', 'table']
  },
  {
    path: 'src/core/appUiActions.js',
    allowedLayers: ['core', 'ui']
  },
  {
    path: 'src/core/bootstrap.js',
    allowedLayers: ['core', 'ui']
  },
  {
    path: 'src/core/queryExecution.js',
    allowedLayers: ['core', 'filters', 'ui']
  },
  {
    prefix: 'src/core/',
    allowedLayers: ['core']
  },
  {
    prefix: 'src/components/',
    allowedLayers: ['components', 'core', 'lib', 'ui']
  },
  {
    prefix: 'src/lib/',
    allowedLayers: ['core', 'lib']
  },
  {
    prefix: 'src/features/filters/',
    allowedLayers: ['core', 'filters', 'ui']
  },
  {
    prefix: 'src/features/history/',
    allowedLayers: ['core', 'filters', 'history']
  },
  {
    prefix: 'src/ui/',
    allowedLayers: ['core', 'filters', 'ui']
  },
  {
    prefix: 'src/features/table/',
    allowedLayers: ['core', 'filters', 'lib', 'table', 'ui']
  },
  {
    prefix: 'src/features/templates/',
    allowedLayers: ['core', 'filters', 'templates']
  }
];

module.exports = {
  changeCouplingBudgets,
  forbiddenWindowMemberReads,
  couplingModularityBudgets,
  folderModularityBudgets,
  legacyLargeModuleBudgets,
  maintainabilityBudgets,
  maxModuleLines,
  moduleBoundaryRules,
  publicModuleEntrypoints,
  runtimeBridgeUsageBudget,
  sourceEntries
};
