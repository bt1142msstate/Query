/**
 * Explicit application bootstrap.
 * Centralizes startup order for UI modules that bind DOM listeners.
 */
import { onDOMReady } from './utils.js?v=19';
import { showToastMessage } from '../ui/toast.js?v=2';
import { QueryBuilderShell } from '../ui/queryBuilderShell.js?v=7';
import { QueryFormMode } from '../ui/formMode.js?v=1773931000035';
import { QueryUI } from '../ui/queryUI.js?v=25';
import { TableNameInput } from '../ui/tableNameInput.js?v=3';

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
