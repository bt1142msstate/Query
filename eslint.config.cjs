const globals = require('globals');

const { forbiddenAppWindowBridgeNames } = require('./config/windowBridgeGlobals.cjs');

const appWindowBridgeNames = new Set(forbiddenAppWindowBridgeNames);

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
  'no-versioned-module-specifiers': {
    meta: {
      type: 'problem',
      docs: {
        description: 'Disallow cache-busting query strings in ES module specifiers.'
      },
      schema: [],
      messages: {
        versionedModuleSpecifier: 'Use a plain module specifier instead of "{{specifier}}". Cache busting belongs at the server/build layer, not in source imports.'
      }
    },
    create(context) {
      function checkSource(sourceNode) {
        if (!sourceNode || sourceNode.type !== 'Literal' || typeof sourceNode.value !== 'string') {
          return;
        }

        if (!/[?#]/u.test(sourceNode.value)) {
          return;
        }

        context.report({
          node: sourceNode,
          messageId: 'versionedModuleSpecifier',
          data: { specifier: sourceNode.value }
        });
      }

      return {
        ImportDeclaration(node) {
          checkSource(node.source);
        },
        ExportNamedDeclaration(node) {
          checkSource(node.source);
        },
        ExportAllDeclaration(node) {
          checkSource(node.source);
        },
        ImportExpression(node) {
          checkSource(node.source);
        }
      };
    }
  },
  'no-app-window-bridge-exports': {
    meta: {
      type: 'problem',
      docs: {
        description: 'Disallow exporting application APIs through window.'
      },
      schema: [],
      messages: {
        windowExport: 'Do not export application API "{{name}}" through window. Use ES module exports, dependency injection, or service registration.'
      }
    },
    create(context) {
      function reportWindowExport(node, exportName) {
        context.report({
          node,
          messageId: 'windowExport',
          data: { name: exportName }
        });
      }

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

          reportWindowExport(node, node.left.property.name);
        },
        CallExpression(node) {
          if (
            node.callee.type !== 'MemberExpression'
            || node.callee.computed
            || node.callee.object.type !== 'Identifier'
            || node.callee.object.name !== 'Object'
            || node.callee.property.type !== 'Identifier'
            || node.callee.property.name !== 'defineProperty'
          ) {
            return;
          }

          const [target, property] = node.arguments;
          if (
            target?.type !== 'Identifier'
            || target.name !== 'window'
            || property?.type !== 'Literal'
            || typeof property.value !== 'string'
          ) {
            return;
          }

          reportWindowExport(node, property.value);
        }
      };
    }
  },
  'no-app-window-bridge-reads': {
    meta: {
      type: 'problem',
      docs: {
        description: 'Disallow reading former application globals from window.'
      },
      schema: [],
      messages: {
        windowBridgeRead: 'Do not read application API "{{name}}" from window. Import it directly or use an explicit service/action facade.'
      }
    },
    create(context) {
      return {
        MemberExpression(node) {
          if (node.computed || node.property.type !== 'Identifier') {
            return;
          }

          if (node.object.type !== 'Identifier' || node.object.name !== 'window') {
            return;
          }

          if (!appWindowBridgeNames.has(node.property.name)) {
            return;
          }

          context.report({
            node,
            messageId: 'windowBridgeRead',
            data: { name: node.property.name }
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
      'no-undef': 'error',
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
      'local/no-app-window-bridge-exports': 'error',
      'local/no-app-window-bridge-reads': 'error',
      'local/no-protected-global-declarations': 'error',
      'local/no-restricted-query-state-access': 'error',
      'local/no-versioned-module-specifiers': 'error'
    }
  },
  {
    files: ['**/*.cjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: {
        ...globals.node
      }
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['error', {
        args: 'none',
        argsIgnorePattern: '^_',
        caughtErrors: 'all',
        caughtErrorsIgnorePattern: '^_',
        ignoreRestSiblings: true,
        varsIgnorePattern: '^_$'
      }]
    }
  },
  {
    files: [
      'appModules.js',
      'bubbles/**/*.js',
      'core/**/*.js',
      'filters/**/*.js',
      'table/**/*.js',
      'ui/**/*.js'
    ],
    languageOptions: {
      sourceType: 'module'
    },
    rules: {
      'no-restricted-syntax': ['error',
        {
          selector: 'CallExpression[callee.name="require"]',
          message: 'Application modules should use ES module imports.'
        },
        {
          selector: 'MemberExpression[object.name="module"][property.name="exports"]',
          message: 'Application modules should use ES module exports.'
        }
      ]
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
      'no-undef': 'error',
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
