const globals = require('globals');

const allowedWindowAssignments = new Set([
  'BUBBLE_DEBUG',
  'BubbleConditionPanel',
  'BubbleInteraction',
  'BubbleReset',
  'BubbleSystem',
  'ClipboardUtils',
  'DOM',
  'DragDropSystem',
  'DragDropInteractions',
  'EventUtils',
  'FilterPill',
  'FilterSidePanel',
  'FilterValueUi',
  'FormModeControls',
  'FormModeStateHelpers',
  'ModalSystem',
  'MoneyUtils',
  'OperatorLabels',
  'OperatorSelectUtils',
  'PostFilterSystem',
  'QueryBuilderShell',
  'QueryFormMode',
  'QueryHistorySystem',
  'QueryHistoryViewHelpers',
  'QueryUI',
  'QueryTableView',
  'QueryStateSubscriptions',
  'SharedFieldPicker',
  'TableNameInput',
  'TableBuilder',
  'TextMeasurement',
  'ValueFormatting',
  'VirtualTable',
  'VisibilityUtils',
  'addColumn',
  'addQueryToHistory',
  'animatingBackBubbles',
  'buildBackendFilters',
  'buildBackendQueryPayload',
  'buildQueryUiConfig',
  'buildableConditionBtnHandler',
  'calculateCategoryCounts',
  'cancelQuery',
  'clearCurrentQuery',
  'collectCurrentSpecialFields',
  'configureInputsForType',
  'createBooleanPillSelector',
  'createQueryTableHeaderCell',
  'createBubblePopParticles',
  'createGroupedSelector',
  'createListPasteInput',
  'createPopupListControl',
  'currentCategory',
  'currentQueryState',
  'dismissToastMessage',
  'DragUtils',
  'DragDropColumnOps',
  'endTableQueryAnimation',
  'enhanceSearchInput',
  'ensureTableName',
  'escapeHtml',
  'escapeJsonHtml',
  'escapeRegExp',
  'fetchQueryStatus',
  'fieldAliases',
  'fieldDefs',
  'fieldDefsArray',
  'fieldOrDuplicatesExist',
  'filterCard',
  'filteredDefs',
  'finalizeConfirmAction',
  'findRelatedColumnIndices',
  'formatColumnsTooltip',
  'formatDuration',
  'formatFieldDefinitionTooltipHTML',
  'formatFieldOperatorForDisplay',
  'formatHistoryFiltersTooltip',
  'formatStandardFilterTooltipHTML',
  'FormatUtils',
  'getBaseFieldName',
  'getContradictionMessage',
  'getCurrentQueryState',
  'getDefaultTableName',
  'getDuplicateGroups',
  'getFieldFilterOperators',
  'getFieldOutputSegments',
  'getFilterDisplayValues',
  'getNormalizedDisplayedFields',
  'getSelectedCondition',
  'getTableZoom',
  'handleConditionBtnClick',
  'handleFilterConfirm',
  'hasLoadedFieldDefinitions',
  'hasPartialResults',
  'hasQueryChanged',
  'hoverScrollArea',
  'initializeSearchInputs',
  'Icons',
  'isBubbleAnimating',
  'isBubbleAnimatingBack',
  'isFieldBackendFilterable',
  'isListPasteField',
  'jsonTreeCollapsedPaths',
  'lastExecutedQueryState',
  'loadFieldDefinitions',
  'lockInput',
  'mapFieldOperatorToUiCond',
  'mapUiCondToFieldOperator',
  'modalManager',
  'normalizeUiConfigFilters',
  'onDOMReady',
  'openFilterListViewer',
  'parseListInputValues',
  'parsePipeDelimitedRow',
  'pendingRenderBubbles',
  'positionInputWrapper',
  'queryPageIsUnloading',
  'queryRunning',
  'refreshTableViewport',
  'registerDynamicField',
  'removeColumnByName',
  'removedColumnInfo',
  'renderCategorySelectors',
  'renderConditionList',
  'renderEmptyQueryTableState',
  'renderJsonNode',
  'renderJsonPrimitive',
  'renderJsonTree',
  'resetBubbleScrollState',
  'resetSplitColumnsToggleUI',
  'resolveFieldName',
  'restoreFieldWithDuplicates',
  'rowHeight',
  'scrollRow',
  'selectedField',
  'setBubbleDebug',
  'setSplitColumnsToggleUIActive',
  'setTableZoom',
  'shouldFieldHavePurpleStyling',
  'shouldFieldHavePurpleStylingBase',
  'shouldUseFilterListViewer',
  'showError',
  'showExampleTable',
  'showToast',
  'showToastMessage',
  'splitColumnsActive',
  'startTableQueryAnimation',
  'toast',
  'toggleTableExpanded',
  'totalRows',
  'CustomDatePicker',
  'TableContextMenu',
  'typeConditions',
  'updateButtonStates',
  'updateCategoryCounts',
  'updateFilteredDefs',
  'updateQueryJson',
  'updateTableQueryAnimationProgress',
  'updateRunButtonIcon',
  'updateSortHeadersUI',
  'updateSplitColumnsToggleState',
  'updateTableChromeState',
  'updateTableResultsLip'
]);

const localRules = {
  'no-unapproved-window-exports': {
    meta: {
      type: 'problem',
      docs: {
        description: 'Require new window exports to be added to the central allowlist.'
      },
      schema: [],
      messages: {
        unapproved: 'Unapproved window export "{{name}}". Add it to eslint.config.js only if this global API is intentional.'
      }
    },
    create(context) {
      return {
        AssignmentExpression(node) {
          if (node.operator !== '=') {
            return;
          }

          if (node.left.type !== 'MemberExpression' || node.left.computed) {
            return;
          }

          if (node.left.object.type !== 'Identifier' || node.left.object.name !== 'window') {
            return;
          }

          if (node.left.property.type !== 'Identifier') {
            return;
          }

          const exportName = node.left.property.name;
          if (allowedWindowAssignments.has(exportName)) {
            return;
          }

          context.report({
            node,
            messageId: 'unapproved',
            data: { name: exportName }
          });
        }
      };
    }
  }
};

module.exports = [
  {
    ignores: ['node_modules/**']
  },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'script',
      globals: {
        ...globals.browser,
        ...globals.node,
        AutoNumeric: 'readonly',
        ExcelJS: 'readonly',
        module: 'readonly'
      }
    },
    plugins: {
      local: {
        rules: localRules
      }
    },
    rules: {
      'no-unused-vars': ['error', {
        args: 'none',
        argsIgnorePattern: '^_',
        caughtErrors: 'all',
        caughtErrorsIgnorePattern: '^_',
        ignoreRestSiblings: true,
        varsIgnorePattern: '^_$'
      }],
      'local/no-unapproved-window-exports': 'error'
    }
  }
];
