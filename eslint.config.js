const globals = require('globals');

const allowedWindowAssignments = new Set([
  '__QUERY_APP_MODULES_ERROR',
  '__QUERY_APP_MODULES_READY',
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
  'QueryPrevalidation',
  'QueryBuilderShell',
  'QueryFormMode',
  'QueryHistorySystem',
  'QueryHistoryViewHelpers',
  'QueryTemplatesSystem',
  'QueryUI',
  'QueryTableView',
  'QueryStateSubscriptions',
  'SharedFieldPicker',
  'TableNameInput',
  'TableBuilder',
  'TooltipManager',
  'TextMeasurement',
  'ValueFormatting',
  'VirtualTable',
  'VisibilityUtils',
  'addQueryToHistory',
  'animatingBackBubbles',
  'BackendApi',
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
  'hasQueryChanged',
  'getDisplayedFields',
  'getActiveFilters',
  'getFilterGroupForField',
  'hasDisplayedField',
  'hasFiltersForField'
]);

const protectedGlobalDeclarationNames = new Set([
  'displayedFields',
  'activeFilters',
  'getCurrentQueryState',
  'hasQueryChanged',
  'currentQueryState',
  'lastExecutedQueryState',
  'queryRunning',
  'hasPartialResults',
  'hasLoadedResultSet',
  'currentQueryId'
]);

function collectPatternIdentifiers(pattern, identifiers = []) {
  if (!pattern) {
    return identifiers;
  }

  if (pattern.type === 'Identifier') {
    identifiers.push(pattern);
    return identifiers;
  }

  if (pattern.type === 'RestElement') {
    return collectPatternIdentifiers(pattern.argument, identifiers);
  }

  if (pattern.type === 'AssignmentPattern') {
    return collectPatternIdentifiers(pattern.left, identifiers);
  }

  if (pattern.type === 'ArrayPattern') {
    pattern.elements.forEach(element => collectPatternIdentifiers(element, identifiers));
    return identifiers;
  }

  if (pattern.type === 'ObjectPattern') {
    pattern.properties.forEach(property => {
      if (property.type === 'Property') {
        collectPatternIdentifiers(property.value, identifiers);
      } else if (property.type === 'RestElement') {
        collectPatternIdentifiers(property.argument, identifiers);
      }
    });
  }

  return identifiers;
}

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
  'no-protected-global-declarations': {
    meta: {
      type: 'problem',
      docs: {
        description: 'Prevent top-level declarations from colliding with protected browser globals.'
      },
      schema: [],
      messages: {
        protectedGlobal: 'Top-level declaration "{{name}}" uses a protected query lifecycle/global state name. Use a locally scoped helper name instead.'
      }
    },
    create(context) {
      function reportIfProtected(identifierNode) {
        if (!identifierNode || !protectedGlobalDeclarationNames.has(identifierNode.name)) {
          return;
        }

        context.report({
          node: identifierNode,
          messageId: 'protectedGlobal',
          data: { name: identifierNode.name }
        });
      }

      return {
        Program(node) {
          node.body.forEach(statement => {
            if (statement.type === 'FunctionDeclaration' || statement.type === 'ClassDeclaration') {
              reportIfProtected(statement.id);
              return;
            }

            if (statement.type === 'VariableDeclaration') {
              statement.declarations.forEach(declaration => {
                collectPatternIdentifiers(declaration.id).forEach(reportIfProtected);
              });
            }
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
        blockedAppStateAlias: 'Read query lifecycle via window.QueryStateReaders.getLifecycleState() instead of window.{{name}}.',
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
            && ['queryRunning', 'hasPartialResults', 'hasLoadedResultSet', 'currentQueryId', 'lastExecutedQueryState', 'currentQueryState'].includes(propertyName)
          ) {
            context.report({ node, messageId: 'lifecycleViaAppState' });
            return;
          }

          if (
            objectNode.type === 'Identifier'
            && objectNode.name === 'AppState'
            && ['queryRunning', 'hasPartialResults', 'hasLoadedResultSet', 'currentQueryId', 'lastExecutedQueryState', 'currentQueryState'].includes(propertyName)
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
          name: 'hasQueryChanged',
          message: 'Use window.QueryStateReaders.hasQueryChanged() instead.'
        },
        {
          name: 'currentQueryState',
          message: 'Read query state via window.QueryStateReaders instead.'
        },
        {
          name: 'lastExecutedQueryState',
          message: 'Read query lifecycle via window.QueryStateReaders.getLifecycleState().'
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
          name: 'hasLoadedResultSet',
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
          property: 'hasQueryChanged',
          message: 'Use window.QueryStateReaders.hasQueryChanged() instead.'
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
          property: 'hasLoadedResultSet',
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
          property: 'hasLoadedResultSet',
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
      'local/no-protected-global-declarations': 'error',
      'local/no-restricted-query-state-access': 'error'
    }
  },
  {
    files: ['tests/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node
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
      }]
    }
  }
];
