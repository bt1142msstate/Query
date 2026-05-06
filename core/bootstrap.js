/**
 * Explicit application bootstrap.
 * Centralizes startup order for UI modules that bind DOM listeners.
 */
import { onDOMReady } from './utils.js';
import { showToastMessage } from '../ui/toast.js';
import { QueryBuilderShell } from '../ui/queryBuilderShell.js';
import { QueryFormMode } from '../ui/formMode.js';
import { QueryUI } from '../ui/queryUI.js';
import { TableNameInput } from '../ui/tableNameInput.js';

(function initializeAppBootstrap() {
  function runInitializer(label, initializer) {
    if (typeof initializer !== 'function') {
      return;
    }

    Promise.resolve(initializer()).catch(error => {
      console.error(`Failed to initialize ${label}:`, error);
      if (showToastMessage) {
        showToastMessage(`Failed to initialize ${label}.`, 'error');
      }
    });
  }

  function bootstrap() {
    runInitializer('query UI', QueryUI?.initialize);
    runInitializer('table name input', TableNameInput?.initialize);
    runInitializer('query builder shell', QueryBuilderShell?.initialize);
    runInitializer('form mode', QueryFormMode?.initialize);
  }

  onDOMReady(bootstrap);
})();
