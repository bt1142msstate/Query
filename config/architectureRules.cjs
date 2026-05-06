const sourceEntries = ['appModules.js', 'bubbles', 'core', 'filters', 'table', 'ui'];
const maxModuleLines = 900;

const forbiddenWindowMemberReads = new Map([
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
  ['core/queryHistory.js', 1213],
  ['core/queryState.js', 1191],
  ['core/queryTemplates.js', 1593],
  ['core/utils.js', 1219],
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
