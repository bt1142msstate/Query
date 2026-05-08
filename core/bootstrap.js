/**
 * Explicit application bootstrap.
 * Centralizes startup order for UI modules that bind DOM listeners.
 */
import { onDOMReady } from './domReady.js';
import { showToastMessage } from './toast.js';
import { QueryBuilderShell } from '../ui/queryBuilderShell.js';
import { QueryFormMode } from '../ui/form-mode/formMode.js';
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
