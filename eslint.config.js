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
  'JsonViewerUI',
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
  'hasQueryChanged',
  'hoverScrollArea',
  'initializeSearchInputs',
  'Icons',
  'isBubbleAnimating',
  'isBubbleAnimatingBack',
  'isFieldBackendFilterable',
  'isListPasteField',
  'jsonTreeCollapsedPaths',
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
  'refreshTableViewport',
  'registerDynamicField',
  'removedColumnInfo',
  'renderCategorySelectors',
  'renderConditionList',
  'renderEmptyQueryTableState',
  'renderJsonNode',
  'renderJsonPrimitive',
  'renderJsonTree',
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
  'updateCategoryCounts',
  'updateFilteredDefs',
  'updateTableQueryAnimationProgress',
  'updateSortHeadersUI',
  'updateSplitColumnsToggleState',
  'updateTableChromeState'
]);

const restrictedQueryStateReadMethods = new Set([
  'getSnapshot',
  'getSerializableState',
  'getDisplayedFields',
  'getActiveFilters',
  'getFilterGroupForField',
  'hasDisplayedField',
  'hasFiltersForField'
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
  },
  'no-restricted-query-state-access': {
    meta: {
      type: 'problem',
      docs: {
        description: 'Prevent bypassing the approved query-state read/write surfaces.'
      },
      schema: [],
      messages: {
        privateStore: 'window.QueryStateStore is private. Use window.QueryChangeManager or window.QueryStateReaders.',
        readerViaManager: 'Read query state via window.QueryStateReaders. Reserve window.QueryChangeManager for writes.',
        blockedAppStateAlias: 'Use window.AppState.{{name}} instead of the blocked global alias window.{{name}}.',
        lifecycleViaAppState: 'Read query lifecycle via window.QueryStateReaders.getLifecycleState() or window.QueryStateReaders.getQueryStatus().'
      }
    },
    create(context) {
      return {
        MemberExpression(node) {
          if (node.computed || node.property.type !== 'Identifier') {
            return;
          }

          const propertyName = node.property.name;
          const objectNode = node.object;

          if (objectNode.type === 'Identifier' && objectNode.name === 'window') {
            if (propertyName === 'QueryStateStore') {
              context.report({ node, messageId: 'privateStore' });
              return;
            }

            if (propertyName === 'currentQueryState' || propertyName === 'lastExecutedQueryState') {
              context.report({
                node,
                messageId: 'blockedAppStateAlias',
                data: { name: propertyName }
              });
              return;
            }
          }

          if (
            objectNode.type === 'MemberExpression'
            && !objectNode.computed
            && objectNode.property.type === 'Identifier'
            && objectNode.property.name === 'AppState'
            && ['queryRunning', 'hasPartialResults', 'currentQueryId', 'lastExecutedQueryState', 'currentQueryState'].includes(propertyName)
          ) {
            context.report({ node, messageId: 'lifecycleViaAppState' });
            return;
          }

          if (
            objectNode.type === 'Identifier'
            && objectNode.name === 'AppState'
            && ['queryRunning', 'hasPartialResults', 'currentQueryId', 'lastExecutedQueryState', 'currentQueryState'].includes(propertyName)
          ) {
            context.report({ node, messageId: 'lifecycleViaAppState' });
            return;
          }

          if (
            objectNode.type === 'MemberExpression'
            && !objectNode.computed
            && objectNode.property.type === 'Identifier'
            && objectNode.property.name === 'QueryChangeManager'
            && restrictedQueryStateReadMethods.has(propertyName)
          ) {
            context.report({ node, messageId: 'readerViaManager' });
            return;
          }

          if (
            objectNode.type === 'Identifier'
            && objectNode.name === 'QueryChangeManager'
            && restrictedQueryStateReadMethods.has(propertyName)
          ) {
            context.report({ node, messageId: 'readerViaManager' });
          }
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
      'no-restricted-globals': ['error',
        {
          name: 'displayedFields',
          message: 'Use window.QueryStateReaders.getDisplayedFields() instead.'
        },
        {
          name: 'activeFilters',
          message: 'Use window.QueryStateReaders.getActiveFilters() instead.'
        },
        {
          name: 'getCurrentQueryState',
          message: 'Use window.QueryStateReaders.getSerializableState() instead.'
        },
        {
          name: 'currentQueryState',
          message: 'Use window.AppState.currentQueryState instead.'
        },
        {
          name: 'lastExecutedQueryState',
          message: 'Use window.AppState.lastExecutedQueryState instead.'
        },
        {
          name: 'queryRunning',
          message: 'Read query lifecycle via window.QueryStateReaders.getLifecycleState() or getQueryStatus().'
        },
        {
          name: 'hasPartialResults',
          message: 'Read query lifecycle via window.QueryStateReaders.getLifecycleState() or getQueryStatus().'
        },
        {
          name: 'currentQueryId',
          message: 'Read query lifecycle via window.QueryStateReaders.getLifecycleState().'
        }
      ],
      'no-restricted-properties': ['error',
        {
          object: 'window',
          property: 'displayedFields',
          message: 'Use window.QueryStateReaders.getDisplayedFields() instead.'
        },
        {
          object: 'window',
          property: 'activeFilters',
          message: 'Use window.QueryStateReaders.getActiveFilters() instead.'
        },
        {
          object: 'window',
          property: 'getCurrentQueryState',
          message: 'Use window.QueryStateReaders.getSerializableState() instead.'
        },
        {
          object: 'window',
          property: 'queryRunning',
          message: 'Read query lifecycle via window.QueryStateReaders.getLifecycleState() or getQueryStatus().'
        },
        {
          object: 'window',
          property: 'hasPartialResults',
          message: 'Read query lifecycle via window.QueryStateReaders.getLifecycleState() or getQueryStatus().'
        },
        {
          object: 'window',
          property: 'currentQueryId',
          message: 'Read query lifecycle via window.QueryStateReaders.getLifecycleState().'
        },
        {
          object: 'window',
          property: 'lastExecutedQueryState',
          message: 'Read query lifecycle via window.QueryStateReaders.getLifecycleState().'
        },
        {
          object: 'window',
          property: 'currentQueryState',
          message: 'Read query lifecycle via window.QueryStateReaders.getLifecycleState().'
        },
        {
          object: 'AppState',
          property: 'queryRunning',
          message: 'Read query lifecycle via window.QueryStateReaders.getLifecycleState() or getQueryStatus().'
        },
        {
          object: 'AppState',
          property: 'hasPartialResults',
          message: 'Read query lifecycle via window.QueryStateReaders.getLifecycleState() or getQueryStatus().'
        },
        {
          object: 'AppState',
          property: 'currentQueryId',
          message: 'Read query lifecycle via window.QueryStateReaders.getLifecycleState().'
        },
        {
          object: 'AppState',
          property: 'lastExecutedQueryState',
          message: 'Read query lifecycle via window.QueryStateReaders.getLifecycleState().'
        },
        {
          object: 'AppState',
          property: 'currentQueryState',
          message: 'Read query lifecycle via window.QueryStateReaders.getLifecycleState().'
        }
      ],
      'local/no-unapproved-window-exports': 'error',
      'local/no-restricted-query-state-access': 'error'
    }
  }
];
