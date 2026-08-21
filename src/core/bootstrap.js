/**
 * Explicit application bootstrap.
 * Centralizes startup order for UI modules that bind DOM listeners.
 */
import { onDOMReady } from './domReady.js';
import { showToastMessage } from './toast.js';
import { ApiSettings } from '../ui/apiSettings.js';
import { QueryBuilderShell } from '../ui/queryBuilderShell.js';
import { QueryFormMode } from '../ui/form-mode/formMode.js';
import { QueryUI } from '../ui/queryUI.js';
import { TableNameInput } from '../ui/controls/tableNameInput.js';
import { OclcBibCompare } from '../ui/bib-compare/oclcBibCompare.js';

(function initializeAppBootstrap() {
  function runInitializer(label, initializer) {
    if (typeof initializer !== 'function') {
      return;
    }

    Promise.resolve(initializer()).catch(error => {
      console.error(`Failed to initialize ${label}:`, error);
      if (showToastMessage) {
        showToastMessage(`${label} could not be started. Refresh the page and try again.`, 'error');
      }
    });
  }

  function bootstrap() {
    runInitializer('query UI', QueryUI?.initialize);
    runInitializer('table name input', TableNameInput?.initialize);
    runInitializer('API settings', ApiSettings?.initialize);
    runInitializer('query builder shell', QueryBuilderShell?.initialize);
    runInitializer('form mode', QueryFormMode?.initialize);
    runInitializer('WorldCat bibliographic comparison', OclcBibCompare?.initialize);
  }

  onDOMReady(bootstrap);
})();
